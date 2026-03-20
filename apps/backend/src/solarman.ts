import { createHash } from "node:crypto";
import type { AppConfig } from "./config.js";
import type { SolarReading, SourceHealth } from "./types.js";

interface TokenResponse {
  success?: boolean;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  uid?: number;
  code?: string;
  msg?: string;
}

interface Station {
  id: number;
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
  private tokenExpiresAt = 0;
  private deviceSn: string | null = null;

  public constructor(config: AppConfig) {
    this.config = config;
    this.deviceSn = config.SOLARMAN_DEVICE_SN ?? null;
  }

  public async poll(): Promise<SolarReading> {
    await this.ensureAuthenticated();
    await this.ensureDeviceSn();

    const data = await this.fetchCurrentData(this.deviceSn!);
    const powerW = extractPowerFromDataList(data.dataList ?? []);

    const reading: SolarReading = {
      ts: new Date().toISOString(),
      solarW: Math.max(0, Math.round(powerW)),
      raw: data
    };

    this.latestReading = reading;
    this.health = {
      ...this.health,
      freshness: "fresh",
      lastSuccessAt: reading.ts,
      lastError: null
    };

    return reading;
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

    if (!this.config.SOLARMAN_APP_ID || !this.config.SOLARMAN_APP_SECRET) {
      const message = "Solarman appId/appSecret is missing";
      this.health = { ...this.health, freshness: "offline", authenticated: false, lastError: message };
      throw new Error(message);
    }

    if (!this.config.SOLARMAN_EMAIL || !this.config.SOLARMAN_PASSWORD) {
      const message = "Solarman email/password is missing";
      this.health = { ...this.health, freshness: "offline", authenticated: false, lastError: message };
      throw new Error(message);
    }

    const passwordHash = createHash("sha256").update(this.config.SOLARMAN_PASSWORD).digest("hex");

    const url = new URL(
      `/account/v1.0/token?appId=${encodeURIComponent(this.config.SOLARMAN_APP_ID)}&language=en`,
      this.config.SOLARMAN_BASE_URL
    );

    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appSecret: this.config.SOLARMAN_APP_SECRET,
        email: this.config.SOLARMAN_EMAIL,
        password: passwordHash
      })
    });

    const payload = (await response.json()) as TokenResponse;

    if (!response.ok || !payload.access_token) {
      const message = `Solarman auth failed: ${response.status} ${payload.msg ?? "unknown error"}`;
      this.health = { ...this.health, freshness: "offline", authenticated: false, lastError: message };
      throw new Error(message);
    }

    this.accessToken = payload.access_token;
    this.tokenExpiresAt = Date.now() + ((payload.expires_in ?? 7200) - 300) * 1000;
    this.health = { ...this.health, authenticated: true, lastError: null };
  }

  private async ensureDeviceSn(): Promise<void> {
    if (this.deviceSn) {
      return;
    }

    const stationId = await this.resolveStationId();
    const devices = await this.fetchDevices(stationId);

    const inverter = devices.deviceListItems?.find(
      (d) => d.deviceType?.toUpperCase().includes("INVERTER")
    ) ?? devices.deviceListItems?.[0];

    if (!inverter?.deviceSn) {
      throw new Error("No Solarman device found at station");
    }

    this.deviceSn = inverter.deviceSn;
  }

  private async resolveStationId(): Promise<number> {
    if (this.config.SOLARMAN_PLANT_ID) {
      return Number(this.config.SOLARMAN_PLANT_ID);
    }

    const data = await this.request<StationListResponse>("/station/v1.0/list", {
      page: 1,
      size: 20
    });

    const stations = data.stationList ?? [];
    if (stations.length === 0) {
      throw new Error("No Solarman stations found for account");
    }

    return stations[0]!.id;
  }

  private async fetchDevices(stationId: number): Promise<DeviceListResponse> {
    return this.request<DeviceListResponse>("/station/v1.0/device?language=en", { stationId });
  }

  private async fetchCurrentData(deviceSn: string): Promise<CurrentDataResponse> {
    try {
      return await this.request<CurrentDataResponse>("/device/v1.0/currentData?language=en", { deviceSn });
    } catch (error) {
      if (String(error).includes("401") || String(error).includes("token")) {
        await this.ensureAuthenticated(true);
        return this.request<CurrentDataResponse>("/device/v1.0/currentData?language=en", { deviceSn });
      }
      throw error;
    }
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    if (!this.accessToken) {
      throw new Error("Solarman access token is missing");
    }

    const url = new URL(path, this.config.SOLARMAN_BASE_URL);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `bearer ${this.accessToken}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Solarman request failed (${response.status}) for ${path}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;

    if (payload.success === false) {
      throw new Error(`Solarman API error: ${payload.msg ?? "unknown"}`);
    }

    return payload as T;
  }
}

function extractPowerFromDataList(dataList: DataItem[]): number {
  for (const key of POWER_KEYS) {
    const item = dataList.find((d) => d.key === key);
    if (item) {
      const value = parseFloat(item.value);
      if (!Number.isNaN(value)) {
        return value;
      }
    }
  }

  return 0;
}
