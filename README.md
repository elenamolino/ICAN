# ICAN

ICAN is a platform for browsing SaaS Terms-of-Service contracts and their analysis, orchestrating a set of contract-analysis tools (unfair-clause classification, ToS→ODRL conversion, and others) as microservices behind a single backend gateway.

## Microservices

| Service | Repo | Used for | Runtime dependency? |
|---|---|---|---|
| [unfair-terms-detector-app](https://github.com/elenamolino/unfair-terms-detector-app) | separate repo, published to `ghcr.io/elenamolino/unfair-tos-detector` | AI Classify — unfair-clause classification | Yes, called live |
| [AM-TOSL](https://github.com/elenamolino/tos-to-tosl) (tos-to-odrl) | separate repo, backend published to `ghcr.io/elenamolino/tos-to-odrl` | Ontology Analysis — ToS → ODRL policy pipeline | Yes, called live |
| [termscockpit](https://github.com/elenamolino/termscockpit) | separate repo, run standalone (not containerized here) | Sync source for `Contract`/`Service`/`ContractVersion` (wraps [OpenTermsArchive/contrib-versions](https://github.com/OpenTermsArchive/contrib-versions)) | No — only needed while running `pnpm run sync:termscockpit`, not by the running app |

## Running locally

### Prerequisites

- Node.js and [pnpm](https://pnpm.io/)
- Docker (for MongoDB, Redis, and the unfair-tos-detector analysis microservice — pulled from GHCR, no local checkout needed)

### Steps

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/elenamolino/ICAN.git
   cd ICAN
   pnpm run install
   ```

2. Configure environment variables:

   - In `api/`, copy `.env.testing` to `.env` and adjust for running on the host (e.g. `MONGO_HOST=localhost` instead of `mongodb`, since the api runs on the host in dev while MongoDB runs in Docker).
   - In `frontend/`, copy `.env.example` to `.env`.

3. Start MongoDB, Redis and unfair-tos-detector, and seed the database:

   ```bash
   pnpm run dev:setup
   ```

4. Start the backend and frontend:

   ```bash
   pnpm run dev
   ```

   The frontend will be available at `http://localhost:5173`, and the API at the port configured in `api/.env`.

5. (Optional) Ontology Analysis needs `tos-to-odrl` running too — clone [AM-TOSL](https://github.com/elenamolino/tos-to-tosl), copy its `.env.example` to `.env` and fill in your model API keys, then:

   ```bash
   docker compose up -d
   ```

   Point `TOS_TO_ODRL_SERVICE_URL` in `api/.env` at it (defaults to `http://localhost:8000`).

6. (Optional) To populate `Contract`/`Service` data from termscockpit, clone [termscockpit](https://github.com/elenamolino/termscockpit), run its server (`python -m termscockpit.server --port 5050 --repos contrib`), point `TERMSCOCKPIT_SERVICE_URL` in `api/.env` at it, then run:

   ```bash
   pnpm run sync:termscockpit -- --repos contrib --services Airbnb,Google,Spotify
   ```

   This is a one-off/occasional ingestion step, not something the running app depends on afterwards.

## Deploying to production

`docker/production/docker-compose.yml` runs the full stack — `server`, `client`, `nginx`, `mongodb`, `redis`, `mongo-express`, and both `unfair-tos-detector` and `tos-to-odrl-backend` pulled from GHCR (no local checkout of either microservice needed).

Before running `docker compose up -d` in `docker/production/`, the deploy machine needs these gitignored files created (none are committed):

- `docker/production/.env` — copy from `.env.example` and fill in.
- `docker/production/.env.tos-to-odrl` — copy from `.env.tos-to-odrl.example` and fill in the model API keys.
- `docker/gh_pat.txt` — a single line with a read-only GitHub PAT, used to fetch the changelog when building the frontend image.
- `nginx/production/ssl/fullchain.pem` and `privkey.pem` — a TLS cert for the deploy domain.

And these already-tracked values need real secrets filled in on the deploy machine (currently blank or dev-grade placeholders in `api/.env.production`):

- `GOOGLE_CLIENT_SECRET`
- `JWT_SECRET`, `ADMIN_PASSWORD`, `USER_PASSWORD`, and the Mongo root password — replace the checked-in dev values with real ones for a genuinely separate deployment.

`termscockpit` is intentionally not part of this compose (see the table above) — run the sync separately, pointed at the production database, whenever you want to (re)populate contract data.

---

Built on top of the [SPHERE](https://github.com/SCORELabUS/SPHERE) architecture.
