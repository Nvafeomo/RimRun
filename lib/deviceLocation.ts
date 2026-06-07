import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { withTimeout } from './withTimeout';

const GPS_TIMEOUT_MS = 12_000;
const RECENTER_GPS_TIMEOUT_MS = 6_000;

export async function ensureForegroundLocationPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === 'granted') return true;
  const requested = await Location.requestForegroundPermissionsAsync();
  return requested.status === 'granted';
}

/** Best-effort device coordinates for startup (last-known first, then fresh GPS). */
export async function resolveDeviceCoordinates(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  const granted = await ensureForegroundLocationPermission();
  if (!granted) return null;

  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 300_000 });
    if (last) {
      return { latitude: last.coords.latitude, longitude: last.coords.longitude };
    }
  } catch {
    /* ignore */
  }

  try {
    const loc = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy:
          Platform.OS === 'android'
            ? Location.Accuracy.Low
            : Location.Accuracy.Balanced,
      }),
      GPS_TIMEOUT_MS,
      'GPS',
    );
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch {
    return null;
  }
}

/** Fast recenter: last-known immediately; optional fresh GPS refines in background. */
export async function resolveRecenterCoordinates(): Promise<{
  latitude: number;
  longitude: number;
  fresh: boolean;
} | null> {
  const granted = await ensureForegroundLocationPermission();
  if (!granted) return null;

  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 300_000 });
    if (last) {
      return {
        latitude: last.coords.latitude,
        longitude: last.coords.longitude,
        fresh: false,
      };
    }
  } catch {
    /* ignore */
  }

  try {
    const loc = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy:
          Platform.OS === 'android'
            ? Location.Accuracy.Lowest
            : Location.Accuracy.Low,
      }),
      RECENTER_GPS_TIMEOUT_MS,
      'GPS',
    );
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      fresh: true,
    };
  } catch {
    return null;
  }
}

/** Background GPS refine after a fast last-known recenter. */
export async function refineDeviceCoordinates(
  previous: { latitude: number; longitude: number },
  minShiftMiles = 0.15,
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const loc = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy:
          Platform.OS === 'android'
            ? Location.Accuracy.Lowest
            : Location.Accuracy.Low,
      }),
      RECENTER_GPS_TIMEOUT_MS,
      'GPS',
    );
    const next = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    const dLat = (next.latitude - previous.latitude) * 69;
    const dLng =
      (next.longitude - previous.longitude) *
      69 *
      Math.cos((previous.latitude * Math.PI) / 180);
    const miles = Math.sqrt(dLat * dLat + dLng * dLng);
    return miles >= minShiftMiles ? next : null;
  } catch {
    return null;
  }
}
