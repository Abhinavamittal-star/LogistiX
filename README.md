# LogistiX Control Tower

LogistiX is a full-stack logistics operations application for coordinating deliveries between dispatchers, drivers, and customers. It combines a role-based web application, a Node.js API, MongoDB persistence, Socket.IO updates, a Bengaluru map, and an optional vehicle simulator.

This guide covers what the application does, how its parts fit together, how to run it locally, how to demonstrate each role, and how to keep simulated demo data separate from real account data.

> **Credential safety:** This README intentionally does not contain any live account passwords, MongoDB credentials, JWT secrets, or dispatcher registration codes. Do not put these in documentation, source files, screenshots, or commits. The live accounts can be signed into using their credentials supplied separately and securely. Rotate any credentials that have been shared in chat or another public channel before presenting the application.

## Contents

- [Project at a glance](#project-at-a-glance)
- [What the application does](#what-the-application-does)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [How storage and demo isolation work](#how-storage-and-demo-isolation-work)
- [Live account access for the presentation](#live-account-access-for-the-presentation)
- [Roles and presentation walkthrough](#roles-and-presentation-walkthrough)
- [Local setup](#local-setup)
- [Environment configuration](#environment-configuration)
- [Running the application](#running-the-application)
- [Vehicle simulator](#vehicle-simulator)
- [Map and routes](#map-and-routes)
- [Main workflows](#main-workflows)
- [API overview](#api-overview)
- [Real-time events](#real-time-events)
- [Data model overview](#data-model-overview)
- [Optimization, geofences, and playback](#optimization-geofences-and-playback)
- [Security and deployment notes](#security-and-deployment-notes)
- [Deploy both services on Railway](#deploy-both-services-on-railway)
- [Troubleshooting](#troubleshooting)
- [Validation commands](#validation-commands)
- [Known demo limitations](#known-demo-limitations)

## Project at a glance

| Area | Implementation |
|---|---|
| Frontend | React 18, Vite, Zustand, React Router |
| API | Node.js and Express |
| Persistence | MongoDB with Mongoose |
| Live updates | Socket.IO |
| Authentication | JWT access and refresh tokens; bcrypt password hashing |
| Map | MapLibre GL JS with a free OpenFreeMap style |
| Route geometry | Public OSRM demo service when available; bundled Bengaluru routes as fallback |
| Simulator | Node.js process that moves simulated vehicles and sends location updates |
| UI | Responsive dark operations dashboard with role-specific screens |

The application has three normal user roles:

- **Dispatcher** manages deliveries, assignments, vehicles, customer and driver accounts, alerts, optimization, and geofences.
- **Driver** sees assigned deliveries, updates delivery status, and can send their device location while using the driver app.
- **Customer** creates and follows their own deliveries through the customer portal.

There are also built-in demo identities for demonstrations. These intentionally use a separate in-memory workspace; their information is sample data and is not the same as MongoDB-backed client data.

## What the application does

The current application includes:

- Registration and sign-in for customer and driver accounts.
- Protected dispatcher registration when an administrator enables it with a private backend-only registration code.
- Role-aware pages and API access.
- Order creation, assignment, status changes, delivery evidence, and tracking codes.
- Dispatcher order, vehicle, people, alert, optimization, and geofence panels.
- Real-time order, account, alert, and vehicle updates with Socket.IO.
- Driver GPS heartbeats, subject to browser geolocation permission and a secure browser context.
- A map centered on Bengaluru, showing pickup and delivery endpoints without connecting lines.
- A simulator for moving sample vehicles and demonstrating live updates.
- Greedy nearest-neighbor route assignment with a 2-opt improvement step.
- Geofence management, breach alerts, and vehicle position history playback.
- Public tracking by tracking code.

## Architecture

```text
Browser (React + Vite)
  ├── REST requests ───────────────► Express API (/api)
  ├── Socket.IO connection ────────► Express / Socket.IO server
  └── MapLibre GL ─────────────────► OpenFreeMap tiles

Express API
  ├── MongoDB / Mongoose ──────────► persistent client accounts and records
  ├── In-memory demo store ────────► isolated demo accounts and sample records
  └── Socket.IO rooms ─────────────► role-, customer-, and shipment-scoped events

Simulator (optional)
  └── Socket.IO ───────────────────► demo vehicle location and alert events
```

The backend owns authentication and authorization, validates role permissions, chooses the appropriate storage workspace, persists records, and publishes live events. The frontend calls the API for initial data and receives changes over Socket.IO. The simulator is an optional additional process and is not required for the frontend or API to start.

### Application startup and health

The Express application serves endpoints under `/api`. Its health endpoint is:

```text
GET /api/health
```

The JSON response includes a status, whether storage is available, the current server storage mode (`mongodb` or `memory`), and a timestamp. The dispatcher dashboard also uses the storage mode to label its workspace **LIVE OPERATIONS** or **DEMO · MEMORY ONLY**.

## Repository layout

```text
.
├── backend/
│   ├── src/
│   │   ├── config/       # MongoDB connection and storage-mode selection
│   │   ├── data/         # In-memory demo store and sample data
│   │   ├── middleware/   # JWT authentication and role checks
│   │   ├── models/       # Mongoose schemas
│   │   ├── routes/       # REST API endpoints
│   │   ├── services/     # Tracking, optimization, and geofence logic
│   │   ├── socket/       # Socket.IO authentication, rooms, and events
│   │   └── utils/        # JWT and dispatcher registration helpers
│   ├── scripts/          # Administrative utilities
│   └── .env.example      # Safe configuration template
├── frontend/
│   ├── src/
│   │   ├── components/   # Map, dashboard panels, playback, and shared UI
│   │   ├── pages/        # Login, dispatcher, driver, and customer pages
│   │   ├── api.js        # REST client and token handling
│   │   └── store.js      # Shared client state and Socket.IO event handling
│   └── .env.example      # Frontend API and socket URL template
├── simulator/
│   └── index.js          # Bengaluru vehicle movement simulator
├── package.json          # npm workspace and root scripts
└── render.yaml           # Render deployment blueprint
```

## How storage and demo isolation work

There are two distinct storage decisions:

1. **Server-wide storage mode** is selected at backend startup.
   - With a valid `MONGO_URI` and `DEMO_MODE=false`, the server connects to MongoDB.
   - Without a MongoDB URI, or when `DEMO_MODE=true`, the server uses in-memory mode.
   - Production startup intentionally fails if MongoDB is not configured and the deployment is not explicitly set to demo mode.
2. **Per-account workspace** is selected from the authenticated identity.
   - A regular account uses MongoDB when the server is connected to MongoDB.
   - A built-in demo account has a signed `demoMode` token claim and uses the in-memory demo store, even while the server is connected to MongoDB.

This means the demo dispatcher and a MongoDB-backed dispatcher are not supposed to see the same orders, vehicles, alerts, or people. Demo edits disappear when the backend restarts. MongoDB-backed account records persist.

| Server configuration | Signed-in identity | Workspace |
|---|---|---|
| MongoDB configured; `DEMO_MODE=false` | Built-in demo account | In-memory demo store |
| MongoDB configured; `DEMO_MODE=false` | Registered customer, driver, or dispatcher | MongoDB |
| `DEMO_MODE=true` | Any supported demo flow | In-memory demo store |
| No MongoDB URI in local development | Demo flow | In-memory demo store |

The browser clears operational state and recreates its socket when the signed-in identity changes. This prevents old account data and live events from remaining visible after signing out or switching accounts. Accounts already registered in MongoDB can log in normally; the dispatcher registration code is only needed to create a dispatcher account, not to sign in.

## Live account access for the presentation

Use the MongoDB-backed accounts to demonstrate the live workspace. Keep their email addresses, passwords, and any dispatcher registration code in a password manager or a separate handout shared privately with your instructor. Do not place active credentials in this README or in a public repository.

| Account role | Sign-in details |
|---|---|
| Driver | Share email and password privately |
| Customer | Share email and password privately |
| Dispatcher | Share email and password privately |

The dispatcher registration code is only needed when registering a new dispatcher; it is not part of dispatcher sign-in. Remove or rotate that code after account setup. If preparing a local-only credential handout, keep it outside version control and verify it is excluded before committing or publishing the project.

## Roles and presentation walkthrough

### Using existing live accounts

The live accounts you have already registered are MongoDB-backed accounts. Sign in with each account's email and password through the normal login page and confirm the dispatcher dashboard displays **LIVE OPERATIONS**.

| Account role | Sign-in details |
|---|---|
| Driver | abhinavamittal@gmail.com  123456|
| Customer |abhinava.25bcs10721@gmail.com 123456|
| Dispatcher | 2025eb01808@online.bits-pilani.ac.in 1234567890123|
| DISPATCHER_REGISTRATION_CODE | t3Jo97-dPSa-DRiNjdofn4UpkzP0x1I4Vwcx-Q5MdLE|

The dispatcher registration code is only needed when registering a new dispatcher; it is not part of dispatcher sign-in. 

If a login shows **DEMO · MEMORY ONLY**, sign out and make sure you are using the intended MongoDB-backed account rather than one of the built-in demo identities.

### Built-in demo accounts

The login page has a small **Explore demo** control that reveals the built-in demo sign-ins. Demo sample accounts use the shared demo password displayed in that UI. The built-in identities are:

| Role | Demo email |
|---|---|
| Dispatcher | `dispatcher@demo.com` |
| Driver | `driver@demo.com` |
| Customer | `customer@demo.com` |

The built-in demo password is `demo123`. These are sample accounts, not the live MongoDB-backed accounts. Demo changes are memory-only and may be reset when the backend restarts.

### Recommended instructor walkthrough

1. Start the backend, frontend, and (optionally) simulator.
2. Open the frontend login page and sign in as the MongoDB-backed dispatcher.
3. Verify the dashboard shows **LIVE OPERATIONS**. Open **Orders**, **People**, and **Vehicles** to show the records currently available to that dispatcher.
4. Open **Optimize** to assign a set of orders to drivers and compare the route distances.
5. Open **Geofences** to review or draw an area and view geofence alerts.
6. Use **Playback** to inspect saved vehicle position history when available.
7. Sign out, then sign in as the MongoDB-backed driver to show assigned stops, status updates, and location sharing.
8. Sign out and sign in as the MongoDB-backed customer to show the customer portal and customer-owned deliveries.
9. To demonstrate seeded sample data without touching client records, sign out and use **Explore demo**. The dashboard should display **DEMO · MEMORY ONLY**.

The dispatcher registration code is an administrative bootstrap credential and should not be given to an instructor as a login. Once dispatcher registration is no longer needed, remove the code from the backend environment and restart the backend. Existing dispatcher accounts continue to log in without it.

## Local setup

### Requirements

- Node.js 18 or later
- npm
- MongoDB Atlas or a local MongoDB instance for persistent client accounts and records
- Network access to the configured MongoDB server
- A modern browser; location sharing requires user permission and HTTPS (or localhost)

### Install dependencies

From the repository root:

```bash
npm install
```

The root `package.json` defines npm workspaces for the backend, frontend, and simulator. Installing once from the root installs dependencies for all workspaces.

### Configure the backend

Copy `backend/.env.example` to `backend/.env`, then edit the local `.env` file. Do not commit it:

```dotenv
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
JWT_SECRET=<long-random-private-value>
JWT_REFRESH_SECRET=<different-long-random-private-value>
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d
NODE_ENV=development
DEMO_MODE=false
FRONTEND_URL=http://localhost:5173
SIMULATOR_TOKEN=<optional-shared-simulator-secret>
DISPATCHER_REGISTRATION_CODE=<private-temporary-registration-code>
```

Important:

- Replace all placeholders with real values locally. The sample values in `.env.example` are not usable production secrets.
- Keep `JWT_SECRET` and `JWT_REFRESH_SECRET` different and randomly generated.
- Keep the dispatcher registration code in the backend environment only. Never prefix it with `VITE_`, because Vite variables are exposed to browser code.
- Remove or rotate the dispatcher registration code after the account creation window.
- Use `DEMO_MODE=true` only when intentionally running a demo-only backend.
- `MONGO_DNS_SERVERS` is optional and is only useful for environments where MongoDB SRV DNS resolution needs an override.

On Windows PowerShell, a local copy can be made with:

```powershell
Copy-Item backend\.env.example backend\.env
```

### Configure the frontend

The default local development URLs are already suitable for a typical local setup. If overriding them, copy `frontend/.env.example` to `frontend/.env` and set:

```dotenv
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

The API URL includes `/api`; the Socket.IO URL is the backend origin without that suffix. Restart Vite after changing frontend environment variables.

### Create dispatcher accounts

Dispatcher self-registration is disabled unless `DISPATCHER_REGISTRATION_CODE` is set in the backend environment. When enabled:

- The registration form must submit the configured code.
- Dispatcher passwords must be at least 12 characters.
- Dispatcher accounts require MongoDB-backed storage.
- The code is used for registration only; normal login requires the account email and password.

For administrator-managed setup, the backend also provides a `create-dispatcher` script. Run it from an interactive terminal so secrets are not placed in shell history or committed files:

```bash
npm run create-dispatcher --workspace=backend
```

## Running the application

Start all workspaces from the root:

```bash
npm run dev
```

This starts the backend, Vite frontend, and simulator concurrently. Open:

```text
http://localhost:5173
```

Expected local URLs:

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend health | `http://localhost:5000/api/health` |
| Backend REST API | `http://localhost:5000/api` |
| Socket.IO | `http://localhost:5000` |

To run one service at a time, use separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
npm run dev:simulator
```

The simulator is optional. The frontend and backend can be used without it; live simulated movement is only available while the simulator is running and connected.

## Vehicle simulator

The simulator generates moving vehicles in Bengaluru and publishes their locations over Socket.IO. It tries to fetch road-following geometry from the public OSRM demo service. If that service is unavailable or times out, it logs a warning and follows bundled Bengaluru waypoint routes instead.

The simulator uses these optional settings:

| Variable | Default | Description |
|---|---:|---|
| `BACKEND_URL` | `http://localhost:5000` | Backend Socket.IO/API origin |
| `VEHICLE_COUNT` | `4` | Number of simulated vehicles, bounded from 1 to 50 |
| `SPEED_KMH` | `45` | Approximate travel speed |
| `UPDATE_INTERVAL_MS` | `1500` | Time between movement updates |
| `ROUTING_BASE_URL` | Public OSRM route endpoint | Compatible OSRM routing endpoint |
| `SIMULATOR_TOKEN` | Empty | Must match the backend token when configured |

For a local simulator-specific `.env`, use `simulator/.env` and keep it out of source control. The backend and simulator must use the same `SIMULATOR_TOKEN` when a token is configured. In production, the backend requires simulator authentication.

The simulator publishes IDs such as `VEH-001`. In MongoDB mode, a dispatcher should create corresponding vehicle records and assign them to registered driver accounts before expecting the simulator vehicles to appear as registered fleet vehicles. The demo simulator is scoped to the demo in-memory workspace.

## Map and routes

- The map opens centered on Bengaluru and uses a free OpenFreeMap dark map style; no MapTiler or Mapbox key is required by the current default configuration.
- Pickup and delivery endpoints are marked distinctly. Connecting order lines are intentionally hidden to keep the map uncluttered.
- The **Fit deliveries** control frames active order pickup and delivery points.
- Live vehicle positions and their trails are available through the Vehicles panel and backend tracking data; the dispatcher map is designed to emphasize delivery routes rather than vehicle markers.
- Simulator road geometry depends on the public OSRM service being reachable. Its fallback is deterministic bundled Bengaluru waypoints, not a live traffic-aware route.

Map tile styling, road routes, and the vehicle simulator are separate systems: the basemap provides the visible roads; the simulator moves along its own route coordinates; an order route line represents the delivery's pickup-to-delivery path. Changing zoom should change only the map camera and must not reset a vehicle's stored coordinates.

## Main workflows

### Dispatcher

1. Sign in as a dispatcher.
2. Review delivery orders, current statuses, priorities, and pickup/delivery locations.
3. Create or assign orders to drivers.
4. Review the customer and driver directory in **People**.
5. Manage vehicles and review location/trail data in **Vehicles**.
6. Review alerts, including geofence alerts.
7. Optimize orders across available drivers.
8. Create or remove geofence areas and inspect vehicle history using playback.

Dispatcher APIs are role-protected. A customer or driver cannot access dispatcher-only management routes simply by calling them directly.

### Driver

1. Sign in as a driver.
2. Review assigned stops and delivery details.
3. Update order progress (for example pickup and in-transit status).
4. Mark a delivery complete and submit available proof-of-delivery information.
5. Allow browser location access to send location heartbeats while the app is active.

Browser GPS depends on device permissions, network access, and a secure origin. On localhost, browsers generally permit geolocation; remote deployments should use HTTPS.

### Customer

1. Sign in as a customer.
2. Create deliveries and review that customer's orders.
3. Open a tracking link/code to see the public shipment status and available tracking information.

Customer views and protected customer APIs are scoped by the signed-in customer identity. Public tracking is intentionally unauthenticated and should only reveal fields intended for public tracking.

## API overview

All endpoints are under `/api`. Registration options, demo credential discovery, login, token refresh, health, and public tracking are unauthenticated. The remaining endpoints require a valid access token, and the backend enforces role permissions.

### Authentication — `/api/auth`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/registration-options` | Reports whether dispatcher self-registration is enabled |
| `POST` | `/register` | Registers a customer, driver, or permitted dispatcher |
| `POST` | `/login` | Signs in and returns user and token data |
| `POST` | `/refresh` | Refreshes an access token |
| `GET` | `/demo-credentials` | Returns built-in demo account information |
| `GET` | `/drivers` | Dispatcher directory of drivers |
| `GET` | `/customers` | Dispatcher directory of customers |

### Orders — `/api/orders`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Lists orders visible to the authenticated role |
| `GET` | `/stats` | Returns order status totals |
| `GET` | `/:id/public` | Returns the public tracking view for a tracking identifier |
| `GET` | `/:id` | Reads an order visible to the authenticated user |
| `POST` | `/` | Creates an order (dispatcher or customer) |
| `PATCH` | `/:id` | Updates an order (dispatcher or assigned driver as allowed) |
| `DELETE` | `/:id` | Deletes an order (dispatcher) |
| `POST` | `/:id/assign` | Assigns an order to a driver (dispatcher) |
| `POST` | `/:id/deliver` | Completes a delivery and submits proof (driver) |

### Vehicles — `/api/vehicles`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Lists fleet vehicles (dispatcher) |
| `GET` | `/:id` | Reads vehicle details (dispatcher) |
| `GET` | `/:id/playback` | Reads recorded position history (dispatcher) |
| `POST` | `/heartbeat` | Accepts a driver's location heartbeat |
| `POST` | `/` | Creates a vehicle record (dispatcher) |

### Geofences — `/api/geofences`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Lists accessible geofences |
| `POST` | `/` | Creates a geofence (dispatcher) |
| `DELETE` | `/:id` | Deletes a geofence (dispatcher) |
| `GET` | `/alerts` | Reads accessible geofence alerts |

### Route optimization — `/api/optimize`

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/` | Optimizes order assignments and route sequences (dispatcher) |

### Health — `/api/health`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Reports backend readiness and storage mode |

Request and response payloads are validated and filtered by the implementation in `backend/src/routes`. Consult those route handlers when integrating another client.

## Real-time events

The backend authenticates Socket.IO connections using the access token provided during handshake. It assigns connections to rooms according to role, account, shipment, and workspace so that demo events are not broadcast into the MongoDB-backed dispatcher workspace.

Representative events include:

| Event | Direction | Use |
|---|---|---|
| `join:dispatcher` | Client to server | Joins the dispatcher room for that account's workspace |
| `join:driver` | Client to server | Joins the signed-in driver's room |
| `join:shipment` | Client to server | Subscribes to authorized/public tracking updates for a shipment |
| `vehicles:init` | Server to client | Initializes dispatcher vehicle data |
| `vehicle:move` | Server to client | Publishes updated vehicle location |
| `order:created` | Server to client | Notifies the dispatcher workspace of a new order |
| `order:updated` | Server to client | Publishes an order status or assignment update |
| `order:deleted` | Server to client | Notifies the dispatcher workspace that an order was removed |
| `account:created` | Server to client | Adds a newly registered driver/customer to the dispatcher directory |
| `alert:new` / `alert:geofence` | Server to client | Publishes new alert information |
| `alerts:init` | Server to client | Initializes dispatcher alert data |
| `driver:location` | Client to server | Sends a driver GPS update |
| `simulator:vehicle:move` | Simulator to server | Sends a simulated vehicle update |

The browser also clears account-scoped operational state and disconnects the previous socket when the signed-in identity changes. This avoids displaying stale data or processing late events from a previous session.

## Data model overview

### User

Users have a name, normalized unique email, bcrypt-hashed password, role, optional contact fields, activity state, timestamps, and refresh-token state. Password hashes are excluded from standard JSON responses.

### Order

Orders include a unique order identifier and tracking code, customer details, pickup and delivery addresses with GeoJSON coordinates, assigned driver/vehicle references, status, ETA, priority, estimated distance/duration, delivery proof, and status history. Geospatial indexes are defined for pickup and delivery locations.

### Vehicle

Vehicles include a unique vehicle ID, assigned driver, current GeoJSON location, heading, speed, a compact recent trail, bounded position history for playback, status, vehicle metadata, active orders, and last heartbeat. Current locations use a geospatial index.

### Geofence and alert

Geofences describe geographic areas and are used by the tracking/geofence services to detect relevant location changes. Alerts record operational or geofence events and can be streamed to the dispatcher dashboard.

MongoDB records persist across backend restarts. Demo-store records exist only in process memory and reset on restart.

## Optimization, geofences, and playback

### Route optimization

The dispatcher can ask the backend optimizer to allocate selected orders across selected drivers. The current algorithm:

1. Starts with a nearest-neighbor route construction.
2. Applies a 2-opt local-search pass to reduce route length.
3. Returns assignments, per-order sequence values, and before/after distance summaries.

This is a practical heuristic for a project demonstration, not a guarantee of a globally optimal solution. The displayed route distance depends on the locations and route data supplied to the optimizer.

### Geofences

Dispatchers can create and delete geographic zones. The backend tracking/geofence logic evaluates vehicle positions against configured areas and creates alerts for relevant boundary events. Geofence geometry is represented as GeoJSON; coordinates follow GeoJSON order: longitude first, latitude second.

### Playback

Vehicle tracking stores recent trails and a bounded position history. The dispatcher can load available history for a vehicle and use the playback controls to review recorded points. Playback data is only available for vehicles that have recorded history in the selected workspace.

## Security and deployment notes

- Never commit `.env` files, passwords, MongoDB connection strings, JWT secrets, simulator tokens, or dispatcher registration codes.
- Treat any credential pasted into source control, documentation, a screenshot, or a shared chat as exposed: rotate it before continuing to use the account.
- Use unique, high-entropy JWT secrets in production.
- Configure MongoDB network access and credentials with least privilege.
- Use HTTPS for deployed frontend pages, especially for driver GPS.
- Set `FRONTEND_URL` to the exact deployed frontend origin.
- Set `VITE_API_URL` to the backend URL ending in `/api`; set `VITE_SOCKET_URL` to the backend origin.
- Set a private `SIMULATOR_TOKEN` on both backend and simulator if the simulator is used in production.
- Do not enable dispatcher self-registration indefinitely. Remove the registration code from the backend environment after dispatcher onboarding.
- Do not use the built-in demo password for real accounts.
- Review CORS, rate limits, database access rules, public tracking response fields, logging, backups, and monitoring before production use.
- Use a managed secret store provided by the hosting platform instead of putting production secrets in deployment files.

`render.yaml` provides a Render service blueprint. Configure the Mongo URI, JWT secrets, origins, and any simulator secret as private service environment variables in the hosting provider. The backend health check is `/api/health`. The frontend is a static Vite build and can be hosted on a static frontend provider.

The current app is a project/demo implementation. A public launch requires additional operational hardening, observability, policy review, production data retention decisions, backups, and load testing.

## Deploy both services on Railway

The repository includes Railway configuration for two services built from the same GitHub repository:

- **API service:** Express, Socket.IO, and MongoDB connection (`backend/railway.toml`).
- **Frontend service:** Vite production build served as a single-page application (`frontend/railway.toml`, `frontend/server.js`).

### 1. Create the API service

1. In Railway, create a project and choose **Deploy from GitHub repo**.
2. Select `Abhinavamittal-star/LogistiX`.
3. Keep **Root Directory** set to the repository root (`/`) so npm can install the monorepo workspaces.
4. Set the Railway configuration file path to `/backend/railway.toml`.
5. Add these variables in the API service's private **Variables** settings:

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DEMO_MODE` | `false` |
   | `MONGO_URI` | Your MongoDB connection string |
   | `JWT_SECRET` | A new, randomly generated secret |
   | `JWT_REFRESH_SECRET` | A different new, randomly generated secret |
   | `FRONTEND_URL` | The deployed frontend origin; fill this in after step 2 |
   | `DISPATCHER_REGISTRATION_CODE` | Optional temporary code if new dispatchers need self-registration |
   | `SIMULATOR_TOKEN` | Optional; configure only if deploying a simulator |

   Do not add a `PORT` variable; Railway provides it. Do not copy secrets from local `.env` files into GitHub, README, or chat.

6. Deploy the service and wait for its health check at `/api/health` to pass.
7. In the API service's **Networking** settings, generate a public domain and copy its origin, for example `https://your-api-service.up.railway.app`.

### 2. Create the frontend service

1. Add another service from the same GitHub repository.
2. Keep **Root Directory** set to the repository root (`/`) so the frontend workspace can use the root lockfile.
3. Set the Railway configuration file path to `/frontend/railway.toml`.
4. Add build-time variables to the frontend service:

   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | `https://your-api-service.up.railway.app/api` |
   | `VITE_SOCKET_URL` | `https://your-api-service.up.railway.app` |

   Replace the example hostname with the API's actual public domain from step 1. Vite embeds `VITE_` variables into the generated browser bundle, so these URLs are public configuration and must never contain secrets.

5. Deploy the frontend service and generate a public domain in **Networking**.
6. Set the API service's `FRONTEND_URL` to the frontend origin, such as `https://your-frontend-service.up.railway.app`, then redeploy the API. This origin must match the browser URL exactly and must not include a path.

### 3. Verify deployment

- Open the frontend public domain and sign in.
- Open `https://your-api-service.up.railway.app/api/health`; expect status `ok` and storage mode `mongodb`.
- Confirm the dispatcher dashboard shows **LIVE OPERATIONS** for a MongoDB-backed dispatcher.
- Open browser developer tools and check that REST requests and the Socket.IO connection use the API's public HTTPS domain.
- Test demo accounts separately; they should show **DEMO · MEMORY ONLY** and remain isolated from MongoDB-backed records.

The frontend Railway service serves built files and provides SPA fallback for routes such as `/dashboard`, `/driver`, and `/customer`. API and Socket.IO traffic go directly to the API service. The simulator is not deployed by these two service definitions; it can remain local or be deployed separately if needed for simulated vehicle motion.

## Troubleshooting

### The dashboard shows `DEMO · MEMORY ONLY`

- Check which account is signed in; the built-in demo identities intentionally use memory storage.
- Sign out, then sign in with the intended MongoDB-backed dispatcher account.
- Check `/api/health`. In a persistent deployment, it should report `"storageMode":"mongodb"`.
- Check the backend startup log for a successful MongoDB connection.
- Confirm `DEMO_MODE=false` and that the backend has the correct `MONGO_URI`.

### The map does not load

- Confirm the browser can access the free map style and tile provider.
- Check the browser developer console and network panel for blocked tile requests.
- Confirm the map container has a non-zero height.
- Check whether browser extensions, network policy, or DNS filtering blocks map resources.

### The simulator is connected but vehicles do not appear

- Confirm the simulator reports a successful backend connection.
- Confirm the backend and simulator use matching `SIMULATOR_TOKEN` values if one is configured.
- Remember that simulator updates use the demo workspace; sign in with a demo dispatcher to inspect demo simulator traffic.
- In MongoDB mode, create matching vehicle records and assign them to registered drivers when demonstrating persistent fleet vehicles.
- Check simulator logs for OSRM fallback messages. A fallback route should still move vehicles.

### The simulator is not following roads

- OSRM geometry depends on the public routing service and may be unavailable or rate-limited.
- When routing cannot be fetched, the simulator intentionally uses built-in waypoint sequences.
- The map basemap's roads and the simulator's route geometry are independent; bundled routes are illustrative and are not guaranteed to match every visible road.

### A driver cannot share GPS

- Allow location permission in the browser.
- Use localhost or an HTTPS deployment.
- Ensure the device has location services enabled and that the browser is not blocking geolocation.
- Keep the driver app open while testing; location heartbeats require an active session and network connection.

### A dispatcher cannot register

- Confirm MongoDB is configured and connected.
- Confirm the administrator has temporarily configured `DISPATCHER_REGISTRATION_CODE` in the backend environment.
- Enter the configured code exactly; do not use a previous or rotated code.
- Use a password at least 12 characters long.
- If an account already exists for that email, sign in instead of registering it again.

### Changes do not appear immediately

- Check the backend and browser console for API or Socket.IO errors.
- Confirm the account has the correct role and that its access token is still valid.
- Confirm the client is connected to the expected backend URL.
- Refresh the page to request a fresh REST snapshot if needed.
- Ensure the other user and the dispatcher are in the same workspace (both demo or both MongoDB-backed).

## Validation commands

Run these commands from the repository root:

```bash
npm test
npm run lint
npm run build --workspace=frontend
```

- `npm test` runs the backend Node.js test suite, including tests for storage selection, JWT behavior, dispatcher registration validation, optimization, and geofence geometry.
- `npm run lint` runs ESLint across backend, frontend, and simulator source.
- The frontend build compiles the production Vite assets.

## Known demo limitations

- OSRM road routing uses a public demo endpoint and may be rate-limited or unavailable; bundled route data is used as a fallback.
- The simulator creates artificial GPS movement and is not connected to physical vehicles.
- The optimizer is heuristic and does not guarantee a globally optimal route.
- Demo workspace data is memory-only and resets when the backend restarts.
- GPS updates require a device/browser that supports geolocation, permission, and a secure origin.
- Map tiles require network access to the configured tile provider.
- A large MapLibre JavaScript bundle may generate a Vite build-size warning; the build can still complete successfully.
