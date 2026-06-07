import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Platform,
  Text,
  TextInput,
  Keyboard,
  Alert,
  Modal,
  ScrollView,
  TouchableWithoutFeedback,
  type LayoutChangeEvent,
} from "react-native";
import MapView, { Region, Marker } from "react-native-maps";
import { router } from "expo-router";
import CourtMapMarker, {
  CourtCalloutBubbleContent,
} from "../../../components/CourtMapMarker";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { supabase } from "../../../lib/supabase";
import { useCourtAliases } from "../../../hooks/useCourtAliases";
import { colors, borderRadius, spacing } from "../../../constants/theme";
import {
  boundingBoxForRadiusMiles,
  haversineMiles,
} from "../../../lib/geo";
import {
  geocodeSearchQuery,
  enrichPickOptions,
  type LocationPickOption,
} from "../../../lib/courtMapSearch";
import { resolveUsStateCenter } from "../../../lib/usStateCentroids";
import { withTimeout } from "../../../lib/withTimeout";
import {
  resolveDeviceCoordinates,
  resolveRecenterCoordinates,
  refineDeviceCoordinates,
} from "../../../lib/deviceLocation";

const COURTS_FETCH_TIMEOUT_MS = 15_000;

const DEFAULT_REGION: Region = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.52,
  longitudeDelta: 0.52,
};

const MAP_DELTA_NEAR_USER = 0.52;

const DEFAULT_RADIUS_MILES = 15;

/** If the last load was centered on the user, refetch when GPS moves farther than this (miles). */
const REFETCH_MOVE_MILES = 10;

/** Skip refetch when anchor moved less than this since last successful load (miles). */
const MIN_ANCHOR_SHIFT_MILES = 1.5;

/** Minimum time between court fetches (ms). */
const MIN_REFETCH_INTERVAL_MS = 2500;

/** Smooth pan/zoom when jumping to a search anchor or recentering (ms). */
const MAP_FLY_DURATION_MS = 950;
/** Search: snap on Android to avoid blank tile flash while tiles load mid-animation. */
const MAP_FLY_DURATION_ANDROID_SEARCH_MS = 1;
/** Relocate: glide like iOS, but slightly shorter on Android. */
const MAP_FLY_DURATION_ANDROID_RECENTER_MS = 650;

function getMapFlyDurationMs(smooth = false): number {
  if (Platform.OS === "android") {
    return smooth ? MAP_FLY_DURATION_ANDROID_RECENTER_MS : MAP_FLY_DURATION_ANDROID_SEARCH_MS;
  }
  return MAP_FLY_DURATION_MS;
}

/** Debounce GPS-driven refetch checks (ms). */
const GPS_REFETCH_DEBOUNCE_MS = 3000;

/** Max courts shown on map / list after distance sort (keeps RN Maps responsive). */
const MAX_COURTS_SHOWN = 300;

/**
 * Bbox fallback only (when RPC is missing): max rows from PostgREST before radius filter.
 * Not “nearest N”—arbitrary subset of bbox—so keep RPC deployed; see scripts/courts-within-radius-rpc.sql.
 */
const FETCH_ROW_CAP = 500;

/** Instant pin paint for typical loads; stagger only for very large result sets. */
const INSTANT_MARKER_REVEAL_MAX = 120;
const REVEAL_MARKERS_PER_FRAME = 80;

const PIN_WIDTH = 36;
const PIN_HEIGHT = 44;
/** Android floating card size (for layout math next to pin). */
const ANDROID_CALLOUT_W = 150;
const ANDROID_CALLOUT_H = 100;

function parseMilesInput(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_RADIUS_MILES;
  }
  return Math.min(150, Math.max(1, Math.round(n)));
}

/** Map span so the search radius fits comfortably in view. */
function mapDeltaForRadiusMiles(radiusMiles: number): number {
  const spanDeg = (2 * radiusMiles) / 69;
  return Math.min(2.5, Math.max(0.08, spanDeg * 1.15));
}

function regionForAnchor(
  latitude: number,
  longitude: number,
  radiusMiles: number
): Region {
  const d = mapDeltaForRadiusMiles(radiusMiles);
  return {
    latitude,
    longitude,
    latitudeDelta: d,
    longitudeDelta: d,
  };
}

const RIMRUN_MAP_THEME = [
  { elementType: "geometry", stylers: [{ color: colors.surface }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  {
    elementType: "labels.text.fill",
    stylers: [{ color: colors.textSecondary }],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [{ color: colors.background }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#1e2836" }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: "#1a2330" }],
  },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: colors.surfaceElevated }],
  },
  {
    featureType: "administrative.country",
    elementType: "labels.text.fill",
    stylers: [{ color: colors.textMuted }],
  },
  {
    featureType: "administrative.land_parcel",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: colors.textSecondary }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: colors.textMuted }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: colors.surfaceElevated }],
  },
  {
    featureType: "road",
    elementType: "geometry.fill",
    stylers: [{ color: colors.border }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: colors.textMuted }],
  },
  {
    featureType: "road.arterial",
    elementType: "geometry",
    stylers: [{ color: colors.surfaceElevated }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: colors.surfaceElevated }],
  },
  {
    featureType: "road.highway.controlled_access",
    elementType: "geometry",
    stylers: [{ color: colors.surfaceElevated }],
  },
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [{ color: colors.textMuted }],
  },
  {
    featureType: "transit",
    elementType: "labels.text.fill",
    stylers: [{ color: colors.textMuted }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: colors.background }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: colors.textMuted }],
  },
];

type Court = {
  id: string;
  name: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  hoops: number | null;
  is_private: boolean | null;
  is_indoor: boolean | null;
  verified?: boolean;
  flagged_for_review?: boolean;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: Platform.OS === "ios" ? 6 : 4,
    minHeight: 52,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  searchFieldCluster: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    paddingLeft: spacing.xs,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    paddingRight: spacing.sm,
    fontSize: 16,
    color: colors.text,
  },
  radiusGroup: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  milesInput: {
    width: 40,
    minWidth: 40,
    paddingVertical: 4,
    paddingHorizontal: 0,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  radiusUnit: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  searchIconButton: {
    width: 35,
    height: 35,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: spacing.xs,
  },
  searchIconButtonDisabled: {
    opacity: 0.55,
  },
  pickModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  pickModalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "78%",
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  pickModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  pickModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.2,
  },
  pickModalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  pickModalScroll: {
    maxHeight: 360,
  },
  pickOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickOptionText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  pickModalCancel: {
    paddingVertical: spacing.md,
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  pickModalCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  mapSlot: {
    flex: 1,
    position: "relative",
    backgroundColor: "#1e2836",
  },
  map: {
    flex: 1,
    backgroundColor: "#1e2836",
  },
  androidCourtBubbleWrap: {
    position: "absolute",
    zIndex: 1000,
    pointerEvents: "box-none",
  },
  androidCourtBubbleCard: {
    position: "relative",
    width: ANDROID_CALLOUT_W,
  },
  androidCourtClose: {
    position: "absolute",
    top: 2,
    right: 2,
    zIndex: 2,
    padding: spacing.xs,
  },
  androidCallout: {
    width: ANDROID_CALLOUT_W,
    maxWidth: ANDROID_CALLOUT_W,
    minHeight: 56,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden" as const,
    elevation: 8,
  },
  androidCalloutTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  androidCalloutText: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
  },
  androidCalloutHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  fetchErrorBanner: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 11,
  },
  fetchErrorText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  fetchErrorRetry: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  loadingOverlayWrap: {
    position: "absolute",
    top: spacing.sm,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  loadingOverlay: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  loadingLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  callout: {
    minWidth: 160,
    maxWidth: 280,
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calloutTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 6,
  },
  calloutText: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  calloutHint: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  userLocationMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 4,
    borderColor: colors.text,
  },
  recenterButton: {
    position: "absolute",
    bottom: 80,
    left: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 999,
  },
  addCourtButton: {
    position: "absolute",
    borderColor: colors.primary,
    bottom: 80,
    right: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    borderWidth: 2,
  },
  addCourtButtonIcon: {
    color: colors.text,
  },
});

export default function CourtsScreen() {
  const { getDisplayName } = useCourtAliases();
  const [region, setRegion] = useState<Region | null>(DEFAULT_REGION);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [sortedCourts, setSortedCourts] = useState<Court[]>([]);
  const [visibleCourts, setVisibleCourts] = useState<Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);
  const [courtsFetchFailed, setCourtsFetchFailed] = useState(false);
  const [gpsInitDone, setGpsInitDone] = useState(false);
  const [recentering, setRecentering] = useState(false);
  /** Avoid flashing a loader on fast RPC responses; keeps map visible. */
  const [showCourtsLoadingUi, setShowCourtsLoadingUi] = useState(false);
  /** Android: native map callouts are unreliable; we show the same UI as a floating card. */
  const [androidSelectedCourt, setAndroidSelectedCourt] = useState<Court | null>(
    null,
  );
  const [androidBubbleScreenPos, setAndroidBubbleScreenPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const mapSlotLayoutRef = useRef({ width: 0, height: 0 });
  const androidSelectedCourtRef = useRef<Court | null>(null);
  const openingCourtFromMapRef = useRef(false);

  const [locationQuery, setLocationQuery] = useState("");
  const [milesInput, setMilesInput] = useState(String(DEFAULT_RADIUS_MILES));
  const [geocodingSearch, setGeocodingSearch] = useState(false);
  const [locationPickVisible, setLocationPickVisible] = useState(false);
  const [locationPickOptions, setLocationPickOptions] = useState<
    LocationPickOption[]
  >([]);

  useEffect(() => {
    androidSelectedCourtRef.current = androidSelectedCourt;
  }, [androidSelectedCourt]);

  const mapRef = useRef<MapView | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const fetchRequestIdRef = useRef(0);
  const initialCourtsLoadStartedRef = useRef(false);

  const radiusMilesRef = useRef(DEFAULT_RADIUS_MILES);
  const lastFetchAnchorRef = useRef<{ lat: number; lng: number } | null>(
    null
  );
  const lastFetchWasUserAnchoredRef = useRef(false);
  const moveRefetchInFlightRef = useRef(false);
  const lastFetchMetaRef = useRef({
    at: 0,
    lat: 0,
    lng: 0,
    radius: 0,
  });
  const gpsRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingGpsRef = useRef<{ latitude: number; longitude: number } | null>(
    null,
  );
  /** Captured once so MapView never receives a changing `initialRegion` during flies. */
  const mapInitialRegionRef = useRef<Region | null>(null);
  const mapFlyUntilRef = useRef(0);
  const mapFlyEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRegionRef = useRef<Region | null>(null);
  const pendingCourtsRef = useRef<Court[] | null>(null);
  const pendingCourtsRequestIdRef = useRef(0);

  const commitAfterMapFly = useCallback(() => {
    if (pendingRegionRef.current) {
      setRegion(pendingRegionRef.current);
      pendingRegionRef.current = null;
    }
    const pending = pendingCourtsRef.current;
    if (
      pending &&
      pendingCourtsRequestIdRef.current === fetchRequestIdRef.current
    ) {
      pendingCourtsRef.current = null;
      setSortedCourts(pending);
      setCourtsLoading(false);
    }
  }, []);

  const beginMapFly = useCallback((durationMs: number) => {
    mapFlyUntilRef.current = Date.now() + durationMs;
    if (mapFlyEndTimerRef.current) {
      clearTimeout(mapFlyEndTimerRef.current);
    }
    mapFlyEndTimerRef.current = setTimeout(() => {
      mapFlyEndTimerRef.current = null;
      mapFlyUntilRef.current = 0;
      commitAfterMapFly();
    }, durationMs);
  }, [commitAfterMapFly]);

  const applyCourtsToMap = useCallback((courts: Court[], requestId: number) => {
    const slice = courts.slice(0, MAX_COURTS_SHOWN);
    const deferForFly =
      Platform.OS !== "android" && Date.now() < mapFlyUntilRef.current;
    if (deferForFly) {
      pendingCourtsRef.current = slice;
      pendingCourtsRequestIdRef.current = requestId;
      return;
    }
    setSortedCourts(slice);
    setCourtsLoading(false);
  }, []);

  const flyMapToAnchor = useCallback(
    (
      latitude: number,
      longitude: number,
      radiusMiles: number,
      options?: { smooth?: boolean },
    ) => {
      const durationMs = getMapFlyDurationMs(options?.smooth ?? false);
      const next = regionForAnchor(latitude, longitude, radiusMiles);
      pendingRegionRef.current = next;
      beginMapFly(durationMs);
      requestAnimationFrame(() => {
        mapRef.current?.animateToRegion(next, durationMs);
      });
    },
    [beginMapFly],
  );

  useEffect(() => {
    return () => {
      if (mapFlyEndTimerRef.current) {
        clearTimeout(mapFlyEndTimerRef.current);
      }
    };
  }, []);

  const loadCourtsAtAnchor = useCallback(
    async (
      centerLat: number,
      centerLng: number,
      radiusMiles: number,
      requestId: number
    ): Promise<boolean> => {
      radiusMilesRef.current = radiusMiles;

      setCourtsLoading(true);
      setCourtsFetchFailed(false);
      // Keep existing pins visible while fetching (stale-while-revalidate).

      try {
        const { data: rpcData, error: rpcError } = await withTimeout(
          supabase.rpc("courts_within_radius_miles", {
            p_lat: centerLat,
            p_lng: centerLng,
            p_radius_miles: radiusMiles,
          }),
          COURTS_FETCH_TIMEOUT_MS,
          "Courts fetch",
        );

        if (requestId !== fetchRequestIdRef.current) {
          return false;
        }

        if (!rpcError && Array.isArray(rpcData)) {
          applyCourtsToMap(rpcData as Court[], requestId);
          return true;
        }

        if (rpcError) {
          console.warn(
            "courts_within_radius_miles unavailable (run scripts/courts-within-radius-rpc.sql); using bbox fallback:",
            rpcError.message,
          );
        }

        const { minLat, maxLat, minLng, maxLng } = boundingBoxForRadiusMiles(
          centerLat,
          centerLng,
          radiusMiles,
          1.08,
        );

        const { data, error } = await withTimeout(
          supabase
            .from("courts")
            .select(
              "id, name, address, latitude, longitude, hoops, is_private, is_indoor, verified, flagged_for_review",
            )
            .gte("latitude", minLat)
            .lte("latitude", maxLat)
            .gte("longitude", minLng)
            .lte("longitude", maxLng)
            .limit(FETCH_ROW_CAP),
          COURTS_FETCH_TIMEOUT_MS,
          "Courts fetch",
        );

        if (requestId !== fetchRequestIdRef.current) {
          return false;
        }

        if (error) {
          console.error("Error fetching courts:", error);
          setCourtsFetchFailed(true);
          return false;
        }

        const rows = (data ?? []) as Court[];
        const withDist = rows.map((c) => ({
          c,
          d: haversineMiles(centerLat, centerLng, c.latitude, c.longitude),
        }));
        withDist.sort((a, b) => a.d - b.d);
        const inRadius = withDist
          .filter(({ d }) => d <= radiusMiles)
          .map(({ c }) => c);

        applyCourtsToMap(inRadius, requestId);
        return true;
      } catch (err) {
        console.error("Courts fetch failed:", err);
        if (requestId === fetchRequestIdRef.current) {
          setCourtsFetchFailed(true);
        }
        return false;
      } finally {
        if (requestId === fetchRequestIdRef.current) {
          setCourtsLoading(false);
        }
      }
    },
    [applyCourtsToMap]
  );

  const runCourtsSearch = useCallback(
    async (opts: {
      anchorLat: number;
      anchorLng: number;
      radiusMiles: number;
      userAnchored: boolean;
      animateMap: boolean;
      force?: boolean;
    }) => {
      const last = lastFetchMetaRef.current;
      const now = Date.now();
      if (!opts.force) {
        if (now - last.at < MIN_REFETCH_INTERVAL_MS) {
          return;
        }
        if (
          last.at > 0 &&
          last.radius === opts.radiusMiles &&
          haversineMiles(opts.anchorLat, opts.anchorLng, last.lat, last.lng) <
            MIN_ANCHOR_SHIFT_MILES
        ) {
          return;
        }
      }

      if (opts.animateMap) {
        flyMapToAnchor(opts.anchorLat, opts.anchorLng, opts.radiusMiles);
      }

      const requestId = ++fetchRequestIdRef.current;
      const ok = await loadCourtsAtAnchor(
        opts.anchorLat,
        opts.anchorLng,
        opts.radiusMiles,
        requestId
      );
      if (!ok) {
        return;
      }
      lastFetchMetaRef.current = {
        at: Date.now(),
        lat: opts.anchorLat,
        lng: opts.anchorLng,
        radius: opts.radiusMiles,
      };
      lastFetchAnchorRef.current = {
        lat: opts.anchorLat,
        lng: opts.anchorLng,
      };
      lastFetchWasUserAnchoredRef.current = opts.userAnchored;
    },
    [loadCourtsAtAnchor, flyMapToAnchor]
  );

  const runCourtsSearchRef = useRef(runCourtsSearch);
  runCourtsSearchRef.current = runCourtsSearch;

  const applyMapToCoordinates = useCallback(
    (latitude: number, longitude: number, animate = true) => {
      const next: Region = {
        latitude,
        longitude,
        latitudeDelta: MAP_DELTA_NEAR_USER,
        longitudeDelta: MAP_DELTA_NEAR_USER,
      };
      setUserLocation({ latitude, longitude });
      setRegion(next);
      requestAnimationFrame(() => {
        mapRef.current?.animateToRegion(next, animate ? 350 : 0);
      });
    },
    [],
  );

  /** First paint: wait for GPS attempt, then load courts at device location (or map default). */
  useEffect(() => {
    if (!region || !gpsInitDone || initialCourtsLoadStartedRef.current) {
      return;
    }
    initialCourtsLoadStartedRef.current = true;

    const centerLat = userLocation?.latitude ?? region.latitude;
    const centerLng = userLocation?.longitude ?? region.longitude;
    const radiusMiles = parseMilesInput(milesInput);

    void runCourtsSearch({
      anchorLat: centerLat,
      anchorLng: centerLng,
      radiusMiles,
      userAnchored: Boolean(userLocation),
      animateMap: false,
      force: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, gpsInitDone, userLocation, runCourtsSearch]);

  useEffect(() => {
    if (sortedCourts.length === 0) {
      setVisibleCourts([]);
      return;
    }

    if (sortedCourts.length <= INSTANT_MARKER_REVEAL_MAX) {
      setVisibleCourts(sortedCourts);
      return;
    }

    let index = 0;
    let raf = 0;

    const tick = () => {
      index = Math.min(
        sortedCourts.length,
        index + REVEAL_MARKERS_PER_FRAME,
      );
      setVisibleCourts(sortedCourts.slice(0, index));
      if (index < sortedCourts.length) {
        raf = requestAnimationFrame(tick);
      }
    };

    index = REVEAL_MARKERS_PER_FRAME;
    setVisibleCourts(sortedCourts.slice(0, index));
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [sortedCourts]);

  useEffect(() => {
    if (!courtsLoading) {
      setShowCourtsLoadingUi(false);
      return;
    }
    const t = setTimeout(() => setShowCourtsLoadingUi(true), 450);
    return () => clearTimeout(t);
  }, [courtsLoading]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const coords = await resolveDeviceCoordinates();
      if (cancelled) return;
      if (coords) {
        applyMapToCoordinates(coords.latitude, coords.longitude, true);
      }
      setGpsInitDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMapToCoordinates]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") return;
      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 75,
        },
        (loc) => {
          const latitude = loc.coords.latitude;
          const longitude = loc.coords.longitude;
          setUserLocation({ latitude, longitude });
          pendingGpsRef.current = { latitude, longitude };

          if (gpsRefetchTimerRef.current) {
            clearTimeout(gpsRefetchTimerRef.current);
          }
          gpsRefetchTimerRef.current = setTimeout(() => {
            gpsRefetchTimerRef.current = null;
            const pending = pendingGpsRef.current;
            if (!pending) return;

            const anchor = lastFetchAnchorRef.current;
            if (
              !lastFetchWasUserAnchoredRef.current ||
              !anchor ||
              moveRefetchInFlightRef.current
            ) {
              return;
            }
            const dist = haversineMiles(
              pending.latitude,
              pending.longitude,
              anchor.lat,
              anchor.lng
            );
            if (dist < REFETCH_MOVE_MILES) {
              return;
            }
            moveRefetchInFlightRef.current = true;
            const r = radiusMilesRef.current;
            void runCourtsSearchRef
              .current({
                anchorLat: pending.latitude,
                anchorLng: pending.longitude,
                radiusMiles: r,
                userAnchored: true,
                animateMap: false,
              })
              .finally(() => {
                moveRefetchInFlightRef.current = false;
              });
          }, GPS_REFETCH_DEBOUNCE_MS);
        }
      );
    })();
    return () => {
      locationSubRef.current?.remove();
      if (gpsRefetchTimerRef.current) {
        clearTimeout(gpsRefetchTimerRef.current);
      }
    };
  }, []);

  const handleCourtsSearch = useCallback(async () => {
    Keyboard.dismiss();
    if (!region) {
      return;
    }

    const radiusMiles = parseMilesInput(milesInput);
    const trimmed = locationQuery.trim();

    if (trimmed === "") {
      const lat = userLocation?.latitude ?? region.latitude;
      const lng = userLocation?.longitude ?? region.longitude;
      await runCourtsSearch({
        anchorLat: lat,
        anchorLng: lng,
        radiusMiles,
        userAnchored: true,
        animateMap: true,
        force: true,
      });
      return;
    }

    const stateCenter = resolveUsStateCenter(trimmed);
    if (stateCenter) {
      setLocationQuery(stateCenter.label);
      await runCourtsSearch({
        anchorLat: stateCenter.latitude,
        anchorLng: stateCenter.longitude,
        radiusMiles,
        userAnchored: false,
        animateMap: true,
        force: true,
      });
      return;
    }

    setGeocodingSearch(true);
    try {
      const raw = await geocodeSearchQuery(trimmed, userLocation);
      if (raw.length === 0) {
        Alert.alert(
          "Location not found",
          "Try adding a state or country (e.g. Calgary, AB), or turn on location so we can narrow the search."
        );
        return;
      }

      const options = await enrichPickOptions(raw, userLocation, trimmed);
      if (options.length === 1) {
        const only = options[0];
        setLocationQuery(only.label);
        await runCourtsSearch({
          anchorLat: only.latitude,
          anchorLng: only.longitude,
          radiusMiles,
          userAnchored: false,
          animateMap: true,
          force: true,
        });
        return;
      }

      setLocationPickOptions(options);
      setLocationPickVisible(true);
    } catch (e) {
      console.error("geocodeSearch", e);
      Alert.alert(
        "Search failed",
        "Could not look up that location. Try a different spelling."
      );
    } finally {
      setGeocodingSearch(false);
    }
  }, [locationQuery, milesInput, region, userLocation, runCourtsSearch]);

  const handlePickSearchLocation = useCallback(
    async (opt: LocationPickOption) => {
      setLocationPickVisible(false);
      setLocationQuery(opt.label);
      const radiusMiles = parseMilesInput(milesInput);
      await runCourtsSearch({
        anchorLat: opt.latitude,
        anchorLng: opt.longitude,
        radiusMiles,
        userAnchored: false,
        animateMap: true,
        force: true,
      });
    },
    [milesInput, runCourtsSearch]
  );

  const handleAddCourt = () => {
    router.push("/(app)/court/add");
  };

  const handleAndroidCourtPin = useCallback((c: Court) => {
    setTimeout(() => setAndroidSelectedCourt(c), 50);
  }, []);

  const clearAndroidCourtSelection = useCallback(() => {
    setAndroidSelectedCourt(null);
  }, []);

  const openCourtFromMap = useCallback((court: Court) => {
    if (openingCourtFromMapRef.current) return;
    openingCourtFromMapRef.current = true;
    setAndroidSelectedCourt(null);
    router.push({
      pathname: "/(app)/court/[courtId]",
      params: { courtId: court.id },
    });
    setTimeout(() => {
      openingCourtFromMapRef.current = false;
    }, 600);
  }, []);

  const updateAndroidBubblePosition = useCallback(async () => {
    const court = androidSelectedCourtRef.current;
    if (Platform.OS !== "android" || !court) return;
    const map = mapRef.current;
    const { width: w, height: h } = mapSlotLayoutRef.current;
    if (!map || w < 8) return;
    try {
      const pt = await map.pointForCoordinate({
        latitude: court.latitude,
        longitude: court.longitude,
      });
      const gap = 8;
      const margin = 8;
      const pinTop = pt.y - PIN_HEIGHT;
      const pinBottom = pt.y;

      let left = pt.x - ANDROID_CALLOUT_W / 2;
      left = Math.max(margin, Math.min(left, w - ANDROID_CALLOUT_W - margin));

      let top = pinTop - gap - ANDROID_CALLOUT_H;
      top = Math.max(margin, Math.min(top, h - ANDROID_CALLOUT_H - margin));
      if (top + ANDROID_CALLOUT_H > pinTop - gap) {
        top = pinBottom + gap;
        top = Math.max(margin, Math.min(top, h - ANDROID_CALLOUT_H - margin));
      }

      setAndroidBubbleScreenPos({ left, top });
    } catch {
      setAndroidBubbleScreenPos(null);
    }
  }, []);

  useEffect(() => {
    if (!androidSelectedCourt) {
      setAndroidBubbleScreenPos(null);
      return;
    }
    if (Platform.OS !== "android") return;
    if (mapSlotLayoutRef.current.width < 8) return;
    const id = requestAnimationFrame(() => {
      void updateAndroidBubblePosition();
    });
    return () => cancelAnimationFrame(id);
  }, [androidSelectedCourt, updateAndroidBubblePosition]);

  const onMapSlotLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      const rw = Math.round(width);
      const rh = Math.round(height);
      const prev = mapSlotLayoutRef.current;
      if (prev.width === rw && prev.height === rh) return;
      mapSlotLayoutRef.current = { width: rw, height: rh };
      if (
        Platform.OS === "android" &&
        androidSelectedCourtRef.current &&
        rw >= 8
      ) {
        requestAnimationFrame(() => void updateAndroidBubblePosition());
      }
    },
    [updateAndroidBubblePosition],
  );

  const handleRecenter = useCallback(async () => {
    Keyboard.dismiss();
    if (recentering) return;
    setRecentering(true);
    const radiusMiles = parseMilesInput(milesInput);

    const moveAndRefetch = (latitude: number, longitude: number) => {
      setLocationQuery("");
      setUserLocation({ latitude, longitude });
      flyMapToAnchor(latitude, longitude, radiusMiles, { smooth: true });
      void runCourtsSearch({
        anchorLat: latitude,
        anchorLng: longitude,
        radiusMiles,
        userAnchored: true,
        animateMap: false,
        force: true,
      });
    };

    try {
      const coords = await resolveRecenterCoordinates();
      if (coords) {
        moveAndRefetch(coords.latitude, coords.longitude);
        if (!coords.fresh) {
          void refineDeviceCoordinates(coords).then((refined) => {
            if (refined) {
              moveAndRefetch(refined.latitude, refined.longitude);
            }
          });
        }
        return;
      }
      if (userLocation) {
        moveAndRefetch(userLocation.latitude, userLocation.longitude);
        return;
      }
      Alert.alert(
        "Location unavailable",
        "Allow location access for RimRun in your device settings, then try again.",
      );
    } finally {
      setRecentering(false);
    }
  }, [milesInput, recentering, runCourtsSearch, userLocation, flyMapToAnchor]);

  if (gpsInitDone && region && !mapInitialRegionRef.current) {
    mapInitialRegionRef.current = region;
  }

  if (!region) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={styles.container}>
      <View style={styles.searchSection}>
        <View style={styles.searchCard}>
          <View style={styles.searchFieldCluster}>
            <Ionicons name="search" size={20} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="City, address, or state"
              placeholderTextColor={colors.textMuted}
              value={locationQuery}
              onChangeText={setLocationQuery}
              returnKeyType="search"
              onSubmitEditing={handleCourtsSearch}
              editable={!geocodingSearch}
              autoCorrect
              autoCapitalize="words"
              selectionColor={colors.primary}
            />
          </View>
          <View style={styles.radiusGroup}>
            <TextInput
              style={styles.milesInput}
              placeholder="15"
              placeholderTextColor={colors.textMuted}
              value={milesInput}
              onChangeText={setMilesInput}
              editable={!geocodingSearch}
              keyboardType={
                Platform.OS === "ios" ? "number-pad" : "numeric"
              }
              maxLength={4}
              selectionColor={colors.primary}
            />
            <Text style={styles.radiusUnit}>mi</Text>
          </View>
          <Pressable
            style={[
              styles.searchIconButton,
              geocodingSearch && styles.searchIconButtonDisabled,
            ]}
            onPress={handleCourtsSearch}
            disabled={geocodingSearch}
            accessibilityRole="button"
            accessibilityLabel="Search courts"
          >
            {geocodingSearch ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Ionicons name="arrow-forward" size={22} color={colors.background} />
            )}
          </Pressable>
        </View>
      </View>

      <Modal
        visible={locationPickVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationPickVisible(false)}
      >
        <View style={styles.pickModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setLocationPickVisible(false)}
            accessibilityLabel="Dismiss"
          />
          <View style={[styles.pickModalCard, { zIndex: 1 }]}>
            <View style={styles.pickModalHeader}>
              <Ionicons name="location-outline" size={26} color={colors.primary} />
              <Text style={styles.pickModalTitle}>Choose a location</Text>
            </View>
            <Text style={styles.pickModalSubtitle}>
              Multiple places matched your search. Pick one to load courts nearby.
            </Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.pickModalScroll}
            >
              {locationPickOptions.map((opt, index) => (
                <Pressable
                  key={`${opt.latitude.toFixed(4)},${opt.longitude.toFixed(4)}-${index}`}
                  style={({ pressed }) => [
                    styles.pickOptionRow,
                    pressed && { backgroundColor: colors.surfaceElevated },
                  ]}
                  onPress={() => void handlePickSearchLocation(opt)}
                  android_ripple={{ color: colors.border }}
                >
                  <Text style={styles.pickOptionText}>{opt.label}</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.textMuted}
                  />
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={styles.pickModalCancel}
              onPress={() => setLocationPickVisible(false)}
            >
              <Text style={styles.pickModalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <View style={styles.mapSlot} onLayout={onMapSlotLayout}>
        <MapView
          ref={mapRef}
          style={styles.map}
          customMapStyle={RIMRUN_MAP_THEME}
          initialRegion={mapInitialRegionRef.current ?? region}
          showsUserLocation={false}
          userInterfaceStyle="dark"
          loadingEnabled={false}
          onPress={
            Platform.OS === "android" ? clearAndroidCourtSelection : undefined
          }
        >
          {userLocation && (
            <Marker
              coordinate={userLocation}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={Platform.OS === "android"}
            >
              <View style={styles.userLocationMarker} />
            </Marker>
          )}
          {visibleCourts.map((court) => (
            <CourtMapMarker
              key={court.id}
              court={court}
              pinWidth={PIN_WIDTH}
              pinHeight={PIN_HEIGHT}
              getDisplayName={getDisplayName}
              callout={styles.callout}
              calloutTitle={styles.calloutTitle}
              calloutText={styles.calloutText}
              calloutHint={styles.calloutHint}
              onAndroidPinPress={handleAndroidCourtPin}
            />
          ))}
        </MapView>

        {courtsFetchFailed && !courtsLoading && (
          <View style={styles.fetchErrorBanner}>
            <Text style={styles.fetchErrorText}>Couldn&apos;t load courts. Check your connection.</Text>
            <Pressable
              onPress={() => {
                if (region) {
                  void runCourtsSearch({
                    anchorLat: region.latitude,
                    anchorLng: region.longitude,
                    radiusMiles: radiusMilesRef.current,
                    userAnchored: false,
                    animateMap: false,
                    force: true,
                  });
                }
              }}
            >
              <Text style={styles.fetchErrorRetry}>Retry</Text>
            </Pressable>
          </View>
        )}

        {showCourtsLoadingUi && (
          <View style={styles.loadingOverlayWrap} pointerEvents="none">
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingLabel}>Updating courts…</Text>
            </View>
          </View>
        )}

        {Platform.OS === "android" &&
          androidSelectedCourt &&
          androidBubbleScreenPos && (
            <View
              style={[
                styles.androidCourtBubbleWrap,
                {
                  left: androidBubbleScreenPos.left,
                  top: androidBubbleScreenPos.top,
                },
              ]}
              pointerEvents="box-none"
            >
              <View style={styles.androidCourtBubbleCard}>
                <Pressable
                  onPress={() => openCourtFromMap(androidSelectedCourt)}
                  accessibilityRole="button"
                  accessibilityLabel="Open court details"
                >
                  <CourtCalloutBubbleContent
                    court={androidSelectedCourt}
                    getDisplayName={getDisplayName}
                    callout={styles.androidCallout}
                    calloutTitle={styles.androidCalloutTitle}
                    calloutText={styles.androidCalloutText}
                    calloutHint={styles.androidCalloutHint}
                  />
                </Pressable>
                <Pressable
                  style={styles.androidCourtClose}
                  onPress={() => setAndroidSelectedCourt(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss court preview"
                  hitSlop={8}
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>
          )}

        <Pressable
          onPress={() => void handleRecenter()}
          style={styles.recenterButton}
          disabled={recentering}
          accessibilityRole="button"
          accessibilityLabel="Relocate to my position"
        >
          {recentering ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="locate" size={24} color={colors.text} />
          )}
        </Pressable>
        <Pressable onPress={handleAddCourt} style={styles.addCourtButton}>
          <Ionicons
            name="add-outline"
            size={24}
            color={styles.addCourtButtonIcon.color}
          />
        </Pressable>
      </View>
    </View>
    </TouchableWithoutFeedback>
  );
}
