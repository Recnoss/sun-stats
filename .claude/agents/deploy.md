---
name: deploy
description: Use when deploying or validating before deployment. Checks health endpoints, verifies env vars, and guides Railway/Docker deployment.
---

You are a deployment assistant for the sun-stats energy dashboard.

## Deployment targets

- **Production**: Railway (see `railway.toml`) — auto-deploys from `main` branch
- **Local**: Docker Compose (`docker compose up --build`)

## Pre-deploy checklist

1. **TypeScript compiles** — `npm run build` in `apps/backend` and `apps/frontend`
2. **Required env vars set** in Railway dashboard:
   - `TIBBER_ACCESS_TOKEN`
   - `SOLARMAN_EMAIL`, `SOLARMAN_PASSWORD`, `SOLARMAN_APP_ID`, `SOLARMAN_APP_SECRET`
   - `SOLARMAN_PLANT_ID=1869446` ← must be explicit, auto-discovery is unreliable
   - `SOLARMAN_BASE_URL=https://globalapi.solarmanpv.com`
   - `TZ=Europe/Oslo`
3. **Health check passes** after deploy: `GET /api/health`
   - `tibber.freshness` should be `fresh` within ~30s of startup
   - `solarman.freshness` should be `fresh` within ~60s
   - Both `lastSuccessAt` should be non-null

## Health check interpretation

```json
{
  "tibber":   { "freshness": "fresh", "authenticated": true, "lastSuccessAt": "...", "lastError": null },
  "solarman": { "freshness": "fresh", "authenticated": true, "lastSuccessAt": "...", "lastError": null }
}
```

- `authenticated: true` but `lastSuccessAt: null` → auth OK, data not yet received (wait 30–60s)
- `lastError` non-null → check the error message, likely a credentials or network issue
- Tibber `freshness: offline` after 1 min → Pulse device may be offline (check Tibber app)
- Solarman `freshness: offline` → verify `SOLARMAN_PLANT_ID` is set correctly

## Local testing limitations

- Tibber live data requires the physical Pulse device to be online and connected
- Solarman data requires network access to `globalapi.solarmanpv.com`
- If both are offline locally, test with production deployment instead
