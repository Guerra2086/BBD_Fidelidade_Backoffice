import type { OrderEstado, OrderItem, Order } from '../types';

export const eur = (v: number) => v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
export const fmtDT = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
};

export const orderTotal = (o: Order) => o.total;
export const orderUnits = (items: OrderItem[]) => items.reduce((s, i) => s + i.quantidade, 0);

export const ESTADO_LABEL: Record<OrderEstado, string> = {
  pendente: 'Reservada',
  confirmada: 'Confirmada',
  pronta_levantamento: 'Pronta p/ levantar',
  entregue: 'Paga e entregue',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
};

const BADGE_CLASS: Record<OrderEstado, string> = {
  pendente: 'b-pend',
  confirmada: 'b-pend',
  pronta_levantamento: 'b-pronta',
  entregue: 'b-entregue',
  cancelada: 'b-cancel',
  expirada: 'b-exp',
};

export function OrderBadge({ estado }: { estado: OrderEstado }) {
  return <span className={`badge ${BADGE_CLASS[estado]}`}>{ESTADO_LABEL[estado]}</span>;
}

export function orderDeadline(order: Order, reserveDays: number) {
  const d = new Date(order.created_at);
  d.setDate(d.getDate() + reserveDays);
  return d;
}

export function daysLeft(order: Order, reserveDays: number) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((orderDeadline(order, reserveDays).getTime() - today.getTime()) / 86400000);
}

// Turno de recolha escolhido no frontoffice. "curto" → "21/10 · Manhã"; senão → "quarta-feira, 21 de outubro · Manhã".
export function fmtRecolha(o: Pick<Order, 'recolha_data' | 'recolha_turno'>, curto = false) {
  if (!o.recolha_data || !o.recolha_turno) return null;
  const d = new Date(`${o.recolha_data}T12:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = curto
    ? { day: '2-digit', month: '2-digit', timeZone: 'UTC' }
    : { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' };
  return `${new Intl.DateTimeFormat('pt-PT', opts).format(d)} · ${o.recolha_turno === 'manha' ? 'Manhã' : 'Tarde'}`;
}
