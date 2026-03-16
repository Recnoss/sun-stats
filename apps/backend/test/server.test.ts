import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

describe("server", () => {
  it("returns live snapshot and health", async () => {
    const app = buildServer({
      getLiveSnapshot: () => ({
        ts: "2026-03-10T10:00:00Z",
        solarW: 5000,
        gridImportW: 0,
        gridExportW: 1200,
        homeLoadW: 3800,
        solarFreshness: "fresh",
        gridFreshness: "fresh",
        status: "selling"
      }),
      getHistory: () => ({ window: "24h", points: [] }),
      getHealth: () => ({
        now: "2026-03-10T10:00:00Z",
        tibber: {
          name: "tibber",
          freshness: "fresh",
          authenticated: true,
          lastSuccessAt: "2026-03-10T10:00:00Z",
          lastError: null
        },
        solarman: {
          name: "solarman",
          freshness: "stale",
          authenticated: true,
          lastSuccessAt: "2026-03-10T09:59:00Z",
          lastError: null
        }
      }),
      subscribe: () => () => {}
    });

    const live = await app.inject({ method: "GET", url: "/api/live" });
    expect(live.statusCode).toBe(200);
    expect(live.json().status).toBe("selling");

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().solarman.freshness).toBe("stale");
  });
});

