import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
  } from 'react-native';
  import { SafeAreaView } from 'react-native-safe-area-context';
  import { useRouter } from 'expo-router';
  import { useState } from 'react';
  import { useAuth } from '../../context/AuthContext';
  import { useProfile } from '../../context/ProfileContext';
  import { colors, spacing, borderRadius } from '../../constants/theme';
  import { router } from 'expo-router';
  import { Image } from 'expo-image';
  import DateTimePicker from '@react-native-community/datetimepicker';
  import * as ImagePicker from 'expo-image-picker';
  import { supabase } from '../../lib/supabase';
  import { reencodeJpegWithoutExif } from '../../lib/stripImageForUpload';
  import {
    formatLocalIsoDate,
    maxBirthDateForMinAge,
    validateDateOfBirthForSignup,
  } from '../../lib/agePolicy';

  const formatDateForDisplay = (isoDate: string) => {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  export default function OnboardingScreen() {
    const { user } = useAuth();
    const { profile, loading: profileLoading, refreshProfile } = useProfile();
    const [profilePicture, setProfilePicture] = useState<string | null>(null);
    /** Local file URI for upload (strip EXIF via re-encode before storage). */
    const [profilePictureUri, setProfilePictureUri] = useState<string | null>(null);
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const imagePickerOptions = {
        mediaTypes: ['images' as const],
        allowsEditing: true,
        aspect: [1, 1] as [number, number],
        quality: 1,
        base64: false,
    };

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(
              'Permission needed',
              'We need permission to access your photos to set your profile picture.',
            );
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync(imagePickerOptions);
        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            setProfilePicture(asset.uri);
            setProfilePictureUri(asset.uri);
        }
    };

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert(
              'Permission needed',
              'We need permission to access your camera to take a profile picture.',
            );
            return;
        }
        const result = await ImagePicker.launchCameraAsync(imagePickerOptions);
        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            setProfilePicture(asset.uri);
            setProfilePictureUri(asset.uri);
        }
    };

    const showImagePicker = () => {
        Alert.alert('Select Profile Image', 'Choose an option', [
            { text: 'Camera', onPress: takePhoto },
            { text: 'Photo Library', onPress: pickImage },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const needsLegacyDob = !profile?.date_of_birth;

    const handleCompleteProfile = async () => {
        if (!user?.id) {
            setError('You must be signed in to complete your profile.');
            return;
        }
        if (needsLegacyDob) {
            const dobCheck = validateDateOfBirthForSignup(dateOfBirth);
            if (!dobCheck.ok) {
                const msg =
                    dobCheck.error === 'required'
                        ? 'Please select your date of birth. RimRun is 13+ only.'
                        : dobCheck.error === 'invalid_format'
                          ? 'Date of birth must be a valid calendar date.'
                          : dobCheck.error === 'future'
                            ? 'Date of birth cannot be in the future.'
                            : 'You must be at least 13 years old to use RimRun.';
                setError(msg);
                return;
            }
        }
        setError('');
        setSubmitting(true);
        try {
            let avatarUrl: string | null = null;
            if (profilePictureUri) {
                try {
                    const filePath = `${user.id}/avatar.jpg`;
                    const bytes = await reencodeJpegWithoutExif(profilePictureUri);
                    const { error: uploadError } = await supabase.storage
                        .from('Avatars')
                        .upload(filePath, bytes, {
                            contentType: 'image/jpeg',
                            upsert: true,
                        });
                    if (uploadError) throw uploadError;
                    const { data: urlData } = supabase.storage.from('Avatars').getPublicUrl(filePath);
                    avatarUrl = urlData.publicUrl;
                } catch (uploadErr) {
                    const msg = uploadErr instanceof Error ? uploadErr.message : 'Upload failed';
                    if (msg.includes('Bucket') || msg.includes('bucket')) {
                        setError('Storage bucket "Avatars" not found. Create it in Supabase Dashboard → Storage.');
                        setSubmitting(false);
                        return;
                    }
                    throw uploadErr;
                }
            }
            const updates: Record<string, string | null> = {};
            if (needsLegacyDob) {
                updates.date_of_birth = dateOfBirth.trim();
            }
            if (avatarUrl !== null) {
                updates.profile_image_url = avatarUrl;
            }
            if (Object.keys(updates).length > 0) {
                const { error: updateError } = await supabase
                    .from('profiles')
                    .update(updates)
                    .eq('id', user.id);
                if (updateError) throw updateError;
            }
            await refreshProfile();
            router.replace('/(app)');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to save profile');
        } finally {
            setSubmitting(false);
        }
    };
    if (profileLoading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
                activeOpacity={0.7}
                >
                <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <ScrollView style={styles.container}>
                <View style={styles.header}>
                    <Image source={require('../../assets/rimrun-logo.png')} style={styles.logo} contentFit="contain" />
                    <Text style={styles.title}>Complete Your Profile</Text>
                    <Text style={styles.subtitle}>
                        {needsLegacyDob
                            ? 'Your account needs a date of birth (13+). Add an optional profile photo below.'
                            : 'Add a profile picture if you like. Date of birth was set when you signed up.'}
                    </Text>
                </View>
                <View style={styles.card}>
                    <TouchableOpacity style={styles.imageContainer} onPress={showImagePicker}>
                        {profilePicture ? <Image source={{ uri: profilePicture }} style={styles.profilePicture} contentFit="cover" /> : (
                        <View style={styles.placeholderImage}>
                            <Text style={styles.placeholderText}>+</Text>
                        </View>
                        )}
                        <View style={styles.editBadge}>
                            <Text style={styles.editText}>Edit</Text>
                        </View>
                    </TouchableOpacity>

                    {needsLegacyDob ? (
                        <>
                            <TouchableOpacity
                                style={[styles.input, { width: '80%', alignSelf: 'center', justifyContent: 'center', alignItems: 'center' }]}
                                onPress={() => setShowDatePicker(true)}
                            >
                                <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 16, fontWeight: '500', alignSelf: 'center' }}>
                                    {dateOfBirth ? formatDateForDisplay(dateOfBirth) : 'Select Date of Birth'}
                                </Text>
                            </TouchableOpacity>

                            {showDatePicker ? (
                                <DateTimePicker
                                    value={
                                        dateOfBirth
                                            ? (() => {
                                                const [y, m, d] = dateOfBirth.split('-').map(Number);
                                                return new Date(y, m - 1, d);
                                              })()
                                            : maxBirthDateForMinAge()
                                    }
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    textColor={colors.textSecondary}
                                    maximumDate={maxBirthDateForMinAge()}
                                    onChange={(event, selectedDate) => {
                                        setShowDatePicker(false);
                                        if (event.type === 'set' && selectedDate) {
                                            setDateOfBirth(formatLocalIsoDate(selectedDate));
                                        }
                                    }}
                                />
                            ) : null}
                        </>
                    ) : null}
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleCompleteProfile}
                        disabled={submitting}
                        activeOpacity={0.8}
                    >
                        {submitting ? (
                        <ActivityIndicator color={colors.text} />
                        ) : (
                        <Text style={styles.buttonText}>{needsLegacyDob ? 'Complete Profile' : 'Continue'}</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      
    );
  }
  
  const styles = StyleSheet.create({
    backButton: {
        position: 'absolute',
        top: spacing.md,
        left: spacing.lg,
        zIndex: 10,
      },
      backButtonText: {
        fontSize: 16,
        color: colors.primaryLight,
        fontWeight: '600',
      },
    profilePicture: {
      width: '100%',
      height: '100%',
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
    },
    imageContainer: {
      width: 100,
      height: 100,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: spacing.lg,
      
    },
    placeholderImage: {
      width: '100%',
      height: '100%',
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderText: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textSecondary,
      textAlign: 'center',
    },
    editBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      backgroundColor: colors.primary,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    editText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
    },
    header: {
      flex: 1,
      alignItems: 'center',
      
      marginTop: 50,
      marginBottom: 100,
    },
    logo: {
      width: 100,
      height: 100,
      marginBottom: spacing.sm,
      alignSelf: 'center',
    },
    title: {
      fontSize: 30
      ,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 1,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      fontWeight: '500',
      textAlign: 'center',
    },
    card: {
      marginTop: -50,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      borderWidth: .5,
      width: '90%',
      alignSelf: 'center',
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
    cardSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
    error: {
      color: colors.error,
      fontSize: 14,
      marginBottom: spacing.md,
      textAlign: 'center',
    },
    input: {
      width: '100%',
      height: 50,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.inputBg,
      marginBottom: spacing.md,
    },
    button: {
      width: '100%',
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: borderRadius.md,
      marginTop: spacing.sm,
    },
    buttonText: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    linkButton: {
      alignSelf: 'center',
      paddingVertical: spacing.lg,
      marginTop: spacing.md,
    },
    linkButtonText: {
      fontSize: 15,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    linkButtonTextBold: {
      color: colors.primary,
      fontWeight: '700',
    },
  });
  