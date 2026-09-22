import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { callAdminApi } from '../lib/api';
import type { Order, OrderItem } from '../types';

const ESTADOS: Order['estado'][] = ['pendente', 'confirmada', 'pronta_levantamento', 'entregue', 'cancelada'];
const ESTADO_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  confirmada: 'Confirmada',
  pronta_levantamento: 'Pronta p/ levantamento',
  entregue: 'Entregue',
  cancelada: 'Cancelada',
};

export function Encomendas({ onlyPending = false }: { onlyPending?: boolean }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [estadoFilter, setEstadoFilter] = useState<string>(onlyPending ? 'pendente' : '');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
  });

  const estadoMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: Order['estado'] }) => {
      const { error } = await supabase.from('orders').update({ estado }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancel_order', { p_order_id: id });
      if (error) throw error;
      await callAdminApi('send-order-email', { orderId: id, templateKey: 'order_cancelled' }).catch(() => {
        // o cancelamento já foi aplicado; a falha a enviar o email não deve bloquear o fluxo
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  async function toggleExpand(order: Order) {
    if (expanded === order.id) {
      setExpanded(null);
      return;
    }
    setExpanded(order.id);
    if (!items[order.id]) {
      const { data } = await supabase.from('order_items').select('*').eq('order_id', order.id);
      setItems((prev) => ({ ...prev, [order.id]: (data as OrderItem[]) ?? [] }));
    }
  }

  const rows = orders.filter((o) => (estadoFilter ? o.estado === estadoFilter : true));

  return (
    <div className="page">
      <h1>{onlyPending ? 'Encomendas pendentes' : 'Todas as encomendas'}</h1>
      {!onlyPending && (
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', marginBottom: 16 }}
        >
          <option value="">Todos os estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {ESTADO_LABEL[e]}
            </option>
          ))}
        </select>
      )}
      {isLoading ? (
        <p style={{ color: 'var(--muted)' }}>A carregar…</p>
      ) : (
        <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--paper)' }}>
                {['Código', 'Comprador', 'Total', 'Estado', 'Data', ''].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr style={{ borderTop: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'ui-monospace,monospace', fontSize: 13 }}>{r.codigo}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {r.buyer_nome}
                      <br />
                      <small style={{ color: 'var(--muted)' }}>{r.buyer_email}</small>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{r.total} €</td>
                    <td style={{ padding: '12px 16px' }}>
                      <select
                        value={r.estado}
                        disabled={r.estado === 'cancelada'}
                        onChange={(e) => estadoMutation.mutate({ id: r.id, estado: e.target.value as Order['estado'] })}
                        style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--line)' }}
                      >
                        {ESTADOS.map((e) => (
                          <option key={e} value={e}>
                            {ESTADO_LABEL[e]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{new Date(r.created_at).toLocaleDateString('pt-PT')}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost" onClick={() => toggleExpand(r)}>
                        Detalhe
                      </button>
                      <button
                        className="btn btn-ghost"
                        disabled={r.estado === 'cancelada' || r.estado === 'entregue'}
                        onClick={() => cancelMutation.mutate(r.id)}
                      >
                        Cancelar
                      </button>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: '0 16px 16px', background: 'var(--paper)' }}>
                        {(items[r.id] ?? []).map((it) => (
                          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                            <span>
                              {it.quantidade}x {it.product_nome_snapshot}
                            </span>
                            <span>{(it.quantidade * it.preco_unitario).toFixed(2)} €</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
