import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon } from '../lib/icons';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../hooks/useAlerts';
import { OrderBadge, orderTotal, orderUnits, eur, fmtDT } from '../lib/orders';
import type { Order, OrderItem, Product } from '../types';

export function Dashboard() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const alerts = useAlerts();

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
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

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    for (const it of orderItems) {
      const arr = map.get(it.order_id) ?? [];
      arr.push(it);
      map.set(it.order_id, arr);
    }
    return map;
  }, [orderItems]);

  const paid = orders.filter((o) => o.estado === 'entregue');
  const revenue = paid.reduce((s, o) => s + o.total, 0);
  const active = orders.filter((o) => ['pendente', 'pronta_levantamento'].includes(o.estado));
  const soldUnits = orders
    .filter((o) => !['cancelada', 'expirada'].includes(o.estado))
    .reduce((s, o) => s + orderUnits(itemsByOrder.get(o.id) ?? []), 0);
  const kg = orders
    .filter((o) => !['cancelada', 'expirada'].includes(o.estado))
    .reduce((s, o) => s + o.peso_total_kg, 0);
  const lowStockCount = products.filter((p) => p.ativo && p.stock <= 3).length;

  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, k) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (13 - k));
      const v = orders
        .filter((o) => !['cancelada', 'expirada'].includes(o.estado) && new Date(o.created_at).toDateString() === d.toDateString())
        .reduce((s, o) => s + o.total, 0);
      return { d, v };
    });
  }, [orders]);
  const max = Math.max(...days.map((x) => x.v), 1);

  const firstName = session?.user.email?.split('@')[0] ?? 'Admin';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bom dia, {firstName} 👋</h1>
          <p>Resumo da campanha Fidelidade × Banco de Bens Doados.</p>
        </div>
        <div className="actions">
          <button className="btn btn-line" onClick={() => navigate('/relatorios')}>
            <Icon name="chart" />
            Relatórios
          </button>
          <button className="btn btn-red" onClick={() => navigate('/produtos?new=1')}>
            <Icon name="plus" />
            Novo produto
          </button>
        </div>
      </div>

      <div className="grid kpis">
        <div className="card kpi k1">
          <div className="ic">
            <Icon name="euro" />
          </div>
          <div className="lbl">Receita recebida</div>
          <div className="val">{eur(revenue)}</div>
          <div className="sub">
            pago presencialmente · <b>{paid.length} encomendas</b>
          </div>
        </div>
        <div className="card kpi k2">
          <div className="ic">
            <Icon name="clock" />
          </div>
          <div className="lbl">Por levantar</div>
          <div className="val">{active.length}</div>
          <div className="sub">{eur(active.reduce((s, o) => s + o.total, 0))} a receber</div>
        </div>
        <div className="card kpi k3">
          <div className="ic">
            <Icon name="box" />
          </div>
          <div className="lbl">Unidades vendidas</div>
          <div className="val">{soldUnits}</div>
          <div className="sub">
            <b>{kg.toFixed(0)} kg</b> reaproveitados
          </div>
        </div>
        <div className="card kpi k4">
          <div className="ic">
            <Icon name="alert" />
          </div>
          <div className="lbl">Stock baixo / esgotado</div>
          <div className="val">{lowStockCount}</div>
          <div className="sub">limite de alerta: ≤ 3 un.</div>
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Encomendas dos últimos 14 dias</h3>
              <p>Valor encomendado por dia (sem canceladas/expiradas)</p>
            </div>
          </div>
          <div className="chart">
            {days.map((x, k) => (
              <div className={`bar${k === 13 ? ' today' : ''}`} key={k}>
                <span className="tip">
                  {x.d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })} · {eur(x.v)}
                </span>
                <i style={{ height: `${Math.max(1.5, (x.v / max) * 100)}%` }}></i>
              </div>
            ))}
          </div>
          <div className="chart-x">
            {days.map((x, k) => (
              <span key={k}>{k % 2 ? '' : x.d.getDate()}</span>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Precisa de atenção</h3>
              <p>{alerts.length} alerta(s)</p>
            </div>
          </div>
          {alerts.length ? (
            alerts.slice(0, 6).map((a, k) => (
              <div className="alert-item" key={k} style={{ cursor: 'pointer' }} onClick={() => navigate(a.href)}>
                <div
                  className="ai"
                  style={{
                    background: a.tone === 'red' ? 'var(--red-soft)' : a.tone === 'amber' ? 'var(--amber-soft)' : 'var(--blue-soft)',
                    color: a.tone === 'red' ? 'var(--red)' : a.tone === 'amber' ? 'var(--amber)' : 'var(--navy)',
                  }}
                >
                  <Icon name={a.icon} />
                </div>
                <div className="tx">
                  <b>{a.titulo}</b>
                  <span>{a.sub}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">Tudo em ordem 🎉</div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18, padding: 0 }}>
        <div className="card-head" style={{ padding: '20px 22px 0' }}>
          <div>
            <h3>Últimas encomendas</h3>
            <p>Clica numa linha para ver o detalhe</p>
          </div>
          <button className="btn btn-line btn-sm" onClick={() => navigate('/encomendas')}>
            Ver todas
          </button>
        </div>
        <div style={{ overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>N.º</th>
                <th>Colaborador</th>
                <th>Data</th>
                <th>Artigos</th>
                <th>Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 6).map((o) => (
                <tr className="click" key={o.id} onClick={() => navigate(`/encomendas?open=${o.id}`)}>
                  <td className="num">{o.codigo}</td>
                  <td>{o.buyer_nome}</td>
                  <td>{fmtDT(o.created_at)}</td>
                  <td>{orderUnits(itemsByOrder.get(o.id) ?? [])}</td>
                  <td className="num">{eur(orderTotal(o))}</td>
                  <td>
                    <OrderBadge estado={o.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
