import type { DashboardStatus, PowerSnapshot } from "../types.js";

const CX = 200;
const CY = 195;
const R_ARC    = 148;
const R_ZONE   = 142;
const R_TICK_O = 140;
const R_TICK_I = 128;
const R_MIN_O  = 140;
const R_MIN_I  = 133;
const R_LABEL  = 112;
const NEEDLE_LEN = 135;

type GaugeMode = "consumption" | "export";

interface GaugeConfig {
  maxW: number;
  value: number;
  label: string;
  majorTicks: number[];
  minorStep: number;
  zones: { n0: number; n1: number; color: string; alpha: number }[];
  formatLabel: (n: number, idx: number) => string;
}

function getGaugeConfig(snapshot: PowerSnapshot): GaugeConfig & { mode: GaugeMode } {
  if (snapshot.status === "selling") {
    const maxW = 35_000;
    // Major ticks every 5kW: 0, 5k, 10k, 15k, 20k, 25k, 30k, 35k
    const majorTicks = Array.from({ length: 8 }, (_, i) => i / 7);
    return {
      mode: "export",
      maxW,
      value: snapshot.gridExportW,
      label: "Netteksport",
      majorTicks,
      minorStep: 1 / 35, // every 1kW
      zones: [
        { n0: 0,    n1: 0.857, color: "#00e5a0", alpha: 0.55 }, // 0-30kW green
        { n0: 0.857, n1: 1.0,  color: "#f0a020", alpha: 0.55 }, // 30-35kW amber (near inverter limit)
      ],
      formatLabel: (_, idx) => {
        const kw = idx * 5;
        return kw === 0 ? "0" : `${kw}k`;
      },
    };
  }

  const maxW = 15_000;
  // Major ticks every 3kW: 0, 3k, 6k, 9k, 12k, 15k
  const majorTicks = Array.from({ length: 6 }, (_, i) => i / 5);
  return {
    mode: "consumption",
    maxW,
    value: snapshot.homeLoadW,
    label: "Hjemforbruk",
    majorTicks,
    minorStep: 1 / 15, // every 1kW
    zones: [
      { n0: 0,    n1: 0.4,  color: "#00e5a0", alpha: 0.55 }, // 0-6kW green
      { n0: 0.4,  n1: 0.67, color: "#f0a020", alpha: 0.55 }, // 6-10kW amber
      { n0: 0.67, n1: 1.0,  color: "#ff3355", alpha: 0.55 }, // 10-15kW red
    ],
    formatLabel: (_, idx) => {
      const kw = idx * 3;
      return kw === 0 ? "0" : `${kw}k`;
    },
  };
}

const STATUS_LABELS: Record<DashboardStatus, string> = {
  buying:           "KJØPER FRA NETTET",
  selling:          "SELGER TIL NETTET",
  "self-consuming": "KJØRER PÅ SOL",
  "night-idle":     "NATT / INAKTIV",
  degraded:         "DATA FORSINKET",
};

const STATUS_COLOR: Record<DashboardStatus, string> = {
  buying:           "#2196f3",
  selling:          "#00e5a0",
  "self-consuming": "#f0a020",
  "night-idle":     "#4a7a9b",
  degraded:         "#ff3355",
};

const BADGE_STROKE: Record<DashboardStatus, string> = {
  buying:           "#ff8c00",
  selling:          "#00e5a0",
  "self-consuming": "#f0a020",
  "night-idle":     "#4a7a9b",
  degraded:         "#ff3355",
};

const BADGE_FILL: Record<DashboardStatus, string> = {
  buying:           "rgba(255,140,0,0.10)",
  selling:          "rgba(0,229,160,0.10)",
  "self-consuming": "rgba(240,160,32,0.10)",
  "night-idle":     "rgba(74,122,155,0.08)",
  degraded:         "rgba(255,51,85,0.10)",
};

function polar(r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

/** SVG arc from normStart to normEnd along the semi-circle (math 180°→0°) */
function arcD(r: number, n0: number, n1: number) {
  const a0 = (1 - n0) * 180;
  const a1 = (1 - n1) * 180;
  const s = polar(r, a0);
  const e = polar(r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function formatGauge(w: number) {
  if (w >= 1000) return `${(w / 1000).toFixed(w >= 10000 ? 0 : 1)}\u202fkW`;
  return `${Math.round(w)}\u202fW`;
}

interface Props { snapshot: PowerSnapshot }

export function PowerGauge({ snapshot }: Props) {
  const config = getGaugeConfig(snapshot);
  const normalized = Math.min(config.value / config.maxW, 1);
  const rotateDeg = normalized * 180 - 90;
  const accentColor = STATUS_COLOR[snapshot.status];

  // Generate minor ticks (exclude positions that coincide with major ticks)
  const minorTicks = Array.from(
    { length: Math.round(1 / config.minorStep) + 1 },
    (_, i) => i * config.minorStep,
  ).filter((n) => !config.majorTicks.some((m) => Math.abs(m - n) < 0.001));

  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 400 268" aria-label="Power gauge">
        <defs>
          <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            {config.mode === "export" ? (
              <>
                <stop offset="0%"   stopColor="#00e5a0" stopOpacity="0.9" />
                <stop offset="85%"  stopColor="#00e5a0" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#f0a020" stopOpacity="0.9" />
              </>
            ) : (
              <>
                <stop offset="0%"   stopColor="#00e5a0" stopOpacity="0.9" />
                <stop offset="45%"  stopColor="#f0a020" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#ff3355" stopOpacity="0.9" />
              </>
            )}
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="needleGlow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Zone arc segments */}
        {config.zones.map((z) => (
          <path
            key={z.n0}
            d={arcD(R_ZONE, z.n0, z.n1)}
            fill="none"
            stroke={z.color}
            strokeWidth="4"
            strokeOpacity={z.alpha}
            strokeLinecap="butt"
          />
        ))}

        {/* Track (background arc) */}
        <path
          d={arcD(R_ARC, 0, 1)}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="10"
          strokeLinecap="round"
        />

        {/* Active arc (filled to current value) */}
        <path
          d={arcD(R_ARC, 0, normalized)}
          fill="none"
          stroke="url(#arcGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          filter="url(#glow)"
        />

        {/* Major tick marks */}
        {config.majorTicks.map((n) => {
          const angle = (1 - n) * 180;
          const o = polar(R_TICK_O, angle);
          const i = polar(R_TICK_I, angle);
          return (
            <line
              key={n}
              x1={o.x} y1={o.y} x2={i.x} y2={i.y}
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}

        {/* Minor tick marks */}
        {minorTicks.map((n) => {
          const angle = (1 - n) * 180;
          const o = polar(R_MIN_O, angle);
          const i = polar(R_MIN_I, angle);
          return (
            <line
              key={n}
              x1={o.x} y1={o.y} x2={i.x} y2={i.y}
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1"
              strokeLinecap="round"
            />
          );
        })}

        {/* Scale labels */}
        {config.majorTicks.map((n, idx) => {
          const angle = (1 - n) * 180;
          const pt = polar(R_LABEL, angle);
          return (
            <text
              key={n}
              x={pt.x}
              y={pt.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="9"
              fontFamily="'JetBrains Mono', 'Consolas', monospace"
              fill="rgba(180,210,240,0.55)"
              fontWeight="400"
            >
              {config.formatLabel(n, idx)}
            </text>
          );
        })}

        {/* Center cap background */}
        <circle cx={CX} cy={CY} r="18" fill="var(--bg-panel)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

        {/* Needle */}
        <g
          className="gauge-needle"
          style={{
            transformOrigin: `${CX}px ${CY}px`,
            transform: `rotate(${rotateDeg}deg)`,
          }}
          filter="url(#needleGlow)"
        >
          <line
            x1={CX} y1={CY + 10}
            x2={CX} y2={CY - NEEDLE_LEN}
            stroke={accentColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeOpacity="0.4"
          />
          <polygon
            points={`
              ${CX - 2.5},${CY + 10}
              ${CX + 2.5},${CY + 10}
              ${CX + 1},${CY - NEEDLE_LEN}
              ${CX - 1},${CY - NEEDLE_LEN}
            `}
            fill={accentColor}
          />
        </g>

        {/* Center cap front */}
        <circle cx={CX} cy={CY} r="8" fill={accentColor} opacity="0.9" />
        <circle cx={CX} cy={CY} r="4" fill="var(--bg)" />

        {/* Digital readout */}
        <text
          x={CX} y={CY + 35}
          textAnchor="middle"
          fontSize="26"
          fontWeight="700"
          fontFamily="'JetBrains Mono', 'Consolas', monospace"
          fill={accentColor}
          style={{ filter: `drop-shadow(0 0 8px ${accentColor}88)` }}
        >
          {formatGauge(config.value)}
        </text>

        {/* Status badge */}
        <rect
          x={CX - 82} y={CY + 44}
          width={164} height={22}
          rx={5} ry={5}
          fill={BADGE_FILL[snapshot.status]}
          stroke={BADGE_STROKE[snapshot.status]}
          strokeWidth="1"
          className={`gauge-badge gauge-badge--${snapshot.status}`}
        />
        <text
          x={CX} y={CY + 58}
          textAnchor="middle"
          fontSize="8.5"
          fontFamily="'JetBrains Mono', 'Consolas', monospace"
          fontWeight="700"
          letterSpacing="2.5"
          fill={BADGE_STROKE[snapshot.status]}
        >
          {STATUS_LABELS[snapshot.status]}
        </text>

        {/* W unit label at scale ends */}
        <text x="30" y={CY + 14} textAnchor="middle" fontSize="8" fill="rgba(180,210,240,0.35)" fontFamily="monospace">W</text>
      </svg>
    </div>
  );
}
