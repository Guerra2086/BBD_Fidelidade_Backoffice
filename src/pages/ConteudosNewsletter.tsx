import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

type Subscriber = { email: string; created_at: string };

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ConteudosNewsletter() {
  const { data: subscribers = [], isLoading } = useQuery({
    queryKey: ['newsletter_subscribers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('newsletter_subscribers').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Subscriber[];
    },
  });

  return (
    <div className="page">
      <h1>Newsletter</h1>
      <button
        className="btn btn-ghost"
        style={{ marginBottom: 16 }}
        onClick={() => downloadCsv('newsletter.csv', [['Email', 'Subscrito em'], ...subscribers.map((s) => [s.email, s.created_at])])}
      >
        Exportar CSV
      </button>
      {isLoading ? (
        <p style={{ color: 'var(--muted)' }}>A carregar…</p>
      ) : (
        <div className="card-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: 'var(--paper)' }}>
                <th style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>Email</th>
                <th style={{ padding: '12px 16px', fontSize: 13, color: 'var(--muted)' }}>Subscrito em</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((s) => (
                <tr key={s.email} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '12px 16px' }}>{s.email}</td>
                  <td style={{ padding: '12px 16px' }}>{new Date(s.created_at).toLocaleDateString('pt-PT')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
