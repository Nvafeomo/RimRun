import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextValue = {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signIn: (emailOrUsername: string, password: string) => Promise<void>;
    signUp: (email: string, password: string, username: string) => Promise<void>;
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
          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();
  
          if (!isMounted) return;
          if (error) {
            console.error('Error getting session', error);
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
  
      return () => {
        isMounted = false;
        clearTimeout(timeout);
        authListener.subscription.unsubscribe();
      };
    }, []);
  
    // Auth actions
    async function signIn(emailOrUsername: string, password: string) {
      let email = emailOrUsername;
      if (!emailOrUsername.includes('@')) {
        const { data, error} = await supabase
        .from('profiles')
        .select('email')
        .ilike('username', emailOrUsername.trim().toLowerCase())
        .single();

        if (error || !data) {
          throw new Error('Invalid credentials');
        }
        email = data.email;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }
      // No need to set state here; onAuthStateChange will fire.
    }
  
    async function signUp(email: string, password: string, username: string) {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
      if (error) {
        throw error;
      }
      // Depending on your email confirmation settings, you may or may not get a session immediately.
    }
  
    async function signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      // Listener will clear user/session.
    }
  
    const value: AuthContextValue = {
      user,
      session,
      loading,
      signIn,
      signUp,
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