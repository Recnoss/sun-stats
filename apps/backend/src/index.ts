import path from "node:path";
import { config } from "./config.js";
import { SnapshotStore } from "./db.js";
import { deriveSnapshot } from "./snapshot-engine.js";
import { SolarmanClient } from "./solarman.js";
import { buildServer } from "./server.js";
import { TibberClient } from "./tibber.js";
import type { HealthSnapshot, PowerSnapshot, SolarReading, SourceHealth } from "./types.js";

const snapshotStore = new SnapshotStore(path.resolve(process.cwd(), "data", "sun-stats.sqlite"));
const tibberClient = new TibberClient({ accessToken: config.TIBBER_ACCESS_TOKEN });
const solarmanClient = config.SOLARMAN_ENABLED ? new SolarmanClient(config) : null;
const pausedSolarmanHealth: SourceHealth = {
  name: "solarman",
  freshness: "offline",
  authenticated: false,
  lastSuccessAt: null,
  lastError: "Paused by config (SOLARMAN_ENABLED=false)"
};
const subscribers = new Set<(snapshot: PowerSnapshot) => void>();

let latestSnapshot = snapshotStore.getLatestSnapshot() ?? deriveSnapshot({
  now: new Date(),
  grid: null,
  solar: null,
  gridStaleAfterMs: config.GRID_STALE_AFTER_MS,
  solarStaleAfterMs: config.SOLAR_STALE_AFTER_MS
});

function notify(snapshot: PowerSnapshot): void {
  for (const subscriber of subscribers) {
    subscriber(snapshot);
  }
}

function buildHealth(): HealthSnapshot {
  return {
    now: new Date().toISOString(),
    tibber: tibberClient.getHealth(),
    solarman: solarmanClient?.getHealth() ?? pausedSolarmanHealth
  };
}

async function bootstrap(): Promise<void> {
  const app = buildServer({
    getLiveSnapshot: () => latestSnapshot,
    getHistory: (window) => snapshotStore.getHistory(window),
    getHealth: () => buildHealth(),
    getTibberRaw: () => tibberClient.getLatestRaw(),
    subscribe: (listener) => {
      subscribers.add(listener);
      if (latestSnapshot) {
        listener(latestSnapshot);
      }
      return () => {
        subscribers.delete(listener);
      };
    }
  });

  await app.listen({
    port: config.PORT,
    host: "0.0.0.0"
  });

  app.log.info(`Backend listening on port ${config.PORT}`);

  void startBackgroundTasks(app.log);
}

async function startBackgroundTasks(log: { info: (message: string) => void; error: (message: string, error?: unknown) => void }): Promise<void> {
  void connectTibber(log);
  if (solarmanClient) {
    void pollSolarman(log);
  } else {
    log.info("Solarman polling paused (SOLARMAN_ENABLED=false)");
  }

  setInterval(() => {
    const solarReading: SolarReading | null = solarmanClient
      ? solarmanClient.getLatestReading()
      : tibberClient.getLatestSolarReading();

    latestSnapshot = deriveSnapshot({
      now: new Date(),
      grid: tibberClient.getLatestReading(),
      solar: solarReading,
      gridStaleAfterMs: config.GRID_STALE_AFTER_MS,
      solarStaleAfterMs: config.SOLAR_STALE_AFTER_MS
    });
    snapshotStore.saveSnapshot(latestSnapshot);
    snapshotStore.saveHealth(buildHealth());
    notify(latestSnapshot);
  }, config.SNAPSHOT_INTERVAL_MS);

  if (solarmanClient) {
    setInterval(() => {
      void pollSolarman(log);
    }, config.SOLARMAN_POLL_INTERVAL_MS);
  }
}

async function connectTibber(log: { info: (message: string) => void; error: (message: string, error?: unknown) => void }): Promise<void> {
  try {
    await tibberClient.start();
    log.info("Connected to Tibber live feed");
  } catch (error) {
    log.error("Tibber live feed failed to start; retrying in 30s", error);
    setTimeout(() => {
      void connectTibber(log);
    }, 30_000);
  }
}

async function pollSolarman(log: { info: (message: string) => void; error: (message: string, error?: unknown) => void }): Promise<void> {
  if (!solarmanClient) {
    return;
  }

  try {
    await solarmanClient.poll();
    log.info("Polled Solarman successfully");
  } catch (error) {
    log.error("Solarman poll failed", error);
  }
}

void bootstrap();
