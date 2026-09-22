import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MENU, type MenuItem } from './menu';
import './TopNav.css';

function isItemActive(item: MenuItem, pathname: string) {
  if (item.href) return item.href === pathname;
  return item.children?.some((c) => c.href === pathname) ?? false;
}

export function TopNav({ userLabel, onSignOut }: { userLabel?: string; onSignOut?: () => void }) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const submenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const location = useLocation();
  const navigate = useNavigate();

  const toggleMenu = useCallback((id: string) => {
    setOpenMenuId((prev) => (prev === id ? null : id));
  }, []);

  const selectLeaf = useCallback(
    (href: string) => {
      setOpenMenuId(null);
      setMobileOpen(false);
      navigate(href);
    },
    [navigate],
  );

  const handleTriggerClick = useCallback(
    (item: MenuItem) => {
      if (item.children) toggleMenu(item.id);
      else selectLeaf(item.href!);
    },
    [selectLeaf, toggleMenu],
  );

  // Regra 4: fecha ao clicar fora
  useEffect(() => {
    if (!openMenuId) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [openMenuId]);

  // Regra 5: Esc fecha e devolve o foco ao trigger
  useEffect(() => {
    if (!openMenuId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const id = openMenuId;
        setOpenMenuId(null);
        triggerRefs.current[id]?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openMenuId]);

  const handleSubmenuKeyDown = (e: React.KeyboardEvent, id: string) => {
    const submenu = submenuRefs.current[id];
    if (!submenu) return;
    const links = Array.from(submenu.querySelectorAll<HTMLAnchorElement>('a[role="menuitem"]'));
    const currentIndex = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      links[(currentIndex + 1) % links.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      links[(currentIndex - 1 + links.length) % links.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      links[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      links[links.length - 1]?.focus();
    }
  };

  return (
    <nav className="topnav" ref={containerRef} aria-label="Navegação principal">
      <div className="topnav-bar">
        <img className="topnav-logo" src="/logos/bbd.svg" alt="Banco de Bens Doados" />

        <div className="topnav-items">
          {MENU.map((item) => {
            const active = isItemActive(item, location.pathname);
            if (!item.children) {
              return (
                <Link
                  key={item.id}
                  to={item.href!}
                  className={`topnav-trigger${active ? ' active' : ''}`}
                  onClick={() => setOpenMenuId(null)}
                >
                  {item.label}
                </Link>
              );
            }
            const open = openMenuId === item.id;
            return (
              <div key={item.id} style={{ position: 'relative' }}>
                <button
                  type="button"
                  ref={(el) => {
                    triggerRefs.current[item.id] = el;
                  }}
                  className={`topnav-trigger${active ? ' active' : ''}`}
                  aria-haspopup="true"
                  aria-expanded={open}
                  aria-controls={`submenu-${item.id}`}
                  onClick={() => handleTriggerClick(item)}
                >
                  {item.label}
                </button>
                {open && (
                  <div
                    id={`submenu-${item.id}`}
                    role="menu"
                    className="topnav-submenu"
                    ref={(el) => {
                      submenuRefs.current[item.id] = el;
                    }}
                    onKeyDown={(e) => handleSubmenuKeyDown(e, item.id)}
                  >
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        to={child.href}
                        role="menuitem"
                        className={child.href === location.pathname ? 'active' : ''}
                        onClick={() => selectLeaf(child.href)}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="topnav-user">
          {userLabel && <span>{userLabel}</span>}
          {onSignOut && (
            <button className="btn btn-ghost" onClick={onSignOut}>
              Sair
            </button>
          )}
        </div>

        <button
          type="button"
          className="topnav-hamburger"
          aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={mobileOpen}
          onClick={() => {
            setMobileOpen((v) => !v);
            setOpenMenuId(null);
          }}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {mobileOpen && (
        <div className="topnav-mobile-panel">
          {MENU.map((item) => {
            const active = isItemActive(item, location.pathname);
            if (!item.children) {
              return (
                <div className="topnav-mobile-item" key={item.id}>
                  <Link
                    to={item.href!}
                    className={`topnav-mobile-trigger${active ? ' active' : ''}`}
                    onClick={() => selectLeaf(item.href!)}
                  >
                    {item.label}
                  </Link>
                </div>
              );
            }
            const open = openMenuId === item.id;
            return (
              <div className="topnav-mobile-item" key={item.id}>
                <button
                  type="button"
                  className={`topnav-mobile-trigger${active ? ' active' : ''}`}
                  aria-haspopup="true"
                  aria-expanded={open}
                  aria-controls={`mobile-submenu-${item.id}`}
                  onClick={() => toggleMenu(item.id)}
                >
                  {item.label}
                  <span>{open ? '−' : '+'}</span>
                </button>
                {open && (
                  <div id={`mobile-submenu-${item.id}`} role="menu" className="topnav-mobile-submenu">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        to={child.href}
                        role="menuitem"
                        className={child.href === location.pathname ? 'active' : ''}
                        onClick={() => selectLeaf(child.href)}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </nav>
  );
}
