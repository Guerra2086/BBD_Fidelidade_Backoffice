import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { callAdminApi } from '../lib/api';

type SettingRow = { key: string; value: Record<string, unknown> };
type EmailTemplate = { key: string; nome: string; assunto: string; corpo_html: string; ativo: boolean };

export function ConteudosConfiguracoes() {
  const queryClient = useQueryClient();
  const [tecLimit, setTecLimit] = useState('2');
  const [sender, setSender] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testTemplate, setTestTemplate] = useState('order_confirmation');
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const { data: settings = [] } = useQuery({
    queryKey: ['site_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('site_settings').select('key, value');
      if (error) throw error;
      return data as SettingRow[];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['email_templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('email_templates').select('key, nome, assunto, corpo_html, ativo');
      if (error) throw error;
      return data as EmailTemplate[];
    },
  });

  useEffect(() => {
    const limit = settings.find((s) => s.key === 'tecnologia_qty_limit')?.value?.limit;
    const address = settings.find((s) => s.key === 'email_sender_address')?.value?.address;
    if (limit !== undefined) setTecLimit(String(limit));
    if (address) setSender(String(address));
  }, [settings]);

  const limitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('site_settings')
        .update({ value: { limit: Number(tecLimit) }, updated_at: new Date().toISOString() })
        .eq('key', 'tecnologia_qty_limit');
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site_settings'] }),
  });

  const senderMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('site_settings')
        .update({ value: { address: sender }, updated_at: new Date().toISOString() })
        .eq('key', 'email_sender_address');
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['site_settings'] }),
  });

  async function handlePasswordUpdate() {
    setPasswordMsg(null);
    try {
      await callAdminApi('admin-set-password', { password: newPassword });
      setPasswordMsg('Palavra-passe atualizada ✓');
      setNewPassword('');
    } catch (e) {
      setPasswordMsg(e instanceof Error ? e.message : 'Erro ao atualizar a palavra-passe.');
    }
  }

  async function handleSendTest() {
    setTestMsg(null);
    try {
      await callAdminApi<{ sent: boolean }>('send-test-email', { templateKey: testTemplate, to: testEmailTo });
      setTestMsg(`Email de teste enviado para ${testEmailTo} ✓`);
    } catch {
      setTestMsg('Não foi possível enviar o email de teste.');
    }
  }

  return (
    <div className="page">
      <h1>Configurações</h1>

      <div className="card-panel" style={{ maxWidth: 480, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Palavra-passe do site</h3>
        <input
          type="password"
          placeholder="Nova palavra-passe"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', width: '100%' }}
        />
        <button className="btn btn-red" style={{ marginTop: 12 }} disabled={newPassword.length < 6} onClick={handlePasswordUpdate}>
          Atualizar palavra-passe
        </button>
        {passwordMsg && <p style={{ fontSize: 13, marginTop: 8, color: passwordMsg.includes('✓') ? 'var(--ok)' : 'var(--red)' }}>{passwordMsg}</p>}
      </div>

      <div className="card-panel" style={{ maxWidth: 480, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Limite de quantidade — categoria Tecnologia</h3>
        <input
          type="number"
          min={1}
          value={tecLimit}
          onChange={(e) => setTecLimit(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', width: 120 }}
        />
        <button className="btn btn-red" style={{ marginTop: 12, display: 'block' }} onClick={() => limitMutation.mutate()}>
          Guardar limite
        </button>
      </div>

      <div className="card-panel" style={{ maxWidth: 480, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Remetente dos emails automáticos</h3>
        <input
          type="email"
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', width: '100%' }}
        />
        <button className="btn btn-red" style={{ marginTop: 12 }} onClick={() => senderMutation.mutate()}>
          Guardar remetente
        </button>
      </div>

      <div className="card-panel" style={{ maxWidth: 480 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Enviar email de teste</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
          {/* TODO: editor completo de assunto/corpo dos templates (email_templates.assunto/corpo_html) —
              por agora dá para escolher o template e disparar um envio de teste. */}
          Escolhe um template e um email de destino para verificar o envio via Resend.
        </p>
        <select
          value={testTemplate}
          onChange={(e) => setTestTemplate(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', width: '100%', marginBottom: 10 }}
        >
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.nome}
            </option>
          ))}
        </select>
        <input
          type="email"
          placeholder="destino@exemplo.pt"
          value={testEmailTo}
          onChange={(e) => setTestEmailTo(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)', width: '100%' }}
        />
        <button className="btn btn-red" style={{ marginTop: 12 }} disabled={!testEmailTo} onClick={handleSendTest}>
          Enviar teste
        </button>
        {testMsg && <p style={{ fontSize: 13, marginTop: 8 }}>{testMsg}</p>}
      </div>
    </div>
  );
}
