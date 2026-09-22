import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { eur } from '../lib/orders';
import type { Order } from '../types';

export function Colaboradores() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').neq('estado', 'cancelada').neq('estado', 'expirada');
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
    <>
      <div className="page-head">
        <div>
          <h1>Colaboradores</h1>
          <p>Não há contas individuais (loja sem login) — agregado a partir do nome/email indicados em cada encomenda.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>N.º encomendas</th>
              <th>Total gasto</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty">A carregar…</div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty">Ainda sem encomendas.</div>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.email}>
                  <td>
                    <b>{r.nome}</b>
                  </td>
                  <td>{r.email}</td>
                  <td>{r.encomendas}</td>
                  <td className="num">{eur(r.totalGasto)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
