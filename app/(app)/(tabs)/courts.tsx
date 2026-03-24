import React, { useEffect, useState, useRef } from "react";
import {
  View,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Image,
  Text,
} from "react-native";
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

// Dark map style matching RimRun theme (background, surface, primary)
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
});

export default function CourtsScreen() {
  const { getDisplayName } = useCourtAliases();
  const [region, setRegion] = useState<Region | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const mapRef = useRef<MapView>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);

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

  useEffect(() => {
    if (!region) return;
    const fetchCourts = async () => {
      const { data, error } = await supabase
        .from("courts")
        .select("id, name, address, latitude, longitude, hoops, is_private")
        .not("latitude", "is", null)
        .not("longitude", "is", null);
      if (error) {
        console.error("Error fetching courts:", error);
        return;
      }
      setCourts(data ?? []);
    };
    fetchCourts();
  }, [region]);

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
      <MapView
        ref={mapRef}
        style={styles.map}
        customMapStyle={RIMRUN_MAP_THEME}
        initialRegion={region}
        showsUserLocation={false}
        userInterfaceStyle="dark"
      >
        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
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
      </MapView>
      <Pressable onPress={handleRecenter} style={styles.recenterButton}>
        <Ionicons name="locate" size={24} color={colors.text} />
      </Pressable>
    </View>
  );
}