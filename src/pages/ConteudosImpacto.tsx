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
    <>
      <div className="page-head">
        <div>
          <h1>Números de impacto</h1>
          <p>Contadores mostrados na secção de impacto da loja.</p>
        </div>
      </div>
      <div className="card form" style={{ maxWidth: 480 }}>
        {stats.map((s) => (
          <div className="f" key={s.key}>
            <label>{s.label}</label>
            <input value={values[s.key] ?? ''} onChange={(e) => setValues({ ...values, [s.key]: e.target.value })} />
          </div>
        ))}
        <button className="btn btn-red" style={{ justifySelf: 'start' }} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? 'A guardar…' : saved ? 'Guardado ✓' : 'Guardar'}
        </button>
      </div>
    </>
  );
}
