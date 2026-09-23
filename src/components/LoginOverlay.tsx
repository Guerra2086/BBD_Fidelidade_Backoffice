import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const MESSAGES = [
  'A verificar as tuas credenciais…',
  'Cada entrada ajuda a dar uma segunda vida a mais um objeto…',
  'Quase lá…',
];

export function LoginOverlay() {
  const { loginPhase, loginErrorMsg, resetLoginPhase } = useAuth();
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (loginPhase !== 'checking') {
      setMsgIndex(0);
      return;
    }
    const t = setInterval(() => setMsgIndex((i) => (i + 1) % MESSAGES.length), 1100);
    return () => clearInterval(t);
  }, [loginPhase]);

  if (loginPhase === 'idle') return null;

  return (
    <div className="login-overlay" role="status" aria-live="polite">
      <div className={`login-overlay-card ${loginPhase}`}>
        {loginPhase === 'checking' && (
          <>
            <svg className="lo-spinner" viewBox="0 0 48 48" width="56" height="56">
              <circle cx="24" cy="24" r="19" fill="none" stroke="var(--line)" strokeWidth="4" />
              <circle cx="24" cy="24" r="19" fill="none" stroke="var(--navy)" strokeWidth="4" strokeLinecap="round" strokeDasharray="70 120" />
            </svg>
            <p className="lo-msg">{MESSAGES[msgIndex]}</p>
          </>
        )}
        {loginPhase === 'success' && (
          <>
            <svg className="lo-icon" viewBox="0 0 52 52" width="56" height="56">
              <circle cx="26" cy="26" r="24" fill="none" stroke="var(--green)" strokeWidth="3" className="lo-circle" />
              <path fill="none" stroke="var(--green)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M15 27l7 7 15-15" className="lo-tick" />
            </svg>
            <p className="lo-msg">Sessão iniciada!</p>
          </>
        )}
        {loginPhase === 'error' && (
          <>
            <svg className="lo-icon" viewBox="0 0 52 52" width="56" height="56">
              <circle cx="26" cy="26" r="24" fill="none" stroke="var(--red)" strokeWidth="3" className="lo-circle" />
              <path fill="none" stroke="var(--red)" strokeWidth="4" strokeLinecap="round" d="M18 18l16 16" className="lo-x1" />
              <path fill="none" stroke="var(--red)" strokeWidth="4" strokeLinecap="round" d="M34 18l-16 16" className="lo-x2" />
            </svg>
            <p className="lo-msg">{loginErrorMsg ?? 'Não foi possível validar as credenciais.'}</p>
            <button type="button" className="btn btn-line" onClick={resetLoginPhase}>
              Tentar novamente
            </button>
          </>
        )}
      </div>
    </div>
  );
}
