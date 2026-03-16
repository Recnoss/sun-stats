# Sun Stats

`sun-stats` er et lokalt dashboard for å vise:

- solproduksjon fra Tibber live (`powerProduction`) eller Solarman
- import/eksport mot strømnettet fra Tibber
- beregnet husforbruk
- 24 timers historikk lagret lokalt i SQLite

Målet er en enkel kiosk-visning for iPad eller skjerm på hjemmenettverket.

## Status

Prosjektet har en fungerende backend/frontend-struktur, lokal lagring, polling av live-data og et kiosk-UI.

Det som fungerer nå:

- Fastify-backend med API-endepunkter for live-data, historikk og health
- React/Vite-frontend med automatisk oppdatering
- lokal SQLite-lagring av snapshots og 24t-historikk
- Tibber-integrasjonsskjelett
- Solarman-integrasjonsskjelett
- Docker Compose-oppsett for hjem-server

Det som fortsatt er uavklart:

- Solarman-innlogging mot `home.solarmanpv.com` feiler foreløpig med `401` med ren token-posting
- frontend bruker HTTP-polling som primær oppdateringsmekanisme
- WebSocket-endepunkt finnes i backend-koden, men er ikke i aktiv bruk i frontend

Hvis du bare vil kjøre prosjektet lokalt og utvikle videre, er repoet klart til det.

## Arkitektur

### Backend

Ligger i [apps/backend](/Users/erv/Repositories/sun-stats/apps/backend).

Ansvar:

- hente data fra Tibber live, med valgfri Solarman-polling
- normalisere målepunkter til ett internt format
- lagre snapshots i SQLite
- eksponere API for frontend

Viktige filer:

- [index.ts](/Users/erv/Repositories/sun-stats/apps/backend/src/index.ts): oppstart, bakgrunnsjobber, server-start
- [server.ts](/Users/erv/Repositories/sun-stats/apps/backend/src/server.ts): HTTP-ruter
- [tibber.ts](/Users/erv/Repositories/sun-stats/apps/backend/src/tibber.ts): Tibber-klient
- [solarman.ts](/Users/erv/Repositories/sun-stats/apps/backend/src/solarman.ts): Solarman-klient
- [snapshot-engine.ts](/Users/erv/Repositories/sun-stats/apps/backend/src/snapshot-engine.ts): beregning av status og last
- [db.ts](/Users/erv/Repositories/sun-stats/apps/backend/src/db.ts): SQLite-lagring

### Frontend

Ligger i [apps/frontend](/Users/erv/Repositories/sun-stats/apps/frontend).

Ansvar:

- vise live snapshot
- vise 24 timers historikk
- fungere på iPad/kiosk-visning

Frontend poller:

- `/api/live` hvert 5. sekund
- `/api/history?window=24h` hvert 60. sekund

### Persistens

SQLite-database lagres som:

- [data/sun-stats.sqlite](/Users/erv/Repositories/sun-stats/data/sun-stats.sqlite)

## API

Backend eksponerer disse endepunktene:

- `GET /api/live`
- `GET /api/history?window=24h`
- `GET /api/health`
- `GET /ws/live` finnes, men frontend er ikke avhengig av den nå

### Eksempel: `/api/live`

```json
{
  "ts": "2026-03-10T14:17:43.111Z",
  "solarW": 0,
  "gridImportW": 0,
  "gridExportW": 0,
  "homeLoadW": 0,
  "solarFreshness": "offline",
  "gridFreshness": "offline",
  "status": "degraded"
}
```

### Eksempel: `/api/health`

```json
{
  "now": "2026-03-10T14:17:46.979Z",
  "tibber": {
    "name": "tibber",
    "freshness": "offline",
    "authenticated": true,
    "lastSuccessAt": null,
    "lastError": null
  },
  "solarman": {
    "name": "solarman",
    "freshness": "offline",
    "authenticated": false,
    "lastSuccessAt": null,
    "lastError": "Paused by config (SOLARMAN_ENABLED=false)"
  }
}
```

## Krav

- Node.js 25 eller nyere
- npm 11 eller nyere
- Docker hvis du vil bruke Compose

Testet lokalt med:

- Node `v25.6.1`
- npm `11.9.0`

## Oppsett lokalt

### 1. Klon repoet og installer avhengigheter

```bash
npm install
```

### 2. Lag `.env`

Kopier eksempel-filen:

```bash
cp .env.example .env
```

Fyll inn minst:

```env
TIBBER_ACCESS_TOKEN="..."
SOLARMAN_ENABLED=false
```

Hvis token eller passord inneholder spesialtegn, bruk anførselstegn.

### 3. Start backend

```bash
npm run dev --workspace backend
```

Backend lytter som standard på:

- [http://localhost:3001](http://localhost:3001)

Nyttige sjekker:

- [http://localhost:3001/api/live](http://localhost:3001/api/live)
- [http://localhost:3001/api/health](http://localhost:3001/api/health)

### 4. Start frontend

I et nytt terminalvindu:

```bash
npm run dev --workspace frontend
```

Frontend kjører på:

- [http://localhost:5173](http://localhost:5173)

Vite er konfigurert til å proxye `/api` til backend på `localhost:3001`.

## Miljøvariabler

Se [.env.example](/Users/erv/Repositories/sun-stats/.env.example).

Viktigste felter:

- `TIBBER_ACCESS_TOKEN`
- `SOLARMAN_ENABLED` (`true`/`false`)
- `PORT`
- `TZ`

Når `SOLARMAN_ENABLED=true` må du også sette:

- `SOLARMAN_USERNAME`
- `SOLARMAN_PASSWORD`
- `SOLARMAN_PLANT_ID`

Valgfrie Solarman-felter:

- `SOLARMAN_BASE_URL`
- `SOLARMAN_TOKEN_PATH`
- `SOLARMAN_GRANT_TYPE`
- `SOLARMAN_CLIENT_ID`
- `SOLARMAN_CLIENT_SECRET`
- `SOLARMAN_SCOPE`

Polling og freshness:

- `SOLARMAN_POLL_INTERVAL_MS`
- `SNAPSHOT_INTERVAL_MS`
- `SOLAR_STALE_AFTER_MS`
- `GRID_STALE_AFTER_MS`

## Docker / hjem-server

Repoet inneholder:

- [docker-compose.yml](/Users/erv/Repositories/sun-stats/docker-compose.yml)
- [apps/backend/Dockerfile](/Users/erv/Repositories/sun-stats/apps/backend/Dockerfile)
- [apps/frontend/Dockerfile](/Users/erv/Repositories/sun-stats/apps/frontend/Dockerfile)
- [deploy/nginx/default.conf](/Users/erv/Repositories/sun-stats/deploy/nginx/default.conf)

Start med:

```bash
docker compose up --build -d
```

Da er frontend tilgjengelig på:

- [http://localhost:8080](http://localhost:8080)

## Testing og bygg

Kjør alle tester:

```bash
npm test
```

Bygg hele prosjektet:

```bash
npm run build
```

Workspace-spesifikt:

```bash
npm run test --workspace backend
npm run test --workspace frontend
npm run build --workspace backend
npm run build --workspace frontend
```

## Datamodell

Backend normaliserer alle målinger til et snapshot med:

- `ts`
- `solarW`
- `gridImportW`
- `gridExportW`
- `homeLoadW`
- `solarFreshness`
- `gridFreshness`
- `status`

`homeLoadW` beregnes som:

```text
homeLoadW = solarW + gridImportW - gridExportW
```

## Feilsøking

### Frontend viser `ECONNREFUSED`

Backend kjører ikke eller lytter ikke på `3001`.

Sjekk:

```bash
curl http://localhost:3001/api/health
```

### Backend klager på manglende env-variabler

Sjekk at `.env` finnes i repo-roten og at feltene ikke er tomme.

Eksempel:

```env
TIBBER_ACCESS_TOKEN="..."
SOLARMAN_ENABLED=false
```

### Dashboard viser bare nuller

Sjekk health-endepunktet:

```bash
curl http://localhost:3001/api/health
```

Hvis `SOLARMAN_ENABLED=false`, vil health vise Solarman som pauset.

### SQLite warning ved oppstart

Denne advarselen er forventet med `node:sqlite` i Node 25:

```text
ExperimentalWarning: SQLite is an experimental feature
```

Den stopper ikke appen.

## Tibber

Prosjektet forventer et Tibber access token i:

- `TIBBER_ACCESS_TOKEN`

Per nå brukes Tibbers GraphQL-endepunkter fra backend-koden i [tibber.ts](/Users/erv/Repositories/sun-stats/apps/backend/src/tibber.ts).

## Solarman

Prosjektet forsøker i dag å bruke portal-/OAuth-ruter som er observert i frontend-bundlene for `home.solarmanpv.com`.

Observerte ruter:

- `/oauth2-s/oauth/token`
- `/oauth-s/oauth/token`
- `/maintain-s/operating/station/search`
- `/maintain-s/operating/station/information/{plantId}`
- `/maintain-s/history/power/{plantId}/record`

Viktig:

- ren token-innlogging med bruker/passord fungerer ikke per nå for din konto
- neste sannsynlige steg er å implementere en ekte portal-login/session-flyt, eventuelt med browser-automatisering

## Videre arbeid

Naturlige neste steg:

- implementere robust Solarman-login via session/cookie-flyt
- ferdigstille Tibber live measurement-verifisering mot faktisk Pulse-data
- rydde opp eller fjerne backend-WebSocket hvis polling er tilstrekkelig
- legge til batteristøtte hvis anlegget får det senere
- legge til bedre observability og tydeligere feilvisning i UI

## Lisens

Ingen lisens er satt i repoet foreløpig.
