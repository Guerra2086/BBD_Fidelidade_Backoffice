import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon } from '../lib/icons';
import { Modal } from '../components/Modal';
import { useToast } from '../context/ToastContext';
import { callAdminApi } from '../lib/api';

type EmailTemplate = { key: string; nome: string; assunto: string; corpo_html: string; corpo_texto: string | null; ativo: boolean };
type SettingRow = { key: string; value: Record<string, unknown> };

const VARS = ['nome', 'numero_encomenda', 'itens', 'total', 'data_limite', 'local_levantamento', 'horario', 'produto', 'stock'];

const TPL_META: Record<string, { icon: string; tint: string; col: string; para: string }> = {
  order_confirmation: { icon: 'check', tint: 'var(--green-soft)', col: 'var(--green)', para: 'Colaborador' },
  order_ready: { icon: 'box', tint: 'var(--blue-soft)', col: 'var(--navy)', para: 'Colaborador' },
  order_cancelled: { icon: 'x', tint: '#EEE', col: '#6B6B6B', para: 'Colaborador' },
  reserve_expiring: { icon: 'clock', tint: 'var(--amber-soft)', col: 'var(--amber)', para: 'Colaborador' },
  low_stock_alert: { icon: 'alert', tint: 'var(--red-soft)', col: 'var(--red)', para: 'Equipa interna' },
};

function sample(text: string) {
  const vals: Record<string, string> = {
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
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => vals[k] ?? m);
}

export function Emails() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [senderOpen, setSenderOpen] = useState(false);

  const { data: templates = [] } = useQuery({
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
          senderName={senderName}
          senderAddress={senderAddress}
          onClose={() => setEditingKey(null)}
        />
      )}

      <SenderModal open={senderOpen} onClose={() => setSenderOpen(false)} senderName={senderName} senderAddress={senderAddress} />
    </>
  );
}

function TemplateEditor({
  template,
  senderName,
  senderAddress,
  onClose,
}: {
  template: EmailTemplate;
  senderName: string;
  senderAddress: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [assunto, setAssunto] = useState(template.assunto);
  const [corpo, setCorpo] = useState(template.corpo_texto ?? template.corpo_html);
  const [lastField, setLastField] = useState<'assunto' | 'corpo'>('corpo');
  const [testTo, setTestTo] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
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

  async function sendTest() {
    if (!/^\S+@\S+\.\S+$/.test(testTo)) return toast('Email inválido.', 'err');
    setSendingTest(true);
    try {
      await callAdminApi('send-test-email', { templateKey: template.key, to: testTo });
      toast('Email de teste enviado', 'mail', `De ${senderAddress} para ${testTo}`);
    } catch {
      toast('Não foi possível enviar o teste', 'err');
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Email: ${template.nome}`}
      sub={`De: ${senderAddress}`}
      icon="mail"
      size="xl"
      left={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="destino@exemplo.pt"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1.5px solid var(--line)', fontSize: 13 }}
          />
          <button className="btn btn-line btn-sm" disabled={sendingTest} onClick={sendTest}>
            <Icon name="send" />
            {sendingTest ? 'A enviar…' : 'Enviar teste'}
          </button>
        </div>
      }
      footer={
        <>
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
              <span>
                Assunto: <b>{sample(assunto)}</b>
              </span>
            </div>
            <div className="band">
              <span>Segunda Vida</span>
              <small>LOGO BBD</small>
            </div>
            <div className="mb">{sample(corpo)}</div>
            <div className="mf">Loja solidária · bens doados pela Fidelidade ao Banco de Bens Doados</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function SenderModal({ open, onClose, senderName, senderAddress }: { open: boolean; onClose: () => void; senderName: string; senderAddress: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(senderName);
  const [address, setAddress] = useState(senderAddress);

  useEffect(() => {
    setName(senderName);
    setAddress(senderAddress);
  }, [senderName, senderAddress, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('nome_obrigatorio');
      if (!/^\S+@\S+\.\S+$/.test(address)) throw new Error('email_invalido');
      await Promise.all([
        supabase.from('site_settings').update({ value: { name } }).eq('key', 'sender_name'),
        supabase.from('site_settings').update({ value: { address } }).eq('key', 'email_sender_address'),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site_settings'] });
      toast('Remetente guardado', 'ok', `${name} <${address}>`);
      onClose();
    },
    onError: (e) => toast(e instanceof Error && e.message === 'nome_obrigatorio' ? 'Obrigatório.' : 'Email inválido.', 'err'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Remetente dos emails"
      sub="Conta que envia todos os emails automáticos"
      icon="mail"
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
        <div className="note">
          <Icon name="lock" />
          <div>O envio é feito através da API da Resend. A chave da API fica guardada nos secrets do Vercel, nunca é mostrada aqui.</div>
        </div>
      </div>
    </Modal>
  );
}
