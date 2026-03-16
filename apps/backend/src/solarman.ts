import type { AppConfig } from "./config.js";
import type { SolarReading, SourceHealth } from "./types.js";

interface SolarmanTokenResponse {
  access_token?: string;
  token_type?: string;
}

interface PlantCandidate {
  id?: string | number;
  stationId?: string | number;
  name?: string;
  stationName?: string;
}

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
  private cookieHeader = "";
  private plantId: string | null = null;
  private readonly tokenPaths: string[];

  public constructor(config: AppConfig) {
    this.config = config;
    this.plantId = config.SOLARMAN_PLANT_ID ?? null;
    this.tokenPaths = Array.from(new Set([config.SOLARMAN_TOKEN_PATH, "/oauth-s/oauth/token", "/oauth2-s/oauth/token"]));
  }

  public async poll(): Promise<SolarReading> {
    await this.ensureAuthenticated();
    await this.ensurePlantId();

    const stationInfo = await this.fetchStationInformation(this.plantId!);
    const currentPower = extractNumberByHints(stationInfo, [
      "generationPower",
      "currentPower",
      "outputPower",
      "pac",
      "activePower",
      "power"
    ]);

    if (currentPower !== null) {
      return this.recordSuccess(currentPower, stationInfo);
    }

    const dailyRecord = await this.fetchLatestDailyRecord(this.plantId!);
    return this.recordSuccess(dailyRecord.solarW, dailyRecord.raw);
  }

  public getLatestReading(): SolarReading | null {
    return this.latestReading;
  }

  public getHealth(): SourceHealth {
    return this.health;
  }

  private async ensureAuthenticated(force = false): Promise<void> {
    if (!force && this.accessToken) {
      return;
    }
    if (!this.config.SOLARMAN_USERNAME || !this.config.SOLARMAN_PASSWORD) {
      const message = "Solarman credentials are missing";
      this.health = {
        ...this.health,
        freshness: "offline",
        authenticated: false,
        lastError: message
      };
      throw new Error(message);
    }

    const params = new URLSearchParams();
    params.set("username", this.config.SOLARMAN_USERNAME);
    params.set("password", this.config.SOLARMAN_PASSWORD);
    params.set("grant_type", this.config.SOLARMAN_GRANT_TYPE);

    if (this.config.SOLARMAN_CLIENT_ID) {
      params.set("client_id", this.config.SOLARMAN_CLIENT_ID);
    }
    if (this.config.SOLARMAN_CLIENT_SECRET) {
      params.set("client_secret", this.config.SOLARMAN_CLIENT_SECRET);
    }
    if (this.config.SOLARMAN_SCOPE) {
      params.set("scope", this.config.SOLARMAN_SCOPE);
    }

    let lastError = "Solarman auth failed";
    for (const tokenPath of this.tokenPaths) {
      const response = await fetch(new URL(tokenPath, this.config.SOLARMAN_BASE_URL), {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
      });

      this.captureCookies(response);
      const payload = (await response.json()) as SolarmanTokenResponse & Record<string, unknown>;
      if (response.ok && payload.access_token) {
        this.accessToken = payload.access_token;
        this.health = {
          ...this.health,
          freshness: "fresh",
          authenticated: true,
          lastError: null
        };
        return;
      }

      lastError = `Solarman auth failed on ${tokenPath}: ${response.status}`;
    }

    this.health = {
      ...this.health,
      freshness: "offline",
      authenticated: false,
      lastError
    };
    throw new Error(lastError);
  }

  private async ensurePlantId(): Promise<void> {
    if (this.plantId) {
      return;
    }

    const response = await this.request("/maintain-s/operating/station/search", {
      method: "POST",
      query: {
        pageNum: this.config.SOLARMAN_STATION_PAGE_SIZE > 0 ? "1" : "1",
        pageSize: String(this.config.SOLARMAN_STATION_PAGE_SIZE)
      },
      jsonBody: {}
    });

    const plants = collectCandidates(response);
    if (plants.length === 0) {
      throw new Error("No Solarman plants found for account");
    }

    const match = plants.find((plant) => {
      const name = String(plant.name ?? plant.stationName ?? "");
      return name.toLowerCase().includes("hærnesvegen 208") || name.toLowerCase().includes("haernesvegen 208");
    }) ?? plants[0];
    if (!match) {
      throw new Error("No Solarman plant match found");
    }

    const resolvedPlantId = match.id ?? match.stationId;
    if (!resolvedPlantId) {
      throw new Error("Could not resolve Solarman plant id from station search");
    }

    this.plantId = String(resolvedPlantId);
  }

  private async fetchStationInformation(plantId: string): Promise<Record<string, unknown>> {
    try {
      return await this.request(`/maintain-s/operating/station/information/${plantId}`, {
        method: "GET"
      });
    } catch (error) {
      if (String(error).includes("401")) {
        await this.ensureAuthenticated(true);
        return this.request(`/maintain-s/operating/station/information/${plantId}`, { method: "GET" });
      }
      throw error;
    }
  }

  private async fetchLatestDailyRecord(plantId: string): Promise<{ solarW: number; raw: unknown }> {
    const now = new Date();
    const response = await this.request(`/maintain-s/history/power/${plantId}/record`, {
      method: "GET",
      query: {
        year: String(now.getUTCFullYear()),
        month: String(now.getUTCMonth() + 1),
        day: String(now.getUTCDate())
      }
    });

    const records = collectRecords(response);
    if (records.length === 0) {
      throw new Error("No Solarman daily records returned");
    }

    const latest = records
      .map((record) => ({
        ts: extractTimestamp(record),
        solarW: extractNumberByHints(record, ["generationPower", "currentPower", "power"]) ?? 0,
        raw: record
      }))
      .sort((left, right) => left.ts.localeCompare(right.ts))
      .at(-1);

    if (!latest) {
      throw new Error("No usable Solarman daily record found");
    }

    return latest;
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

  private async request(
    route: string,
    options: {
      method: "GET" | "POST";
      query?: Record<string, string>;
      jsonBody?: unknown;
    }
  ): Promise<Record<string, unknown>> {
    if (!this.accessToken) {
      throw new Error("Solarman access token is missing");
    }

    const url = new URL(route, this.config.SOLARMAN_BASE_URL);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      method: options.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.accessToken}`,
        ...(this.cookieHeader ? { cookie: this.cookieHeader } : {}),
        ...(options.jsonBody ? { "content-type": "application/json" } : {})
      },
      body: options.jsonBody ? JSON.stringify(options.jsonBody) : null
    });

    this.captureCookies(response);

    if (!response.ok) {
      throw new Error(`Solarman request failed (${response.status}) for ${route}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return unwrapResponse(payload);
  }

  private captureCookies(response: Response): void {
    const rawCookies = response.headers.getSetCookie?.() ?? [];
    if (rawCookies.length === 0) {
      return;
    }

    const cookiePairs = rawCookies.map((cookie) => cookie.split(";")[0]).filter(Boolean);
    this.cookieHeader = [...new Set([...this.cookieHeader.split("; ").filter(Boolean), ...cookiePairs])].join("; ");
  }
}

function unwrapResponse(payload: Record<string, unknown>): Record<string, unknown> {
  if (typeof payload.data === "object" && payload.data !== null) {
    return payload.data as Record<string, unknown>;
  }

  return payload;
}

function collectCandidates(payload: Record<string, unknown>): PlantCandidate[] {
  const candidates = payload.records ?? payload.list ?? payload.rows ?? payload.items ?? payload.data ?? [];
  return Array.isArray(candidates) ? (candidates as PlantCandidate[]) : [];
}

function collectRecords(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const records = payload.records ?? payload.list ?? payload.rows ?? payload.items ?? [];
  return Array.isArray(records) ? (records as Array<Record<string, unknown>>) : [];
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

function extractTimestamp(record: Record<string, unknown>): string {
  const dateTime = record.dateTime;
  if (typeof dateTime === "number") {
    const ms = dateTime > 1_000_000_000_000 ? dateTime : dateTime * 1000;
    return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}
