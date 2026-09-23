import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type LoginPhase = 'idle' | 'checking' | 'success' | 'error';

type AuthState = {
  loading: boolean;
  session: Session | null;
  isAdmin: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  loginPhase: LoginPhase;
  loginErrorMsg: string | null;
  resetLoginPhase: () => void;
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
  const [loginPhase, setLoginPhase] = useState<LoginPhase>('idle');
  const [loginErrorMsg, setLoginErrorMsg] = useState<string | null>(null);

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

  async function signInWithPassword(email: string, password: string) {
    setLoginPhase('checking');
    setLoginErrorMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginPhase('error');
      setLoginErrorMsg('Não foi possível validar as credenciais.');
    } else {
      setLoginPhase('success');
      setTimeout(() => setLoginPhase('idle'), 1500);
    }
    return { error: error?.message ?? null };
  }

  function resetLoginPhase() {
    setLoginPhase('idle');
    setLoginErrorMsg(null);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setLoginPhase('idle');
  }

  return (
    <AuthContext.Provider
      value={{ loading, session, isAdmin, signInWithPassword, signOut, loginPhase, loginErrorMsg, resetLoginPhase }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
