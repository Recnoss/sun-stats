import { formatTime } from "../lib/format.js";
import type { HistoryPoint } from "../types.js";

interface Series {
  field: keyof Pick<HistoryPoint, "solarW" | "gridImportW" | "gridExportW" | "homeLoadW">;
  color: string;
  label: string;
}

interface CombinedHistoryChartProps {
  points: HistoryPoint[];
  title: string;
  series: Series[];
}

const W = 320;
const H = 100;
const X_LABEL_H = 14;
const TOTAL_H = H + X_LABEL_H;
const GRID_LINES = 4;
const HOUR_STEP = 3;

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
      `C ${(prev.x + cpx).toFixed(1)} ${prev.y.toFixed(1)} ${(curr.x - cpx).toFixed(1)} ${curr.y.toFixed(1)} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`,
    );
  }
  return parts.join(" ");
}

export function CombinedHistoryChart({ points, title, series }: CombinedHistoryChartProps) {
  // Find global max across all series for shared Y axis
  const max = Math.max(
    ...series.flatMap((s) => points.map((p) => p[s.field])),
    1,
  );

  const formatMax = (w: number) =>
    w >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`;

  // Whole-hour labels
  const xLabels =
    points.length >= 2
      ? (points
          .map((p, i) => {
            const d = new Date(p.ts);
            if (d.getMinutes() !== 0 || d.getHours() % HOUR_STEP !== 0) return null;
            const x = (i / (points.length - 1)) * W;
            return { x, label: formatTime(p.ts) };
          })
          .filter(Boolean) as { x: number; label: string }[])
      : [];

  return (
    <article className="panel chart-card">
      <div className="chart-card__header">
        <span className="chart-card__title">{title}</span>
        <span className="chart-card__max">{formatMax(max)}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${TOTAL_H}`} aria-label={`${title} history chart`}>
        <defs>
          {series.map((s) => (
            <linearGradient key={`grad-${s.field}`} id={`cgrad-${s.field}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
            </linearGradient>
          ))}
          {series.map((s) => (
            <filter key={`glow-${s.field}`} id={`cglow-${s.field}`} x="-5%" y="-20%" width="110%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
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

        {/* Render each series */}
        {series.map((s) => {
          const coords = points.map((p, i) => ({
            x: (i / Math.max(points.length - 1, 1)) * W,
            y: H - (p[s.field] / max) * (H - 4),
          }));

          const line = smoothLine(coords);
          const areaPath =
            coords.length > 0
              ? `${line} L ${coords.at(-1)!.x.toFixed(1)} ${H} L 0 ${H} Z`
              : "";

          return (
            <g key={s.field}>
              {areaPath && <path d={areaPath} fill={`url(#cgrad-${s.field})`} />}
              {line && (
                <path
                  d={line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter={`url(#cglow-${s.field})`}
                  style={{ opacity: points.length > 0 ? 1 : 0 }}
                />
              )}
              {coords.length > 0 && (
                <circle
                  cx={coords.at(-1)!.x}
                  cy={coords.at(-1)!.y}
                  r="2.5"
                  fill={s.color}
                  style={{ filter: `drop-shadow(0 0 3px ${s.color})` }}
                />
              )}
            </g>
          );
        })}

        {/* X-axis baseline */}
        <line x1="0" y1={H} x2={W} y2={H} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

        {/* X-axis time labels */}
        {xLabels.map(({ x, label }) => (
          <text
            key={x}
            x={x.toFixed(1)}
            y={H + 11}
            textAnchor="middle"
            fontSize="8"
            fontFamily="'JetBrains Mono','Consolas',monospace"
            fill="rgba(180,210,240,0.4)"
          >
            {label}
          </text>
        ))}

        {/* Legend dots */}
        {series.map((s, i) => (
          <g key={`legend-${s.field}`}>
            <circle cx={8 + i * 80} cy={H + 11} r="3" fill={s.color} />
            <text
              x={14 + i * 80}
              y={H + 13}
              fontSize="7"
              fontFamily="'JetBrains Mono','Consolas',monospace"
              fill="rgba(180,210,240,0.5)"
            >
              {s.label}
            </text>
          </g>
        ))}
      </svg>
    </article>
  );
}
