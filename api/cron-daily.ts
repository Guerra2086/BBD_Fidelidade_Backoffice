import { supabaseAdmin } from './_shared/supabaseAdmin';
import { sendTemplatedEmail } from './_shared/email';
import { formatDataLimite, formatHorario } from './_shared/pickupFormat';

export const config = { runtime: 'edge' };

type ReminderOrder = {
  id: string;
  codigo: string;
  buyer_nome: string;
  buyer_email: string;
  recolha_data: string;
  recolha_turno: 'manha' | 'tarde';
};

// Corrido todos os dias pelo Vercel Cron (ver "crons" no vercel.json): expira reservas
// esquecidas, envia o lembrete de recolha do dia seguinte, e cancela quem não compareceu
// na data marcada — repondo sempre o stock.
export default async function handler(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const resultado = { reservasExpiradas: 0, lembretesEnviados: 0, naoRecolhidasCanceladas: 0, erros: [] as string[] };

  // 1) Reservas "pendente" há demasiado tempo sem o admin as rever (mecanismo já existia,
  // só faltava ser chamado por um cron — ver 0002_backoffice_v2.sql).
  try {
    const { data, error } = await admin.rpc('expire_old_orders');
    if (error) throw error;
    resultado.reservasExpiradas = (data as number) ?? 0;
  } catch (e) {
    resultado.erros.push(`expire_old_orders: ${e instanceof Error ? e.message : String(e)}`);
  }

  const { data: pickupSetting } = await admin.from('site_settings').select('value').eq('key', 'pickup_info').maybeSingle();
  const localLevantamento = (pickupSetting?.value as { place?: string } | null)?.place ?? '';

  // 2) Lembrete do dia anterior à recolha.
  try {
    const { data: orders, error } = await admin.rpc('orders_needing_reminder');
    if (error) throw error;
    for (const order of (orders ?? []) as ReminderOrder[]) {
      const result = await sendTemplatedEmail('reserve_expiring', order.buyer_email, {
        nome: order.buyer_nome,
        numero_encomenda: order.codigo,
        data_limite: formatDataLimite(order.recolha_data),
        horario: formatHorario(order.recolha_data, order.recolha_turno),
        local_levantamento: localLevantamento,
      });
      if (result.sent) {
        await admin.rpc('mark_reminder_sent', { p_order_id: order.id });
        resultado.lembretesEnviados++;
      } else {
        resultado.erros.push(`lembrete ${order.codigo}: ${result.reason}`);
      }
    }
  } catch (e) {
    resultado.erros.push(`orders_needing_reminder: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3) Cancela quem não apareceu na data marcada (o RPC já repõe o stock).
  try {
    const { data: cancelled, error } = await admin.rpc('cancel_unclaimed_pickups');
    if (error) throw error;
    for (const order of (cancelled ?? []) as ReminderOrder[]) {
      await sendTemplatedEmail('order_cancelled', order.buyer_email, {
        nome: order.buyer_nome,
        numero_encomenda: order.codigo,
        data_limite: formatDataLimite(order.recolha_data),
        horario: formatHorario(order.recolha_data, order.recolha_turno),
      }).catch(() => {});
      resultado.naoRecolhidasCanceladas++;
    }
  } catch (e) {
    resultado.erros.push(`cancel_unclaimed_pickups: ${e instanceof Error ? e.message : String(e)}`);
  }

  return Response.json(resultado);
}
