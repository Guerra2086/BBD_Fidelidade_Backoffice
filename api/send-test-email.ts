import { verifyAdminRequest } from './_shared/adminAuth';
import { sendTemplatedEmail } from './_shared/email';

export const config = { runtime: 'edge' };

// Usado pelo editor de templates no backoffice: envia uma pré-visualização
// com dados de exemplo para o email indicado pelo admin.
export default async function handler(req: Request): Promise<Response> {
  if (!(await verifyAdminRequest(req))) {
    return Response.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const { templateKey, to } = (await req.json().catch(() => ({ templateKey: null, to: null }))) as {
    templateKey?: string | null;
    to?: string | null;
  };
  if (!templateKey || !to) {
    return Response.json({ error: 'dados_em_falta' }, { status: 400 });
  }

  const result = await sendTemplatedEmail(templateKey, to, {
    nome: 'Colaborador de Teste',
    numero_encomenda: 'BBD-2026-000000',
    itens: '1x Candeeiro de mesa (12.00 €)',
    total: '12.00 €',
    email: to,
    password: 'Ex3mpl0!23',
  });

  return Response.json(result, { status: result.sent ? 200 : 500 });
}
