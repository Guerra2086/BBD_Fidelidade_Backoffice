import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon, ProductIcon } from '../lib/icons';
import { Modal } from '../components/Modal';
import { useToast } from '../context/ToastContext';
import { fmtDT } from '../lib/orders';
import type { Product, StockMovement } from '../types';

const MOTIVOS = ['Entrada de stock (nova doação)', 'Ajuste manual (inventário)', 'Devolução'];

export function Movimentos() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [entryOpen, setEntryOpen] = useState(false);
  const [pid, setPid] = useState('');
  const [qty, setQty] = useState('1');
  const [motivo, setMotivo] = useState(MOTIVOS[0]);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('nome');
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: moves = [], isLoading } = useQuery({
    queryKey: ['stock_movements'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data as StockMovement[];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('id, codigo');
      if (error) throw error;
      return data as { id: string; codigo: string }[];
    },
  });

  const productById = (id: string | null) => products.find((p) => p.id === id);
  const orderCodigo = (id: string | null) => orders.find((o) => o.id === id)?.codigo;

  const entryMutation = useMutation({
    mutationFn: async () => {
      const q = Number(qty);
      if (!pid || !(q >= 1) || !Number.isInteger(q)) throw new Error('invalido');
      const { error } = await supabase.rpc('adjust_stock', { p_product_id: pid, p_delta: q, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast(`+${qty} un. registadas`);
      setEntryOpen(false);
      setQty('1');
    },
    onError: () => toast('Quantidade inválida.', 'err'),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Movimentos de stock</h1>
          <p>Registo automático de todas as entradas e saídas.</p>
        </div>
        <div className="actions">
          <button
            className="btn btn-red"
            onClick={() => {
              setPid(products[0]?.id ?? '');
              setEntryOpen(true);
            }}
          >
            <Icon name="plus" />
            Registar entrada
          </button>
        </div>
      </div>

      <div className="note" style={{ marginBottom: 16 }}>
        <Icon name="refresh" />
        <div>
          <b>Gestão automática ativa.</b> Encomendas descontam o stock, cancelamentos e reservas expiradas repõem-no sozinhos.
        </div>
      </div>

      <div className="table-wrap" data-tour="movimentos-tabela">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Produto</th>
              <th>Movimento</th>
              <th>Motivo</th>
              <th>Referência</th>
              <th>Stock após</th>
              <th>Por</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">A carregar…</div>
                </td>
              </tr>
            ) : (
              moves.map((m) => {
                const p = productById(m.product_id);
                const codigo = orderCodigo(m.ref_order_id);
                return (
                  <tr key={m.id}>
                    <td>{fmtDT(m.created_at)}</td>
                    <td>
                      {p ? (
                        <div className="prod">
                          <div className="thumb nophoto" style={{ width: 36, height: 36, flex: '0 0 36px' }}>
                            <ProductIcon name={p.icone} style={{ width: 20, height: 20 }} />
                          </div>
                          <b>{p.nome}</b>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className="num" style={{ color: m.delta > 0 ? 'var(--green)' : 'var(--red)' }}>
                        {m.delta > 0 ? '+' : ''}
                        {m.delta}
                      </span>
                    </td>
                    <td>{m.motivo}</td>
                    <td>
                      {codigo ? (
                        <a className="num" style={{ color: 'var(--navy)', cursor: 'pointer' }} onClick={() => navigate(`/encomendas?open=${m.ref_order_id}`)}>
                          {codigo}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="num">{m.resulting_stock}</td>
                    <td>{m.user_label === 'Sistema' ? <span className="pill">⚙ Sistema</span> : m.user_label}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        title="Registar entrada de stock"
        sub="Ex.: nova doação da Fidelidade"
        icon="stock"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEntryOpen(false)}>
              Cancelar
            </button>
            <button className="btn btn-red" onClick={() => entryMutation.mutate()}>
              Registar
            </button>
          </>
        }
      >
        <div className="form">
          <div className="f">
            <label>Produto</label>
            <select value={pid} onChange={(e) => setPid(e.target.value)}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} (atual: {p.stock})
                </option>
              ))}
            </select>
          </div>
          <div className="cols">
            <div className="f">
              <label>Quantidade</label>
              <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="f">
              <label>Motivo</label>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                {MOTIVOS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
