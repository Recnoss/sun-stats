export type SourceFreshness = "fresh" | "stale" | "offline";

export type DashboardStatus =
  | "buying"
  | "selling"
  | "self-consuming"
  | "night-idle"
  | "degraded";

export interface GridReading {
  ts: string;
  importW: number;
  exportW: number;
  raw?: unknown;
}

export interface SolarReading {
  ts: string;
  solarW: number;
  raw?: unknown;
}

export interface PowerSnapshot {
  ts: string;
  solarW: number;
  gridImportW: number;
  gridExportW: number;
  homeLoadW: number;
  solarFreshness: SourceFreshness;
  gridFreshness: SourceFreshness;
  status: DashboardStatus;
}

export interface HistoryPoint {
  ts: string;
  solarW: number;
  gridImportW: number;
  gridExportW: number;
  homeLoadW: number;
}

export interface HistorySeries {
  window: string;
  points: HistoryPoint[];
}

export interface SourceHealth {
  name: "tibber" | "solarman";
  freshness: SourceFreshness;
  authenticated: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
}

export interface HealthSnapshot {
  now: string;
  tibber: SourceHealth;
  solarman: SourceHealth;
}

