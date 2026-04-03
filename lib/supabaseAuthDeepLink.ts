import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const PENDING_PASSWORD_RECOVERY_KEY = 'rimrun_pending_password_recovery';

export async function hasPendingPasswordRecovery(): Promise<boolean> {
  return (await AsyncStorage.getItem(PENDING_PASSWORD_RECOVERY_KEY)) === '1';
}

export async function clearPendingPasswordRecovery(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_PASSWORD_RECOVERY_KEY);
}

/** True if URL looks like a Supabase auth redirect (tokens or PKCE code). */
export function isLikelyAuthCallback(url: string): boolean {
  return /[?&#](access_token|refresh_token|code)=/.test(url);
}

/**
 * Parses access/refresh tokens from Supabase email redirects (fragment or query).
 */
export function parseTokensFromAuthUrl(url: string): {
  access_token: string | null;
  refresh_token: string | null;
  type: string | null;
  code: string | null;
} {
  const noHash = url.split('#')[0] ?? url;
  const hashPart = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const queryPart = noHash.includes('?') ? noHash.split('?')[1] ?? '' : '';
  const search = hashPart || queryPart;
  const params = new URLSearchParams(search);
  return {
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
    type: params.get('type'),
    code: params.get('code'),
  };
}

/**
 * Applies Supabase auth from a deep link (password recovery, magic link, etc.).
 * Returns true if a session was established or exchanged.
 */
export async function applyAuthFromUrl(url: string): Promise<boolean> {
  const { access_token, refresh_token, code, type } = parseTokensFromAuthUrl(url);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn('[auth deep link] exchangeCodeForSession', error.message);
      return false;
    }
    if (url.includes('reset-password')) {
      await AsyncStorage.setItem(PENDING_PASSWORD_RECOVERY_KEY, '1');
    }
    return true;
  }

  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) {
      console.warn('[auth deep link] setSession', error.message);
      return false;
    }
    if (type === 'recovery' || url.includes('reset-password')) {
      await AsyncStorage.setItem(PENDING_PASSWORD_RECOVERY_KEY, '1');
    }
    return true;
  }

  return false;
}
