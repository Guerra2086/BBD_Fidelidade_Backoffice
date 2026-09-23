import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { TOUR_STEPS, type TourStep } from '../lib/tourSteps';
import { TourPrompt } from '../components/TourPrompt';
import { TourOverlay } from '../components/TourOverlay';

type TourState = {
  running: boolean;
  stepIndex: number;
  totalSteps: number;
  step: TourStep | null;
  rect: DOMRect | null;
  start: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
};

const TourContext = createContext<TourState | null>(null);

function waitForElement(selector: string, timeoutMs = 4000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const found = document.querySelector<HTMLElement>(selector);
    if (found) {
      resolve(found);
      return;
    }
    const startedAt = Date.now();
    const iv = setInterval(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el || Date.now() - startedAt > timeoutMs) {
        clearInterval(iv);
        resolve(el);
      }
    }, 80);
  });
}

export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, mustChangePassword, tourSeen, markTourSeen } = useAuth();

  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const elRef = useRef<HTMLElement | null>(null);
  const promptedRef = useRef(false);

  // Mostra a proposta de tour uma única vez, assim que sabemos que é um admin ativo
  // e já não está preso ao ecrã de troca de palavra-passe.
  useEffect(() => {
    if (isAdmin && !mustChangePassword && !tourSeen && !promptedRef.current) {
      promptedRef.current = true;
      setShowPrompt(true);
    }
  }, [isAdmin, mustChangePassword, tourSeen]);

  const measure = useCallback(() => {
    if (elRef.current) setRect(elRef.current.getBoundingClientRect());
  }, []);

  useEffect(() => {
    if (!running) return;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    // Conteúdo dinâmico (gráficos, tabelas a carregar) pode mudar de tamanho sem
    // disparar scroll/resize — um intervalo curto mantém o spot ajustado.
    const iv = setInterval(measure, 400);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      clearInterval(iv);
    };
  }, [running, measure]);

  const endTour = useCallback(() => {
    setRunning(false);
    setRect(null);
    elRef.current = null;
    markTourSeen();
  }, [markTourSeen]);

  const goToStep = useCallback(
    async (i: number) => {
      if (i < 0) return;
      if (i >= TOUR_STEPS.length) {
        endTour();
        return;
      }
      const step = TOUR_STEPS[i];
      setStepIndex(i);
      if (step.path && location.pathname !== step.path) {
        navigate(step.path);
      }
      if (step.target) {
        const el = await waitForElement(step.target);
        elRef.current = el;
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          await new Promise((r) => setTimeout(r, 260));
          setRect(el.getBoundingClientRect());
        } else {
          setRect(null);
        }
      } else {
        elRef.current = null;
        setRect(null);
      }
    },
    [location.pathname, navigate, endTour],
  );

  const start = useCallback(() => {
    setShowPrompt(false);
    markTourSeen();
    setRunning(true);
    goToStep(0);
  }, [goToStep, markTourSeen]);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
    markTourSeen();
  }, [markTourSeen]);

  const next = useCallback(async () => {
    const cur = TOUR_STEPS[stepIndex];
    if (cur?.clickToAdvance && elRef.current) {
      elRef.current.click();
      await new Promise((r) => setTimeout(r, 150));
    }
    goToStep(stepIndex + 1);
  }, [stepIndex, goToStep]);

  const prev = useCallback(() => {
    goToStep(stepIndex - 1);
  }, [stepIndex, goToStep]);

  return (
    <TourContext.Provider
      value={{
        running,
        stepIndex,
        totalSteps: TOUR_STEPS.length,
        step: running ? TOUR_STEPS[stepIndex] : null,
        rect,
        start,
        stop: endTour,
        next,
        prev,
      }}
    >
      {children}
      {showPrompt && <TourPrompt onStart={start} onDismiss={dismissPrompt} />}
      {running && <TourOverlay />}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}
