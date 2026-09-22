import { handleOptions, json } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { verifyGateToken } from '../_shared/gate.ts';

// Substitui "as minhas encomendas" (não há login individual — ver plano, TODO(Rodrigo)
// confirmar se código+email é o UX pretendido).
Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (!(await verifyGateToken(req))) {
    return json({ error: 'nao_autorizado' }, 401);
  }

  const { codigo, email } = await req.json().catch(() => ({ codigo: null, email: null }));
  if (!codigo || !email) {
    return json({ error: 'dados_em_falta' }, 400);
  }

  const admin = supabaseAdmin();
  const { data: order, error } = await admin
    .from('orders')
    .select('id, codigo, estado, total, peso_total_kg, created_at')
    .eq('codigo', codigo)
    .ilike('buyer_email', email)
    .maybeSingle();

  if (error || !order) {
    return json({ error: 'encomenda_nao_encontrada' }, 404);
  }

  const { data: items } = await admin
    .from('order_items')
    .select('product_nome_snapshot, quantidade, preco_unitario')
    .eq('order_id', order.id);

  const { id: _id, ...orderPublic } = order;
  return json({ order: orderPublic, items: items ?? [] });
});
