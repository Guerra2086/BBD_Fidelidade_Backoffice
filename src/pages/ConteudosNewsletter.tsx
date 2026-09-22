import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Icon } from '../lib/icons';

type Subscriber = { email: string; created_at: string };

function downloadCsv(filename: string, rows: string[][]) {
  const csv = '﻿' + rows.map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(';')).join('\n');
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
    <>
      <div className="page-head">
        <div>
          <h1>Newsletter</h1>
          <p>{subscribers.length} subscritores.</p>
        </div>
        <div className="actions">
          <button
            className="btn btn-line"
            onClick={() => downloadCsv('newsletter.csv', [['Email', 'Subscrito em'], ...subscribers.map((s) => [s.email, s.created_at])])}
          >
            <Icon name="down" />
            Exportar CSV
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Subscrito em</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={2}>
                  <div className="empty">A carregar…</div>
                </td>
              </tr>
            ) : (
              subscribers.map((s) => (
                <tr key={s.email}>
                  <td>{s.email}</td>
                  <td>{new Date(s.created_at).toLocaleDateString('pt-PT')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
