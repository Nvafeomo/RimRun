import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius } from '../../constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn } = useAuth();

  function validateEmailOrUsername(value: string): string | null {
    if (!value.trim()) return 'Email or Username is required';
    if (value.includes('@')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) return 'Invalid email address';
    }
    return null;
  }
  function validatePassword(value: string): string | null {
    if (!value.trim()) return 'Password is required';
    if (value.length < 8) return 'Password must be at least 8 characters long';
    return null;
  }
  async function handleSignIn() {
    setError('');
    const emailOrUsernameError = validateEmailOrUsername(emailOrUsername);
    const passwordError = validatePassword(password);
    if (emailOrUsernameError || passwordError) {
      setError(emailOrUsernameError || passwordError || 'Invalid credentials');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(emailOrUsername.trim(), password);
      router.replace('/(app)');
    } catch (e: any) {
      setError(e?.message ?? 'Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
          <Text style={styles.cardTitle}>Welcome Back</Text>
          <Text style={styles.cardSubtitle}>Sign in to continue</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            placeholder="Email or Username"
            placeholderTextColor={colors.textMuted}
            keyboardType="default"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            style={styles.input}
            value={emailOrUsername}
            onChangeText={setEmailOrUsername}
          />
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

          <TouchableOpacity
            style={styles.button}
            onPress={handleSignIn}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.forgotLink}
            onPress={() => router.push('/reset-password')}
            activeOpacity={0.7}
          >
            <Text style={styles.forgotLinkText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => router.push('/signup')}
          activeOpacity={0.7}
        >
          <Text style={styles.linkButtonText}>
            Don't have an account? <Text style={styles.linkButtonTextBold}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
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
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
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
    marginBottom: spacing.md,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  forgotLink: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  forgotLinkText: {
    fontSize: 14,
    color: colors.primaryLight,
    fontWeight: '600',
  },
  linkButton: {
    alignSelf: 'center',
    paddingVertical: spacing.lg,
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
