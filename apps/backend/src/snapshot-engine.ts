import type { GridReading, PowerSnapshot, SolarReading, SourceFreshness } from "./types.js";

const GRID_DEADBAND_W = 40;

export interface SnapshotInputs {
  now: Date;
  grid: GridReading | null;
  solar: SolarReading | null;
  gridStaleAfterMs: number;
  solarStaleAfterMs: number;
}

export function freshnessFor(
  readingTs: string | null,
  now: Date,
  staleAfterMs: number
): SourceFreshness {
  if (!readingTs) {
    return "offline";
  }

  const age = now.getTime() - new Date(readingTs).getTime();
  if (Number.isNaN(age)) {
    return "offline";
  }

  return age > staleAfterMs ? "stale" : "fresh";
}

export function deriveSnapshot(input: SnapshotInputs): PowerSnapshot {
  const gridFreshness = freshnessFor(input.grid?.ts ?? null, input.now, input.gridStaleAfterMs);
  const solarFreshness = freshnessFor(input.solar?.ts ?? null, input.now, input.solarStaleAfterMs);

  const gridImportW = sanitizePower(input.grid?.importW ?? 0);
  const gridExportW = sanitizePower(input.grid?.exportW ?? 0);
  const solarW = sanitizePower(input.solar?.solarW ?? 0);
  const homeLoadW = Math.max(0, solarW + gridImportW - gridExportW);

  let status: PowerSnapshot["status"] = "night-idle";
  if (gridFreshness === "offline" && solarFreshness === "offline") {
    status = "degraded";
  } else if (gridFreshness === "stale" || solarFreshness === "stale") {
    status = "degraded";
  } else if (gridExportW > GRID_DEADBAND_W) {
    status = "selling";
  } else if (gridImportW > GRID_DEADBAND_W) {
    status = "buying";
  } else if (solarW > GRID_DEADBAND_W) {
    status = "self-consuming";
  }

  return {
    ts: input.now.toISOString(),
    solarW,
    gridImportW,
    gridExportW,
    homeLoadW,
    solarFreshness,
    gridFreshness,
    status
  };
}

function sanitizePower(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.round(value);
}

