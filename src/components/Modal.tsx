import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../lib/icons';

export function Modal({
  open,
  onClose,
  title,
  sub,
  icon = 'info',
  iconCls = '',
  size = '',
  left,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  icon?: string;
  iconCls?: string;
  size?: '' | 'lg' | 'xl';
  left?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    } else if (mounted) {
      setShown(false);
      const t = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={`overlay${shown ? ' on' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="m-head">
          <div className={`mi ${iconCls}`}>
            <Icon name={icon} style={{ width: 22, height: 22 }} />
          </div>
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          <button className="x" onClick={onClose} aria-label="Fechar">
            <Icon name="x" />
          </button>
        </div>
        <div className="m-body">{children}</div>
        {(footer || left) && (
          <div className="m-foot">
            {left && <div className="left">{left}</div>}
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function useModal() {
  const [open, setOpen] = useState(false);
  return { open, show: () => setOpen(true), hide: () => setOpen(false) };
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  msg,
  ok = 'Confirmar',
  danger = false,
  onYes,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  msg: ReactNode;
  ok?: string;
  danger?: boolean;
  onYes: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={danger ? 'alert' : 'info'}
      iconCls={danger ? 'red' : ''}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className={`btn ${danger ? 'btn-red' : 'btn-navy'}`}
            onClick={() => {
              onYes();
              onClose();
            }}
          >
            {ok}
          </button>
        </>
      }
    >
      <p>{msg}</p>
    </Modal>
  );
}
