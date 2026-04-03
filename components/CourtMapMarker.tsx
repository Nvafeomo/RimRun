import React, { memo, useEffect, useState } from "react";
import {
  View,
  Image,
  Text,
  StyleProp,
  TextStyle,
  ViewStyle,
  Platform,
} from "react-native";
import { Marker, Callout } from "react-native-maps";
import { router } from "expo-router";

export type CourtMapMarkerCourt = {
  id: string;
  name: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  hoops: number | null;
  is_private: boolean | null;
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
      {court.is_private && <Text style={calloutText}>Private</Text>}
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
   * it often snapshots before the Image paints → invisible pins. iOS is fine with false.
   */
  const [tracksViewChanges, setTracksViewChanges] = useState(
    () => Platform.OS === "android",
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const t = setTimeout(() => setTracksViewChanges(false), 800);
    return () => clearTimeout(t);
  }, []);

  const goToCourt = () => {
    router.push(`/(app)/court/${court.id}`);
  };

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
          onLoad={() => {
            setTimeout(() => setTracksViewChanges(false), 120);
          }}
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
      tracksViewChanges={tracksViewChanges}
      onCalloutPress={goToCourt}
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
