import { supabase } from './supabase';

/** Signed URL lifetime for private Avatars bucket (seconds). */
export const AVATAR_SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Returns a time-limited URL for `{userId}/avatar.jpg` in the Avatars bucket.
 * After running phase-3 SQL (private bucket), this is required for display.
 */
export async function fetchSignedAvatarUrl(userId: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('Avatars')
    .createSignedUrl(`${userId}/avatar.jpg`, AVATAR_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}

/**
 * Resolves a display URI: prefers signed URL when profile has an image; falls back to
 * legacy public URL if the bucket is still public or signing fails.
 */
export async function resolveAvatarUriForDisplay(
  userId: string,
  profileImageUrl: string | null | undefined,
): Promise<string | null> {
  if (!profileImageUrl) return null;
  const signed = await fetchSignedAvatarUrl(userId);
  if (signed) return signed;
  return profileImageUrl;
}
