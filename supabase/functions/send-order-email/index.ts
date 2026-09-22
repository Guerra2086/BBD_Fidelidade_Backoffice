import { handleOptions, json } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { verifyAdminRequest } from '../_shared/adminAuth.ts';
import { formatItensList, sendTemplatedEmail } from '../_shared/email.ts';

// Disparada pelo backoffice depois de uma ação de admin sobre uma encomenda
// (ex.: cancel_order) que precise de reenviar/enviar um email ao comprador.
Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (!(await verifyAdminRequest(req))) {
    return json({ error: 'nao_autorizado' }, 401);
  }

  const { orderId, templateKey } = await req.json().catch(() => ({ orderId: null, templateKey: null }));
  if (!orderId || !templateKey) {
    return json({ error: 'dados_em_falta' }, 400);
  }

  const admin = supabaseAdmin();
  const { data: order, error } = await admin
    .from('orders')
    .select('codigo, buyer_nome, buyer_email, total')
    .eq('id', orderId)
    .maybeSingle();
  if (error || !order) {
    return json({ error: 'encomenda_nao_encontrada' }, 404);
  }

  const { data: items } = await admin
    .from('order_items')
    .select('product_nome_snapshot, quantidade, preco_unitario')
    .eq('order_id', orderId);

  const result = await sendTemplatedEmail(templateKey, order.buyer_email, {
    nome: order.buyer_nome,
    numero_encomenda: order.codigo,
    itens: formatItensList(items ?? []),
    total: `${order.total.toFixed(2)} €`,
  });

  return json(result, result.sent ? 200 : 500);
});
