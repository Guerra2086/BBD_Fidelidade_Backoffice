import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon, ProductIcon } from '../lib/icons';
import { Modal, ConfirmDialog } from '../components/Modal';
import { useToast } from '../context/ToastContext';
import { callAdminApi } from '../lib/api';
import { eur, fmtDT, OrderBadge, ESTADO_LABEL, daysLeft, orderDeadline } from '../lib/orders';
import type { Order, OrderEvent, OrderItem, Product } from '../types';

const TABS: [string, string][] = [
  ['todas', 'Todas'],
  ['pendente', 'Reservadas'],
  ['pronta_levantamento', 'Prontas p/ levantar'],
  ['entregue', 'Pagas e entregues'],
  ['cancelada', 'Canceladas'],
  ['expirada', 'Expiradas'],
];

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

export function Encomendas() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('todas');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [reserveDays, setReserveDays] = useState(7);

  const { data: orders = [], isLoading } = useQuery({
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

  useEffect(() => {
    supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'reserve_days')
      .maybeSingle()
      .then(({ data }) => setReserveDays((data?.value as { days?: number } | undefined)?.days ?? 7));
  }, []);

  useEffect(() => {
    const open = params.get('open');
    if (open) {
      setOpenId(open);
      params.delete('open');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    for (const it of orderItems) {
      const arr = map.get(it.order_id) ?? [];
      arr.push(it);
      map.set(it.order_id, arr);
    }
    return map;
  }, [orderItems]);

  const filtered = orders.filter((o) => {
    if (tab !== 'todas' && o.estado !== tab) return false;
    if (!q) return true;
    const query = q.toLowerCase();
    return o.codigo.toLowerCase().includes(query) || o.buyer_nome.toLowerCase().includes(query) || o.buyer_email.toLowerCase().includes(query);
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancel_order', { p_order_id: id });
      if (error) throw error;
      await callAdminApi('send-order-email', { orderId: id, templateKey: 'order_cancelled' }).catch(() => {
        // a encomenda já foi cancelada; a falha a enviar o email não deve bloquear o fluxo
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['order_events'] });
      toast('Encomenda cancelada · stock reposto');
    },
    onError: () => toast('Não foi possível cancelar a encomenda', 'err'),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Encomendas</h1>
          <p>Compra online, pagamento presencial no levantamento. Sem moradas.</p>
        </div>
        <div className="actions">
          <button
            className="btn btn-line"
            onClick={() =>
              downloadCsv('encomendas.csv', [
                ['N.º', 'Nome', 'Email', 'Data', 'Unidades', 'Total', 'Estado', 'Pagamento'],
                ...orders.map((o) => [
                  o.codigo,
                  o.buyer_nome,
                  o.buyer_email,
                  o.created_at,
                  (itemsByOrder.get(o.id) ?? []).reduce((s, i) => s + i.quantidade, 0),
                  o.total,
                  o.estado,
                  o.payment_method ?? '',
                ]),
              ])
            }
          >
            <Icon name="down" />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            {l}
            <span>{k === 'todas' ? orders.length : orders.filter((o) => o.estado === k).length}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <label className="field-inline" style={{ flex: 1, maxWidth: 380 }}>
          <Icon name="eye" />
          <input placeholder="Pesquisar n.º, nome ou email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>N.º</th>
              <th>Colaborador</th>
              <th>Data</th>
              <th>Artigos</th>
              <th>Total a pagar</th>
              <th>Estado</th>
              <th>Reserva</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty">A carregar…</div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty">Sem encomendas neste filtro.</div>
                </td>
              </tr>
            ) : (
              filtered.map((o) => {
                const dl = daysLeft(o, reserveDays);
                const active = ['pendente', 'pronta_levantamento'].includes(o.estado);
                const units = (itemsByOrder.get(o.id) ?? []).reduce((s, i) => s + i.quantidade, 0);
                return (
                  <tr className="click" key={o.id} onClick={() => setOpenId(o.id)}>
                    <td className="num">{o.codigo}</td>
                    <td>
                      <b>{o.buyer_nome}</b>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{o.buyer_email}</div>
                    </td>
                    <td>{fmtDT(o.created_at)}</td>
                    <td>{units} un.</td>
                    <td className="num">{eur(o.total)}</td>
                    <td>
                      <OrderBadge estado={o.estado} />
                    </td>
                    <td>{active ? <span className={`pill ${dl <= 2 ? 'red' : ''}`}>{dl <= 0 ? 'expira hoje' : `${dl} dia(s)`}</span> : '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button title="Ver">
                          <Icon name="eye" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {openId && (
        <OrderDetail
          orderId={openId}
          reserveDays={reserveDays}
          onClose={() => setOpenId(null)}
          onCancel={() => {
            setCancelId(openId);
          }}
          onPay={() => {
            setPayingId(openId);
            setOpenId(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        title="Cancelar encomenda?"
        danger
        ok="Cancelar e repor stock"
        msg={
          <>
            A encomenda vai ser cancelada. O stock é <b>reposto automaticamente</b> e o colaborador recebe um email.
          </>
        }
        onYes={() => {
          if (cancelId) cancelMutation.mutate(cancelId);
          setOpenId(null);
        }}
      />

      {payingId && <PaymentModal orderId={payingId} onClose={() => setPayingId(null)} onBack={() => { setOpenId(payingId); setPayingId(null); }} />}
    </>
  );
}

function OrderDetail({
  orderId,
  reserveDays,
  onClose,
  onCancel,
  onPay,
}: {
  orderId: string;
  reserveDays: number;
  onClose: () => void;
  onCancel: () => void;
  onPay: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: order } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if (error) throw error;
      return data as Order;
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ['order_items', orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from('order_items').select('*').eq('order_id', orderId);
      if (error) throw error;
      return data as OrderItem[];
    },
  });
  const { data: events = [] } = useQuery({
    queryKey: ['order_events', orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from('order_events').select('*').eq('order_id', orderId).order('created_at');
      if (error) throw error;
      return data as OrderEvent[];
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

  const readyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_order_ready', { p_order_id: orderId });
      if (error) throw error;
      await callAdminApi('send-order-email', { orderId, templateKey: 'order_ready' }).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['order_events', orderId] });
      toast('Marcada como pronta para levantamento');
    },
    onError: () => toast('Não foi possível atualizar a encomenda', 'err'),
  });

  if (!order) return null;

  const active = ['pendente', 'pronta_levantamento'].includes(order.estado);
  const dl = daysLeft(order, reserveDays);
  const productById = (id: string | null) => products.find((p) => p.id === id);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Encomenda ${order.codigo}`}
      sub={`${fmtDT(order.created_at)} · ${ESTADO_LABEL[order.estado]}`}
      icon="cart"
      iconCls={order.estado === 'entregue' ? 'green' : ['cancelada', 'expirada'].includes(order.estado) ? 'red' : ''}
      size="lg"
      left={active ? <button className="btn btn-danger" onClick={onCancel}><Icon name="x" />Cancelar encomenda</button> : undefined}
      footer={
        order.estado === 'pendente' ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>
              Fechar
            </button>
            <button className="btn btn-navy" onClick={() => readyMutation.mutate()}>
              <Icon name="box" />
              Marcar como pronta
            </button>
          </>
        ) : order.estado === 'pronta_levantamento' ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>
              Fechar
            </button>
            <button className="btn btn-red" onClick={onPay}>
              <Icon name="euro" />
              Registar pagamento e entrega
            </button>
          </>
        ) : (
          <button className="btn btn-navy" onClick={onClose}>
            Fechar
          </button>
        )
      }
    >
      <div className="od-grid">
        <div>
          {active && (
            <div className={`note ${dl <= 2 ? 'amber' : ''}`} style={{ marginBottom: 14 }}>
              <Icon name="clock" />
              <div>
                Reservada até <b>{orderDeadline(order, reserveDays).toLocaleDateString('pt-PT')}</b> ({dl <= 0 ? 'expira hoje' : `faltam ${dl} dia(s)`}). Se não
                for levantada, é cancelada automaticamente e o stock volta à loja.
              </div>
            </div>
          )}
          <div className="info-box">
            <h4>Artigos</h4>
            <div className="items-list">
              {items.map((i) => {
                const p = productById(i.product_id);
                return (
                  <div className="it" key={i.id}>
                    {p ? (
                      <div className="thumb nophoto" style={{ width: 48, height: 48, flex: '0 0 48px' }}>
                        <ProductIcon name={p.icone} style={{ width: 26, height: 26 }} />
                      </div>
                    ) : (
                      <div className="thumb nophoto" style={{ width: 48, height: 48, flex: '0 0 48px' }} />
                    )}
                    <div className="t">
                      <b>{i.product_nome_snapshot}</b>
                      <small>
                        {i.quantidade} × {eur(i.preco_unitario)}
                      </small>
                    </div>
                    <b className="num">{eur(i.quantidade * i.preco_unitario)}</b>
                  </div>
                );
              })}
            </div>
            <div className="kv" style={{ borderTop: '2px solid var(--ink)', marginTop: 6, paddingTop: 12, fontSize: 16 }}>
              <b>Total a pagar no levantamento</b>
              <b className="num">{eur(order.total)}</b>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="info-box">
            <h4>Colaborador</h4>
            <div className="kv">
              <span>Nome</span>
              <b>{order.buyer_nome}</b>
            </div>
            <div className="kv">
              <span>Email</span>
              <b style={{ wordBreak: 'break-all' }}>{order.buyer_email}</b>
            </div>
            <div className="note" style={{ marginTop: 8 }}>
              <Icon name="pin" />
              <div>Sem morada · levantamento presencial</div>
            </div>
          </div>
          <div className="info-box">
            <h4>Histórico</h4>
            <ul className="tl">
              {events.map((h, k) => (
                <li className={k === events.length - 1 ? 'now' : 'done'} key={h.id}>
                  <b>{h.texto}</b>
                  <span>{fmtDT(h.created_at)}</span>
                </li>
              ))}
            </ul>
            {order.payment_method && (
              <div className="kv">
                <span>Pagamento</span>
                <b>{order.payment_method}</b>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PaymentModal({ orderId, onClose, onBack }: { orderId: string; onClose: () => void; onBack: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [method, setMethod] = useState<'Numerário' | 'Multibanco' | 'MB WAY'>('Numerário');
  const [confirmed, setConfirmed] = useState(true);

  const { data: order } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').eq('id', orderId).single();
      if (error) throw error;
      return data as Order;
    },
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('register_order_payment', { p_order_id: orderId, p_metodo: method });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['order_events', orderId] });
      toast('Pagamento registado', 'ok', order ? `${order.codigo} · ${eur(order.total)} · ${method}` : undefined);
      onClose();
    },
    onError: () => toast('Não foi possível registar o pagamento', 'err'),
  });

  if (!order) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Registar pagamento"
      sub={`${order.codigo} · ${order.buyer_nome}`}
      icon="euro"
      iconCls="green"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onBack}>
            Voltar
          </button>
          <button className="btn btn-red" disabled={!confirmed} onClick={() => payMutation.mutate()}>
            <Icon name="check" />
            Confirmar pagamento
          </button>
        </>
      }
    >
      <div className="form">
        <div style={{ textAlign: 'center', padding: '6px 0 4px' }}>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Valor a receber</div>
          <div className="num" style={{ fontSize: 40, color: 'var(--navy)' }}>
            {eur(order.total)}
          </div>
        </div>
        <div className="f">
          <span className="l">Método de pagamento</span>
          <div className="pay-opts">
            {(['Numerário', 'Multibanco', 'MB WAY'] as const).map((m) => (
              <button key={m} type="button" className={m === method ? 'on' : ''} onClick={() => setMethod(m)}>
                <Icon name={m === 'Numerário' ? 'euro' : m === 'Multibanco' ? 'cart' : 'send'} style={{ width: 22, height: 22 }} />
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="switch-row">
          <div>
            <b>Confirmo que os artigos foram entregues</b>
            <span>Fecha a encomenda</span>
          </div>
          <button type="button" className={`toggle ${confirmed ? 'on' : ''}`} onClick={() => setConfirmed((v) => !v)}></button>
        </div>
      </div>
    </Modal>
  );
}
