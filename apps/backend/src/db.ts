import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { HealthSnapshot, HistorySeries, PowerSnapshot } from "./types.js";

export class SnapshotStore {
  private readonly db: DatabaseSync;

  public constructor(dbFilePath: string) {
    fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
    this.db = new DatabaseSync(dbFilePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        ts TEXT PRIMARY KEY,
        solar_w INTEGER NOT NULL,
        grid_import_w INTEGER NOT NULL,
        grid_export_w INTEGER NOT NULL,
        home_load_w INTEGER NOT NULL,
        solar_freshness TEXT NOT NULL,
        grid_freshness TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS minute_rollups (
        minute_ts TEXT PRIMARY KEY,
        solar_sum INTEGER NOT NULL,
        grid_import_sum INTEGER NOT NULL,
        grid_export_sum INTEGER NOT NULL,
        home_load_sum INTEGER NOT NULL,
        sample_count INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS source_health (
        source TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
    `);
  }

  public saveSnapshot(snapshot: PowerSnapshot): void {
    this.db
      .prepare(`
        INSERT OR REPLACE INTO snapshots (
          ts, solar_w, grid_import_w, grid_export_w, home_load_w,
          solar_freshness, grid_freshness, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        snapshot.ts,
        snapshot.solarW,
        snapshot.gridImportW,
        snapshot.gridExportW,
        snapshot.homeLoadW,
        snapshot.solarFreshness,
        snapshot.gridFreshness,
        snapshot.status
      );

    const minuteTs = `${snapshot.ts.slice(0, 16)}:00.000Z`;
    this.db
      .prepare(`
        INSERT INTO minute_rollups (
          minute_ts, solar_sum, grid_import_sum, grid_export_sum, home_load_sum, sample_count
        ) VALUES (?, ?, ?, ?, ?, 1)
        ON CONFLICT(minute_ts) DO UPDATE SET
          solar_sum = solar_sum + excluded.solar_sum,
          grid_import_sum = grid_import_sum + excluded.grid_import_sum,
          grid_export_sum = grid_export_sum + excluded.grid_export_sum,
          home_load_sum = home_load_sum + excluded.home_load_sum,
          sample_count = sample_count + 1
      `)
      .run(
        minuteTs,
        snapshot.solarW,
        snapshot.gridImportW,
        snapshot.gridExportW,
        snapshot.homeLoadW
      );

    this.db.prepare(`DELETE FROM snapshots WHERE ts < datetime('now', '-7 days')`).run();
    this.db.prepare(`DELETE FROM minute_rollups WHERE minute_ts < datetime('now', '-7 days')`).run();
  }

  public getLatestSnapshot(): PowerSnapshot | null {
    const row = this.db
      .prepare(`
        SELECT ts, solar_w, grid_import_w, grid_export_w, home_load_w,
               solar_freshness, grid_freshness, status
        FROM snapshots
        ORDER BY ts DESC
        LIMIT 1
      `)
      .get() as Record<string, unknown> | undefined;

    return row ? mapSnapshotRow(row) : null;
  }

  public getHistory(window: string): HistorySeries {
    if (window !== "24h") {
      throw new Error(`Unsupported history window: ${window}`);
    }

    const rows = this.db
      .prepare(`
        SELECT
          strftime('%Y-%m-%dT%H:', minute_ts) ||
            CASE WHEN CAST(strftime('%M', minute_ts) AS INTEGER) < 30
                 THEN '00:00.000Z'
                 ELSE '30:00.000Z'
            END AS bucket_ts,
          SUM(solar_sum)       AS solar_sum,
          SUM(grid_import_sum) AS grid_import_sum,
          SUM(grid_export_sum) AS grid_export_sum,
          SUM(home_load_sum)   AS home_load_sum,
          SUM(sample_count)    AS sample_count
        FROM minute_rollups
        WHERE minute_ts >= datetime('now', '-24 hours')
        GROUP BY bucket_ts
        ORDER BY bucket_ts ASC
      `)
      .all() as Array<Record<string, unknown>>;

    return {
      window,
      points: rows.map((row) => {
        const sampleCount = Number(row.sample_count) || 1;
        return {
          ts: String(row.bucket_ts),
          solarW: Math.round(Number(row.solar_sum) / sampleCount),
          gridImportW: Math.round(Number(row.grid_import_sum) / sampleCount),
          gridExportW: Math.round(Number(row.grid_export_sum) / sampleCount),
          homeLoadW: Math.round(Number(row.home_load_sum) / sampleCount)
        };
      })
    };
  }

  public saveHealth(health: HealthSnapshot): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO source_health (source, payload) VALUES (?, ?)`)
      .run("tibber", JSON.stringify(health.tibber));
    this.db
      .prepare(`INSERT OR REPLACE INTO source_health (source, payload) VALUES (?, ?)`)
      .run("solarman", JSON.stringify(health.solarman));
  }
}

function mapSnapshotRow(row: Record<string, unknown>): PowerSnapshot {
  return {
    ts: String(row.ts),
    solarW: Number(row.solar_w),
    gridImportW: Number(row.grid_import_w),
    gridExportW: Number(row.grid_export_w),
    homeLoadW: Number(row.home_load_w),
    solarFreshness: String(row.solar_freshness) as PowerSnapshot["solarFreshness"],
    gridFreshness: String(row.grid_freshness) as PowerSnapshot["gridFreshness"],
    status: String(row.status) as PowerSnapshot["status"]
  };
}

