import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { SiteStat } from '../types';

export function ConteudosImpacto() {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data: stats = [] } = useQuery({
    queryKey: ['site_stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('site_stats').select('*').order('ordem');
      if (error) throw error;
      return data as SiteStat[];
    },
  });

  useEffect(() => {
    setValues(Object.fromEntries(stats.map((s) => [s.key, s.value])));
  }, [stats]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        stats.map((s) => supabase.from('site_stats').update({ value: values[s.key], updated_at: new Date().toISOString() }).eq('key', s.key)),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site_stats'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="page">
      <h1>Números de impacto</h1>
      <div className="card-panel" style={{ display: 'grid', gap: 16, maxWidth: 480 }}>
        {stats.map((s) => (
          <label key={s.key} style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</span>
            <input
              value={values[s.key] ?? ''}
              onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--line)' }}
            />
          </label>
        ))}
        <button className="btn btn-red" style={{ justifySelf: 'start' }} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? 'A guardar…' : saved ? 'Guardado ✓' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
