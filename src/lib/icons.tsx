// Ícones da interface (iguais à referência backoffice-segunda-vida.html).
export const UI: Record<string, string> = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  box: '<path d="M3 8l9-4 9 4v10l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v10"/>',
  stock: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cart: '<path d="M6 6h15l-2 9H8L6 3H3"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>',
  tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 118 0v4"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  down: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  euro: '<path d="M17 6a7 7 0 100 12M4 10h10M4 14h10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  pin: '<path d="M12 21s7-6 7-12a7 7 0 10-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  refresh: '<path d="M20 11a8 8 0 10-2 6M20 5v6h-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
  chev: '<path d="M15 5l-7 7 7 7"/>',
};

export function Icon({ name, className = 'i', style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const d = UI[name];
  if (!d) return null;
  return <svg className={className} viewBox="0 0 24 24" style={style} dangerouslySetInnerHTML={{ __html: d }} />;
}

// Ícones dos produtos (mesma chave usada no frontoffice, mais os novos desta referência).
export const PI: Record<string, string> = {
  cadeira: '<path d="M20 8v48M44 32v24M20 32h24M20 8h20v24"/>',
  cadeiraesc: '<path d="M22 8h20v22H22zM32 30v14M20 44h24M22 44l-4 10M42 44l4 10M32 44v10"/>',
  sofa: '<path d="M8 30h48v16H8zM12 30v-8h40v8M12 46v6M52 46v6"/>',
  cadeirao: '<path d="M14 26V14h36v12M10 26h8v14h28V26h8v18H10zM14 44v8M50 44v8"/>',
  secretaria: '<path d="M6 24h52M10 24v30M54 24v30M36 24v18h18"/>',
  secretaria2: '<path d="M8 20h48M20 20v26M44 20v26M14 46h12M38 46h12M26 32h12"/>',
  mesa: '<ellipse cx="32" cy="22" rx="26" ry="8"/><path d="M32 30v22M22 54h20"/>',
  mesinha: '<path d="M14 26h36M18 26l-4 26M46 26l4 26M16 40h32"/>',
  monitor: '<rect x="8" y="12" width="48" height="30" rx="3"/><path d="M32 42v8M22 52h20"/>',
  portatil: '<rect x="14" y="14" width="36" height="24" rx="2"/><path d="M6 46h52l-4-8H10z"/>',
  candeeiro: '<path d="M22 8h20l6 18H16zM32 26v26M22 56h20"/>',
  estante: '<rect x="14" y="6" width="36" height="52"/><path d="M14 22h36M14 38h36M20 14v8M26 12v10M22 30v8"/>',
  chaleira: '<path d="M16 50h32l-4-26H20zM24 24c0-6 16-6 16 0M48 30l8-6M16 36h-6v8h6"/>',
  micro: '<rect x="8" y="14" width="48" height="36" rx="4"/><rect x="14" y="20" width="28" height="24" rx="2"/><path d="M48 22v4M48 32v4"/>',
  loica: '<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="12"/>',
  casaco: '<path d="M24 8l-12 8v40h40V16L40 8l-8 10zM32 18v38"/>',
  urso: '<circle cx="32" cy="36" r="16"/><circle cx="20" cy="18" r="6"/><circle cx="44" cy="18" r="6"/><circle cx="26" cy="33" r="1.5"/><circle cx="38" cy="33" r="1.5"/><path d="M28 42q4 4 8 0"/>',
  manta: '<path d="M10 14h44v36H10zM10 24h44M10 34h44M10 44h44"/>',
};

export function ProductIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const d = PI[name] || PI.estante;
  return <svg className={className} style={style} viewBox="0 0 64 64" dangerouslySetInnerHTML={{ __html: d }} />;
}

export const ICON_KEYS = Object.keys(PI);
