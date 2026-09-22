import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthState = {
  loading: boolean;
  session: Session | null;
  isAdmin: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// Em ambiente de desenvolvimento local, sem a tabela `profiles` ainda migrada,
// VITE_DEV_BYPASS_AUTH=true permite navegar no backoffice sem is_admin() real.
// Nunca ativar isto em produção — ver .env.example.
const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function checkAdmin() {
      if (!session) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      if (DEV_BYPASS) {
        setIsAdmin(true);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!cancelled) {
        setIsAdmin(!error && data?.role === 'admin');
        setLoading(false);
      }
    }
    setLoading(true);
    checkAdmin();
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function signInWithMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({ email });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ loading, session, isAdmin, signInWithMagicLink, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
