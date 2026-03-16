import { useEffect, useRef, useState } from "react";

type Accent = "solar" | "import" | "export" | "load";

interface MetricCardProps {
  label: string;
  value: number;
  accent: Accent;
  maxValue?: number;
  icon: string;
}

function useAnimatedValue(target: number, duration = 700): number {
  const [display, setDisplay] = useState(target);
  const fromRef  = useRef(target);
  const startRef = useRef<number | null>(null);
  const rafRef   = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;

    startRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return display;
}

function formatDisplay(w: number): { number: string; unit: string } {
  if (w >= 1000) {
    return { number: (w / 1000).toFixed(w >= 10_000 ? 0 : 1), unit: "kW" };
  }
  return { number: String(Math.round(w)), unit: "W" };
}

export function MetricCard({ label, value, accent, maxValue = 10_000, icon }: MetricCardProps) {
  const animated = useAnimatedValue(value);
  const { number, unit } = formatDisplay(animated);
  const pct = Math.min((value / maxValue) * 100, 100).toFixed(1);

  return (
    <article className={`panel metric-card metric-card--${accent}`}>
      <div className="metric-card__label">{icon}&nbsp; {label}</div>
      <div className="metric-card__value">
        <span className="metric-card__number">{number}</span>
        <span className="metric-card__unit">{unit}</span>
      </div>
      <div className="metric-card__bar-track">
        <div className="metric-card__bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </article>
  );
}
