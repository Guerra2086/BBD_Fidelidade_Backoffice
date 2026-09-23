import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon, ProductIcon } from '../lib/icons';
import { eur } from '../lib/orders';
import type { Category, Order, OrderItem, Product } from '../types';

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Relatorios() {
  const [days, setDays] = useState(30);

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
      const { data, error } = await supabase.from('orders').select('*');
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

  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }, [days]);

  const productById = (id: string | null) => products.find((p) => p.id === id);

  const periodOrders = orders.filter((o) => new Date(o.created_at) >= from && !['cancelada', 'expirada'].includes(o.estado));
  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    for (const it of orderItems) {
      const arr = map.get(it.order_id) ?? [];
      arr.push(it);
      map.set(it.order_id, arr);
    }
    return map;
  }, [orderItems]);

  const byCat = categories.map((c) => {
    const v = periodOrders.reduce((s, o) => {
      const items = itemsByOrder.get(o.id) ?? [];
      return s + items.filter((i) => productById(i.product_id)?.category_id === c.id).reduce((a, i) => a + i.quantidade * i.preco_unitario, 0);
    }, 0);
    return { c, v };
  });
  const maxCat = Math.max(...byCat.map((x) => x.v), 1);

  const byProduct = new Map<string, { nome: string; q: number; v: number }>();
  for (const o of periodOrders) {
    for (const i of itemsByOrder.get(o.id) ?? []) {
      const cur = byProduct.get(i.product_id ?? i.product_nome_snapshot) ?? { nome: i.product_nome_snapshot, q: 0, v: 0 };
      cur.q += i.quantidade;
      cur.v += i.quantidade * i.preco_unitario;
      byProduct.set(i.product_id ?? i.product_nome_snapshot, cur);
    }
  }
  const top = [...byProduct.entries()].sort((a, b) => b[1].v - a[1].v).slice(0, 6);

  const tot = periodOrders.reduce((s, o) => s + o.total, 0);
  const paid = periodOrders.filter((o) => o.estado === 'entregue').reduce((s, o) => s + o.total, 0);
  const canc = orders.filter((o) => new Date(o.created_at) >= from && ['cancelada', 'expirada'].includes(o.estado)).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Relatórios</h1>
          <p>Vendas, stock e impacto da campanha.</p>
        </div>
        <div className="actions">
          <div className="seg" data-tour="relatorios-periodo">
            {[7, 30, 90].map((d) => (
              <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
                {d} dias
              </button>
            ))}
          </div>
          <button
            className="btn btn-line"
            onClick={() =>
              downloadCsv('relatorio.csv', [
                ['Produto', 'Doado', 'Em stock', 'Saíram'],
                ...products.map((p) => [p.nome, p.stock_inicial, p.stock, Math.max(0, p.stock_inicial - p.stock)]),
              ])
            }
          >
            <Icon name="down" />
            CSV
          </button>
        </div>
      </div>

      <div className="grid kpis">
        <div className="card kpi k1">
          <div className="ic">
            <Icon name="cart" />
          </div>
          <div className="lbl">Valor encomendado</div>
          <div className="val">{eur(tot)}</div>
          <div className="sub">{periodOrders.length} encomendas</div>
        </div>
        <div className="card kpi k3">
          <div className="ic">
            <Icon name="euro" />
          </div>
          <div className="lbl">Recebido</div>
          <div className="val">{eur(paid)}</div>
          <div className="sub">pago presencialmente</div>
        </div>
        <div className="card kpi k2">
          <div className="ic">
            <Icon name="clock" />
          </div>
          <div className="lbl">Por receber</div>
          <div className="val">{eur(tot - paid)}</div>
          <div className="sub">reservadas / prontas</div>
        </div>
        <div className="card kpi k4">
          <div className="ic">
            <Icon name="x" />
          </div>
          <div className="lbl">Canceladas / expiradas</div>
          <div className="val">{canc}</div>
          <div className="sub">stock reposto automaticamente</div>
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Vendas por categoria</h3>
              <p>Últimos {days} dias</p>
            </div>
          </div>
          {byCat.map((x) => (
            <div className="hbar" key={x.c.id}>
              <span>{x.c.nome}</span>
              <div className="t">
                <i style={{ width: `${(x.v / maxCat) * 100}%` }}></i>
              </div>
              <b>{eur(x.v)}</b>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Mais vendidos</h3>
              <p>Por valor</p>
            </div>
          </div>
          {top.length ? (
            top.map(([pid, v], k) => (
              <div className="alert-item" key={pid}>
                <div className="ai" style={{ background: 'var(--paper-2)', fontWeight: 700, color: 'var(--navy)' }}>
                  {k + 1}
                </div>
                <div className="tx">
                  <b>{v.nome}</b>
                  <span>{v.q} un.</span>
                </div>
                <b className="num">{eur(v.v)}</b>
              </div>
            ))
          ) : (
            <div className="empty">Sem vendas no período.</div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18, padding: 0 }}>
        <div className="card-head" style={{ padding: '20px 22px 0' }}>
          <div>
            <h3>Stock atual vs. doado</h3>
            <p>Quanto de cada doação já ganhou uma segunda vida</p>
          </div>
        </div>
        <div style={{ overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Doado</th>
                <th>Em stock</th>
                <th>Saíram</th>
                <th>Escoamento</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const out = Math.max(0, p.stock_inicial - p.stock);
                const pc = Math.round((out / Math.max(p.stock_inicial, 1)) * 100);
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="prod">
                        <div className="thumb nophoto" style={{ width: 36, height: 36, flex: '0 0 36px' }}>
                          <ProductIcon name={p.icone} style={{ width: 20, height: 20 }} />
                        </div>
                        <b>{p.nome}</b>
                      </div>
                    </td>
                    <td>{p.stock_inicial}</td>
                    <td className="num" style={{ color: p.stock === 0 ? 'var(--red)' : undefined }}>
                      {p.stock}
                    </td>
                    <td>{out}</td>
                    <td>
                      <div className="hbar" style={{ gridTemplateColumns: '1fr 44px', margin: 0 }}>
                        <div className="t">
                          <i style={{ width: `${pc}%`, background: pc >= 100 ? 'var(--red)' : 'var(--navy)' }}></i>
                        </div>
                        <b>{pc}%</b>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
