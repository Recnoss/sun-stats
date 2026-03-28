import Fastify from "fastify";
import websocket from "@fastify/websocket";
import type { HealthSnapshot, HistorySeries, PowerSnapshot } from "./types.js";

interface WsLike {
  readyState: number;
  send: (message: string) => void;
  on?: (event: "close", listener: () => void) => void;
  addEventListener?: (event: "close", listener: () => void) => void;
}

interface ServerOptions {
  getLiveSnapshot: () => PowerSnapshot | null;
  getHistory: (window: string) => HistorySeries;
  getHealth: () => HealthSnapshot;
  getTibberRaw: () => { power: number | null; powerProduction: number | null; ts: string | null };
  subscribe: (listener: (snapshot: PowerSnapshot) => void) => () => void;
}

function trySend(ws: WsLike, snapshot: PowerSnapshot, retries = 0): void {
  try {
    ws.send(JSON.stringify(snapshot));
  } catch (error) {
    if (retries < 5) {
      setTimeout(() => {
        trySend(ws, snapshot, retries + 1);
      }, 100);
    } else {
      console.error("Failed to send websocket snapshot", error);
    }
  }
}

export function buildServer(options: ServerOptions) {
  const app = Fastify({
    logger: true
  });

  void app.register(websocket);

  app.get("/api/live", async () => {
    return options.getLiveSnapshot() ?? {
      ts: new Date().toISOString(),
      solarW: 0,
      gridImportW: 0,
      gridExportW: 0,
      homeLoadW: 0,
      solarFreshness: "offline",
      gridFreshness: "offline",
      status: "degraded"
    };
  });

  app.get<{ Querystring: { window?: string } }>("/api/history", async (request, reply) => {
    const window = request.query.window ?? "24h";
    if (window !== "24h") {
      return reply.code(400).send({ error: "Only window=24h is supported" });
    }
    return options.getHistory(window);
  });

  app.get("/api/health", async () => options.getHealth());

  app.get("/api/debug/tibber", async () => options.getTibberRaw());

  app.get("/ws/live", { websocket: true }, (socket) => {
    const ws = socket as WsLike;
    const unsubscribe = options.subscribe((snapshot) => {
      trySend(ws, snapshot);
    });
    const initialSnapshot = options.getLiveSnapshot();
    if (initialSnapshot) {
      setImmediate(() => trySend(ws, initialSnapshot));
    }

    const cleanup = () => {
      unsubscribe();
    };

    if (typeof ws.on === "function") {
      ws.on("close", cleanup);
    } else if (typeof ws.addEventListener === "function") {
      ws.addEventListener("close", cleanup);
    }
  });

  return app;
}
