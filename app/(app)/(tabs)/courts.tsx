import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Image,
  Text,
} from "react-native";
import ClusteredMapView from "react-native-map-clustering";
import MapView, { Region, Marker, Callout } from "react-native-maps";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { supabase } from "../../../lib/supabase";
import { useCourtAliases } from "../../../hooks/useCourtAliases";
import { colors, borderRadius, spacing } from "../../../constants/theme";

const DEFAULT_REGION: Region = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

const ZOOM_DELTA = 0.01;

/**
 * Rows per viewport request. Keep ≤ Supabase API max rows (e.g. 50k).
 * Clustering keeps native marker count low; this cap bounds JS/network load.
 */
const VIEWPORT_FETCH_LIMIT = 50000;

/** Debounce map-driven refetches so panning does not spam the API / cluster rebuild. */
const VIEWPORT_FETCH_DEBOUNCE_MS = 420;

/**
 * Only treat a region change as worth refetching if the view moved or zoomed enough.
 * Stops micro-jitter from onRegionChangeComplete from clearing/rebuilding pins constantly.
 */
function regionWarrantsRefetch(prev: Region, next: Region): boolean {
  const latSpan = Math.max(prev.latitudeDelta, 1e-9);
  const lngSpan = Math.max(prev.longitudeDelta, 1e-9);
  const latMove = Math.abs(next.latitude - prev.latitude) / latSpan;
  const lngMove = Math.abs(next.longitude - prev.longitude) / lngSpan;
  const zoomRatio =
    Math.max(prev.latitudeDelta, next.latitudeDelta) /
    Math.min(prev.latitudeDelta, next.latitudeDelta);
  const zoomChanged = Math.abs(zoomRatio - 1) > 0.12;
  return latMove > 0.1 || lngMove > 0.1 || zoomChanged;
}

function regionToBounds(r: Region, paddingRatio = 0.12) {
  const padLat = r.latitudeDelta * paddingRatio;
  const padLng = r.longitudeDelta * paddingRatio;
  return {
    minLat: r.latitude - r.latitudeDelta / 2 - padLat,
    maxLat: r.latitude + r.latitudeDelta / 2 + padLat,
    minLng: r.longitude - r.longitudeDelta / 2 - padLng,
    maxLng: r.longitude + r.longitudeDelta / 2 + padLng,
  };
}

/** Same asset as single-court pins; scale up slightly for larger clusters. */
function clusterPinDimensions(pointCount: number) {
  const baseW = 60;
  const baseH = 70;
  const n = Math.max(pointCount, 2);
  const scale = Math.min(1.55, Math.max(1, 0.9 + Math.log10(n) * 0.22));
  const width = Math.round(baseW * scale);
  const height = Math.round(baseH * scale);
  const fontSize = Math.min(16, 10 + Math.round(Math.log10(n + 1) * 3.2));
  return { width, height, fontSize };
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
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  markerImage: {
    width: 60,
    height: 70,
  },
  clusterPinWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  clusterBadge: {
    position: "absolute",
    top: 2,
    right: -4,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 2,
    borderColor: colors.background,
    minWidth: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  clusterBadgeText: {
    color: colors.text,
    fontWeight: "700",
  },
  callout: {
    minWidth: 140,
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
  /** Current map view; drives bbox queries (not the full global table). */
  const [viewportRegion, setViewportRegion] = useState<Region | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  /** Last region we used to trigger a fetch (for “meaningful move” gating). */
  const viewportForFetchRef = useRef<Region | null>(null);
  /** Monotonic id so stale in-flight responses never replace current pins. */
  const fetchRequestIdRef = useRef(0);

  const fetchCourtsForViewport = useCallback(
    async (r: Region, requestId: number) => {
      const { minLat, maxLat, minLng, maxLng } = regionToBounds(r);
      const { data, error } = await supabase
        .from("courts")
        .select("id, name, address, latitude, longitude, hoops, is_private")
        .gte("latitude", minLat)
        .lte("latitude", maxLat)
        .gte("longitude", minLng)
        .lte("longitude", maxLng)
        .order("latitude", { ascending: true })
        .order("longitude", { ascending: true })
        .limit(VIEWPORT_FETCH_LIMIT);
      if (requestId !== fetchRequestIdRef.current) {
        return;
      }
      if (error) {
        console.error("Error fetching courts:", error);
        return;
      }
      setCourts(data ?? []);
    },
    []
  );

  const onRegionChangeComplete = useCallback((r: Region) => {
    const prev = viewportForFetchRef.current;
    if (prev !== null && !regionWarrantsRefetch(prev, r)) {
      return;
    }
    viewportForFetchRef.current = r;
    setViewportRegion(r);
  }, []);

  useEffect(() => {
    if (region) {
      viewportForFetchRef.current = region;
      setViewportRegion(region);
    }
  }, [region]);

  useEffect(() => {
    if (!viewportRegion) {
      return;
    }
    const requestId = ++fetchRequestIdRef.current;
    const r = viewportRegion;
    const t = setTimeout(() => {
      void fetchCourtsForViewport(r, requestId);
    }, VIEWPORT_FETCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
    };
  }, [viewportRegion, fetchCourtsForViewport]);

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
          latitudeDelta: ZOOM_DELTA,
          longitudeDelta: ZOOM_DELTA,
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
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 10 },
        (loc) => {
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      );
    })();
    return () => locationSubRef.current?.remove();
  }, []);

  const renderCluster = useCallback((cluster: {
    id: number;
    geometry: { coordinates: [number, number] };
    properties: { point_count?: number };
    onPress: () => void;
  }) => {
    const { geometry, properties, onPress, id } = cluster;
    const count = properties?.point_count ?? 0;
    const { width, height, fontSize } = clusterPinDimensions(count);
    return (
      <Marker
        key={`cluster-${id}`}
        coordinate={{
          latitude: geometry.coordinates[1],
          longitude: geometry.coordinates[0],
        }}
        onPress={onPress}
        tracksViewChanges={false}
        anchor={{ x: 0.5, y: 1 }}
        style={{ zIndex: Math.min(count + 100, 9999) }}
      >
        <View style={styles.clusterPinWrap}>
          <Image
            source={require("../../../assets/rimrun-logo.png")}
            style={{ width, height }}
            resizeMode="contain"
          />
          <View style={styles.clusterBadge}>
            <Text style={[styles.clusterBadgeText, { fontSize }]}>
              {count > 9999 ? "9999+" : String(count)}
            </Text>
          </View>
        </View>
      </Marker>
    );
  }, []);

  const handleAddCourt = () => {
    router.push("/(app)/court/add");
  };
  const handleRecenter = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;
      mapRef.current?.animateToRegion({
        latitude,
        longitude,
        latitudeDelta: ZOOM_DELTA,
        longitudeDelta: ZOOM_DELTA,
      });
    } catch {
      // Location unavailable
    }
  };

  if (!region) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ClusteredMapView
        ref={mapRef}
        style={styles.map}
        customMapStyle={RIMRUN_MAP_THEME}
        initialRegion={region}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation={false}
        userInterfaceStyle="dark"
        clusteringEnabled
        spiralEnabled
        radius={72}
        minZoom={1}
        maxZoom={20}
        minPoints={2}
        extent={512}
        renderCluster={renderCluster}
        tracksViewChanges={false}
        animationEnabled={false}
      >
        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            {...({ cluster: false } as Record<string, unknown>)}
          >
            <View style={styles.userLocationMarker} />
          </Marker>
        )}
        {courts.map((court) => (
          <Marker
            key={court.id}
            tracksViewChanges={false}
            coordinate={{
              latitude: court.latitude,
              longitude: court.longitude,
            }}
            onCalloutPress={() => router.push(`/(app)/court/${court.id}`)}
          >
            <Image
              source={require("../../../assets/rimrun-logo.png")}
              style={styles.markerImage}
              resizeMode="contain"
            />
            <Callout tooltip>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>
                  {getDisplayName(court.id, court.name ?? "Basketball Court")}
                </Text>
                {court.hoops != null && (
                  <Text style={styles.calloutText}>
                    {court.hoops} hoop{court.hoops !== 1 ? "s" : ""}
                  </Text>
                )}
                {court.address && (
                  <Text style={styles.calloutText} numberOfLines={2}>
                    {court.address}
                  </Text>
                )}
                {court.is_private && (
                  <Text style={styles.calloutText}>Private</Text>
                )}
                <Text style={styles.calloutHint}>Tap to view court →</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </ClusteredMapView>
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
