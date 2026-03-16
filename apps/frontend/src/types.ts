export type SourceFreshness = "fresh" | "stale" | "offline";

export type DashboardStatus =
  | "buying"
  | "selling"
  | "self-consuming"
  | "night-idle"
  | "degraded";

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

