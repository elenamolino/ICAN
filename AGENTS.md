# ICAN Agents

ICAN is a platform for analysing SaaS Terms of Service: AI clause classification, ontology analysis (ToS → TOSL/ODRL policies), and contract collections with versioned contracts.

## Project Structure

- **api/** — Express + MongoDB + Redis backend (TypeScript, Node 22)
- **frontend/** — React + Vite + TailwindCSS v4 frontend
- **docker/** — Compose files per environment (`dev`, `testing`, `pre-production`, `production`)
- Package manager: **pnpm** (not npm/yarn)

External services the API calls (URLs come from env vars):

| Service | Env var | Used by |
| --- | --- | --- |
| tos-to-odrl (ontology analysis pipeline, separate repo) | `TOS_TO_ODRL_SERVICE_URL` | `OntologyAnalysisService` |
| Clause analyzer (AI classification) | `ANALYZER_SERVICE_URL` | `AnalysisService` |
| TermsCockpit (contract population sync) | `TERMSCOCKPIT_SERVICE_URL` | `services/clients/TermsCockpitClient.ts` |

## Developer Commands

```bash
pnpm run install    # Install dependencies for both packages
pnpm run dev:setup  # Start MongoDB and Redis (docker/dev) and seed MongoDB. Run it BEFORE dev.
pnpm run dev        # Run API + Vite dev servers concurrently (from root)
pnpm run test       # Run API tests (vitest), then reseed MongoDB
pnpm run build      # Build frontend and api
```

Seeded dev users: `admin` / `faked` and `testuser` / `faked`. The `USER_PASSWORD` variable in `api/.env` is not used by anything.

## Running a Single Test

```bash
cd api && npx vitest --run --test-name-pattern "<pattern>"
```

## Important Quirks

- `test` reseeds MongoDB (`seed:mongo-local:small`) **after** the tests to reset state
- Tests run sequentially (`fileParallelism: false` in `api/vitest.config.ts`)
- API entry point: `api/src/main/backend.ts`
- Migrations (`ts-migrate-mongoose`, in `api/src/main/migrations/mongo/`) auto-run via `npx migrate up` in `dev:api`
- Commit messages are checked by commitlint (husky `commit-msg` hook): conventional commits, types `feat`, `fix`, `docs`, `refactor`, `chore`

## API Documentation

The OpenAPI description of the API lives in `api/src/main/docs/openapi.ts` and is served with Swagger UI at `/api/v1/docs` (JSON at `/api/v1/docs/openapi.json`). It is the source of truth for endpoint contracts: request/response schemas, authentication and behaviour. Keep it in sync with every endpoint change.

## Test Distribution

- `api/src/test/unit-tests/**` — isolated logic (services, permission engine, auth middleware, SSO/Google providers, utilities). Mock external dependencies.
- `api/src/test/user.test.ts` — user management, authentication and authorization
- `api/src/test/api-keys.test.ts` — API keys
- `api/src/test/organization.test.ts` — organizations and organization-user interactions
- `api/src/test/contractCollection.test.ts`, `contract.test.ts` — contract collections and contracts
- `api/src/test/contractAnalysisSave.test.ts`, `contractOntologyAnalysisSave.test.ts` — saving AI-classify and ontology results into collections
- `api/src/test/ontologyAnalysisSubmit.test.ts` — submitting ontology analysis jobs
- `api/src/test/entityDeletion.test.ts` — cascading deletions
- `api/src/test/cache.test.ts` — caching
- `api/src/test/apiRest.test.ts` — API documentation endpoints and API-key access

Test utilities are in `api/src/test/utils/` (auth, users, organizations, collections, permissions, config, `testApp.ts`).

## Lint Config

- API: `api/eslint.config.ts` (TypeScript-eslint, semi required)
- Frontend: `frontend/eslint.config.js`

## Adding New API Endpoints

1. Describe the endpoint in `api/src/main/docs/openapi.ts`: request/response schemas and authentication.
2. Add the route in its router in `api/src/main/routes/`, following RESTful naming and the contract from step 1.
3. Add the endpoint's permissions in `api/src/main/config/permissions.ts`.
4. Add a controller method in `api/src/main/controllers/` that parses the request and calls the services. Request validation lives in `api/src/main/controllers/validation/`.
5. Put business logic in `api/src/main/services/`, decoupled from controllers and routes. If an existing service method already does the job, call it directly from the controller.
6. Put database queries in the repositories in `api/src/main/repositories/mongoose/`.
7. Write tests in `api/src/test/` covering success, validation errors and unauthorized access, using the helpers in `api/src/test/utils/`.
8. Run `pnpm run test` from the root, or a single test as shown above.

If you add a new entity to the database:

- Create its Mongoose schema in `api/src/main/repositories/mongoose/models/`
- Add a migration in `api/src/main/migrations/mongo/` and run `npx migrate up`
- Update the seeders in `api/src/main/database/seeders/mongo/`
- Register the new repository and service in the awilix container (`api/src/main/config/container.ts`)

## Adding New Frontend Pages/Components

The frontend is organised in modules under `frontend/src/modules/` (`analysis`, `api-keys`, `auth`, `contract-collection`, `core`, `notification`, `organization`, `presentation`, `settings`). Put new code in the module it belongs to. A module may have:

- `pages/` — route-level pages
- `components/` — components specific to the module. Components reused across modules go in `frontend/src/modules/core/components/`.
- `utils/` — module-specific helpers. Cross-module helpers go in `frontend/src/modules/core/utils/`.
- `api/` — HTTP calls to the backend. Check whether a function you need already exists, in any module, before adding a new one.
- `contexts/`, `hooks/`, `layouts/` — module-specific React contexts, hooks and layouts

Follow the style in `./DESIGN.md`, and register new pages in `frontend/src/routes/router.tsx`.

New colours go in `frontend/src/main/styles/tailwind.css`, ALWAYS with a dark mode variant in the `.dark` class of the same file.

IMPORTANT RULE: EVERY CLICKABLE COMPONENT IN THE UI MUST HAVE A `cursor-pointer` CLASS.

## Deployment Notes

- Production runs `docker/production/docker-compose.yml`. The API container loads `api/.env.production` first and `docker/production/.env` second, so a variable defined in both takes the value from `docker/production/.env`. The tos-to-odrl backend reads `docker/production/.env.tos-to-odrl`.
- `docker compose restart` does not reload env files. Recreate the container: `docker compose up -d --force-recreate <service>`.
- ICAN was forked from SPHERE, and some infrastructure names still carry the old prefix (for example the `sphere-mongodb` volume and `sphere-network`). Do not rename the volume: it holds the production database.
