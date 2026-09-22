import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Shell({ children }: { children: ReactNode }) {
  const [sideOpen, setSideOpen] = useState(false);

  return (
    <div className="app">
      <Sidebar open={sideOpen} onClose={() => setSideOpen(false)} />
      <main>
        <Topbar onBurger={() => setSideOpen(true)} />
        <div className="view fade-in">{children}</div>
      </main>
    </div>
  );
}
