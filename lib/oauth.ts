/**
 * Google OAuth for Supabase (Authentication → Providers).
 * Add getOAuthRedirectUrl() output to Supabase → URL Configuration → Redirect URLs
 * (Expo Go: exp://… from Metro; builds: rimrun://auth/callback). Avoid https://auth.expo.io/… (broken with PKCE).
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

export const OAUTH_REDIRECT_PATH = 'auth/callback';

export function getOAuthRedirectUrl(): string {
  return makeRedirectUri({
    scheme: 'rimrun',
    path: `/${OAUTH_REDIRECT_PATH}`,
    preferLocalhost: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
  });
}

type ParsedOAuthResult =
  | { kind: 'session'; access_token: string; refresh_token: string }
  | { kind: 'pkce'; code: string }
  | { kind: 'error'; message: string };

function parseOAuthCallbackUrl(url: string): ParsedOAuthResult | null {
  if (!url) return null;

  const hashIdx = url.indexOf('#');
  const fragment = hashIdx >= 0 ? url.slice(hashIdx + 1) : '';
  const hashParams = new URLSearchParams(fragment);

  const queryPart = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const queryParams = new URLSearchParams(queryPart);

  const err =
    hashParams.get('error_description') ||
    hashParams.get('error') ||
    queryParams.get('error_description') ||
    queryParams.get('error');
  if (err) {
    return { kind: 'error', message: decodeURIComponent(err.replace(/\+/g, ' ')) };
  }

  const access_token =
    hashParams.get('access_token') || queryParams.get('access_token');
  const refresh_token =
    hashParams.get('refresh_token') || queryParams.get('refresh_token');
  if (access_token && refresh_token) {
    return { kind: 'session', access_token, refresh_token };
  }

  const code = queryParams.get('code');
  if (code) {
    return { kind: 'pkce', code };
  }

  return null;
}

/**
 * After OAuth, the browser may close with `dismiss` before the deep link is applied,
 * or the session may be established only via Linking (Expo Go + exp://). Poll briefly.
 */
async function waitForSessionFromDeepLink(timeoutMs: number): Promise<boolean> {
  const intervalMs = 150;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function completeOAuthFromUrl(url: string): Promise<void> {
  const parsed = parseOAuthCallbackUrl(url);
  if (!parsed) {
    if (__DEV__) {
      console.warn('[OAuth] Could not parse callback URL (first 300 chars):', url.slice(0, 300));
    }
    throw new Error(
      'Could not complete sign-in. Invalid callback URL. If this persists, copy the redirect URL from the Metro log and add it to Supabase → Authentication → Redirect URLs.',
    );
  }
  if (parsed.kind === 'error') {
    throw new Error(parsed.message || 'Sign-in was cancelled or failed.');
  }
  if (parsed.kind === 'session') {
    const { error } = await supabase.auth.setSession({
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
  if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = getOAuthRedirectUrl();
  if (__DEV__) {
    console.log(
      '[OAuth] redirectTo — add this exact URL to Supabase Auth → URL Configuration → Redirect URLs:\n',
      redirectTo,
    );
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) {
    throw new Error('Could not start Google sign-in.');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'success' && result.url) {
    await completeOAuthFromUrl(result.url);
    return;
  }

  if (result.type === 'cancel') {
    throw new Error('Sign-in was cancelled.');
  }

  // Expo Go: auth often completes via exp:// deep link; the session is set in Linking
  // after WebBrowser reports dismiss or success without url.
  if (await waitForSessionFromDeepLink(5000)) {
    if (__DEV__) {
      console.log('[OAuth] Session detected after browser closed (deep link / async completion).');
    }
    return;
  }

  // iOS: redirect URL did not match the second argument to openAuthSessionAsync (allowlist / wrong exp:// vs rimrun://).
  if (result.type === 'dismiss') {
    throw new Error(
      'Sign-in did not return to the app. Add the exact [OAuth] redirectTo URL from Metro to Supabase Redirect URLs (Expo Go uses exp://…; dev builds use rimrun://…).',
    );
  }

  if (__DEV__) {
    console.warn('[OAuth] Unexpected WebBrowser result:', result);
  }
  throw new Error(
    'Sign-in did not finish. Add the printed [OAuth] redirectTo URL to Supabase, or use a development build (rimrun://) if Expo Go keeps failing.',
  );
}
