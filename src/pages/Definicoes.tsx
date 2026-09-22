import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon } from '../lib/icons';
import { Modal } from '../components/Modal';
import { useToast } from '../context/ToastContext';
import { callAdminApi } from '../lib/api';
import { SenderModal } from './Emails';

type SettingRow = { key: string; value: Record<string, unknown>; updated_at: string };

function getVal<T>(settings: SettingRow[], key: string, field: string, fallback: T): T {
  const row = settings.find((s) => s.key === key);
  return row ? ((row.value as Record<string, unknown>)[field] as T) ?? fallback : fallback;
}

export function Definicoes() {
  const { data: settings = [] } = useQuery({
    queryKey: ['site_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('site_settings').select('key, value, updated_at');
      if (error) throw error;
      return data as SettingRow[];
    },
  });

  const senderName = getVal(settings, 'sender_name', 'name', 'Banco de Bens Doados');
  const senderAddress = getVal(settings, 'email_sender_address', 'address', 'campanhas.bbd@entrajuda.pt');
  const reserveDays = getVal(settings, 'reserve_days', 'days', 7);
  const lowStock = getVal(settings, 'low_stock_threshold', 'units', 3);
  const alertEmail = getVal(settings, 'alert_email', 'address', '');
  const autoExpire = getVal(settings, 'auto_expire_enabled', 'enabled', true);
  const pickupPlace = getVal(settings, 'pickup_info', 'place', '');
  const pickupHours = getVal(settings, 'pickup_info', 'hours', '');
  const pwUpdatedAt = settings.find((s) => s.key === 'site_password_hash')?.updated_at;
  const ago = pwUpdatedAt ? Math.round((Date.now() - new Date(pwUpdatedAt).getTime()) / 86400000) : null;

  const [pwOpen, setPwOpen] = useState(false);
  const [senderOpen, setSenderOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [pickupOpen, setPickupOpen] = useState(false);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Definições</h1>
          <p>Acesso à loja, emails, stock e levantamento.</p>
        </div>
      </div>

      <div className="set-grid">
        <div className="card set-card">
          <div className="card-head">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="kpi">
                <div className="ic" style={{ position: 'static', background: 'var(--red-soft)', color: 'var(--red)' }}>
                  <Icon name="lock" />
                </div>
              </div>
              <div>
                <h3>Acesso à loja</h3>
                <p>A loja está protegida por palavra-passe</p>
              </div>
            </div>
            <button className="btn btn-line btn-sm" onClick={() => setPwOpen(true)}>
              Alterar
            </button>
          </div>
          <div className="kv">
            <span>Palavra-passe</span>
            <b className="mono">••••••••••</b>
          </div>
          <div className="kv">
            <span>Última alteração</span>
            <b>{ago === null ? '—' : ago === 0 ? 'hoje' : `há ${ago} dia(s)`}</b>
          </div>
          <div className="kv">
            <span>Estado</span>
            <b style={{ color: 'var(--green)' }}>● Loja bloqueada</b>
          </div>
        </div>

        <div className="card set-card">
          <div className="card-head">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="kpi">
                <div className="ic" style={{ position: 'static', background: 'var(--blue-soft)', color: 'var(--navy)' }}>
                  <Icon name="mail" />
                </div>
              </div>
              <div>
                <h3>Remetente dos emails</h3>
                <p>Usado em todos os emails automáticos</p>
              </div>
            </div>
            <button className="btn btn-line btn-sm" onClick={() => setSenderOpen(true)}>
              Configurar
            </button>
          </div>
          <div className="kv">
            <span>Nome</span>
            <b>{senderName}</b>
          </div>
          <div className="kv">
            <span>Email</span>
            <b>{senderAddress}</b>
          </div>
          <div className="kv">
            <span>Envio via</span>
            <b className="mono">Resend API</b>
          </div>
        </div>

        <div className="card set-card">
          <div className="card-head">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="kpi">
                <div className="ic" style={{ position: 'static', background: 'var(--green-soft)', color: 'var(--green)' }}>
                  <Icon name="refresh" />
                </div>
              </div>
              <div>
                <h3>Gestão automática de stock</h3>
                <p>Reservas, reposição e alertas</p>
              </div>
            </div>
            <button className="btn btn-line btn-sm" onClick={() => setStockOpen(true)}>
              Editar
            </button>
          </div>
          <div className="kv">
            <span>Reserva das encomendas</span>
            <b>{reserveDays} dias</b>
          </div>
          <div className="kv">
            <span>Cancelar reservas expiradas</span>
            <b>{autoExpire ? 'Automático' : 'Manual'}</b>
          </div>
          <div className="kv">
            <span>Alerta de stock baixo</span>
            <b>
              ≤ {lowStock} un. → {alertEmail}
            </b>
          </div>
        </div>

        <div className="card set-card">
          <div className="card-head">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div className="kpi">
                <div className="ic" style={{ position: 'static', background: 'var(--amber-soft)', color: 'var(--amber)' }}>
                  <Icon name="pin" />
                </div>
              </div>
              <div>
                <h3>Levantamento e pagamento</h3>
                <p>Pagamento presencial, sem envios</p>
              </div>
            </div>
            <button className="btn btn-line btn-sm" onClick={() => setPickupOpen(true)}>
              Editar
            </button>
          </div>
          <div className="kv">
            <span>Local</span>
            <b>{pickupPlace || '—'}</b>
          </div>
          <div className="kv">
            <span>Horário</span>
            <b>{pickupHours || '—'}</b>
          </div>
          <div className="kv">
            <span>Pagamento</span>
            <b>Presencial (numerário, MB, MB WAY)</b>
          </div>
        </div>
      </div>

      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
      <SenderModal open={senderOpen} onClose={() => setSenderOpen(false)} senderName={senderName} senderAddress={senderAddress} />
      <StockSettingsModal
        open={stockOpen}
        onClose={() => setStockOpen(false)}
        reserveDays={reserveDays}
        lowStock={lowStock}
        alertEmail={alertEmail}
        autoExpire={autoExpire}
      />
      <PickupModal open={pickupOpen} onClose={() => setPickupOpen(false)} place={pickupPlace} hours={pickupHours} />
    </>
  );
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setP1('');
      setP2('');
    }
  }, [open]);

  const score = (v: string) => (v.length >= 8 ? 1 : 0) + (v.length >= 12 ? 1 : 0) + (/[A-Z]/.test(v) ? 1 : 0) + (/\d/.test(v) ? 1 : 0) + (/[^\w]/.test(v) ? 1 : 0);
  const sc = score(p1);
  const scLabel = p1.length < 8 ? 'Mínimo 8 caracteres.' : ['', 'Fraca', 'Fraca', 'Razoável', 'Forte', 'Muito forte'][sc];
  const scColor = sc <= 2 ? 'var(--red)' : sc <= 3 ? 'var(--amber)' : 'var(--green)';

  async function handleSave() {
    if (p1.length < 8) return toast('Tem de ter pelo menos 8 caracteres.', 'err');
    if (p1 !== p2) return toast('As palavras-passe não coincidem.', 'err');
    setSaving(true);
    try {
      await callAdminApi('admin-set-password', { password: p1 });
      toast('Palavra-passe da loja alterada');
      onClose();
    } catch {
      toast('Não foi possível alterar a palavra-passe', 'err');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Alterar palavra-passe da loja"
      sub="Os colaboradores vão precisar da nova palavra-passe"
      icon="lock"
      iconCls="red"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-red" disabled={saving} onClick={handleSave}>
            {saving ? 'A guardar…' : 'Guardar palavra-passe'}
          </button>
        </>
      }
    >
      <div className="form">
        <div className="f">
          <label>Nova palavra-passe</label>
          <input type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
          <div className="meter">
            <i style={{ width: `${sc * 20}%`, background: scColor }}></i>
          </div>
          <div className="hint">{scLabel}</div>
        </div>
        <div className="f">
          <label>Confirmar palavra-passe</label>
          <input type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function StockSettingsModal({
  open,
  onClose,
  reserveDays,
  lowStock,
  alertEmail,
  autoExpire,
}: {
  open: boolean;
  onClose: () => void;
  reserveDays: number;
  lowStock: number;
  alertEmail: string;
  autoExpire: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rd, setRd] = useState(String(reserveDays));
  const [ls, setLs] = useState(String(lowStock));
  const [ae, setAe] = useState(alertEmail);
  const [expOn, setExpOn] = useState(autoExpire);

  useEffect(() => {
    if (open) {
      setRd(String(reserveDays));
      setLs(String(lowStock));
      setAe(alertEmail);
      setExpOn(autoExpire);
    }
  }, [open, reserveDays, lowStock, alertEmail, autoExpire]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!(Number(rd) >= 1)) throw new Error('rd');
      if (!(Number(ls) >= 0)) throw new Error('ls');
      if (!/^\S+@\S+\.\S+$/.test(ae)) throw new Error('ae');
      await Promise.all([
        supabase.from('site_settings').update({ value: { days: Number(rd) } }).eq('key', 'reserve_days'),
        supabase.from('site_settings').update({ value: { units: Number(ls) } }).eq('key', 'low_stock_threshold'),
        supabase.from('site_settings').update({ value: { address: ae } }).eq('key', 'alert_email'),
        supabase.from('site_settings').update({ value: { enabled: expOn } }).eq('key', 'auto_expire_enabled'),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site_settings'] });
      toast('Definições de stock guardadas');
      onClose();
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : '';
      toast(msg === 'rd' ? 'Mínimo 1 dia.' : msg === 'ls' ? 'Valor inválido.' : 'Email inválido.', 'err');
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gestão automática de stock"
      icon="refresh"
      iconCls="green"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-red" onClick={() => saveMutation.mutate()}>
            Guardar
          </button>
        </>
      }
    >
      <div className="form">
        <div className="cols">
          <div className="f">
            <label>Dias de reserva</label>
            <div className="input-suffix">
              <input type="number" min={1} value={rd} onChange={(e) => setRd(e.target.value)} />
              <span>dias</span>
            </div>
            <div className="hint">Tempo para levantar e pagar.</div>
          </div>
          <div className="f">
            <label>Alerta de stock baixo</label>
            <div className="input-suffix">
              <input type="number" min={0} value={ls} onChange={(e) => setLs(e.target.value)} />
              <span>un.</span>
            </div>
          </div>
        </div>
        <div className="f">
          <label>Enviar alertas para</label>
          <input type="email" value={ae} onChange={(e) => setAe(e.target.value)} />
        </div>
        <div className="switch-row">
          <div>
            <b>Cancelar reservas expiradas automaticamente</b>
            <span>O stock volta à loja e o colaborador é avisado</span>
          </div>
          <button type="button" className={`toggle ${expOn ? 'on' : ''}`} onClick={() => setExpOn((v) => !v)}></button>
        </div>
        <div className="switch-row">
          <div>
            <b>Descontar stock ao encomendar</b>
            <span>Sempre ativo — evita vender o que não existe</span>
          </div>
          <button type="button" className="toggle on" disabled></button>
        </div>
        <div className="switch-row">
          <div>
            <b>Repor stock ao cancelar</b>
            <span>Sempre ativo</span>
          </div>
          <button type="button" className="toggle on" disabled></button>
        </div>
      </div>
    </Modal>
  );
}

function PickupModal({ open, onClose, place, hours }: { open: boolean; onClose: () => void; place: string; hours: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pp, setPp] = useState(place);
  const [ph, setPh] = useState(hours);

  useEffect(() => {
    if (open) {
      setPp(place);
      setPh(hours);
    }
  }, [open, place, hours]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!pp.trim()) throw new Error('obrigatorio');
      const { error } = await supabase.from('site_settings').update({ value: { place: pp, hours: ph } }).eq('key', 'pickup_info');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site_settings'] });
      toast('Guardado');
      onClose();
    },
    onError: () => toast('Obrigatório.', 'err'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Levantamento e pagamento"
      icon="pin"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-red" onClick={() => saveMutation.mutate()}>
            Guardar
          </button>
        </>
      }
    >
      <div className="form">
        <div className="f">
          <label>Local de levantamento</label>
          <input value={pp} onChange={(e) => setPp(e.target.value)} />
          <div className="hint">Aparece nos emails ({'{{local_levantamento}}'}).</div>
        </div>
        <div className="f">
          <label>Horário</label>
          <input value={ph} onChange={(e) => setPh(e.target.value)} />
        </div>
        <div className="note">
          <Icon name="euro" />
          <div>A loja não tem pagamento online: o colaborador encomenda no site e paga presencialmente no levantamento.</div>
        </div>
      </div>
    </Modal>
  );
}
