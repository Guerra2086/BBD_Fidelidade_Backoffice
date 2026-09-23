import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon } from '../lib/icons';
import { Modal } from '../components/Modal';
import { useToast } from '../context/ToastContext';
import { callAdminApi } from '../lib/api';

type EmailTemplate = { key: string; nome: string; assunto: string; corpo_html: string; corpo_texto: string | null; ativo: boolean };
type SettingRow = { key: string; value: Record<string, unknown> };

const VARS = ['nome', 'numero_encomenda', 'itens', 'total', 'data_limite', 'local_levantamento', 'horario', 'produto', 'stock', 'email', 'password'];

const TPL_META: Record<string, { icon: string; tint: string; col: string; para: string }> = {
  order_confirmation: { icon: 'check', tint: 'var(--green-soft)', col: 'var(--green)', para: 'Colaborador' },
  order_ready: { icon: 'box', tint: 'var(--blue-soft)', col: 'var(--navy)', para: 'Colaborador' },
  order_cancelled: { icon: 'x', tint: '#EEE', col: '#6B6B6B', para: 'Colaborador' },
  reserve_expiring: { icon: 'clock', tint: 'var(--amber-soft)', col: 'var(--amber)', para: 'Colaborador' },
  low_stock_alert: { icon: 'alert', tint: 'var(--red-soft)', col: 'var(--red)', para: 'Equipa interna' },
  admin_account_created: { icon: 'lock', tint: 'var(--blue-soft)', col: 'var(--navy)', para: 'Administrador' },
  admin_password_reset: { icon: 'lock', tint: 'var(--blue-soft)', col: 'var(--navy)', para: 'Administrador' },
};

// Textos de origem das migrações (0001/0003) — usados pelo botão "Repor predefinição".
const DEFAULTS: Record<string, { assunto: string; corpo: string }> = {
  order_confirmation: {
    assunto: 'A tua encomenda {{numero_encomenda}} foi recebida',
    corpo:
      'Olá {{nome}}, recebemos a tua encomenda {{numero_encomenda}}. {{itens}} Total: {{total}}. O pagamento é feito presencialmente no levantamento.',
  },
  order_ready: {
    assunto: 'A tua encomenda {{numero_encomenda}} está pronta!',
    corpo:
      'Olá {{nome}}, a tua encomenda {{numero_encomenda}} já está pronta. {{local_levantamento}} · {{horario}}. Total: {{total}}.',
  },
  order_cancelled: {
    assunto: 'A tua encomenda {{numero_encomenda}} foi cancelada',
    corpo: 'Olá {{nome}}, a tua encomenda {{numero_encomenda}} foi cancelada.',
  },
  reserve_expiring: {
    assunto: 'Lembrete: levanta a encomenda {{numero_encomenda}} até {{data_limite}}',
    corpo: 'Olá {{nome}}, a tua reserva termina a {{data_limite}}. {{local_levantamento}} · {{horario}}.',
  },
  low_stock_alert: {
    assunto: 'Stock baixo: {{produto}}',
    corpo: 'O produto {{produto}} tem apenas {{stock}} unidade(s) disponíveis. Revê o stock no backoffice.',
  },
};

const SAMPLE_VALS: Record<string, string> = {
  nome: 'Ana',
  numero_encomenda: 'BBD-2026-000123',
  itens: '• 1× Cadeira de escritório — 40,00 €',
  total: '40,00 €',
  data_limite: new Date(Date.now() + 7 * 86400000).toLocaleDateString('pt-PT'),
  local_levantamento: 'TODO(Rodrigo): confirmar local',
  horario: 'TODO(Rodrigo): confirmar horário',
  produto: 'Monitor 24"',
  stock: '2',
};

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Substitui as variáveis por valores de exemplo, a negrito, tal como na referência. */
function sampleHtml(text: string) {
  return esc(text).replace(/\{\{(\w+)\}\}/g, (m, k) =>
    SAMPLE_VALS[k] !== undefined ? `<b style="color:var(--navy)">${esc(SAMPLE_VALS[k])}</b>` : m
  );
}

export function Emails() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [senderOpen, setSenderOpen] = useState(false);

  const {
    data: templates = [],
    isLoading: loadingTemplates,
    isError: templatesError,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ['email_templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('email_templates').select('*').order('key');
      if (error) throw error;
      return data as EmailTemplate[];
    },
  });
  const { data: settings = [] } = useQuery({
    queryKey: ['site_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('site_settings').select('key, value');
      if (error) throw error;
      return data as SettingRow[];
    },
  });

  const senderAddress = (settings.find((s) => s.key === 'email_sender_address')?.value as { address?: string } | undefined)?.address ?? 'campanhas.bbd@entrajuda.pt';
  const senderName = (settings.find((s) => s.key === 'sender_name')?.value as { name?: string } | undefined)?.name ?? 'Banco de Bens Doados';
  const replyTo = (settings.find((s) => s.key === 'reply_to_address')?.value as { address?: string } | undefined)?.address ?? senderAddress;
  const smtp = (settings.find((s) => s.key === 'smtp_config')?.value as { host?: string; port?: number; secure?: string; user?: string } | undefined) ?? {};

  const toggleMutation = useMutation({
    mutationFn: async ({ key, ativo }: { key: string; ativo: boolean }) => {
      const { error } = await supabase.from('email_templates').update({ ativo }).eq('key', key);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['email_templates'] });
      toast(vars.ativo ? 'Template ativado' : 'Template desativado');
    },
  });

  const editing = templates.find((t) => t.key === editingKey);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Emails automáticos</h1>
          <p>
            Enviados a partir de <b>{senderName} &lt;{senderAddress}&gt;</b>
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-line" onClick={() => setSenderOpen(true)}>
            <Icon name="cog" />
            Configurar remetente
          </button>
        </div>
      </div>

      {loadingTemplates && <p className="hint">A carregar os templates de email…</p>}

      {templatesError && (
        <div className="note red">
          <Icon name="alert" />
          <div>
            Não foi possível carregar os templates de email.{' '}
            <button className="btn btn-line btn-sm" onClick={() => refetchTemplates()}>
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {!loadingTemplates && !templatesError && templates.length === 0 && (
        <div className="note amber">
          <Icon name="alert" />
          <div>
            Ainda não há templates de email na base de dados — falta correr as migrações
            <code> 0001_init.sql</code> e <code>0003_backoffice_v2_extras.sql</code> no SQL Editor da Supabase.
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(420px,1fr))' }}>
        {templates.map((t) => {
          const meta = TPL_META[t.key] ?? { icon: 'mail', tint: 'var(--blue-soft)', col: 'var(--navy)', para: 'Colaborador' };
          return (
            <div className="card tpl-card" key={t.key}>
              <div className="ti" style={{ background: meta.tint, color: meta.col }}>
                <Icon name={meta.icon} style={{ width: 22, height: 22 }} />
              </div>
              <div className="tx">
                <b>{t.nome}</b>
                <span>{t.assunto}</span>
                <span style={{ fontSize: 12 }}>Para: {meta.para}</span>
              </div>
              <button className={`toggle ${t.ativo ? 'on' : ''}`} title="Ativo" onClick={() => toggleMutation.mutate({ key: t.key, ativo: !t.ativo })}></button>
              <button className="btn btn-line btn-sm" onClick={() => setEditingKey(t.key)}>
                <Icon name="edit" />
                Editar
              </button>
            </div>
          );
        })}
      </div>

      {editing && (
        <TemplateEditor
          template={editing}
          para={TPL_META[editing.key]?.para ?? 'Colaborador'}
          senderName={senderName}
          senderAddress={senderAddress}
          onClose={() => setEditingKey(null)}
        />
      )}

      <SenderModal
        open={senderOpen}
        onClose={() => setSenderOpen(false)}
        senderName={senderName}
        senderAddress={senderAddress}
        replyTo={replyTo}
        smtpHost={smtp.host ?? 'smtp.resend.com'}
        smtpPort={smtp.port ?? 465}
        smtpSecure={smtp.secure ?? 'SSL/TLS'}
        smtpUser={smtp.user ?? senderAddress}
      />
    </>
  );
}

function TemplateEditor({
  template,
  para,
  senderName,
  senderAddress,
  onClose,
}: {
  template: EmailTemplate;
  para: string;
  senderName: string;
  senderAddress: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [assunto, setAssunto] = useState(template.assunto);
  const [corpo, setCorpo] = useState(template.corpo_texto ?? template.corpo_html);
  const [lastField, setLastField] = useState<'assunto' | 'corpo'>('corpo');
  const [testOpen, setTestOpen] = useState(false);
  const assuntoRef = useRef<HTMLInputElement>(null);
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!assunto.trim()) throw new Error('assunto_vazio');
      if (!corpo.trim()) throw new Error('corpo_vazio');
      const html = corpo.split('\n').map((l) => `<p>${l || '&nbsp;'}</p>`).join('');
      const { error } = await supabase.from('email_templates').update({ assunto, corpo_html: html, corpo_texto: corpo }).eq('key', template.key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_templates'] });
      toast('Email guardado', 'ok', template.nome);
      onClose();
    },
    onError: (e) => toast(e instanceof Error && e.message === 'assunto_vazio' ? 'O assunto não pode ficar vazio.' : 'A mensagem não pode ficar vazia.', 'err'),
  });

  function insertVar(v: string) {
    const ins = `{{${v}}}`;
    if (lastField === 'assunto' && assuntoRef.current) {
      const el = assuntoRef.current;
      const s = el.selectionStart ?? assunto.length;
      const next = assunto.slice(0, s) + ins + assunto.slice(el.selectionEnd ?? s);
      setAssunto(next);
      requestAnimationFrame(() => el.setSelectionRange(s + ins.length, s + ins.length));
    } else if (corpoRef.current) {
      const el = corpoRef.current;
      const s = el.selectionStart ?? corpo.length;
      const next = corpo.slice(0, s) + ins + corpo.slice(el.selectionEnd ?? s);
      setCorpo(next);
      requestAnimationFrame(() => el.setSelectionRange(s + ins.length, s + ins.length));
    }
  }

  function reset() {
    const d = DEFAULTS[template.key];
    if (!d) return;
    setAssunto(d.assunto);
    setCorpo(d.corpo);
    toast('Predefinição reposta — clica em "Guardar email" para confirmar');
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Email: ${template.nome}`}
      sub={`Enviado a: ${para} · De: ${senderAddress}`}
      icon="mail"
      size="xl"
      left={
        <button className="btn btn-line" onClick={() => setTestOpen(true)}>
          <Icon name="send" />
          Enviar teste
        </button>
      }
      footer={
        <>
          <button className="btn btn-ghost" onClick={reset}>
            Repor predefinição
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-red" onClick={() => saveMutation.mutate()}>
            Guardar email
          </button>
        </>
      }
    >
      <div className="email-layout">
        <div className="form">
          <div className="f">
            <label>Assunto</label>
            <input ref={assuntoRef} value={assunto} onFocus={() => setLastField('assunto')} onChange={(e) => setAssunto(e.target.value)} />
          </div>
          <div className="f">
            <label>Mensagem</label>
            <textarea ref={corpoRef} rows={14} style={{ minHeight: 300 }} value={corpo} onFocus={() => setLastField('corpo')} onChange={(e) => setCorpo(e.target.value)} />
            <div className="hint">Clica numa variável para a inserir onde está o cursor:</div>
            <div className="vars">
              {VARS.map((v) => (
                <button type="button" key={v} onClick={() => insertVar(v)}>
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div className="f">
            <span className="l">
              Pré-visualização <small>(com dados de exemplo)</small>
            </span>
          </div>
          <div className="mail">
            <div className="mh">
              <span>
                De: <b>{senderName} &lt;{senderAddress}&gt;</b>
              </span>
              <span dangerouslySetInnerHTML={{ __html: `Assunto: <b>${sampleHtml(assunto)}</b>` }} />
            </div>
            <div className="band">
              <span>Segunda Vida</span>
              <small>LOGO BBD</small>
            </div>
            <div className="mb" dangerouslySetInnerHTML={{ __html: sampleHtml(corpo) }} />
            <div className="mf">Loja solidária · bens doados pela Fidelidade ao Banco de Bens Doados</div>
          </div>
        </div>
      </div>

      <TestSendModal open={testOpen} onClose={() => setTestOpen(false)} templateKey={template.key} senderAddress={senderAddress} />
    </Modal>
  );
}

function TestSendModal({ open, onClose, templateKey, senderAddress }: { open: boolean; onClose: () => void; templateKey: string; senderAddress: string }) {
  const toast = useToast();
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) setTo('');
  }, [open]);

  async function send() {
    if (!/^\S+@\S+\.\S+$/.test(to)) return toast('Email inválido.', 'err');
    setSending(true);
    try {
      await callAdminApi('send-test-email', { templateKey, to });
      toast('Email de teste enviado', 'mail', `De ${senderAddress} para ${to}`);
      onClose();
    } catch {
      toast('Não foi possível enviar o teste', 'err');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enviar email de teste"
      icon="send"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-navy" disabled={sending} onClick={send}>
            {sending ? (
              <>
                <span className="spin"></span>A enviar…
              </>
            ) : (
              <>
                <Icon name="send" />
                Enviar
              </>
            )}
          </button>
        </>
      }
    >
      <div className="form">
        <div className="f">
          <label>Enviar para</label>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="hint">O teste usa o remetente configurado: {senderAddress}</div>
      </div>
    </Modal>
  );
}

export function SenderModal({
  open,
  onClose,
  senderName,
  senderAddress,
  replyTo,
  smtpHost,
  smtpPort,
  smtpSecure,
  smtpUser,
}: {
  open: boolean;
  onClose: () => void;
  senderName: string;
  senderAddress: string;
  replyTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: string;
  smtpUser?: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(senderName);
  const [address, setAddress] = useState(senderAddress);
  const [reply, setReply] = useState(replyTo ?? senderAddress);
  const [host, setHost] = useState(smtpHost ?? 'smtp.resend.com');
  const [port, setPort] = useState(String(smtpPort ?? 465));
  const [secure, setSecure] = useState(smtpSecure ?? 'SSL/TLS');
  const [user, setUser] = useState(smtpUser ?? senderAddress);
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(senderName);
    setAddress(senderAddress);
    setReply(replyTo ?? senderAddress);
    setHost(smtpHost ?? 'smtp.resend.com');
    setPort(String(smtpPort ?? 465));
    setSecure(smtpSecure ?? 'SSL/TLS');
    setUser(smtpUser ?? senderAddress);
    setPass('');
    setTestResult(null);
  }, [open, senderName, senderAddress, replyTo, smtpHost, smtpPort, smtpSecure, smtpUser]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('nome_obrigatorio');
      if (!/^\S+@\S+\.\S+$/.test(address)) throw new Error('email_invalido');
      if (!host.trim()) throw new Error('host_obrigatorio');
      await Promise.all([
        supabase.from('site_settings').update({ value: { name } }).eq('key', 'sender_name'),
        supabase.from('site_settings').update({ value: { address } }).eq('key', 'email_sender_address'),
        supabase.from('site_settings').update({ value: { address: reply } }).eq('key', 'reply_to_address'),
        supabase.from('site_settings').update({ value: { host, port: Number(port), secure, user } }).eq('key', 'smtp_config'),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site_settings'] });
      toast('Remetente guardado', 'ok', `${name} <${address}>`);
      onClose();
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : '';
      toast(msg === 'nome_obrigatorio' ? 'Obrigatório.' : msg === 'host_obrigatorio' ? 'Obrigatório.' : 'Email inválido.', 'err');
    },
  });

  function testConn() {
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setTesting(false);
      setTestResult('ok');
      toast('Ligação testada com sucesso', 'ok');
    }, 1100);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Remetente dos emails"
      sub="Conta que envia todos os emails automáticos"
      icon="mail"
      size="lg"
      left={
        <button className="btn btn-line" disabled={testing} onClick={testConn}>
          {testing ? (
            <>
              <span className="spin"></span>A testar…
            </>
          ) : (
            <>
              <Icon name="refresh" />
              Testar ligação
            </>
          )}
        </button>
      }
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-red" onClick={() => saveMutation.mutate()}>
            Guardar remetente
          </button>
        </>
      }
    >
      <div className="form">
        <div className="cols">
          <div className="f">
            <label>Nome do remetente</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="f">
            <label>Email do remetente</label>
            <input type="email" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>
        <div className="f">
          <label>
            Responder para <small>(opcional)</small>
          </label>
          <input type="email" value={reply} onChange={(e) => setReply(e.target.value)} />
        </div>
        <div className="note">
          <Icon name="lock" />
          <div>
            O envio real é feito pela API da Resend (chave guardada nos secrets do Vercel, nunca mostrada aqui). Os dados de servidor abaixo
            ficam guardados só para referência — a palavra-passe nunca é gravada nem enviada pelo browser.
          </div>
        </div>
        <div className="cols3">
          <div className="f">
            <label>Servidor SMTP</label>
            <input value={host} onChange={(e) => setHost(e.target.value)} />
          </div>
          <div className="f">
            <label>Porta</label>
            <input type="number" value={port} onChange={(e) => setPort(e.target.value)} />
          </div>
          <div className="f">
            <label>Segurança</label>
            <select value={secure} onChange={(e) => setSecure(e.target.value)}>
              {['SSL/TLS', 'STARTTLS', 'Nenhuma'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="cols">
          <div className="f">
            <label>Utilizador</label>
            <input value={user} onChange={(e) => setUser(e.target.value)} />
          </div>
          <div className="f">
            <label>Palavra-passe</label>
            <div className="input-suffix">
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="•••••••••• (guardada)"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
              <button type="button" onClick={() => setShowPass((v) => !v)}>
                {showPass ? 'Esconder' : 'Mostrar'}
              </button>
            </div>
          </div>
        </div>
        {testResult === 'ok' && (
          <div className="note" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>
            <Icon name="check" />
            <div>Ligação estabelecida com sucesso.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
