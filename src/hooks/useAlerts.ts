import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Order, Product } from '../types';

export type Alert = {
  tone: 'red' | 'amber' | 'navy';
  icon: string;
  titulo: string;
  sub: string;
  href: string;
};

const LOW_STOCK_DEFAULT = 3;

export function useAlerts() {
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*, imagens:product_images(id)');
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').neq('estado', 'cancelada').neq('estado', 'expirada');
      if (error) throw error;
      return data as Order[];
    },
  });

  const { data: lowStockSetting } = useQuery({
    queryKey: ['site_settings', 'low_stock_threshold'],
    queryFn: async () => {
      const { data } = await supabase.from('site_settings').select('value').eq('key', 'low_stock_threshold').maybeSingle();
      return (data?.value as { units?: number } | undefined)?.units ?? LOW_STOCK_DEFAULT;
    },
  });

  const { data: reserveDaysSetting } = useQuery({
    queryKey: ['site_settings', 'reserve_days'],
    queryFn: async () => {
      const { data } = await supabase.from('site_settings').select('value').eq('key', 'reserve_days').maybeSingle();
      return (data?.value as { days?: number } | undefined)?.days ?? 7;
    },
  });

  const lowStock = lowStockSetting ?? LOW_STOCK_DEFAULT;
  const reserveDays = reserveDaysSetting ?? 7;

  const alerts: Alert[] = [];

  for (const p of products) {
    if (!p.imagens?.length) {
      alerts.push({ tone: 'amber', icon: 'eye', titulo: `${p.nome} sem fotografia`, sub: 'Adiciona fotos antes de o mostrar na loja', href: `/produtos?edit=${p.id}` });
    }
  }
  for (const p of products) {
    if (p.ativo && p.stock === 0) {
      alerts.push({ tone: 'red', icon: 'alert', titulo: `${p.nome} esgotado`, sub: 'Sem stock na loja', href: `/produtos?edit=${p.id}` });
    } else if (p.ativo && p.stock > 0 && p.stock <= lowStock) {
      alerts.push({ tone: 'amber', icon: 'stock', titulo: `${p.nome}: só ${p.stock} un.`, sub: 'Stock baixo', href: `/produtos?edit=${p.id}` });
    }
  }
  for (const o of orders) {
    if (!['pendente', 'pronta_levantamento'].includes(o.estado)) continue;
    const deadline = new Date(o.created_at);
    deadline.setDate(deadline.getDate() + reserveDays);
    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
    if (daysLeft <= 2) {
      alerts.push({
        tone: 'navy',
        icon: 'clock',
        titulo: `${o.codigo} expira ${daysLeft <= 0 ? 'hoje' : `em ${daysLeft} dia(s)`}`,
        sub: o.buyer_nome,
        href: `/encomendas?open=${o.id}`,
      });
    }
  }

  return alerts;
}
