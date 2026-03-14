import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,

  } from 'react-native';
  import { SafeAreaView } from 'react-native-safe-area-context';
  import { useRouter } from 'expo-router';
  import { useState } from 'react';
  import { useAuth } from '../../context/AuthContext';
  import { colors, spacing, borderRadius } from '../../constants/theme';
  import { useEffect } from 'react';
  import { router } from 'expo-router';
  import { Image } from 'expo-image';
  import DateTimePicker from '@react-native-community/datetimepicker';
  import * as ImagePicker from 'expo-image-picker';
  import { decode } from 'base64-arraybuffer';
  import { supabase } from '../../lib/supabase';

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
    const [profilePicture, setProfilePicture] = useState<string | null>(null);
    const [profilePictureBase64, setProfilePictureBase64] = useState<string | null>(null);
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            alert('We need permission to access your photos to set your profile picture.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 1,
            base64: true,
        });
        if (!result.canceled && result.assets[0]) {
            const asset = result.assets[0];
            setProfilePicture(asset.uri);
            setProfilePictureBase64(asset.base64 ?? null);
        }
        setIsLoading(false);
    };

    const handleCompleteProfile = async () => {
        if (!user?.id) {
            setError('You must be signed in to complete your profile.');
            return;
        }
        setError('');
        setSubmitting(true);
        try {
            let avatarUrl: string | null = null;
            if (profilePictureBase64) {
                try {
                    const filePath = `${user.id}/avatar.jpg`;
                    const { data, error: uploadError } = await supabase.storage
                        .from('avatars')
                        .upload(filePath, decode(profilePictureBase64), {
                            contentType: 'image/jpeg',
                            upsert: true,
                        });
                    if (uploadError) throw uploadError;
                    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(data.path);
                    avatarUrl = urlData.publicUrl;
                } catch (uploadErr) {
                    const msg = uploadErr instanceof Error ? uploadErr.message : 'Upload failed';
                    if (msg.includes('Bucket') || msg.includes('bucket')) {
                        setError('Storage bucket "avatars" not found. Create it in Supabase Dashboard → Storage.');
                        setSubmitting(false);
                        return;
                    }
                    throw uploadErr;
                }
            }
            const updates: Record<string, string | null> = {};
            if (avatarUrl !== null) updates.profile_image_url = avatarUrl;
            if (dateOfBirth) updates.date_of_birth = dateOfBirth;
            if (Object.keys(updates).length > 0) {
                const { error: updateError } = await supabase
                    .from('profiles')
                    .update(updates)
                    .eq('id', user.id);
                if (updateError) throw updateError;
            }
            router.replace('/(app)');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to save profile');
        } finally {
            setSubmitting(false);
        }
    };
    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
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
                    <Image source={require('../../assets/rimrun-logo.png')} style={styles.logo} resizeMode="contain" />
                    <Text style={styles.title}>Complete Your Profile</Text>
                    <Text style={styles.subtitle}>Add your profile picture and date of birth.</Text>
                </View>
                <View style={styles.card}>
                    <TouchableOpacity style={styles.imageContainer} onPress={pickImage}>
                        {profilePicture ? <Image source={{ uri: profilePicture }} style={styles.profilePicture} resizeMode="cover" /> : (
                        <View style={styles.placeholderImage}>
                            <Text style={styles.placeholderText}>+</Text>
                        </View>
                        )}
                        <View style={styles.editBadge}>
                            <Text style={styles.editText}>Edit</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.input, { width: '80%', alignSelf: 'center', justifyContent: 'center', alignItems: 'center' }]}
                        onPress={() => setShowDatePicker(true)}
                    >
                        <Text style={{ color: colors.textSecondary, textAlign: 'center', fontSize: 16, fontWeight: '500', alignSelf: 'center' }}>
                            {dateOfBirth ? formatDateForDisplay(dateOfBirth) : "Select Date of Birth"}
                        </Text>
                    </TouchableOpacity>

                    {showDatePicker && (
                        <DateTimePicker
                            value={dateOfBirth ? new Date(dateOfBirth) : new Date(2000, 0, 1)}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            textColor={colors.textSecondary}
                            onChange={(event, selectedDate) => {
                                setShowDatePicker(false);
                                if (event.type === 'set' && selectedDate) {
                                    setDateOfBirth(selectedDate.toISOString().split("T")[0]);
                                }
                            }}
                        />
                    )}
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
                        <Text style={styles.buttonText}>Complete Profile</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
            <TouchableOpacity
                style={[styles.button, styles.skipButton]}
                onPress={() => router.replace('/(app)')}
                activeOpacity={0.7}
                >
                    
                <Text style={styles.buttonText}>Skip</Text>
            </TouchableOpacity> 
          
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
    skipButton: {
      width: '40%',
      height: 40,
      alignSelf: 'center',
      marginTop: spacing.md,
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
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
  