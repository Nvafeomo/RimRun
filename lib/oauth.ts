/**
 * Google OAuth for Supabase: enable Google under Authentication → Providers.
 * Redirect URLs must include the URL from `getOAuthRedirectUrl()` (scheme rimrun), e.g.
 * rimrun://auth/callback — plus Expo Go / dev client URLs when testing.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

export const OAUTH_REDIRECT_PATH = 'auth/callback';

export function getOAuthRedirectUrl(): string {
  return Linking.createURL(OAUTH_REDIRECT_PATH);
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

async function completeOAuthFromUrl(url: string): Promise<void> {
  const parsed = parseOAuthCallbackUrl(url);
  if (!parsed) {
    throw new Error('Could not complete sign-in. Invalid callback URL.');
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
  if (result.type !== 'success' || !result.url) {
    throw new Error('Sign-in was cancelled.');
  }
  await completeOAuthFromUrl(result.url);
}
