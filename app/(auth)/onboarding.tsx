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
    Image,
  } from 'react-native';
  import { SafeAreaView } from 'react-native-safe-area-context';
  import { useRouter } from 'expo-router';
  import { useState } from 'react';
  import { useAuth } from '../../context/AuthContext';
  import { colors, spacing, borderRadius } from '../../constants/theme';
  import { useEffect } from 'react';
  import { router } from 'expo-router';
  import * as ImagePicker from 'expo-image-picker';
  export default function OnboardingScreen() {
    const [profilePicture, setProfilePicture] = useState<string | null>(null);
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [isLoading, setIsLoading] = useState(false);
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
        });
        if (!result.canceled && result.assets[0]) {
            setProfilePicture(result.assets[0].uri);
        }
        setIsLoading(false);
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
            <ScrollView style={styles.container}>
                <View style={styles.header}>
                    <Image source={require('../../assets/rimrun-logo.png')} style={styles.logo} resizeMode="contain" />
                    <Text style={styles.title}>Complete Your Profile</Text>
                    <Text style={styles.subtitle}>Add your profile picture and date of birth.</Text>
                </View>
                <View style={styles.card}>
                    <TouchableOpacity style={styles.imageContainer} onPress={pickImage}>
                        <View style={styles.placeholderImage}>
                            <Text style={styles.placeholderText}>+</Text>
                        </View>
                        <View style={styles.editBadge}>
                            <Text style={styles.editText}>Edit</Text>
                        </View>
                    </TouchableOpacity>
                    <TextInput placeholder="Date of Birth" style={styles.input} placeholderTextColor={colors.textMuted}/>
                    <TouchableOpacity style={styles.button} onPress={() => router.push('/(app)')}>
                        <Text style={styles.buttonText}>Complete Profile</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
            <TouchableOpacity
                style={[styles.button, styles.skipButton]}
                onPress={() => router.replace('/(auth)/signup')}
                activeOpacity={0.7}
                >
                    
                <Text style={styles.buttonText}>Skip</Text>
            </TouchableOpacity> 
          
        </KeyboardAvoidingView>
      </SafeAreaView>
      
    );
  }
  
  const styles = StyleSheet.create({
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
  