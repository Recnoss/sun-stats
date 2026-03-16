import { useEffect, useState } from "react";
import { FreshnessPill } from "./components/FreshnessPill.js";
import { HistoryChart } from "./components/HistoryChart.js";
import { MetricCard } from "./components/MetricCard.js";
import { PowerGauge } from "./components/PowerGauge.js";
import type { HistorySeries, PowerSnapshot } from "./types.js";

const EMPTY: PowerSnapshot = {
  ts: new Date(0).toISOString(),
  solarW: 0,
  gridImportW: 0,
  gridExportW: 0,
  homeLoadW: 0,
  solarFreshness: "offline",
  gridFreshness: "offline",
  status: "degraded",
};

const STATUS_LABELS: Record<PowerSnapshot["status"], string> = {
  buying:           "Kjøper",
  selling:          "Selger",
  "self-consuming": "Sol",
  "night-idle":     "Inaktiv",
  degraded:         "Feil",
};

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<PowerSnapshot>(EMPTY);
  const [history, setHistory]   = useState<HistorySeries>({ window: "24h", points: [] });
  const [detailsOpen, setDetailsOpen] = useState(true);
  const now = useNow();

  useEffect(() => {
    void loadAll();
    const liveId    = window.setInterval(() => void loadLive(),    5_000);
    const historyId = window.setInterval(() => void loadHistory(), 60_000);
    return () => { window.clearInterval(liveId); window.clearInterval(historyId); };
  }, []);

  async function loadAll(): Promise<void> {
    const [liveRes, histRes] = await Promise.all([
      fetch("/api/live"),
      fetch("/api/history?window=24h"),
    ]);
    if (liveRes.ok)  setSnapshot((await liveRes.json()) as PowerSnapshot);
    if (histRes.ok)  setHistory((await histRes.json()) as HistorySeries);
  }

  async function loadLive(): Promise<void> {
    const res = await fetch("/api/live");
    if (res.ok) setSnapshot((await res.json()) as PowerSnapshot);
  }

  async function loadHistory(): Promise<void> {
    const res = await fetch("/api/history?window=24h");
    if (res.ok) setHistory((await res.json()) as HistorySeries);
  }

  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="app-shell">

      {/* Header */}
      <header className="site-header">
        <div>
          <div className="site-header__title">Hærnesvegen 208</div>
          <div className="site-header__sub">Live energimåling</div>
        </div>
        <div className="site-header__right">
          <div className="led-group">
            <FreshnessPill label="Nett" freshness={snapshot.gridFreshness} />
            <FreshnessPill label="Sol"  freshness={snapshot.solarFreshness} />
          </div>
          <div className={`status-badge status-badge--${snapshot.status}`}>
            {STATUS_LABELS[snapshot.status]}
          </div>
          <div className="site-header__time">
            <div>{timeStr}</div>
            <div style={{ fontSize: "0.65rem", opacity: 0.6, textAlign: "right" }}>{dateStr}</div>
          </div>
        </div>
      </header>

      {/* Gauge hero — centered, full attention */}
      <div className="gauge-hero">
        <div className="panel gauge-panel">
          <div className="gauge-panel__label">Hjemforbruk</div>
          <PowerGauge snapshot={snapshot} />
        </div>
      </div>

      {/* Expand / collapse toggle */}
      <button
        className={`details-toggle${detailsOpen ? " details-toggle--open" : ""}`}
        onClick={() => setDetailsOpen((v) => !v)}
        aria-expanded={detailsOpen}
      >
        <span className="details-toggle__chevron">{detailsOpen ? "▲" : "▼"}</span>
        {detailsOpen ? "Skjul detaljer" : "Vis detaljer"}
      </button>

      {/* Collapsible details */}
      <div className={`details-section${detailsOpen ? "" : " details-section--collapsed"}`}>
        <div className="metrics-row">
          <MetricCard label="Solproduksjon" value={snapshot.solarW}      accent="solar"  maxValue={10_000} icon="☀" />
          <MetricCard label="Hjemforbruk"   value={snapshot.homeLoadW}   accent="load"   maxValue={10_000} icon="⌂" />
          <MetricCard label="Nettimport"    value={snapshot.gridImportW} accent="import" maxValue={10_000} icon="↓" />
          <MetricCard label="Netteksport"   value={snapshot.gridExportW} accent="export" maxValue={10_000} icon="↑" />
        </div>
        <div className="charts-grid">
          <HistoryChart points={history.points} title="Solproduksjon 24t" field="solarW"      color="#f0a020" />
          <HistoryChart points={history.points} title="Hjemforbruk 24t"  field="homeLoadW"   color="#ff6b35" />
          <HistoryChart points={history.points} title="Nettimport 24t"   field="gridImportW" color="#2196f3" />
          <HistoryChart points={history.points} title="Netteksport 24t"  field="gridExportW" color="#00e5a0" />
        </div>
      </div>

    </div>
  );
}
