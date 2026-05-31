import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import MapView, { Region } from "react-native-maps";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../context/AuthContext";
import { useProfile } from "../../../context/ProfileContext";
import { ageInFullYears } from "../../../lib/agePolicy";
import { colors, spacing, borderRadius } from "../../../constants/theme";

/** Minimum age to add a court. Younger users would have to expose a precise public location. */
const MIN_ADD_COURT_AGE = 16;

const ZOOM_DELTA = 0.008;
/** Shown immediately so the screen does not wait on GPS (Android fix is slow with Balanced). */
const FALLBACK_REGION: Region = {
  latitude: 37.78825,
  longitude: -122.4324,
  latitudeDelta: ZOOM_DELTA,
  longitudeDelta: ZOOM_DELTA,
};
/** Minimum characters before we geocode while typing (avoids noisy API calls). */
const MIN_ADDRESS_PREVIEW_CHARS = 4;
/** Wait for a typing pause before geocoding and moving the map. */
const ADDRESS_DEBOUNCE_MS = 650;

function parseHoops(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  if (Number.isNaN(n)) return null;
  return Math.min(10, Math.max(0, n));
}

/** Map pin / GPS when no address; geocoded coords when address is set (not user location). */
async function resolveCourtCoordinates(
  trimmedAddress: string,
  region: Region
): Promise<{ latitude: number; longitude: number } | null> {
  if (trimmedAddress.length > 0) {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== "granted") {
        Alert.alert(
          "Location permission",
          "Allow location so we can look up your address on the map."
        );
        return null;
      }
    }
    try {
      const results = await Location.geocodeAsync(trimmedAddress);
      if (!results?.length) {
        Alert.alert(
          "Address not found",
          "We could not place that address. Try a street and city, or clear the field and use the map pin instead."
        );
        return null;
      }
      const { latitude, longitude } = results[0];
      return { latitude, longitude };
    } catch (e) {
      console.error("geocodeAsync", e);
      Alert.alert(
        "Geocoding failed",
        "Could not convert the address to coordinates. Clear the address and place the court with the map, or try a different address."
      );
      return null;
    }
  }
  return { latitude: region.latitude, longitude: region.longitude };
}

export default function AddCourtScreen() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const mapRef = useRef<MapView>(null);
  /** Last region from GPS / initial load — map returns here when the address field is cleared. */
  const gpsRegionRef = useRef<Region>(FALLBACK_REGION);
  /** Bumps when a new address preview geocode starts; stale async results are ignored. */
  const addressPreviewGen = useRef(0);
  /** True while the address field had text (so clearing it can snap the map back to GPS). */
  const hadAddressContentRef = useRef(false);
  const [region, setRegion] = useState<Region>(FALLBACK_REGION);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [hoopsRaw, setHoopsRaw] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isIndoor, setIsIndoor] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const apply = (next: Region) => {
      if (cancelled) return;
      gpsRegionRef.current = next;
      setRegion(next);
      requestAnimationFrame(() => {
        mapRef.current?.animateToRegion(next, 350);
      });
    };
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        return;
      }

      const last = await Location.getLastKnownPositionAsync({
        maxAge: 120_000,
      });
      if (!cancelled && last) {
        apply({
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
          latitudeDelta: ZOOM_DELTA,
          longitudeDelta: ZOOM_DELTA,
        });
      }

      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy:
            Platform.OS === "android"
              ? Location.Accuracy.Low
              : Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        apply({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: ZOOM_DELTA,
          longitudeDelta: ZOOM_DELTA,
        });
      } catch {
        /* keep fallback / last-known */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced: pan map to geocoded address while typing. Clearing the field snaps back to last GPS (not the geocode).
  useEffect(() => {
    const trimmed = address.trim();
    const empty = trimmed.length === 0;

    if (empty) {
      if (hadAddressContentRef.current && gpsRegionRef.current && mapRef.current) {
        mapRef.current.animateToRegion(gpsRegionRef.current, 350);
        setRegion(gpsRegionRef.current);
      }
      hadAddressContentRef.current = false;
      return;
    }

    hadAddressContentRef.current = true;

    if (trimmed.length < MIN_ADDRESS_PREVIEW_CHARS) {
      return;
    }

    const timer = setTimeout(async () => {
      const myGen = ++addressPreviewGen.current;
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") return;
      try {
        const results = await Location.geocodeAsync(trimmed);
        if (myGen !== addressPreviewGen.current) return;
        if (!results?.length) return;
        const { latitude, longitude } = results[0];
        const next: Region = {
          latitude,
          longitude,
          latitudeDelta: ZOOM_DELTA,
          longitudeDelta: ZOOM_DELTA,
        };
        mapRef.current?.animateToRegion(next, 400);
        setRegion(next);
      } catch {
        // Preview only — no alert while typing
      }
    }, ADDRESS_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [address]);

  const useMyLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const req = await Location.requestForegroundPermissionsAsync();
        if (req.status !== "granted") {
          Alert.alert(
            "Location needed",
            "Allow location to place the court where you are."
          );
          return;
        }
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy:
          Platform.OS === "android"
            ? Location.Accuracy.Low
            : Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;
      const next = {
        latitude,
        longitude,
        latitudeDelta: ZOOM_DELTA,
        longitudeDelta: ZOOM_DELTA,
      };
      setRegion(next);
      gpsRegionRef.current = next;
      mapRef.current?.animateToRegion(next, 250);
    } catch {
      Alert.alert("Location error", "Could not read your current position.");
    } finally {
      setLocating(false);
    }
  }, []);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert("Name required", "Enter a name for this court.");
      return;
    }
    if (!region || !user?.id) return;

    const hoops = parseHoops(hoopsRaw);
    if (hoopsRaw.trim() && hoops === null) {
      Alert.alert("Invalid hoops", "Enter a number from 0 to 10, or leave blank.");
      return;
    }

    const trimmedAddress = address.trim();
    const age = profile?.date_of_birth ? ageInFullYears(profile.date_of_birth) : null;
    if (age === null || age < MIN_ADD_COURT_AGE) {
      Alert.alert(
        "Must be 16 or older",
        "You must be at least 16 years old to add a court."
      );
      return;
    }
    if (trimmedAddress.length === 0) {
      Alert.alert(
        "Address required",
        "Enter the court's public street address. Never enter a home or any private address."
      );
      return;
    }
    setSubmitting(true);
    try {
      const coords = await resolveCourtCoordinates(trimmedAddress, region);
      if (!coords) {
        return;
      }

      const row: Record<string, unknown> = {
        name: trimmedName,
        address: trimmedAddress || null,
        latitude: coords.latitude,
        longitude: coords.longitude,
        hoops,
        is_private: isPrivate,
        is_indoor: isIndoor,
        osm_id: null,
        osm_type: null,
        source: "user",
        confidence: 0.85,
        created_by: user.id,
      };

      const { data, error } = await supabase.from("courts").insert(row).select("id").single();

      if (error) {
        console.error("Insert court error:", error);
        Alert.alert(
          "Could not add court",
          error.message.includes("row-level security") || error.code === "42501"
            ? "Database policy blocked this. Run scripts/user-courts-migration.sql in Supabase (SQL Editor)."
            : error.message
        );
        return;
      }

      const courtId = data?.id;
      if (courtId) {
        await supabase.from("court_subscriptions").insert({
          user_id: user.id,
          court_id: courtId,
        });
        router.replace({
          pathname: "/(app)/court/[courtId]",
          params: { courtId },
        });
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const hasAddress = address.trim().length > 0;
  const viewerAge = profile?.date_of_birth
    ? ageInFullYears(profile.date_of_birth)
    : null;
  const tooYoungToAdd = viewerAge !== null && viewerAge < MIN_ADD_COURT_AGE;

  if (tooYoungToAdd) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Add court
          </Text>
        </View>
        <View style={styles.blockedWrap}>
          <Ionicons name="lock-closed-outline" size={48} color={colors.textMuted} />
          <Text style={styles.blockedTitle}>You must be 16 or older</Text>
          <Text style={styles.blockedBody}>
            Adding a court requires a public street address. To protect younger
            users, you must be at least 16 years old to add one.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Add court
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={styles.mapWrap}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={region}
            onRegionChangeComplete={setRegion}
            showsUserLocation
            userInterfaceStyle="dark"
          />
          <View
            style={[styles.crosshair, hasAddress && styles.crosshairInactive]}
            pointerEvents="none"
          >
            <Ionicons name="location" size={42} color={colors.primary} />
          </View>
          <Text style={styles.mapHint}>
            {hasAddress
              ? "Location comes from the address below (not this map or GPS)"
              : "Enter the court's public address below to place it on the map"}
          </Text>
          <Pressable
            style={[styles.locateChip, hasAddress && styles.locateChipDisabled]}
            onPress={useMyLocation}
            disabled={locating || hasAddress}
          >
            {locating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="locate" size={18} color={colors.primary} />
                <Text style={styles.locateChipText}>My location</Text>
              </>
            )}
          </Pressable>
        </View>

        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.formInner}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Court name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Riverside Park Courts"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Address *</Text>
          <Text style={styles.fieldHint}>
            We set the court&apos;s latitude/longitude from this address (geocoding), not from the
            map or your current location.
          </Text>
          <Text style={styles.warningHint}>
            Only enter the public address of the basketball court. Never enter
            your home or any private address — it is visible to everyone.
          </Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Street, city (public court location)"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Hoops (optional)</Text>
          <TextInput
            style={styles.input}
            value={hoopsRaw}
            onChangeText={setHoopsRaw}
            placeholder="0–10"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
          />

          <View style={styles.switchRow}>
            <Text style={styles.label}>Indoor court</Text>
            <Switch
              value={isIndoor}
              onValueChange={setIsIndoor}
              trackColor={{ false: colors.border, true: colors.primaryDark }}
              thumbColor={colors.text}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Private / restricted access</Text>
            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              trackColor={{ false: colors.border, true: colors.primaryDark }}
              thumbColor={colors.text}
            />
          </View>

          <Pressable
            style={[styles.submit, submitting && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.submitText}>Save court</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  mapWrap: {
    height: 220,
    position: "relative",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  crosshair: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -21,
    marginTop: -42,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
  },
  crosshairInactive: {
    opacity: 0.35,
  },
  mapHint: {
    position: "absolute",
    bottom: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    fontSize: 12,
    color: colors.text,
    textAlign: "center",
    textShadowColor: "#000",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  locateChip: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locateChipDisabled: {
    opacity: 0.45,
  },
  locateChipText: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 14,
  },
  formScroll: {
    flex: 1,
  },
  formInner: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  fieldHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  warningHint: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.error,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  blockedWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  blockedTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  blockedBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    fontSize: 16,
    color: colors.text,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  submit: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
});
