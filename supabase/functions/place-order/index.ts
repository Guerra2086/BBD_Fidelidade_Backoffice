import { handleOptions, json } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { verifyGateToken } from '../_shared/gate.ts';
import { formatItensList, sendTemplatedEmail } from '../_shared/email.ts';

type Item = { product_id: string; quantidade: number };

const ERROR_MESSAGES: Record<string, string> = {
  items_vazios: 'A tua caixa está vazia.',
  stock_insuficiente: 'Já não há stock suficiente para um ou mais artigos da tua caixa.',
  limite_tecnologia_excedido: 'Excedeste o limite de unidades permitido para a categoria Tecnologia.',
};

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (!(await verifyGateToken(req))) {
    return json({ error: 'nao_autorizado' }, 401);
  }

  let body: { buyer_nome?: string; buyer_email?: string; items?: Item[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'pedido_invalido' }, 400);
  }

  const { buyer_nome, buyer_email, items } = body;
  if (!buyer_nome || !buyer_email || !Array.isArray(items) || items.length === 0) {
    return json({ error: 'dados_em_falta' }, 400);
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .rpc('place_order', {
      p_buyer_nome: buyer_nome,
      p_buyer_email: buyer_email,
      p_items: items,
    })
    .single();

  if (error) {
    const code = error.message as keyof typeof ERROR_MESSAGES;
    return json({ error: code, message: ERROR_MESSAGES[code] ?? 'Não foi possível concluir a encomenda.' }, 400);
  }

  const order = data as { order_id: string; codigo: string; total: number };

  const { data: orderItems } = await admin
    .from('order_items')
    .select('product_nome_snapshot, quantidade, preco_unitario')
    .eq('order_id', order.order_id);

  await sendTemplatedEmail('order_confirmation', buyer_email, {
    nome: buyer_nome,
    numero_encomenda: order.codigo,
    itens: formatItensList(orderItems ?? []),
    total: `${order.total.toFixed(2)} €`,
  });

  return json({ codigo: order.codigo, total: order.total });
});
