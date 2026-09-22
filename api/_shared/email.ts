import { supabaseAdmin } from './supabaseAdmin';

export type TemplateVars = {
  nome: string;
  numero_encomenda: string;
  itens: string;
  total: string;
};

function renderTemplate(text: string, vars: TemplateVars): string {
  return text
    .replaceAll('{{nome}}', vars.nome)
    .replaceAll('{{numero_encomenda}}', vars.numero_encomenda)
    .replaceAll('{{itens}}', vars.itens)
    .replaceAll('{{total}}', vars.total);
}

export function formatItensList(items: { product_nome_snapshot: string; quantidade: number; preco_unitario: number }[]) {
  return items.map((i) => `${i.quantidade}x ${i.product_nome_snapshot} (${(i.quantidade * i.preco_unitario).toFixed(2)} €)`).join(', ');
}

export async function sendTemplatedEmail(templateKey: string, to: string, vars: TemplateVars) {
  const admin = supabaseAdmin();

  const { data: template, error: templateError } = await admin
    .from('email_templates')
    .select('assunto, corpo_html, corpo_texto, ativo')
    .eq('key', templateKey)
    .maybeSingle();
  if (templateError || !template || !template.ativo) {
    console.error('Template de email não encontrado ou inativo:', templateKey, templateError);
    return { sent: false, reason: 'template_indisponivel' };
  }

  const { data: settingRow } = await admin.from('site_settings').select('value').eq('key', 'email_sender_address').maybeSingle();
  const sender = (settingRow?.value as { address?: string } | null)?.address || 'campanhas.bbd@entrajuda.pt';

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error('RESEND_API_KEY não configurado — email não enviado.');
    return { sent: false, reason: 'resend_nao_configurado' };
  }

  const subject = renderTemplate(template.assunto, vars);
  const html = renderTemplate(template.corpo_html, vars);
  const text = template.corpo_texto ? renderTemplate(template.corpo_texto, vars) : undefined;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: sender, to: [to], subject, html, text }),
  });

  if (!res.ok) {
    console.error('Falha ao enviar email via Resend:', await res.text());
    return { sent: false, reason: 'resend_erro' };
  }
  return { sent: true };
}
