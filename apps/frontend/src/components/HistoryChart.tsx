import { useState } from "react";
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
const X_LABEL_H = 18;
const TOTAL_H = H + X_LABEL_H;
const GRID_LINES = 4;

const TOOLTIP_W = 96;
const TOOLTIP_H = 22;

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

function formatValue(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(w >= 10_000 ? 0 : 1)} kW`;
  return `${Math.round(w)} W`;
}

export function HistoryChart({ points, title, field, color }: HistoryChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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

  // X-axis: time-based labels every 6h (max 5), positioned by actual time fraction
  const xLabels = (() => {
    if (points.length < 2) return [];
    const t0 = new Date(points[0].ts).getTime();
    const t1 = new Date(points[points.length - 1].ts).getTime();
    const span = t1 - t0 || 1;
    const midnight = new Date(t0);
    midnight.setHours(0, 0, 0, 0);
    const labels: { x: number; label: string }[] = [];
    for (let h = 0; h <= 48; h += 6) {
      const ts = midnight.getTime() + h * 3_600_000;
      if (ts <= t0 || ts > t1) continue;
      labels.push({
        x: ((ts - t0) / span) * W,
        label: new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    }
    return labels;
  })();

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(relX * (points.length - 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (points.length < 2 || !e.touches[0]) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (touch.clientX - rect.left) / rect.width;
    const idx = Math.round(relX * (points.length - 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
  };

  const hoveredCoord = hoverIdx !== null ? coords[hoverIdx] : null;
  const hoveredPoint = hoverIdx !== null ? points[hoverIdx] : null;

  let tooltipX = 0;
  let tooltipY = 0;
  if (hoveredCoord) {
    tooltipX = Math.max(0, Math.min(W - TOOLTIP_W, hoveredCoord.x - TOOLTIP_W / 2));
    tooltipY = hoveredCoord.y < 35 ? hoveredCoord.y + 8 : hoveredCoord.y - TOOLTIP_H - 8;
  }

  return (
    <article className="panel chart-card">
      <div className="chart-card__header">
        <span className="chart-card__title">{title}</span>
        <span className="chart-card__max">{formatMax(max)}</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${TOTAL_H}`}
        aria-label={`${title} history chart`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => setHoverIdx(null)}
        style={{ touchAction: "none" }}
      >
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

        {/* Latest value dot (only when not hovering) */}
        {coords.length > 0 && hoverIdx === null && (
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
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />

        {/* X-axis time labels */}
        {xLabels.map(({ x, label }) => (
          <text
            key={x}
            x={x.toFixed(1)}
            y={H + 13}
            textAnchor="middle"
            fontSize="9.5"
            fontFamily="'JetBrains Mono','Consolas',monospace"
            fill="rgba(180,210,240,0.65)"
          >
            {label}
          </text>
        ))}

        {/* Hover: crosshair + dot + tooltip */}
        {hoveredCoord && hoveredPoint && (
          <>
            <line
              x1={hoveredCoord.x.toFixed(1)} y1="0"
              x2={hoveredCoord.x.toFixed(1)} y2={H}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
              strokeDasharray="3,2"
            />
            <circle
              cx={hoveredCoord.x}
              cy={hoveredCoord.y}
              r="4.5"
              fill={color}
              stroke="rgba(255,255,255,0.85)"
              strokeWidth="1.5"
              style={{ filter: `drop-shadow(0 0 6px ${color})` }}
            />
            <rect
              x={tooltipX} y={tooltipY}
              width={TOOLTIP_W} height={TOOLTIP_H}
              rx="4"
              fill="rgba(7,11,16,0.93)"
              stroke={color}
              strokeWidth="0.75"
              strokeOpacity="0.7"
            />
            <text
              x={tooltipX + TOOLTIP_W / 2}
              y={tooltipY + 14}
              textAnchor="middle"
              fontSize="8.5"
              fontFamily="'JetBrains Mono','Consolas',monospace"
              fill="rgba(220,240,255,0.95)"
            >
              {formatTime(hoveredPoint.ts)} · {formatValue(hoveredPoint[field])}
            </text>
          </>
        )}
      </svg>
    </article>
  );
}
