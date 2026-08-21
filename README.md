# ICAN

ICAN is a platform for browsing SaaS Terms-of-Service contracts and their analysis, orchestrating a set of contract-analysis tools (unfair-clause classification, ToS→ODRL conversion, and others) as microservices behind a single backend gateway.

## Running locally

### Prerequisites

- Node.js and [pnpm](https://pnpm.io/)
- Docker (for MongoDB and Redis)

### Steps

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/elenamolino/ICAN.git
   cd ICAN
   pnpm run install
   ```

2. Configure environment variables:

   - In `api/`, create an `.env` file (see `api/.env.mongo.example` for reference).
   - In `frontend/`, create an `.env` file (see `frontend/.env.example` for reference).

3. Start MongoDB and Redis, and seed the database:

   ```bash
   pnpm run dev:setup
   ```

4. Start the backend and frontend:

   ```bash
   pnpm run dev
   ```

   The frontend will be available at `http://localhost:5173`, and the API at the port configured in `api/.env`.

---

Built on top of the [SPHERE](https://github.com/SCORELabUS/SPHERE) architecture.