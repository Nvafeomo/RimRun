import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
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
      <View style={styles.content}>
        <Text style={styles.title}>Welcome Back!</Text>
        <Text style={styles.subtitle}>Sign In To Continue</Text>
        <View style={styles.form}>
          {error && <Text style={styles.error}>{error}</Text>}
          <TextInput 
          placeholder="Email or Username" 
          keyboardType="default" 
          autoCapitalize="none" 
          autoComplete="email" 
          autoCorrect={false} 
          style = {styles.input}
          value={emailOrUsername}
          onChangeText={setEmailOrUsername}
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
          <TouchableOpacity style = {styles.button} onPress={handleSignIn} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style = {styles.forgotLink} onPress={() => router.push('/reset-password')}>
            <Text style={styles.forgotLink}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity style = {styles.linkButton} onPress={() => router.push('/signup')}>
            <Text style = {styles.linkButtonText}>Don't have an account? <Text style = {styles.linkButtonTextBold}>Sign Up</Text></Text>
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
  forgotLink: {
    fontSize: 14,
    color: 'orange',
    marginBottom: 10,
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