import { supabaseAdmin } from './_shared/supabaseAdmin';
import { verifyAdminRequest } from './_shared/adminAuth';
import { formatItensList, sendTemplatedEmail } from './_shared/email';
import { formatDataLimite, formatHorario } from './_shared/pickupFormat';

export const config = { runtime: 'edge' };

// Disparada pelo backoffice depois de uma ação de admin sobre uma encomenda
// (ex.: cancelar, marcar pronta, registar pagamento) que precise de (re)enviar um
// email ao comprador.
export default async function handler(req: Request): Promise<Response> {
  if (!(await verifyAdminRequest(req))) {
    return Response.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const { orderId, templateKey } = (await req.json().catch(() => ({ orderId: null, templateKey: null }))) as {
    orderId?: string | null;
    templateKey?: string | null;
  };
  if (!orderId || !templateKey) {
    return Response.json({ error: 'dados_em_falta' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: order, error } = await admin
    .from('orders')
    .select('codigo, buyer_nome, buyer_email, total, recolha_data, recolha_turno')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !order) {
    return Response.json({ error: 'encomenda_nao_encontrada' }, { status: 404 });
  }

  const { data: items } = await admin.from('order_items').select('product_nome_snapshot, quantidade, preco_unitario').eq('order_id', orderId);
  const { data: pickupSetting } = await admin.from('site_settings').select('value').eq('key', 'pickup_info').maybeSingle();
  const localLevantamento = (pickupSetting?.value as { place?: string } | null)?.place ?? '';

  const result = await sendTemplatedEmail(templateKey, order.buyer_email, {
    nome: order.buyer_nome,
    numero_encomenda: order.codigo,
    itens: formatItensList(items ?? []),
    total: `${order.total.toFixed(2)} €`,
    data_limite: order.recolha_data ? formatDataLimite(order.recolha_data) : '',
    horario: order.recolha_data && order.recolha_turno ? formatHorario(order.recolha_data, order.recolha_turno) : '',
    local_levantamento: localLevantamento,
  });

  return Response.json(result, { status: result.sent ? 200 : 500 });
}
