import crypto from "node:crypto";
import type { AppConfig } from "./config.js";
import type { SolarReading, SourceHealth } from "./types.js";

interface PlantCandidate {
  id?: string | number;
  stationId?: string | number;
  name?: string;
}

interface StationListResponse {
  stationList?: Station[];
  total?: number;
}

interface DeviceItem {
  deviceSn: string;
  deviceId?: number;
  deviceType?: string;
  deviceState?: number;
}

interface DeviceListResponse {
  deviceListItems?: DeviceItem[];
}

interface DataItem {
  key: string;
  value: string;
  unit?: string;
  name?: string;
}

interface CurrentDataResponse {
  deviceSn?: string;
  deviceState?: number;
  dataList?: DataItem[];
}

const POWER_KEYS = ["APo_t1", "DPi_t1", "t_P_r", "total_active_power"];

export class SolarmanClient {
  private readonly config: AppConfig;
  private latestReading: SolarReading | null = null;
  private health: SourceHealth = {
    name: "solarman",
    freshness: "offline",
    authenticated: false,
    lastSuccessAt: null,
    lastError: null
  };
  private accessToken: string | null = null;
  private plantId: string | null = null;

  public constructor(config: AppConfig) {
    this.config = config;
    this.plantId = config.SOLARMAN_PLANT_ID ?? null;
  }

  public async poll(): Promise<SolarReading> {
    await this.ensureAuthenticated();
    await this.ensurePlantId();

    const data = await this.fetchRealtimeData(this.plantId!);
    const solarW = extractNumberByHints(data, [
      "generationPower",
      "currentPower",
      "outputPower",
      "pac",
      "activePower",
      "power"
    ]);

    return this.recordSuccess(solarW ?? 0, data);
  }

  public getLatestReading(): SolarReading | null {
    return this.latestReading;
  }

  public getHealth(): SourceHealth {
    return this.health;
  }

  private async ensureAuthenticated(force = false): Promise<void> {
    if (!force && this.accessToken && Date.now() < this.tokenExpiresAt) {
      return;
    }

    const { SOLARMAN_USERNAME: email, SOLARMAN_PASSWORD: password, SOLARMAN_APP_ID: appId, SOLARMAN_APP_SECRET: appSecret } = this.config;

    if (!email || !password || !appId || !appSecret) {
      const message = "Solarman credentials are missing";
      this.health = { ...this.health, freshness: "offline", authenticated: false, lastError: message };
      throw new Error(message);
    }

    const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

    const url = new URL("/account/v1.0/token", this.config.SOLARMAN_BASE_URL);
    url.searchParams.set("appId", appId);
    url.searchParams.set("language", "en");

    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, appSecret, password: passwordHash })
    });

    const payload = (await response.json()) as Record<string, unknown>;
    const token = extractToken(payload);

    if (!response.ok || !token) {
      const message = `Solarman auth failed: ${response.status}`;
      this.health = { ...this.health, freshness: "offline", authenticated: false, lastError: message };
      throw new Error(message);
    }

    this.accessToken = token;
    this.health = { ...this.health, freshness: "fresh", authenticated: true, lastError: null };
  }

  private async ensureDeviceSn(): Promise<void> {
    if (this.deviceSn) {
      return;
    }

    const data = await this.request("/station/v1.0/list", { page: 1, size: this.config.SOLARMAN_STATION_PAGE_SIZE });
    const plants = collectCandidates(data);

    if (plants.length === 0) {
      throw new Error("No Solarman plants found for account");
    }

    const match =
      plants.find((plant) => {
        const name = String(plant.name ?? plant.stationName ?? "");
        return name.toLowerCase().includes("hærnesvegen 208") || name.toLowerCase().includes("haernesvegen 208");
      }) ?? plants[0];

    const resolvedId = match?.id ?? match?.stationId;
    if (!resolvedId) {
      throw new Error("Could not resolve Solarman plant id from station list");
    }

    this.plantId = String(resolvedId);
  }

  private async fetchRealtimeData(plantId: string): Promise<Record<string, unknown>> {
    try {
      return await this.request("/station/v1.0/realTime", { stationId: Number(plantId) });
    } catch (error) {
      if (String(error).includes("401")) {
        await this.ensureAuthenticated(true);
        return this.request("/station/v1.0/realTime", { stationId: Number(plantId) });
      }
      throw error;
    }

  private recordSuccess(solarW: number, raw: unknown): SolarReading {
    const reading = {
      ts: new Date().toISOString(),
      solarW: Math.max(0, Math.round(solarW)),
      raw
    };
    this.latestReading = reading;
    this.health = {
      ...this.health,
      freshness: "fresh",
      authenticated: true,
      lastSuccessAt: reading.ts,
      lastError: null
    };
    return reading;
  }

  private async request(route: string, body: unknown): Promise<Record<string, unknown>> {
    if (!this.accessToken) {
      throw new Error("Solarman access token is missing");
    }

    const url = new URL(route, this.config.SOLARMAN_BASE_URL);
    url.searchParams.set("appId", this.config.SOLARMAN_APP_ID!);
    url.searchParams.set("language", "en");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${this.accessToken}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Solarman request failed (${response.status}) for ${path}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return unwrapResponse(payload);
  }
}

function extractToken(payload: Record<string, unknown>): string | null {
  if (typeof payload.access_token === "string") {
    return payload.access_token;
  }
  if (typeof payload.data === "object" && payload.data !== null) {
    const data = payload.data as Record<string, unknown>;
    if (typeof data.access_token === "string") {
      return data.access_token;
    }
  }
  return null;
}

function unwrapResponse(payload: Record<string, unknown>): Record<string, unknown> {
  if (typeof payload.data === "object" && payload.data !== null) {
    return payload.data as Record<string, unknown>;
  }
  return payload;
}

function collectCandidates(payload: Record<string, unknown>): PlantCandidate[] {
  const candidates = payload.list ?? payload.records ?? payload.rows ?? payload.items ?? [];
  return Array.isArray(candidates) ? (candidates as PlantCandidate[]) : [];
}

function extractNumberByHints(value: unknown, hints: string[]): number | null {
  const queue: Array<{ key: string; value: unknown }> = [{ key: "", value }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (typeof current.value === "number" && hints.some((hint) => current.key.toLowerCase().includes(hint.toLowerCase()))) {
      return current.value;
    }
    if (typeof current.value === "object" && current.value !== null) {
      for (const [key, child] of Object.entries(current.value)) {
        queue.push({ key, value: child });
      }
    }
  }
  return null;
}
