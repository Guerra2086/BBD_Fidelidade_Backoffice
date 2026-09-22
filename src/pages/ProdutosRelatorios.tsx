import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Category, Order, OrderItem, Product } from '../types';

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProdutosRelatorios() {
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data as Product[];
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('ordem');
      if (error) throw error;
      return data as Category[];
    },
  });
  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').neq('estado', 'cancelada');
      if (error) throw error;
      return data as Order[];
    },
  });
  const { data: orderItems = [] } = useQuery({
    queryKey: ['order_items_all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('order_items').select('*');
      if (error) throw error;
      return data as OrderItem[];
    },
  });

  const porProduto = useMemo(() => {
    const map = new Map<string, { nome: string; unidades: number; receita: number }>();
    for (const it of orderItems) {
      const row = map.get(it.product_id ?? it.product_nome_snapshot) ?? { nome: it.product_nome_snapshot, unidades: 0, receita: 0 };
      row.unidades += it.quantidade;
      row.receita += it.quantidade * it.preco_unitario;
      map.set(it.product_id ?? it.product_nome_snapshot, row);
    }
    return [...map.values()].sort((a, b) => b.receita - a.receita);
  }, [orderItems]);

  const receitaTotal = orders.reduce((s, o) => s + o.total, 0);
  const kgTotal = orders.reduce((s, o) => s + o.peso_total_kg, 0);
  const esgotados = products.filter((p) => p.ativo && p.stock === 0);

  return (
    <div className="page">
      <h1>Relatórios de produtos</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="card-panel">
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Receita total</div>
          <div style={{ fontFamily: 'Space Grotesk', fontSize: 28, fontWeight: 700 }}>{receitaTotal.toFixed(2)} €</div>
        </div>
        <div className="card-panel">
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Kg reaproveitados</div>
          <div style={{ fontFamily: 'Space Grotesk', fontSize: 28, fontWeight: 700 }}>{kgTotal.toFixed(1)} kg</div>
        </div>
        <div className="card-panel">
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Produtos esgotados</div>
          <div style={{ fontFamily: 'Space Grotesk', fontSize: 28, fontWeight: 700 }}>{esgotados.length}</div>
        </div>
      </div>

      <div className="card-panel" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong>Vendas por produto</strong>
          <button
            className="btn btn-ghost"
            onClick={() =>
              downloadCsv(
                'vendas-por-produto.csv',
                [['Produto', 'Unidades vendidas', 'Receita (€)'], ...porProduto.map((p) => [p.nome, p.unidades, p.receita.toFixed(2)])],
              )
            }
          >
            Exportar CSV
          </button>
        </div>
        {porProduto.map((p) => (
          <div key={p.nome} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <span>{p.nome}</span>
            <span>
              {p.unidades} un. · {p.receita.toFixed(2)} €
            </span>
          </div>
        ))}
      </div>

      <div className="card-panel">
        <strong>Stock atual vs. inicial</strong>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: '8px 0', fontSize: 13, color: 'var(--muted)' }}>Produto</th>
              <th style={{ padding: '8px 0', fontSize: 13, color: 'var(--muted)' }}>Categoria</th>
              <th style={{ padding: '8px 0', fontSize: 13, color: 'var(--muted)' }}>Stock atual / inicial</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '8px 0' }}>{p.nome}</td>
                <td style={{ padding: '8px 0' }}>{categories.find((c) => c.id === p.category_id)?.nome ?? '—'}</td>
                <td style={{ padding: '8px 0' }}>
                  {p.stock} / {p.stock_inicial}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
