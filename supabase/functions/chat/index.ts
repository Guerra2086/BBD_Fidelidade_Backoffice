import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { verifyGateToken } from '../_shared/gate.ts';

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const RATE_LIMIT_MAX_MESSAGES = 20;
const RATE_LIMIT_WINDOW_MINUTES = 60;

function buildSystemPrompt(faqs: { pergunta: string; resposta: string }[], products: { nome: string; categoria: string; preco: number; estado: string; stock: number }[]) {
  const faqsText = faqs.map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`).join('\n\n');
  const productsText = products
    .map((p) => `- ${p.nome} (${p.categoria}) · ${p.preco.toFixed(2)} € · estado: ${p.estado} · stock: ${p.stock === 0 ? 'esgotado' : `${p.stock} un.`}`)
    .join('\n');

  return `És o assistente virtual da loja solidária "Segunda Vida" (Fidelidade × Banco de Bens Doados).
Respondes sempre em português de Portugal, de forma curta, simpática e clara.
Falas só sobre: a loja, os produtos e stock abaixo, encomendas, e a iniciativa Fidelidade × Banco de Bens Doados.
NUNCA inventas stock, preços ou informação que não esteja abaixo. Se não souberes responder com a informação
disponível, diz isso claramente e sugere que a pessoa contacte o Banco de Bens Doados (TODO(Rodrigo): confirmar contacto de apoio).
Não há pagamento online: a encomenda é feita no site, mas paga-se presencialmente no levantamento.

Perguntas frequentes:
${faqsText || '(sem FAQs configuradas)'}

Produtos ativos na loja agora:
${productsText || '(sem produtos disponíveis de momento)'}`;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (!(await verifyGateToken(req))) {
    return json({ error: 'nao_autorizado' }, 401);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: 'chat_nao_configurado' }, 500);
  }

  const { sessionId, message } = await req.json().catch(() => ({ sessionId: null, message: null }));
  if (!sessionId || !message || typeof message !== 'string') {
    return json({ error: 'dados_em_falta' }, 400);
  }

  const admin = supabaseAdmin();

  // Rate limit simples por sessão (conta mensagens do utilizador na última hora).
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await admin
    .from('chat_messages')
    .select('id, chat_conversations!inner(session_id)', { count: 'exact', head: true })
    .eq('role', 'user')
    .eq('chat_conversations.session_id', sessionId)
    .gte('created_at', since);
  if ((count ?? 0) >= RATE_LIMIT_MAX_MESSAGES) {
    return json({ error: 'demasiados_pedidos', message: 'Já fizeste muitas perguntas nesta hora. Tenta novamente mais tarde.' }, 429);
  }

  let { data: conversation } = await admin
    .from('chat_conversations')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (!conversation) {
    const { data: created } = await admin.from('chat_conversations').insert({ session_id: sessionId }).select('id').single();
    conversation = created;
  }
  if (!conversation) {
    return json({ error: 'erro_interno' }, 500);
  }

  const { data: history } = await admin
    .from('chat_messages')
    .select('role, conteudo')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
    .limit(20);

  const [{ data: faqs }, { data: products }] = await Promise.all([
    admin.from('faqs').select('pergunta, resposta').eq('ativo', true).order('ordem'),
    admin
      .from('products')
      .select('nome, preco, estado, stock, categories(nome)')
      .eq('ativo', true),
  ]);

  const productsForPrompt = (products ?? []).map((p) => ({
    nome: p.nome,
    categoria: (p as unknown as { categories: { nome: string } | null }).categories?.nome ?? '',
    preco: p.preco,
    estado: p.estado,
    stock: p.stock,
  }));

  await admin.from('chat_messages').insert({ conversation_id: conversation.id, role: 'user', conteudo: message });

  const messages = [...(history ?? []).map((m) => ({ role: m.role, content: m.conteudo })), { role: 'user', content: message }];

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      system: buildSystemPrompt(faqs ?? [], productsForPrompt),
      messages,
      stream: true,
    }),
  });

  if (!anthropicRes.ok || !anthropicRes.body) {
    console.error('Erro na API da Anthropic:', await anthropicRes.text());
    return json({ error: 'erro_ao_contactar_assistente' }, 502);
  }

  let full = '';
  const stream = new ReadableStream({
    async start(controller) {
      const reader = anthropicRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          try {
            const evt = JSON.parse(payload);
            if (evt.type === 'content_block_delta' && evt.delta?.text) {
              full += evt.delta.text;
              controller.enqueue(new TextEncoder().encode(evt.delta.text));
            }
          } catch {
            // ignora linhas que não sejam JSON válido (ex.: eventos de controlo)
          }
        }
      }
      await admin.from('chat_messages').insert({ conversation_id: conversation.id, role: 'assistant', conteudo: full });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
  });
});
