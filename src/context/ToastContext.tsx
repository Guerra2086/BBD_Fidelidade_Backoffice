import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../lib/icons';

type ToastType = 'ok' | 'err' | 'mail';
type ToastItem = { id: number; msg: string; type: ToastType; sub?: string; out?: boolean };

type ToastContextValue = {
  toast: (msg: string, type?: ToastType, sub?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((msg: string, type: ToastType = 'ok', sub?: string) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, msg, type, sub }]);
    setTimeout(() => {
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, out: true } : t)));
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 300);
    }, 3400);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div className={`toast ${t.type}${t.out ? ' out' : ''}`} key={t.id}>
            <div className="ti">
              <Icon name={t.type === 'err' ? 'alert' : t.type === 'mail' ? 'mail' : 'check'} style={{ width: 16, height: 16 }} />
            </div>
            <div>
              {t.msg}
              {t.sub && <small>{t.sub}</small>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}
