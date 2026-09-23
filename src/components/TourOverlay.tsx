import { useEffect, useState } from 'react';
import { useTour } from '../context/TourContext';
import { Icon } from '../lib/icons';

const TOOLTIP_WIDTH = 320;

export function TourOverlay() {
  const { step, stepIndex, totalSteps, rect, next, prev, stop } = useTour();
  const [tip, setTip] = useState<{ top: number; left: number; flip: boolean }>({ top: 0, left: 0, flip: false });

  useEffect(() => {
    if (!rect) return;
    const margin = 16;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < 180 && rect.top > 180;
    const top = flip ? rect.top - margin : rect.bottom + margin;
    let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - margin));
    setTip({ top, left, flip });
  }, [rect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [next, prev, stop]);

  if (!step) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  const controls = (
    <div className="tf">
      <span className="count">
        {stepIndex + 1} / {totalSteps}
      </span>
      <div className="btns">
        {!isFirst && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={prev}>
            Anterior
          </button>
        )}
        <button type="button" className="btn btn-red btn-sm" onClick={next}>
          {isLast ? 'Concluir' : 'Seguinte'}
        </button>
      </div>
    </div>
  );

  if (!rect) {
    return (
      <div className="tour-center-wrap">
        <div className="tour-center">
          <button className="x" aria-label="Fechar tour" onClick={stop}>
            <Icon name="x" />
          </button>
          <h4>{step.title}</h4>
          <p>{step.text}</p>
          {controls}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="tour-blocker" />
      <div
        className="tour-spotlight"
        style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }}
      />
      <div
        className="tour-tip"
        style={{ top: tip.top, left: tip.left, transform: tip.flip ? 'translateY(-100%)' : undefined }}
      >
        <button className="x" aria-label="Saltar tour" onClick={stop}>
          <Icon name="x" />
        </button>
        <h4>{step.title}</h4>
        <p>{step.text}</p>
        {controls}
      </div>
    </>
  );
}
