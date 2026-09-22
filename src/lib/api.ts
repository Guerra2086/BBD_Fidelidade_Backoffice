import { supabase } from './supabase';

// Chama as funções serverless do próprio backoffice (pasta api/), autenticadas com o
// JWT da sessão Supabase do admin (verificado do lado do servidor via is_admin()).
export async function callAdminApi<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('sem_sessao');

  const res = await fetch(`/api/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'erro_desconhecido');
  }
  return data as T;
}
