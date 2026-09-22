import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Order } from '../types';

export function Colaboradores() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').neq('estado', 'cancelada');
      if (error) throw error;
      return data as Order[];
    },
  });

  const rows = useMemo(() => {
    const byEmail = new Map<string, { nome: string; email: string; encomendas: number; totalGasto: number }>();
    for (const o of orders) {
      const row = byEmail.get(o.buyer_email) ?? { nome: o.buyer_nome, email: o.buyer_email, encomendas: 0, totalGasto: 0 };
      row.encomendas += 1;
      row.totalGasto += o.total;
      byEmail.set(o.buyer_email, row);
    }
    return [...byEmail.values()].sort((a, b) => b.totalGasto - a.totalGasto);
  }, [orders]);

  return (
    <div className="page">
      <h1>Colaboradores</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 16, fontSize: 13 }}>
        Não há contas de colaborador (loja sem login individual) — agregado a partir do nome/email indicados em cada encomenda.
      </p>
      {isLoading ? (
        <p style={{ color: 'var(--muted)' }}>A carregar…</p>
      ) : (
        <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--paper)' }}>
                {['Nome', 'Email', 'N.º encomendas', 'Total gasto'].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.email} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.nome}</td>
                  <td style={{ padding: '12px 16px' }}>{r.email}</td>
                  <td style={{ padding: '12px 16px' }}>{r.encomendas}</td>
                  <td style={{ padding: '12px 16px' }}>{r.totalGasto.toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
