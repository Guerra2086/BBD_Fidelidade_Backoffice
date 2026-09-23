import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '../lib/icons';
import { useAlerts } from '../hooks/useAlerts';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import type { Product } from '../types';

export function Topbar({ onBurger }: { onBurger: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const alerts = useAlerts();
  const [popOpen, setPopOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName ?? '')) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') setPopOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!popOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setPopOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [popOpen]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (/^bbd/i.test(q)) navigate(`/encomendas?q=${encodeURIComponent(q)}`);
    else navigate(`/produtos?q=${encodeURIComponent(q)}`);
    setQuery('');
    searchRef.current?.blur();
  }

  async function simularEncomenda() {
    setSimulating(true);
    try {
      const { data: products } = await supabase.from('products').select('*').eq('ativo', true).gt('stock', 0);
      const avail = (products as Product[] | null) ?? [];
      if (!avail.length) {
        toast('Sem produtos com stock', 'err');
        return;
      }
      const p = avail[Math.floor(Math.random() * avail.length)];
      const qty = Math.min(p.stock, 1 + Math.floor(Math.random() * 2));
      const nomes = ['Ana Ribeiro', 'João Martins', 'Inês Carvalho', 'Pedro Almeida', 'Sofia Lopes'];
      const nome = nomes[Math.floor(Math.random() * nomes.length)];
      const email = nome.toLowerCase().replace(' ', '.') + '@fidelidade.pt';
      const telemovel = '9' + String(Math.floor(10000000 + Math.random() * 89999999));
      const { data, error } = await supabase
        .rpc('place_order', {
          p_buyer_nome: nome,
          p_buyer_email: email,
          p_buyer_telemovel: telemovel,
          p_items: [{ product_id: p.id, quantidade: qty }],
        })
        .single();
      if (error) throw error;
      const order = data as { codigo: string };
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
      toast(`Nova encomenda ${order.codigo}`, 'ok', `${qty}× ${p.nome}`);
    } catch {
      toast('Não foi possível simular a encomenda', 'err');
    } finally {
      setSimulating(false);
    }
  }

  const frontofficeUrl = import.meta.env.VITE_FRONTOFFICE_URL as string | undefined;

  return (
    <div className="top">
      <button className="burger" onClick={onBurger} aria-label="Abrir menu">
        <Icon name="dash" />
      </button>
      <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 460 }}>
        <label className="search">
          <Icon name="eye" />
          <input
            ref={searchRef}
            placeholder="Pesquisar produtos ou encomendas (ex.: BBD-2026-000123)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>/</kbd>
        </label>
      </form>
      <div className="top-actions">
        <button className="btn btn-line" onClick={simularEncomenda} disabled={simulating} title="Simula uma encomenda vinda da loja">
          <Icon name="plus" />
          <span>Simular encomenda</span>
        </button>
        <div style={{ position: 'relative' }} ref={popRef}>
          <button className="icon-btn" aria-label="Alertas" onClick={() => setPopOpen((v) => !v)}>
            <Icon name="alert" />
            {alerts.length > 0 && <span className="dot"></span>}
          </button>
          <div className={`popover${popOpen ? ' on' : ''}`} style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0 }}>
            <div className="ph">
              <b>Alertas</b>
              <span className={`pill ${alerts.length ? 'red' : ''}`}>{alerts.length}</span>
            </div>
            <div className="pb">
              {alerts.length ? (
                alerts.map((a, k) => (
                  <div
                    className="alert-item"
                    key={k}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setPopOpen(false);
                      navigate(a.href);
                    }}
                  >
                    <div
                      className="ai"
                      style={{
                        background: a.tone === 'red' ? 'var(--red-soft)' : a.tone === 'amber' ? 'var(--amber-soft)' : 'var(--blue-soft)',
                        color: a.tone === 'red' ? 'var(--red)' : a.tone === 'amber' ? 'var(--amber)' : 'var(--navy)',
                      }}
                    >
                      <Icon name={a.icon} />
                    </div>
                    <div className="tx">
                      <b>{a.titulo}</b>
                      <span>{a.sub}</span>
                    </div>
                    <Icon name="eye" style={{ color: 'var(--muted)' }} />
                  </div>
                ))
              ) : (
                <div className="empty">Tudo em ordem 🎉</div>
              )}
            </div>
          </div>
        </div>
        <a
          className="btn btn-red"
          href={frontofficeUrl || '#'}
          target={frontofficeUrl ? '_blank' : undefined}
          rel="noreferrer"
          onClick={(e) => {
            if (!frontofficeUrl) {
              e.preventDefault();
              toast('Define VITE_FRONTOFFICE_URL para abrir a loja real', 'err');
            }
          }}
        >
          <Icon name="box" />
          <span>Ver loja</span>
        </a>
      </div>
    </div>
  );
}
