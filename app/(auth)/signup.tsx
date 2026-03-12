import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
export default function SignupScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signUp } = useAuth();

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
  async function handleSignUp() {
    setError('');
    const usernameError = validateUsername(username);
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const confirmPasswordError = validateConfirmPassword(confirmPassword);
    if (usernameError || emailError || passwordError || confirmPasswordError) {
      setError(usernameError || emailError || passwordError || confirmPasswordError || 'Invalid credentials');
      return;
    }
    setSubmitting(true);
    
    try {
      await signUp(email.trim(), password, username.trim().toLowerCase());
      router.replace('/(app)');
    } catch (e: any) {
      setError(e?.message ?? 'Sign up failed');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Create An Account</Text>
        <Text style={styles.subtitle}>Sign Up to Continue</Text>
        <View style={styles.form}>
          {error && <Text style={styles.error}>{error}</Text>}
          <TextInput 
          placeholder="Username" 
          keyboardType="default" 
          autoCapitalize="none" 
          autoComplete="username" 
          autoCorrect={false} 
          style = {styles.input}
          value={username}
          onChangeText={setUsername}
          />
          <TextInput 
          placeholder="Email" 
          keyboardType="email-address" 
          autoCapitalize="none" 
          autoComplete="email" 
          autoCorrect={false} 
          style = {styles.input}
          value={email}
          onChangeText={setEmail}
          />
          <TextInput 
          placeholder="Password" 
          keyboardType="default" 
          autoCapitalize="none" 
          autoComplete="password" 
          autoCorrect={false} 
          secureTextEntry={true} 
          style = {styles.input}
          value={password}
          onChangeText={setPassword}
          />
          <TextInput 
          placeholder="Confirm Password" 
          keyboardType="default" 
          autoCapitalize="none" 
          autoComplete="password" 
          autoCorrect={false} 
          secureTextEntry={true} 
          style = {styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          />
          <TouchableOpacity 
            style={styles.button} 
            onPress={handleSignUp} 
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Sign Up</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style = {styles.linkButton} onPress={() => router.push('/login')}>
            <Text style = {styles.linkButtonText}>Already have an account? <Text style = {styles.linkButtonTextBold}>Sign In</Text></Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    
  },
  error: {
    color: 'red',
    marginBottom: 15,
    fontSize: 14,
  },
  input: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    borderColor: 'orange',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 15,
  },
  button: {
    width: '100%',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'orange',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  linkButton: {
    width: '100%',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  title: {
    fontSize: 32, 
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
  },
  form: {
    width: "100%",
    padding: 24,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
    
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    
  },
  linkButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'orange',
  },
  linkButtonTextBold: {
    fontSize: 16,
    fontWeight: '600',
    color: 'black',
    
  },
});
