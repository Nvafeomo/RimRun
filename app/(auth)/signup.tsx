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
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { SocialAuthButtons } from '../../components/SocialAuthButtons';
import {
  formatLocalIsoDate,
  maxBirthDateForMinAge,
  validateDateOfBirthForSignup,
} from '../../lib/agePolicy';

export default function SignupScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signUp, signInWithGoogle } = useAuth();

  const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
  function validateUsername(value: string): string | null {
    if (!value.trim()) return 'Username is required';
    if (!USERNAME_REGEX.test(value)) return '3–20 chars, letters, numbers, underscore only';
    return null;
  }
  function validateEmail(value: string): string | null {
    if (!value.trim()) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return 'Invalid email address';
    return null;
  }
  function validatePassword(value: string): string | null {
    if (!value.trim()) return 'Password is required';
    if (value.length < 8) return 'Password must be at least 8 characters long';
    return null;
  }
  function validateConfirmPassword(value: string): string | null {
    if (!value.trim()) return 'Confirm Password is required';
    if (value !== password) return 'Passwords do not match';
    return null;
  }

  const formatDateForDisplay = (isoDate: string) => {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  async function handleSignUp() {
    setError('');
    const usernameError = validateUsername(username);
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const confirmPasswordError = validateConfirmPassword(confirmPassword);
    const dobCheck = validateDateOfBirthForSignup(dateOfBirth);
    if (!dobCheck.ok) {
      const dobMsg =
        dobCheck.error === 'required'
          ? 'Date of birth is required. RimRun is 13+ only.'
          : dobCheck.error === 'invalid_format'
            ? 'Enter a valid date of birth.'
            : dobCheck.error === 'future'
              ? 'Date of birth cannot be in the future.'
              : 'You must be at least 13 years old to use RimRun.';
      setError(dobMsg);
      return;
    }
    if (usernameError || emailError || passwordError || confirmPasswordError) {
      setError(
        usernameError || emailError || passwordError || confirmPasswordError || 'Invalid credentials',
      );
      return;
    }
    setSubmitting(true);

    try {
      const normalizedUsername = username.trim().toLowerCase();
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .maybeSingle();

      if (existingUser) {
        setError('Username is already taken');
        setSubmitting(false);
        return;
      }

      const dobIso = dateOfBirth.trim();
      await signUp(email.trim(), password, normalizedUsername, dobIso);
      router.replace('/(auth)/onboarding');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign up failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      router.replace('/(app)');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Google sign-in failed';
      if (!msg.toLowerCase().includes('cancel')) {
        setError(msg);
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Image
              source={require('../../assets/rimrun-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>RimRun</Text>
            <Text style={styles.subtitle}>Find courts. Run the game.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Create Account</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TextInput
              placeholder="Username"
              placeholderTextColor={colors.textMuted}
              keyboardType="default"
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect={false}
              style={styles.input}
              value={username}
              onChangeText={setUsername}
            />
            <TextInput
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              style={styles.input}
              value={email}
              onChangeText={setEmail}
            />

            <TouchableOpacity
              style={[styles.input, styles.dobTouchable]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={[styles.dobText, !dateOfBirth && styles.dobPlaceholder]}>
                {dateOfBirth ? formatDateForDisplay(dateOfBirth) : 'Date of birth (13+ only)'}
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

            <TextInput
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              keyboardType="default"
              autoCapitalize="none"
              autoComplete="password"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
              value={password}
              onChangeText={setPassword}
            />
            <TextInput
              placeholder="Confirm Password"
              placeholderTextColor={colors.textMuted}
              keyboardType="default"
              autoCapitalize="none"
              autoComplete="password"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <TouchableOpacity
              style={styles.button}
              onPress={handleSignUp}
              disabled={submitting || googleLoading}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.buttonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            <SocialAuthButtons
              onGooglePress={handleGoogle}
              disabled={submitting}
              loading={googleLoading}
            />
          </View>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => router.push('/login')}
            activeOpacity={0.7}
          >
            <Text style={styles.linkButtonText}>
              Already have an account? <Text style={styles.linkButtonTextBold}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
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
  dobTouchable: {
    justifyContent: 'center',
  },
  dobText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  dobPlaceholder: {
    color: colors.textMuted,
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
