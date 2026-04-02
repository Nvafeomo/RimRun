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
} from "react-native";
import MapView, { Region, Marker } from "react-native-maps";
import { router } from "expo-router";
import CourtMapMarker from "../../../components/CourtMapMarker";
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

const DEFAULT_REGION: Region = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.52,
  longitudeDelta: 0.52,
};

const MAP_DELTA_NEAR_USER = 0.52;

const DEFAULT_RADIUS_MILES = 15;

/** If the last load was centered on the user, refetch when GPS moves farther than this (miles). */
const REFETCH_MOVE_MILES = 8;

const FETCH_ROW_CAP = 50_000;

const REVEAL_MARKERS_PER_FRAME = 36;

const PIN_WIDTH = 36;
const PIN_HEIGHT = 44;

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
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 15,
  },
  milesInput: {
    width: 52,
    height: 40,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 15,
    textAlign: "center",
  },
  searchButton: {
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  searchButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.background,
  },
  searchButtonDisabled: {
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  pickModalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  pickModalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  pickModalScroll: {
    maxHeight: 360,
  },
  pickOptionRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pickOptionText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 20,
  },
  pickModalCancel: {
    paddingVertical: spacing.md,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pickModalCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 20, 25, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingLabel: {
    marginTop: spacing.md,
    fontSize: 15,
    color: colors.textSecondary,
  },
  callout: {
    minWidth: 160,
    maxWidth: 280,
    minHeight: 72,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  calloutText: {
    fontSize: 12,
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
  const [region, setRegion] = useState<Region | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [sortedCourts, setSortedCourts] = useState<Court[]>([]);
  const [visibleCourts, setVisibleCourts] = useState<Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);

  const [locationQuery, setLocationQuery] = useState("");
  const [milesInput, setMilesInput] = useState(String(DEFAULT_RADIUS_MILES));
  const [geocodingSearch, setGeocodingSearch] = useState(false);
  const [locationPickVisible, setLocationPickVisible] = useState(false);
  const [locationPickOptions, setLocationPickOptions] = useState<
    LocationPickOption[]
  >([]);

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

  const loadCourtsAtAnchor = useCallback(
    async (
      centerLat: number,
      centerLng: number,
      radiusMiles: number,
      requestId: number
    ): Promise<boolean> => {
      radiusMilesRef.current = radiusMiles;

      setCourtsLoading(true);
      setSortedCourts([]);
      setVisibleCourts([]);

      const { minLat, maxLat, minLng, maxLng } = boundingBoxForRadiusMiles(
        centerLat,
        centerLng,
        radiusMiles
      );

      const { data, error } = await supabase
        .from("courts")
        .select("id, name, address, latitude, longitude, hoops, is_private")
        .gte("latitude", minLat)
        .lte("latitude", maxLat)
        .gte("longitude", minLng)
        .lte("longitude", maxLng)
        .limit(FETCH_ROW_CAP);

      if (requestId !== fetchRequestIdRef.current) {
        return false;
      }

      if (error) {
        console.error("Error fetching courts:", error);
        setCourtsLoading(false);
        return false;
      }

      const rows = data ?? [];
      const inRadius = rows.filter((c) => {
        const d = haversineMiles(
          centerLat,
          centerLng,
          c.latitude,
          c.longitude
        );
        return d <= radiusMiles;
      });

      inRadius.sort(
        (a, b) =>
          haversineMiles(centerLat, centerLng, a.latitude, a.longitude) -
          haversineMiles(centerLat, centerLng, b.latitude, b.longitude)
      );

      setSortedCourts(inRadius);
      setCourtsLoading(false);
      return true;
    },
    []
  );

  const runCourtsSearch = useCallback(
    async (opts: {
      anchorLat: number;
      anchorLng: number;
      radiusMiles: number;
      userAnchored: boolean;
      animateMap: boolean;
    }) => {
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
      lastFetchAnchorRef.current = {
        lat: opts.anchorLat,
        lng: opts.anchorLng,
      };
      lastFetchWasUserAnchoredRef.current = opts.userAnchored;

      if (opts.animateMap) {
        const d = mapDeltaForRadiusMiles(opts.radiusMiles);
        mapRef.current?.animateToRegion({
          latitude: opts.anchorLat,
          longitude: opts.anchorLng,
          latitudeDelta: d,
          longitudeDelta: d,
        });
        setRegion({
          latitude: opts.anchorLat,
          longitude: opts.anchorLng,
          latitudeDelta: d,
          longitudeDelta: d,
        });
      }
    },
    [loadCourtsAtAnchor]
  );

  const runCourtsSearchRef = useRef(runCourtsSearch);
  runCourtsSearchRef.current = runCourtsSearch;

  /** First paint: same as blank search — current location (or map default) + miles field. */
  useEffect(() => {
    if (!region || initialCourtsLoadStartedRef.current) {
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
      userAnchored: true,
      animateMap: false,
    });
    // Intentionally omit milesInput/userLocation: run once when map region is ready; GPS and region are set together when permission is granted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, runCourtsSearch]);

  useEffect(() => {
    if (sortedCourts.length === 0) {
      setVisibleCourts([]);
      return;
    }

    let index = 0;
    let raf = 0;

    const tick = () => {
      index = Math.min(
        sortedCourts.length,
        index + REVEAL_MARKERS_PER_FRAME
      );
      setVisibleCourts(sortedCourts.slice(0, index));
      if (index < sortedCourts.length) {
        raf = requestAnimationFrame(tick);
      }
    };

    setVisibleCourts([]);
    index = 0;
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [sortedCourts]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setRegion(DEFAULT_REGION);
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { latitude, longitude } = loc.coords;
        setUserLocation({ latitude, longitude });
        setRegion({
          latitude,
          longitude,
          latitudeDelta: MAP_DELTA_NEAR_USER,
          longitudeDelta: MAP_DELTA_NEAR_USER,
        });
      } catch {
        setRegion(DEFAULT_REGION);
      }
    })();
  }, []);

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

          const anchor = lastFetchAnchorRef.current;
          if (
            !lastFetchWasUserAnchoredRef.current ||
            !anchor ||
            moveRefetchInFlightRef.current
          ) {
            return;
          }
          const dist = haversineMiles(
            latitude,
            longitude,
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
              anchorLat: latitude,
              anchorLng: longitude,
              radiusMiles: r,
              userAnchored: true,
              animateMap: false,
            })
            .finally(() => {
              moveRefetchInFlightRef.current = false;
            });
        }
      );
    })();
    return () => locationSubRef.current?.remove();
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

      const options = await enrichPickOptions(raw, userLocation);
      if (options.length === 1) {
        const only = options[0];
        setLocationQuery(only.label);
        await runCourtsSearch({
          anchorLat: only.latitude,
          anchorLng: only.longitude,
          radiusMiles,
          userAnchored: false,
          animateMap: true,
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
      });
    },
    [milesInput, runCourtsSearch]
  );

  const handleAddCourt = () => {
    router.push("/(app)/court/add");
  };

  const handleRecenter = useCallback(async () => {
    Keyboard.dismiss();
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;
      setUserLocation({ latitude, longitude });
      setLocationQuery("");
      const radiusMiles = parseMilesInput(milesInput);
      await runCourtsSearch({
        anchorLat: latitude,
        anchorLng: longitude,
        radiusMiles,
        userAnchored: true,
        animateMap: true,
      });
    } catch {
      // Location unavailable
    }
  }, [milesInput, runCourtsSearch]);

  if (!region) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="City, neighborhood, or address"
          placeholderTextColor={colors.textMuted}
          value={locationQuery}
          onChangeText={setLocationQuery}
          returnKeyType="search"
          onSubmitEditing={handleCourtsSearch}
          editable={!geocodingSearch}
          autoCorrect
          autoCapitalize="words"
        />
        <TextInput
          style={styles.milesInput}
          placeholder="mi"
          placeholderTextColor={colors.textMuted}
          value={milesInput}
          onChangeText={setMilesInput}
          editable={!geocodingSearch}
          keyboardType={
            Platform.OS === "ios" ? "number-pad" : "numeric"
          }
          maxLength={4}
        />
        <Pressable
          style={[
            styles.searchButton,
            geocodingSearch && styles.searchButtonDisabled,
          ]}
          onPress={handleCourtsSearch}
          disabled={geocodingSearch}
          accessibilityRole="button"
          accessibilityLabel="Search courts"
        >
          {geocodingSearch ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </Pressable>
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
            <Text style={styles.pickModalTitle}>Which place?</Text>
            <Text style={styles.pickModalSubtitle}>
              Several locations matched. Choose one to search nearby courts.
            </Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={styles.pickModalScroll}
            >
              {locationPickOptions.map((opt, index) => (
                <Pressable
                  key={`${opt.latitude.toFixed(4)},${opt.longitude.toFixed(4)}-${index}`}
                  style={styles.pickOptionRow}
                  onPress={() => void handlePickSearchLocation(opt)}
                >
                  <Text style={styles.pickOptionText}>{opt.label}</Text>
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

      <MapView
        ref={mapRef}
        style={styles.map}
        customMapStyle={
          Platform.OS === "android" ? undefined : RIMRUN_MAP_THEME
        }
        initialRegion={region}
        showsUserLocation={false}
        userInterfaceStyle={Platform.OS === "android" ? "light" : "dark"}
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
          />
        ))}
      </MapView>

      {courtsLoading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingLabel}>Loading nearby courts…</Text>
        </View>
      )}

      <Pressable onPress={handleRecenter} style={styles.recenterButton}>
        <Ionicons name="locate" size={24} color={colors.text} />
      </Pressable>
      <Pressable onPress={handleAddCourt} style={styles.addCourtButton}>
        <Ionicons
          name="add-outline"
          size={24}
          color={styles.addCourtButtonIcon.color}
        />
      </Pressable>
    </View>
  );
}
