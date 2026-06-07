import {
  Dimensions,
  Keyboard,
  Platform,
  type KeyboardEvent,
} from "react-native";

/**
 * Pixels the keyboard overlaps the app window from the bottom.
 * Uses screenY (top of keyboard) so sizing stays correct across OEMs / nav bars.
 */
export function getKeyboardOverlapPx(event: KeyboardEvent): number {
  const { screenY, height } = event.endCoordinates;
  const windowHeight = Dimensions.get("window").height;

  if (typeof screenY === "number" && Number.isFinite(screenY)) {
    const overlap = Math.round(windowHeight - screenY);
    if (overlap > 0) return overlap;
  }

  if (typeof height === "number" && height > 0) {
    return Math.round(height);
  }

  return 0;
}

/** Android: track keyboard overlap; iOS returns a no-op unsubscribe. */
export function subscribeAndroidKeyboardOverlap(
  onOverlapChange: (overlapPx: number) => void,
): () => void {
  if (Platform.OS !== "android") {
    return () => undefined;
  }

  const update = (event: KeyboardEvent) => {
    onOverlapChange(getKeyboardOverlapPx(event));
  };

  const showSub = Keyboard.addListener("keyboardDidShow", update);
  const frameSub = Keyboard.addListener("keyboardDidChangeFrame", update);
  const hideSub = Keyboard.addListener("keyboardDidHide", () => {
    onOverlapChange(0);
  });

  return () => {
    showSub.remove();
    frameSub.remove();
    hideSub.remove();
  };
}
