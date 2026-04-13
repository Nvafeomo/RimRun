import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Linking } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { signInWithGoogle as oauthGoogle } from '../lib/oauth';
import {
  applyAuthFromUrl,
  clearPendingPasswordRecovery,
  isLikelyAuthCallback,
} from '../lib/supabaseAuthDeepLink';
import { mapProfileUsernameError } from '../lib/usernameRules';
import { defaultUsernameSearchableForDob } from '../lib/usernameSearchPolicy';

type AuthContextValue = {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signIn: (emailOrUsername: string, password: string) => Promise<void>;
    signUp: (
      email: string,
      password: string,
      username: string,
      dateOfBirthIso: string,
    ) => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
  };
  
  const AuthContext = createContext<AuthContextValue | undefined>(undefined);
  
  type AuthProviderProps = {
    children: ReactNode;
  };
  
  export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
  
    // Initial session load + auth state listener
    useEffect(() => {
      let isMounted = true;
      const timeout = setTimeout(() => {
        if (isMounted) {
          setLoading(false);
        }
      }, 5000);

      const {
        data: authListener,
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);
      });

      async function initAuth() {
        try {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl && isLikelyAuthCallback(initialUrl)) {
            await applyAuthFromUrl(initialUrl);
          }
        } catch (e) {
          console.warn('Auth deep link (initial URL)', e);
        }

        try {
          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();
  
          if (!isMounted) return;
          if (error) {
            console.error('Error getting session', error);
            // Invalid refresh token: clear bad session from storage
            await supabase.auth.signOut({ scope: 'local' });
            setSession(null);
            setUser(null);
          } else {
            setSession(session);
            setUser(session?.user ?? null);
          }
        } catch (err) {
          if (isMounted) {
            console.error('Auth init error', err);
            setSession(null);
            setUser(null);
          }
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      }
  
      initAuth();

      const linkSub = Linking.addEventListener('url', ({ url }) => {
        if (url && isLikelyAuthCallback(url)) {
          void applyAuthFromUrl(url);
        }
      });

      return () => {
        isMounted = false;
        clearTimeout(timeout);
        authListener.subscription.unsubscribe();
        linkSub.remove();
      };
    }, []);
  
    // Auth actions
    async function signIn(emailOrUsername: string, password: string) {
      let email = emailOrUsername;
      if (!emailOrUsername.includes('@')) {
        const { data: loginEmail, error } = await supabase.rpc(
          'lookup_login_email',
          { p_username: emailOrUsername.trim() },
        );
        if (error || !loginEmail) {
          throw new Error('Invalid credentials');
        }
        email = loginEmail;
      }

      const { error } = await supabase.auth.signInWithPassword({ 
        email, password });
      if (error) {
        throw error;
      }
      // No need to set state here; onAuthStateChange will fire.
    }
  
    async function signUp(
      email: string,
      password: string,
      username: string,
      dateOfBirthIso: string,
    ) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            date_of_birth: dateOfBirthIso,
          },
        },
      });
      if (error) {
        throw error;
      }
      const uid = data.user?.id;
      if (!uid) {
        throw new Error('Sign up did not return a user. Try again or confirm your email if required.');
      }
      // Persist DOB without wiping other columns (avoid upsert nulling profile_image_url, etc.).
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', uid)
        .maybeSingle();

      if (existingProfile) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            date_of_birth: dateOfBirthIso,
            username,
            email,
            username_searchable: defaultUsernameSearchableForDob(dateOfBirthIso),
          })
          .eq('id', uid);
        if (profileError) {
          throw new Error(mapProfileUsernameError(profileError));
        }
      } else {
        const { error: insertErr } = await supabase.from('profiles').insert({
          id: uid,
          username,
          email,
          date_of_birth: dateOfBirthIso,
          username_searchable: defaultUsernameSearchableForDob(dateOfBirthIso),
        });
        if (insertErr?.code === '23505') {
          const { error: retryErr } = await supabase
            .from('profiles')
            .update({
              date_of_birth: dateOfBirthIso,
              username,
              email,
              username_searchable: defaultUsernameSearchableForDob(dateOfBirthIso),
            })
            .eq('id', uid);
          if (retryErr) {
            throw new Error(mapProfileUsernameError(retryErr));
          }
        } else if (insertErr) {
          throw new Error(mapProfileUsernameError(insertErr));
        }
      }
    }
  
    async function signInWithGoogle() {
      await oauthGoogle();
    }

    async function signOut() {
      await clearPendingPasswordRecovery();
      const { error } = await supabase.auth.signOut();
      if (error) {
        // Invalid token etc: clear local session anyway
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setUser(null);
        return;
      }
      // Listener will clear user/session.
    }
  
    const value: AuthContextValue = {
      user,
      session,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    };
  
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }
  
  export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
      throw new Error('useAuth must be used within an AuthProvider');
    }
    return ctx;
  }