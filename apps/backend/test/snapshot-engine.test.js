import { describe, expect, it } from "vitest";
import { deriveSnapshot, freshnessFor } from "../src/snapshot-engine.js";
describe("freshnessFor", () => {
    it("marks missing values as offline", () => {
        expect(freshnessFor(null, new Date("2026-03-10T10:00:00Z"), 10_000)).toBe("offline");
    });
    it("marks old values as stale", () => {
        expect(freshnessFor("2026-03-10T09:58:00Z", new Date("2026-03-10T10:00:00Z"), 30_000)).toBe("stale");
    });
});
describe("deriveSnapshot", () => {
    it("computes buying state", () => {
        const snapshot = deriveSnapshot({
            now: new Date("2026-03-10T10:00:00Z"),
            grid: { ts: "2026-03-10T10:00:00Z", importW: 800, exportW: 0 },
            solar: { ts: "2026-03-10T10:00:00Z", solarW: 1200 },
            gridStaleAfterMs: 30_000,
            solarStaleAfterMs: 90_000
        });
        expect(snapshot.homeLoadW).toBe(2000);
        expect(snapshot.status).toBe("buying");
    });
    it("computes selling state", () => {
        const snapshot = deriveSnapshot({
            now: new Date("2026-03-10T10:00:00Z"),
            grid: { ts: "2026-03-10T10:00:00Z", importW: 0, exportW: 600 },
            solar: { ts: "2026-03-10T10:00:00Z", solarW: 2000 },
            gridStaleAfterMs: 30_000,
            solarStaleAfterMs: 90_000
        });
        expect(snapshot.homeLoadW).toBe(1400);
        expect(snapshot.status).toBe("selling");
    });
    it("computes self-consuming state near zero grid", () => {
        const snapshot = deriveSnapshot({
            now: new Date("2026-03-10T10:00:00Z"),
            grid: { ts: "2026-03-10T10:00:00Z", importW: 10, exportW: 0 },
            solar: { ts: "2026-03-10T10:00:00Z", solarW: 1500 },
            gridStaleAfterMs: 30_000,
            solarStaleAfterMs: 90_000
        });
        expect(snapshot.homeLoadW).toBe(1510);
        expect(snapshot.status).toBe("self-consuming");
    });
    it("reports degraded when solar is stale", () => {
        const snapshot = deriveSnapshot({
            now: new Date("2026-03-10T10:00:00Z"),
            grid: { ts: "2026-03-10T10:00:00Z", importW: 100, exportW: 0 },
            solar: { ts: "2026-03-10T09:57:00Z", solarW: 300 },
            gridStaleAfterMs: 30_000,
            solarStaleAfterMs: 90_000
        });
        expect(snapshot.status).toBe("degraded");
        expect(snapshot.solarFreshness).toBe("stale");
    });
});
