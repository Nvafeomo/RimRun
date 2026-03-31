import React, { memo } from "react";
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

type Props = {
  court: CourtMapMarkerCourt;
  pinWidth: number;
  pinHeight: number;
  getDisplayName: (id: string, fallback: string) => string;
  callout: StyleProp<ViewStyle>;
  calloutTitle: StyleProp<TextStyle>;
  calloutText: StyleProp<TextStyle>;
  calloutHint: StyleProp<TextStyle>;
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
}: Props) {
  const goToCourt = () => {
    router.push(`/(app)/court/${court.id}`);
  };

  return (
    <Marker
      coordinate={{
        latitude: court.latitude,
        longitude: court.longitude,
      }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={false}
      onCalloutPress={goToCourt}
    >
      <Image
        source={require("../assets/rimrun-logo.png")}
        style={{ width: pinWidth, height: pinHeight }}
        resizeMode="contain"
      />
      <Callout tooltip={Platform.OS === "ios"} onPress={goToCourt}>
        <View style={callout} collapsable={false}>
          <Text style={calloutTitle}>
            {getDisplayName(court.id, court.name ?? "Basketball Court")}
          </Text>
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
          {court.is_private && (
            <Text style={calloutText}>Private</Text>
          )}
          <Text style={calloutHint}>Tap to view court →</Text>
        </View>
      </Callout>
    </Marker>
  );
}

/** Memoized so panning the map does not rebuild every marker subtree on parent re-renders. */
export default memo(CourtMapMarkerInner);
