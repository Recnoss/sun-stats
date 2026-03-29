import { createClient, type Client } from "graphql-ws";
import WebSocket from "ws";
import type { GridReading, SolarReading, SourceHealth } from "./types.js";

const TIBBER_QUERY = `
  query ViewerInfo {
    viewer {
      websocketSubscriptionUrl
      homes {
        id
      }
    }
  }
`;

const TIBBER_SUBSCRIPTION = `
  subscription LiveMeasurement($homeId: ID!) {
    liveMeasurement(homeId: $homeId) {
      timestamp
      power
      powerProduction
    }
  }
`;

interface TibberConfig {
  accessToken: string;
}

const USER_AGENT = "sun-stats/0.1.0";
const DEFAULT_WS_URL = "wss://websocket-api.tibber.com/v1-beta/gql/subscriptions";

class TibberWebSocket extends WebSocket {
  public constructor(address: string | URL, protocols?: string | string[]) {
    super(address, protocols, {
      headers: {
        "User-Agent": USER_AGENT
      }
    });
  }
}

export class TibberClient {
  private readonly accessToken: string;
  private client: Client | null = null;
  private latestGridReading: GridReading | null = null;
  private latestSolarReading: SolarReading | null = null;
  private health: SourceHealth = {
    name: "tibber",
    freshness: "offline",
    authenticated: false,
    lastSuccessAt: null,
    lastError: null
  };

  public constructor(config: TibberConfig) {
    this.accessToken = config.accessToken;
  }

  public async start(): Promise<void> {
    const { homeId, websocketSubscriptionUrl } = await this.fetchViewerContext();
    this.client?.dispose();
    this.client = this.createSubscriptionClient(websocketSubscriptionUrl);
    this.health = {
      ...this.health,
      authenticated: true,
      freshness: this.latestGridReading ? "fresh" : "offline",
      lastError: null
    };

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      this.client!.subscribe<{ liveMeasurement: { timestamp: string; power: number; powerProduction: number } }>(
        {
          query: TIBBER_SUBSCRIPTION,
          variables: { homeId }
        },
        {
          next: (payload) => {
            const reading = payload.data?.liveMeasurement;
            if (!reading) {
              return;
            }

            const ts = new Date(reading.timestamp).toISOString();
            const gridPower = Number(reading.power ?? 0);
            const powerProduction = reading.powerProduction != null ? Number(reading.powerProduction) : null;

            // If we're importing from the grid, we cannot simultaneously be exporting.
            // Use this as a signal to clear stale held export values.
            const isImporting = gridPower > 0;
            const exportW = powerProduction != null
              ? Math.max(0, Math.round(powerProduction))
              : isImporting ? 0 : (this.latestGridReading?.exportW ?? 0);

            this.latestGridReading = {
              ts,
              importW: Math.max(0, Math.round(gridPower)),
              exportW,
              raw: payload.data
            };
            this.latestSolarReading = {
              ts,
              solarW: powerProduction != null
                ? Math.max(0, Math.round(powerProduction))
                : isImporting ? 0 : (this.latestSolarReading?.solarW ?? 0),
              raw: payload.data
            };
            this.health = {
              ...this.health,
              freshness: "fresh",
              authenticated: true,
              lastSuccessAt: ts,
              lastError: null
            };

            if (!settled) {
              settled = true;
              resolve();
            }
          },
          error: (error) => {
            this.health = {
              ...this.health,
              freshness: "offline",
              authenticated: false,
              lastError: Array.isArray(error) ? error.map((entry) => entry.message).join(", ") : String(error)
            };
            if (!settled) {
              settled = true;
              reject(new Error(this.health.lastError ?? "Tibber subscription failed"));
            }
          },
          complete: () => {
            if (!settled) {
              settled = true;
              reject(new Error("Tibber subscription completed before first payload"));
            }
          }
        }
      );
    });
  }

  public getLatestReading(): GridReading | null {
    return this.latestGridReading;
  }

  public getLatestSolarReading(): SolarReading | null {
    return this.latestSolarReading;
  }

  public getHealth(): SourceHealth {
    return this.health;
  }

  public getLatestRaw(): { power: number | null; powerProduction: number | null; ts: string | null } {
    const raw = this.latestGridReading?.raw as { liveMeasurement?: { power?: number; powerProduction?: number; timestamp?: string } } | undefined;
    return {
      power: raw?.liveMeasurement?.power ?? null,
      powerProduction: raw?.liveMeasurement?.powerProduction ?? null,
      ts: raw?.liveMeasurement?.timestamp ?? null
    };
  }

  private createSubscriptionClient(websocketSubscriptionUrl: string): Client {
    return createClient({
      url: websocketSubscriptionUrl || DEFAULT_WS_URL,
      webSocketImpl: TibberWebSocket,
      connectionParams: {
        token: this.accessToken
      },
      lazy: false,
      retryAttempts: Infinity,
      retryWait: async (retries) => {
        await new Promise((resolve) => {
          setTimeout(resolve, 1_000 * Math.min(retries + 1, 30));
        });
      }
    });
  }

  private async fetchViewerContext(): Promise<{ homeId: string; websocketSubscriptionUrl: string }> {
    const response = await fetch("https://api.tibber.com/v1-beta/gql", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
        "user-agent": USER_AGENT
      },
      body: JSON.stringify({ query: TIBBER_QUERY })
    });
    const result = (await response.json()) as {
      data?: { viewer?: { homes?: Array<{ id: string }>; websocketSubscriptionUrl?: string } };
      errors?: Array<{ message: string }>;
    };
    if (!response.ok || !result.data?.viewer?.homes) {
      const message = result.errors?.map((entry) => entry.message).join(", ") ?? `Tibber home lookup failed: ${response.status}`;
      this.health = {
        ...this.health,
        freshness: "offline",
        authenticated: false,
        lastError: message
      };
      throw new Error(message);
    }

    const homeId = result.data.viewer.homes[0]?.id;
    const websocketSubscriptionUrl = result.data.viewer.websocketSubscriptionUrl || DEFAULT_WS_URL;
    if (!homeId) {
      this.health = {
        ...this.health,
        freshness: "offline",
        authenticated: false,
        lastError: "No Tibber home found for access token"
      };
      throw new Error("No Tibber home found for access token");
    }

    return { homeId, websocketSubscriptionUrl };
  }
}
