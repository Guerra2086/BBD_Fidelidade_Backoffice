import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Order, OrderItem, Product } from '../types';

export function Dashboard() {
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

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*');
      if (error) throw error;
      return data as Product[];
    },
  });

  const vendasTotais = orders.reduce((s, o) => s + o.total, 0);
  const unidadesVendidas = orderItems.reduce((s, i) => s + i.quantidade, 0);
  const kgReaproveitados = orders.reduce((s, o) => s + o.peso_total_kg, 0);
  const stockBaixo = products.filter((p) => p.ativo && p.stock > 0 && p.stock <= 3).length;

  const cards = [
    { label: 'Vendas totais', value: `${vendasTotais.toFixed(2)} €` },
    { label: 'N.º de encomendas', value: String(orders.length) },
    { label: 'Unidades vendidas', value: String(unidadesVendidas) },
    { label: 'Kg reaproveitados', value: `${kgReaproveitados.toFixed(1)} kg` },
    { label: 'Produtos com stock baixo (≤3)', value: String(stockBaixo) },
  ];

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {cards.map((c) => (
          <div className="card-panel" key={c.label}>
            <div style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontFamily: 'Space Grotesk', fontSize: 32, fontWeight: 700, marginTop: 6 }}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
