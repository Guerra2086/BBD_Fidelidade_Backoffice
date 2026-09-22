import { useAuth } from '../context/AuthContext';

export function SemAcesso() {
  const { signOut } = useAuth();
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--paper)' }}>
      <div className="card-panel" style={{ width: 360, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Sem acesso</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>
          A tua conta não tem permissões de administrador no backoffice do Segunda Vida.
        </p>
        <button className="btn btn-ghost" onClick={signOut}>
          Sair
        </button>
      </div>
    </div>
  );
}
