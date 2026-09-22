import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

type Conversation = { id: string; session_id: string; created_at: string };
type Message = { id: string; role: 'user' | 'assistant'; conteudo: string; created_at: string };

export function ChatbotConversas() {
  const [selected, setSelected] = useState<string | null>(null);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['chat_conversations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chat_conversations').select('*').order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data as Conversation[];
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['chat_messages', selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase.from('chat_messages').select('*').eq('conversation_id', selected).order('created_at');
      if (error) throw error;
      return data as Message[];
    },
  });

  return (
    <div className="page">
      <h1>Conversas do chatbot</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? (
            <p style={{ padding: 16, color: 'var(--muted)' }}>A carregar…</p>
          ) : conversations.length === 0 ? (
            <p style={{ padding: 16, color: 'var(--muted)' }}>Sem conversas para mostrar ainda.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: 14,
                  borderBottom: '1px solid var(--line)',
                  background: selected === c.id ? 'var(--paper)' : 'transparent',
                }}
              >
                <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>{c.session_id.slice(0, 8)}…</div>
                <small style={{ color: 'var(--muted)' }}>{new Date(c.created_at).toLocaleString('pt-PT')}</small>
              </button>
            ))
          )}
        </div>
        <div className="card-panel" style={{ minHeight: 200 }}>
          {!selected ? (
            <p style={{ color: 'var(--muted)' }}>Seleciona uma conversa para ver as mensagens.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {messages.map((m) => (
                <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <span className={`badge ${m.role === 'user' ? 'red' : 'navy'}`}>{m.role === 'user' ? 'Colaborador' : 'Assistente'}</span>
                  <p style={{ marginTop: 4 }}>{m.conteudo}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
