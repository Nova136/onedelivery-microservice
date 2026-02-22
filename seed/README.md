# Central seed folder for all microservices

Seed **data** lives here; each app runs its own seed script so TypeORM entities load in the correct context.

Run from the **repository root** (ensure DB is up, e.g. `npm run start-db`):

- **All seeds:** `npm run seed`
- **Single service:** `npm run seed:logistics`, `npm run seed:order`, `npm run seed:payment`, `npm run seed:audit`, `npm run seed:user`

## Layout

- **`seed/run.ts`** – Orchestrator: runs `npm run seed --workspace=<service>` for each (or one) service.
- **`seed/data/`** – Shared seed data; each app’s `src/seed.ts` imports from here and runs TypeORM.
  - `logistics.products.ts` – Products (delivery options, add-ons).
  - `order.ids.ts` – Fixed order IDs (referenced by payment seed).
  - `order.orders.ts` – Orders and order items.
  - `payment.payments.ts` – Payments and refunds.
  - `audit.events.ts` – Audit events.
  - `audit.incidents.ts` – Incidents.
  - `user.users.ts` – Users (passwords hashed in runner).
- **`apps/<service>/src/seed.ts`** – Per-app runner that uses `seed/data` and the app’s entities.

Run **order** seed before **payment** (payment references order IDs).
