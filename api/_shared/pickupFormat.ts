// Formatação da data/horário de recolha para os emails — mesma regra do frontoffice
// (src/lib/pickup.ts) e do backoffice (src/lib/orders.tsx): nos dias úteis há um único
// período (o dia todo), só aos fins de semana é que faz sentido "manhã"/"tarde".
export function formatDataLimite(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  return new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
}

export function formatHorario(data: string, turno: 'manha' | 'tarde'): string {
  const dow = new Date(`${data}T12:00:00Z`).getUTCDay();
  if (dow !== 0 && dow !== 6) return 'Dia todo';
  return turno === 'manha' ? 'Manhã' : 'Tarde';
}
