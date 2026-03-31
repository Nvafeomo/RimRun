import React, { useEffect, useState, useRef } from "react";
import {
  View,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Platform,
  Text,
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

const DEFAULT_REGION: Region = {
  latitude: 37.78825,
  longitude: -122.4324,
  /** ~30–35 mi span so ~20 mi radius is comfortably in view */
  latitudeDelta: 0.52,
  longitudeDelta: 0.52,
};

/** Map zoom when recentering on user (~20 mi context). */
const MAP_DELTA_NEAR_USER = 0.52;

/** Show courts within this radius of the anchor point (user or default map center). */
const COURTS_RADIUS_MILES = 20;

/**
 * One Supabase request cap. No `.order()` — ordering would truncate to a lat/lng stripe
 * inside the bbox and hide courts elsewhere in the circle.
 */
const FETCH_ROW_CAP = 50_000;

/** How many markers to add per animation frame when revealing (near → far). */
const REVEAL_MARKERS_PER_FRAME = 36;

const PIN_WIDTH = 36;
const PIN_HEIGHT = 44;

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
  /** Courts within COURTS_RADIUS_MILES, sorted nearest → farthest from anchor. */
  const [sortedCourts, setSortedCourts] = useState<Court[]>([]);
  /** Subset revealed progressively for smooth “spread” from user. */
  const [visibleCourts, setVisibleCourts] = useState<Court[]>([]);
  const [courtsLoading, setCourtsLoading] = useState(false);

  const mapRef = useRef<MapView | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const fetchRequestIdRef = useRef(0);
  const courtsLoadStartedRef = useRef(false);

  /** Single load when `region` is ready (not on every GPS tick). Anchor = user if granted, else map center. */
  useEffect(() => {
    if (!region || courtsLoadStartedRef.current) {
      return;
    }
    courtsLoadStartedRef.current = true;

    const centerLat = userLocation?.latitude ?? region.latitude;
    const centerLng = userLocation?.longitude ?? region.longitude;
    const requestId = ++fetchRequestIdRef.current;

    setCourtsLoading(true);
    setSortedCourts([]);
    setVisibleCourts([]);

    const { minLat, maxLat, minLng, maxLng } = boundingBoxForRadiusMiles(
      centerLat,
      centerLng,
      COURTS_RADIUS_MILES
    );

    void (async () => {
      const { data, error } = await supabase
        .from("courts")
        .select("id, name, address, latitude, longitude, hoops, is_private")
        .gte("latitude", minLat)
        .lte("latitude", maxLat)
        .gte("longitude", minLng)
        .lte("longitude", maxLng)
        .limit(FETCH_ROW_CAP);

      if (requestId !== fetchRequestIdRef.current) {
        return;
      }

      if (error) {
        console.error("Error fetching courts:", error);
        setCourtsLoading(false);
        return;
      }

      const rows = data ?? [];
      const inRadius = rows.filter((c) => {
        const d = haversineMiles(
          centerLat,
          centerLng,
          c.latitude,
          c.longitude
        );
        return d <= COURTS_RADIUS_MILES;
      });

      inRadius.sort(
        (a, b) =>
          haversineMiles(centerLat, centerLng, a.latitude, a.longitude) -
          haversineMiles(centerLat, centerLng, b.latitude, b.longitude)
      );

      setSortedCourts(inRadius);
      setCourtsLoading(false);
    })();
  }, [region]);

  /** Reveal markers from nearest to farthest in small batches each frame. */
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
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      );
    })();
    return () => locationSubRef.current?.remove();
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
        latitudeDelta: MAP_DELTA_NEAR_USER,
        longitudeDelta: MAP_DELTA_NEAR_USER,
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
