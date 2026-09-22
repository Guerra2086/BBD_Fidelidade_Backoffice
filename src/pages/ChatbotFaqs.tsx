import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Faq } from '../types';

export function ChatbotFaqs() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Partial<Faq> | null>(null);

  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ['faqs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('faqs').select('*').order('ordem');
      if (error) throw error;
      return data as Faq[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (faq: Partial<Faq>) => {
      if (faq.id) {
        const { error } = await supabase.from('faqs').update({ pergunta: faq.pergunta, resposta: faq.resposta, ativo: faq.ativo }).eq('id', faq.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('faqs').insert({ pergunta: faq.pergunta, resposta: faq.resposta, ordem: faqs.length });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqs'] });
      setEditing(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('faqs').update({ ativo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['faqs'] }),
  });

  return (
    <div className="page">
      <h1>FAQs do chatbot</h1>
      <button className="btn btn-red" style={{ marginBottom: 16 }} onClick={() => setEditing({ pergunta: '', resposta: '', ativo: true })}>
        + Nova FAQ
      </button>

      {isLoading ? (
        <p style={{ color: 'var(--muted)' }}>A carregar…</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {faqs.map((f) => (
            <div className="card-panel" key={f.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{f.pergunta}</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className={`badge ${f.ativo ? 'ok' : 'muted'}`}>{f.ativo ? 'Ativa' : 'Inativa'}</span>
                  <button className="btn btn-ghost" onClick={() => setEditing(f)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost" onClick={() => toggleMutation.mutate({ id: f.id, ativo: !f.ativo })}>
                    {f.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
              <p style={{ color: 'var(--muted)', marginTop: 8 }}>{f.resposta}</p>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <>
          <div className="bo-scrim" onClick={() => setEditing(null)} />
          <aside className="bo-drawer">
            <div className="bo-drawer-head">
              <h3>{editing.id ? 'Editar FAQ' : 'Nova FAQ'}</h3>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                ×
              </button>
            </div>
            <div className="bo-drawer-body">
              <div className="bo-field">
                <label>Pergunta</label>
                <input value={editing.pergunta ?? ''} onChange={(e) => setEditing({ ...editing, pergunta: e.target.value })} />
              </div>
              <div className="bo-field">
                <label>Resposta</label>
                <textarea rows={5} value={editing.resposta ?? ''} onChange={(e) => setEditing({ ...editing, resposta: e.target.value })} />
              </div>
            </div>
            <div className="bo-drawer-foot">
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button className="btn btn-red" disabled={!editing.pergunta || !editing.resposta} onClick={() => saveMutation.mutate(editing)}>
                Guardar
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
