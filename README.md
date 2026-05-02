# AffordMed Backend - Campus Notifications Microservice

## Project Structure

```
affordmed/
├── src/
│   ├── config/index.ts          # loads .env variables
│   ├── middleware/logger.ts     # reusable Log() function (the core deliverable)
│   ├── scripts/
│   │   ├── register.ts          # run once to get clientID + clientSecret
│   │   ├── getToken.ts          # run to get auth Bearer token
│   │   └── priorityInbox.ts    # Stage 6 - top N priority notifications
│   └── index.ts                 # express server
├── docs/
│   └── notification_system_design.md  # Stages 1-6 design doc
├── .env.example
├── package.json
└── tsconfig.json
```

## Setup Steps

### 1. Install dependencies
```bash
npm install
```

### 2. Create your .env file
```bash
cp .env.example .env
```
Fill in your EMAIL, NAME, ROLL_NO, MOBILE_NO, GITHUB_USERNAME, and ACCESS_CODE (from the email you received).

### 3. Register (run ONCE only)
```bash
npm run register
```
Copy the CLIENT_ID and CLIENT_SECRET printed to your terminal into your .env file.

### 4. Get auth token
```bash
npm run gettoken
```
Copy the AUTH_TOKEN into your .env file.

### 5. Run priority inbox (Stage 6)
```bash
npm run notifications
```
This fetches notifications and shows the top 10 by priority score.

### 6. Start the server (optional)
```bash
npm run dev
```

## The Log Function

```typescript
import { Log } from "./middleware/logger";

// Log(stack, level, package, message)
Log("backend", "info", "service", "Fetched notifications for student 42");
Log("backend", "error", "handler", "Received string, expected bool");
Log("backend", "fatal", "db", "Critical database connection failure.");
```

Valid values:
- **stack**: `backend` | `frontend`
- **level**: `debug` | `info` | `warn` | `error` | `fatal`
- **package (backend)**: `cache` `controller` `cron_job` `db` `domain` `handler` `repository` `route` `service`
- **package (frontend)**: `api` `component` `hook` `page` `state` `style`
- **package (shared)**: `auth` `config` `middleware` `utils`
