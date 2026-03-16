import { formatTime } from "../lib/format.js";
import type { HistoryPoint } from "../types.js";

interface HistoryChartProps {
  points: HistoryPoint[];
  title: string;
  field: keyof Pick<HistoryPoint, "solarW" | "gridImportW" | "gridExportW" | "homeLoadW">;
  color: string;
}

const W = 320;
const H = 100;
const X_LABEL_H = 14;   // extra height below chart for time labels
const TOTAL_H = H + X_LABEL_H;
const GRID_LINES = 4;
const X_LABEL_COUNT = 5; // how many time labels across the bottom

function smoothLine(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  const p0 = pts[0]!;
  if (pts.length === 1) return `M ${p0.x} ${p0.y}`;

  const parts: string[] = [`M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)}`];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]!;
    const curr = pts[i]!;
    const cpx = (curr.x - prev.x) / 2.5;
    parts.push(
      `C ${(prev.x + cpx).toFixed(1)} ${prev.y.toFixed(1)} ${(curr.x - cpx).toFixed(1)} ${curr.y.toFixed(1)} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`
    );
  }
  return parts.join(" ");
}

export function HistoryChart({ points, title, field, color }: HistoryChartProps) {
  const values = points.map((p) => p[field]);
  const max    = Math.max(...values, 1);

  const coords = points.map((p, i) => ({
    x: (i / Math.max(points.length - 1, 1)) * W,
    y: H - (p[field] / max) * (H - 4),
  }));

  const line     = smoothLine(coords);
  const areaPath = coords.length > 0
    ? `${line} L ${coords.at(-1)!.x.toFixed(1)} ${H} L 0 ${H} Z`
    : "";

  const gradId = `grad-${field}`;
  const glowId = `glow-${field}`;

  const formatMax = (w: number) =>
    w >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`;

  // 5 evenly-spaced X-axis time labels
  const xLabels = points.length >= 2
    ? Array.from({ length: X_LABEL_COUNT }, (_, i) => {
        const pct = i / (X_LABEL_COUNT - 1);
        const idx = Math.round(pct * (points.length - 1));
        const pt  = points[idx]!;
        return { x: pct * W, label: formatTime(pt.ts), anchor: i === 0 ? "start" : i === X_LABEL_COUNT - 1 ? "end" : "middle" };
      })
    : [];

  return (
    <article className="panel chart-card">
      <div className="chart-card__header">
        <span className="chart-card__title">{title}</span>
        <span className="chart-card__max">{formatMax(max)}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${TOTAL_H}`} aria-label={`${title} history chart`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
          <filter id={glowId} x="-5%" y="-20%" width="110%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Horizontal grid lines */}
        {Array.from({ length: GRID_LINES }, (_, i) => {
          const y = ((i + 1) / (GRID_LINES + 1)) * H;
          return (
            <line
              key={i}
              x1="0" y1={y.toFixed(1)}
              x2={W} y2={y.toFixed(1)}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
          );
        })}

        {/* Area fill */}
        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}

        {/* Line with glow */}
        {line && (
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${glowId})`}
            style={{ opacity: points.length > 0 ? 1 : 0 }}
          />
        )}

        {/* Latest value dot */}
        {coords.length > 0 && (
          <circle
            cx={coords.at(-1)!.x}
            cy={coords.at(-1)!.y}
            r="3"
            fill={color}
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        )}

        {/* X-axis baseline */}
        <line
          x1="0" y1={H} x2={W} y2={H}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />

        {/* X-axis time labels */}
        {xLabels.map(({ x, label, anchor }) => (
          <text
            key={x}
            x={x.toFixed(1)}
            y={H + 11}
            textAnchor={anchor as "start" | "middle" | "end"}
            fontSize="8"
            fontFamily="'JetBrains Mono','Consolas',monospace"
            fill="rgba(180,210,240,0.4)"
          >
            {label}
          </text>
        ))}
      </svg>
    </article>
  );
}
