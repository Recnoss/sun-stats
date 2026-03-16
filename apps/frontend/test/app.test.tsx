import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App.js";

describe("App", () => {
  it("renders the kiosk title and metric labels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/history")) {
          return new Response(JSON.stringify({ window: "24h", points: [] }));
        }
        return new Response(
          JSON.stringify({
            ts: "2026-03-10T10:00:00Z",
            solarW: 4000,
            gridImportW: 0,
            gridExportW: 1200,
            homeLoadW: 2800,
            solarFreshness: "fresh",
            gridFreshness: "fresh",
            status: "selling"
          })
        );
      })
    );

    vi.stubGlobal(
      "WebSocket",
      class {
        public addEventListener() {}
        public close() {}
      } as unknown as typeof WebSocket
    );

    render(<App />);

    expect(await screen.findByText("Hærnesvegen 208")).toBeInTheDocument();
    expect(screen.getByText("Solar production")).toBeInTheDocument();
    expect(screen.getByText("Grid export")).toBeInTheDocument();
  });
});

