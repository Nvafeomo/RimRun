import { supabase } from './supabase'; // adjust path as needed

// Sign in with email and password
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Sign up with email and password
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

// Sign out the current user
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Send password reset email
export async function resetPassword(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://your-app.com/reset-password', // customize this
  });
  if (error) throw error;
  return data;
}
