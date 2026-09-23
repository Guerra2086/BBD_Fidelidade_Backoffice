import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../lib/icons';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Order } from '../types';

type NavItem = { href: string; nome: string; icon: string; grp: string; count?: number };

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  const { session, signOut } = useAuth();

  const { data: orders = [] } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*');
      if (error) throw error;
      return data as Order[];
    },
  });
  const pendentes = orders.filter((o) => o.estado === 'pendente').length;

  const PAGES: NavItem[] = [
    { href: '/', nome: 'Dashboard', icon: 'dash', grp: 'Geral' },
    { href: '/encomendas', nome: 'Encomendas', icon: 'cart', grp: 'Geral', count: pendentes },
    { href: '/produtos', nome: 'Produtos', icon: 'box', grp: 'Catálogo' },
    { href: '/movimentos', nome: 'Movimentos de stock', icon: 'stock', grp: 'Catálogo' },
    { href: '/categorias', nome: 'Categorias e limites', icon: 'tag', grp: 'Catálogo' },
    { href: '/relatorios', nome: 'Relatórios', icon: 'chart', grp: 'Análise' },
    { href: '/emails', nome: 'Emails automáticos', icon: 'mail', grp: 'Configuração' },
    { href: '/definicoes', nome: 'Definições', icon: 'cog', grp: 'Configuração' },
    { href: '/administradores', nome: 'Administradores', icon: 'user', grp: 'Configuração' },
  ];

  let lastGrp = '';
  const initials = (session?.user.email ?? '??').slice(0, 2).toUpperCase();

  return (
    <>
      <aside className={`side${open ? ' open' : ''}`}>
        <div className="brand">
          <div className="mark">
            <Icon name="box" style={{ width: 22, height: 22 }} />
          </div>
          <div>
            <b>Segunda Vida</b>
            <small>Backoffice · BBD</small>
          </div>
        </div>
        <nav className="nav">
          {PAGES.map((p) => {
            const showLabel = p.grp !== lastGrp;
            lastGrp = p.grp;
            const isOn = location.pathname === p.href;
            return (
              <div key={p.href}>
                {showLabel && <div className="nav-label">{p.grp}</div>}
                <Link to={p.href} className={isOn ? 'on' : ''} onClick={onClose} data-tour={`nav-${p.href === '/' ? 'dashboard' : p.href.slice(1)}`}>
                  <Icon name={p.icon} />
                  <span>{p.nome}</span>
                  {!!p.count && <span className="count">{p.count}</span>}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="partner-box">
            <span className="d"></span>
            <span>
              Campanha <b>Fidelidade</b> × Banco de Bens Doados
            </span>
          </div>
          <div className="me">
            <div className="avatar">{initials}</div>
            <div>
              <b>{session?.user.email}</b>
              <small>
                Administrador ·{' '}
                <button onClick={signOut} style={{ textDecoration: 'underline' }}>
                  sair
                </button>
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className={`side-scrim${open ? ' on' : ''}`} onClick={onClose}></div>
    </>
  );
}
