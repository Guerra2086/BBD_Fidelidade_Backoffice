import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon } from '../lib/icons';
import { Modal } from '../components/Modal';
import { useToast } from '../context/ToastContext';
import type { Faq } from '../types';

export function ChatbotFaqs() {
  const queryClient = useQueryClient();
  const toast = useToast();
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
        const { error } = await supabase.from('faqs').update({ pergunta: faq.pergunta, resposta: faq.resposta }).eq('id', faq.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('faqs').insert({ pergunta: faq.pergunta, resposta: faq.resposta, ordem: faqs.length });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqs'] });
      setEditing(null);
      toast('FAQ guardada');
    },
    onError: () => toast('Não foi possível guardar a FAQ', 'err'),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('faqs').update({ ativo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['faqs'] }),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>FAQs do chatbot</h1>
          <p>Base de conhecimento usada pelo assistente da loja.</p>
        </div>
        <div className="actions">
          <button className="btn btn-red" onClick={() => setEditing({ pergunta: '', resposta: '', ativo: true })}>
            <Icon name="plus" />
            Nova FAQ
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="empty">A carregar…</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {faqs.map((f) => (
            <div className="card" key={f.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong>{f.pergunta}</strong>
                <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
                  <span className={`pill ${f.ativo ? '' : 'red'}`}>{f.ativo ? 'Ativa' : 'Inativa'}</span>
                  <button className="btn btn-line btn-sm" onClick={() => setEditing(f)}>
                    Editar
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleMutation.mutate({ id: f.id, ativo: !f.ativo })}>
                    {f.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </div>
              <p style={{ color: 'var(--muted)', marginTop: 8 }}>{f.resposta}</p>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar FAQ' : 'Nova FAQ'}
        icon="mail"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="btn btn-red" disabled={!editing?.pergunta || !editing?.resposta} onClick={() => editing && saveMutation.mutate(editing)}>
              Guardar
            </button>
          </>
        }
      >
        {editing && (
          <div className="form">
            <div className="f">
              <label>Pergunta</label>
              <input value={editing.pergunta ?? ''} onChange={(e) => setEditing({ ...editing, pergunta: e.target.value })} />
            </div>
            <div className="f">
              <label>Resposta</label>
              <textarea rows={5} value={editing.resposta ?? ''} onChange={(e) => setEditing({ ...editing, resposta: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
