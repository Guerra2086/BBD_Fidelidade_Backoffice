import { handleOptions, json } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { verifyGateToken } from '../_shared/gate.ts';

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (!(await verifyGateToken(req))) {
    return json({ error: 'nao_autorizado' }, 401);
  }

  const admin = supabaseAdmin();

  const [categories, products, stats] = await Promise.all([
    admin.from('categories').select('id, nome, slug, ordem').order('ordem'),
    admin
      .from('products')
      .select('id, nome, slug, category_id, descricao, preco, estado, icone, imagem_url, peso_kg, stock, destaque_novo, codigo_passaporte')
      .eq('ativo', true)
      .order('nome'),
    admin.from('site_stats').select('key, label, value, ordem').order('ordem'),
  ]);

  if (categories.error || products.error || stats.error) {
    console.error(categories.error, products.error, stats.error);
    return json({ error: 'erro_a_carregar_dados' }, 500);
  }

  return json({
    categories: categories.data,
    products: products.data,
    stats: stats.data,
  });
});
