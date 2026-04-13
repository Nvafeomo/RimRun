import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { reencodeJpegWithoutExif } from '../lib/stripImageForUpload';
import { validateDateOfBirthForSignup } from '../lib/agePolicy';
import { resolveAvatarUriForDisplay } from '../lib/avatarUrls';
import { useAuth } from './AuthContext';

/** Columns added by `scripts/profile-privacy-public-profile.sql`; optional until migration runs. */
const PROFILE_SELECT_BASE =
  'profile_image_url, date_of_birth, username, email' as const;
const PROFILE_SELECT_WITH_PRIVACY =
  `${PROFILE_SELECT_BASE}, profile_public_show_friends, profile_public_show_courts_joined, profile_public_show_courts_added, messages_only_from_friends, username_searchable, chat_suspended_until, auto_suspension_count` as const;

function isUndefinedColumnError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: string }).code;
    if (code === '42703') return true;
  }
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : '';
  return /column .* does not exist/i.test(msg);
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Profile fetch timed out after ${ms}ms`)),
      ms,
    );
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Row shape from `profiles` (privacy columns optional until migration is applied). */
export type ProfileDbRow = {
  profile_image_url: string | null;
  date_of_birth: string | null;
  username?: string | null;
  email?: string | null;
  profile_public_show_friends?: boolean;
  profile_public_show_courts_joined?: boolean;
  profile_public_show_courts_added?: boolean;
  messages_only_from_friends?: boolean;
  /** When false, user does not appear in Add friends username search. Minors default false (DB + trigger). */
  username_searchable?: boolean;
  chat_suspended_until?: string | null;
  auto_suspension_count?: number;
};

export type Profile = {
  profile_image_url: string | null;
  date_of_birth: string | null;
  username?: string | null;
  email?: string | null;
  /** When false, friends count is hidden on your public profile. Default true. */
  profile_public_show_friends?: boolean;
  /** When false, courts joined count is hidden on your public profile. Default true. */
  profile_public_show_courts_joined?: boolean;
  /** When false, courts added count is hidden on your public profile. Default true. */
  profile_public_show_courts_added?: boolean;
  /** When true, only friends can start a new DM with you. Default false. */
  messages_only_from_friends?: boolean;
  /** When true, you may appear in Add friends search by username. Default false for under 18. */
  username_searchable?: boolean;
  /** When in the future, server blocks sending chat messages (RLS). */
  chat_suspended_until?: string | null;
  auto_suspension_count?: number;
} | null;

type ProfileContextValue = {
  profile: Profile;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfilePicture: () => void;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

const IMAGE_PICKER_OPTIONS = {
  mediaTypes: ['images' as const],
  allowsEditing: true,
  aspect: [1, 1] as [number, number],
  quality: 1,
  base64: false,
};

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const query = supabase
        .from('profiles')
        .select(PROFILE_SELECT_WITH_PRIVACY)
        .eq('id', user.id)
        .maybeSingle();
      const first = await withTimeout(query, 20_000);
      let data: ProfileDbRow | null = first.data as ProfileDbRow | null;
      let error = first.error;

      if (error && isUndefinedColumnError(error)) {
        const fallback = await withTimeout(
          supabase
            .from('profiles')
            .select(PROFILE_SELECT_BASE)
            .eq('id', user.id)
            .maybeSingle(),
          20_000,
        );
        data = fallback.data as ProfileDbRow | null;
        error = fallback.error;
      }

      if (error) throw error;
      let row = data;
      // Email-confirm signup: DOB may only exist in auth metadata until first profile row sync.
      if (row && !row.date_of_birth) {
        const metaDob = user.user_metadata?.date_of_birth;
        if (typeof metaDob === 'string' && metaDob.trim()) {
          const check = validateDateOfBirthForSignup(metaDob.trim());
          if (check.ok) {
            const { error: syncErr } = await supabase
              .from('profiles')
              .update({ date_of_birth: metaDob.trim() })
              .eq('id', user.id);
            if (!syncErr) {
              row = { ...row, date_of_birth: metaDob.trim() };
            }
          }
        }
      }
      if (row) {
        const avatarUri = await resolveAvatarUriForDisplay(
          user.id,
          row.profile_image_url,
        );
        setProfile({
          ...row,
          profile_image_url: avatarUri,
        });
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.user_metadata?.date_of_birth]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const uploadAndUpdateProfile = useCallback(
    async (localUri: string) => {
      if (!user?.id) return;
      try {
        const filePath = `${user.id}/avatar.jpg`;
        const bytes = await reencodeJpegWithoutExif(localUri);
        const { error: uploadError } = await supabase.storage
          .from('Avatars')
          .upload(filePath, bytes, {
            contentType: 'image/jpeg',
            upsert: true,
          });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('Avatars').getPublicUrl(filePath);
        const avatarUrl = urlData.publicUrl;

        let updateResult = await supabase
          .from('profiles')
          .update({ profile_image_url: avatarUrl })
          .eq('id', user.id)
          .select(PROFILE_SELECT_WITH_PRIVACY)
          .maybeSingle();
        if (updateResult.error && isUndefinedColumnError(updateResult.error)) {
          updateResult = await supabase
            .from('profiles')
            .update({ profile_image_url: avatarUrl })
            .eq('id', user.id)
            .select(PROFILE_SELECT_BASE)
            .maybeSingle();
        }
        const { data: updated, error: updateError } = updateResult;
        if (updateError) throw updateError;
        if (!updated) {
          throw new Error(
            'Could not save profile photo (no row updated). Check RLS allows UPDATE on profiles for your user.'
          );
        }

        const row = updated as ProfileDbRow;
        const avatarUri = await resolveAvatarUriForDisplay(
          user.id,
          row.profile_image_url ?? avatarUrl,
        );
        setProfile({
          ...row,
          profile_image_url: avatarUri,
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Failed to upload profile image. Please try again.';
        console.error('Error uploading profile image:', err);
        Alert.alert('Upload Failed', message);
      }
    },
    [user?.id],
  );

  const updateProfilePicture = useCallback(() => {
    if (!user?.id) return;

    const pickImage = async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'We need permission to access your photos to set your profile picture.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync(IMAGE_PICKER_OPTIONS);
      const uri = result.assets?.[0]?.uri;
      if (!result.canceled && uri) {
        await uploadAndUpdateProfile(uri);
      }
    };

    const takePhoto = async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'We need permission to access your camera to take your profile picture.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync(IMAGE_PICKER_OPTIONS);
      const uri = result.assets?.[0]?.uri;
      if (!result.canceled && uri) {
        await uploadAndUpdateProfile(uri);
      }
    };

    Alert.alert('Select Profile Image', 'Choose an option', [
      { text: 'Camera', onPress: takePhoto },
      { text: 'Photo Library', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [user?.id, uploadAndUpdateProfile]);

  const value: ProfileContextValue = {
    profile,
    loading,
    refreshProfile: fetchProfile,
    updateProfilePicture,
  };

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return ctx;
}
