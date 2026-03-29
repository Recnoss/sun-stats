# sun-stats

Real-time solar energy dashboard for Hærnesvegen 208. Shows live solar production, home consumption, grid import/export, and 24-hour history.

## Architecture

```
apps/
  backend/   Node.js + Fastify — data collection and API
  frontend/  React + Vite — live dashboard
deploy/      Docker / Railway config
```

**Data sources:**
- **Tibber** (WebSocket subscription) — grid import/export via AMS smart meter (Pulse device)
- **Solarman** (REST poll every 30s) — total solar panel production from inverter

**Key calculation** (`snapshot-engine.ts`):
```
homeLoadW = solarW + gridImportW - gridExportW
```

## Tibber API — important gotchas

`power` and `powerProduction` are always non-negative (never bidirectional):
- `power` — grid import (W), always ≥ 0
- `powerProduction` — grid export (W), always ≥ 0, **often null** in List 1 AMS messages

When `powerProduction` is null:
- Hold the last known export value (AMS meter omits it in high-frequency messages)
- Exception: if `power > 0` (importing), reset export to 0 immediately (can't import and export simultaneously)

## Solarman API

Requires `SOLARMAN_PLANT_ID` in `.env` — auto-discovery via station list is unreliable. Plant ID for this installation: `1869446`.

Auth endpoint: `/account/v1.0/token` — returns `access_token` in `payload.data.access_token`.
Data endpoint: `/station/v1.0/realTime` — solar wattage is in `dataList` entries, search by key hints (`generationPower`, `pac`, etc.).

## Running locally

```bash
cp .env.example .env   # fill in credentials
docker compose up --build
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:3001
- Health check: http://localhost:3001/api/health

## API endpoints

| Endpoint | Description |
|---|---|
| `GET /api/live` | Latest snapshot (solarW, gridImportW, gridExportW, homeLoadW, status) |
| `GET /api/history?window=24h` | 30-min rollups for the last 24 hours |
| `GET /api/health` | Tibber + Solarman connection status and freshness |

## Status states

| Status | Condition | Norwegian label |
|---|---|---|
| `selling` | gridExportW > 40W | SELGER TIL NETTET |
| `buying` | gridImportW > 40W | KJØPER FRA NETTET |
| `self-consuming` | solarW > 40W | KJØRER PÅ SOL |
| `night-idle` | all below threshold | NATT / INAKTIV |
| `degraded` | data stale/offline | DATA FORSINKET |

## Project conventions

- TypeScript strict throughout — no `any`
- Backend uses ES modules (`import/export`), compiled to `dist/`
- Frontend uses React functional components, no class components
- CSS uses custom properties (`--solar`, `--import`, `--export`, `--load`) — maintain these for new UI elements
- All power values stored/transmitted in **Watts** (integer), displayed as W or kW
- Timestamps are ISO 8601 strings throughout
- No ORM — raw SQLite via `better-sqlite3`

## Environment variables

```
TIBBER_ACCESS_TOKEN=          # Required
SOLARMAN_ENABLED=true
SOLARMAN_EMAIL=
SOLARMAN_PASSWORD=
SOLARMAN_APP_ID=
SOLARMAN_APP_SECRET=
SOLARMAN_PLANT_ID=1869446     # Set this — skip auto-discovery
SOLARMAN_BASE_URL=https://globalapi.solarmanpv.com
SNAPSHOT_INTERVAL_MS=5000
SOLARMAN_POLL_INTERVAL_MS=30000
GRID_STALE_AFTER_MS=30000
SOLAR_STALE_AFTER_MS=90000
PORT=3001
TZ=Europe/Oslo
```
