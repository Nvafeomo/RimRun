import React, { memo, useCallback, useRef, useState } from "react";
import {
  View,
  Image,
  Text,
  StyleSheet,
  StyleProp,
  TextStyle,
  ViewStyle,
  Platform,
} from "react-native";
import { Marker, Callout } from "react-native-maps";
import { router } from "expo-router";
import { colors, spacing, borderRadius } from "../constants/theme";
import {
  isCourtRecentlyAdded,
  isCourtUserAdded,
} from "../lib/courtProvenance";

export type CourtMapMarkerCourt = {
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
  source?: string | null;
  created_at?: string | null;
};

type BubbleStyles = {
  callout: StyleProp<ViewStyle>;
  calloutTitle: StyleProp<TextStyle>;
  calloutText: StyleProp<TextStyle>;
  calloutHint: StyleProp<TextStyle>;
};

type BubbleProps = BubbleStyles & {
  court: CourtMapMarkerCourt;
  getDisplayName: (id: string, fallback: string) => string;
};

function CourtCalloutVenueTag({ isIndoor }: { isIndoor: boolean }) {
  return (
    <View style={calloutTagStyles.pill}>
      <Text style={calloutTagStyles.pillText}>
        {isIndoor ? "Indoor" : "Outdoor"}
      </Text>
    </View>
  );
}

/** Shared copy for iOS Map Callout and Android floating card (native InfoWindow is unreliable on Android). */
export function CourtCalloutBubbleContent({
  court,
  getDisplayName,
  callout,
  calloutTitle,
  calloutText,
  calloutHint,
}: BubbleProps) {
  const displayName = getDisplayName(
    court.id,
    court.name ?? "Basketball Court",
  );
  return (
    <View
      style={callout}
      collapsable={false}
      {...(Platform.OS === "android"
        ? { renderToHardwareTextureAndroid: false }
        : {})}
    >
      <Text style={calloutTitle}>{displayName}</Text>
      <View style={calloutTagStyles.tagRow}>
        {isCourtRecentlyAdded(court.created_at) ? (
          <View style={[calloutTagStyles.pill, calloutTagStyles.pillRecent]}>
            <Text style={calloutTagStyles.pillTextDark}>Recently added</Text>
          </View>
        ) : null}
        {isCourtUserAdded(court.source) ? (
          <View style={[calloutTagStyles.pill, calloutTagStyles.pillUserAdded]}>
            <Text style={calloutTagStyles.pillText}>User added</Text>
          </View>
        ) : null}
        <CourtCalloutVenueTag isIndoor={Boolean(court.is_indoor)} />
        {court.flagged_for_review ? (
          <View style={[calloutTagStyles.pill, calloutTagStyles.pillFlagged]}>
            <Text style={calloutTagStyles.pillTextDark}>Flagged</Text>
          </View>
        ) : court.verified ? (
          <View style={[calloutTagStyles.pill, calloutTagStyles.pillVerified]}>
            <Text style={calloutTagStyles.pillTextDark}>Verified</Text>
          </View>
        ) : null}
      </View>
      {court.hoops != null && (
        <Text style={calloutText}>
          {court.hoops} hoop{court.hoops !== 1 ? "s" : ""}
        </Text>
      )}
      {court.address && (
        <Text style={calloutText} numberOfLines={2}>
          {court.address}
        </Text>
      )}
      {court.is_private ? (
        <Text style={calloutText}>Private</Text>
      ) : null}
      <Text style={calloutHint}>Tap to view court →</Text>
    </View>
  );
}

type Props = BubbleStyles & {
  court: CourtMapMarkerCourt;
  pinWidth: number;
  pinHeight: number;
  getDisplayName: (id: string, fallback: string) => string;
  /** Android: native callout is skipped; parent shows a floating card when this fires. */
  onAndroidPinPress?: (court: CourtMapMarkerCourt) => void;
};

function CourtMapMarkerInner({
  court,
  pinWidth,
  pinHeight,
  getDisplayName,
  callout,
  calloutTitle,
  calloutText,
  calloutHint,
  onAndroidPinPress,
}: Props) {
  /**
   * Android Google Maps rasterizes custom marker views once; with `tracksViewChanges={false}`
   * it often snapshots before the Image paints → invisible pins. Flip true for one frame on load.
   */
  const [tracksViewChanges, setTracksViewChanges] = useState(false);

  const handleImageLoad = useCallback(() => {
    if (Platform.OS !== "android") return;
    setTracksViewChanges(true);
    requestAnimationFrame(() => setTracksViewChanges(false));
  }, []);

  const navigatingRef = useRef(false);

  const goToCourt = useCallback(() => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    router.push(`/(app)/court/${court.id}`);
    setTimeout(() => {
      navigatingRef.current = false;
    }, 600);
  }, [court.id]);

  const bubbleProps: BubbleProps = {
    court,
    getDisplayName,
    callout,
    calloutTitle,
    calloutText,
    calloutHint,
  };

  if (Platform.OS === "android") {
    return (
      <Marker
        coordinate={{
          latitude: court.latitude,
          longitude: court.longitude,
        }}
        anchor={{ x: 0.5, y: 1 }}
        tracksViewChanges={tracksViewChanges}
        onPress={() => onAndroidPinPress?.(court)}
      >
        <Image
          source={require("../assets/rimrun-logo.png")}
          style={{ width: pinWidth, height: pinHeight }}
          resizeMode="contain"
          onLoad={handleImageLoad}
        />
      </Marker>
    );
  }

  return (
    <Marker
      coordinate={{
        latitude: court.latitude,
        longitude: court.longitude,
      }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={false}
    >
      <Image
        source={require("../assets/rimrun-logo.png")}
        style={{ width: pinWidth, height: pinHeight }}
        resizeMode="contain"
      />
      <Callout tooltip onPress={goToCourt}>
        <CourtCalloutBubbleContent {...bubbleProps} />
      </Callout>
    </Marker>
  );
}

export default memo(CourtMapMarkerInner);

const calloutTagStyles = StyleSheet.create({
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  pill: {
    alignSelf: "flex-start",
    minWidth: 68,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  pillVerified: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  pillFlagged: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  pillRecent: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  pillUserAdded: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  pillTextDark: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});
