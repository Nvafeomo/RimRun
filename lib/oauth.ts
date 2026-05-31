/**
 * Native Apple + Google sign-in for Supabase (`signInWithIdToken`).
 *
 * Google Cloud Console: create OAuth clients (Web + iOS + Android).
 * Supabase → Authentication → Providers → Google: use the Web client ID/secret.
 * If iOS sign-in fails with a nonce error, enable "Skip nonce check" for Google in Supabase.
 *
 * Google Sign-In requires a dev/preview/production build — it is not available in Expo Go.
 */
import { Platform, TurboModuleRegistry } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');

let googleConfigured = false;
let googleModulePromise: Promise<GoogleSignInModule> | null = null;

const GOOGLE_UNAVAILABLE_MESSAGE =
  'Google Sign-In needs a development or preview build. Expo Go does not include native Google Sign-In — use your EAS build or run npx expo run:ios.';

/** True when the native Google Sign-In module is linked (dev/preview/production builds). */
export function isGoogleSignInAvailable(): boolean {
  return TurboModuleRegistry.get('RNGoogleSignin') != null;
}

async function loadGoogleSignIn(): Promise<GoogleSignInModule> {
  if (!isGoogleSignInAvailable()) {
    throw new Error(GOOGLE_UNAVAILABLE_MESSAGE);
  }
  if (!googleModulePromise) {
    googleModulePromise = import('@react-native-google-signin/google-signin');
  }
  return googleModulePromise;
}

async function ensureGoogleConfigured(
  GoogleSignin: GoogleSignInModule['GoogleSignin']
): Promise<void> {
  if (googleConfigured) return;

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!webClientId) {
    throw new Error(
      'Google Sign-In is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (Web OAuth client from Google Cloud Console).',
    );
  }

  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();

  GoogleSignin.configure({
    webClientId,
    ...(iosClientId ? { iosClientId } : {}),
    offlineAccess: false,
  });

  googleConfigured = true;
}

/** Call on app sign-out so the next Google sign-in shows the account picker. */
export async function signOutGoogleIfNeeded(): Promise<void> {
  if (!isGoogleSignInAvailable()) {
    return;
  }
  try {
    const { GoogleSignin } = await loadGoogleSignIn();
    await ensureGoogleConfigured(GoogleSignin);
    await GoogleSignin.signOut();
  } catch {
    // Ignore — user may not have used Google or native module unavailable.
  }
}

export async function signInWithApple(): Promise<void> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  const { identityToken } = credential;
  if (!identityToken) {
    throw new Error('Apple sign-in failed: no identity token returned.');
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
  });
  if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> {
  const { GoogleSignin, statusCodes, isErrorWithCode } =
    await loadGoogleSignIn();
  await ensureGoogleConfigured(GoogleSignin);

  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  try {
    const response = await GoogleSignin.signIn();

    if (response.type === 'cancelled') {
      throw new Error('Sign-in was cancelled.');
    }

    if (response.type !== 'success') {
      throw new Error('Google sign-in failed.');
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error('Google sign-in failed: no ID token returned.');
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) throw error;
  } catch (e: unknown) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new Error('Sign-in was cancelled.');
      }
      if (e.code === statusCodes.IN_PROGRESS) {
        throw new Error('Google sign-in is already in progress.');
      }
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services is not available on this device.');
      }
    }
    throw e;
  }
}
