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
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type Profile = {
  profile_image_url: string | null;
  date_of_birth: string | null;
  username?: string | null;
  email?: string | null;
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
  base64: true,
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
      const { data, error } = await supabase
        .from('profiles')
        .select('profile_image_url, date_of_birth, username, email')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      setProfile(data ?? null);
    } catch (err) {
      console.error('Error fetching profile:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const uploadAndUpdateProfile = useCallback(
    async (base64: string) => {
      if (!user?.id) return;
      try {
        const filePath = `${user.id}/avatar.jpg`;
        const { data, error: uploadError } = await supabase.storage
          .from('Avatars')
          .upload(filePath, decode(base64), {
            contentType: 'image/jpeg',
            upsert: true,
          });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('Avatars').getPublicUrl(data.path);
        const avatarUrl = urlData.publicUrl;

        const { error: updateError } = await supabase
          .from('profiles')
          .update({ profile_image_url: avatarUrl })
          .eq('id', user.id);
        if (updateError) throw updateError;

        const displayUrl = `${avatarUrl}${avatarUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
        setProfile((prev) => (prev ? { ...prev, profile_image_url: displayUrl } : { profile_image_url: displayUrl, date_of_birth: null }));
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
      if (!result.canceled && result.assets[0]?.base64) {
        await uploadAndUpdateProfile(result.assets[0].base64);
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
      if (!result.canceled && result.assets[0]?.base64) {
        await uploadAndUpdateProfile(result.assets[0].base64);
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
