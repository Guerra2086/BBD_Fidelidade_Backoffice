import { handleOptions, json } from '../_shared/cors.ts';
import { verifyAdminRequest } from '../_shared/adminAuth.ts';
import { sendTemplatedEmail } from '../_shared/email.ts';

// Usado pelo editor de templates no backoffice: envia uma pré-visualização
// com dados de exemplo para o email indicado pelo admin.
Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (!(await verifyAdminRequest(req))) {
    return json({ error: 'nao_autorizado' }, 401);
  }

  const { templateKey, to } = await req.json().catch(() => ({ templateKey: null, to: null }));
  if (!templateKey || !to) {
    return json({ error: 'dados_em_falta' }, 400);
  }

  const result = await sendTemplatedEmail(templateKey, to, {
    nome: 'Colaborador de Teste',
    numero_encomenda: 'BBD-2026-000000',
    itens: '1x Candeeiro de mesa (12.00 €)',
    total: '12.00 €',
  });

  return json(result, result.sent ? 200 : 500);
});
