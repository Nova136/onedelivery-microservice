# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Running Services
```bash
# Start infrastructure only (Postgres, RabbitMQ, Kong, LocalStack)
npm run start-db

# Run a single service in dev mode
npm run run-orchestrator-agent
npm run run-qa-agent
npm run run-logistics
# Pattern: npm run run-<service-name>

# Run all services concurrently (requires infrastructure up)
npm run nest-debug-all

# Run all services via Docker (full stack)
npm run start-debug-docker
npm run stop-debug-docker
```

### Building
```bash
# Build all apps
npm run nest-build-all

# Build a single app (NestJS monorepo pattern)
npx nest build <app-name>   # e.g. npx nest build orchestrator-agent
```

### Linting
```bash
npm run lint --workspaces --if-present
```

### Testing
```bash
# Unit tests
npm run test:unit

# E2E tests
npm run test:e2e

# Coverage
npm run test:coverage

# LangSmith evaluations (require OPENAI_API_KEY + LANGSMITH_API_KEY in .env)
npm run test-orchestrator-agent
npm run test-qa-agent
npm run test-logistics-agent
npm run test-resolution-agent
npm run test-qa-trends
```

### Database Seeding
```bash
# Seed all services
npm run seeding-all-datas

# Seed a specific service
npm run seed-knowledge-data
npm run seed-order-data
# etc.
```

## Architecture Overview

### Monorepo Structure
NestJS monorepo with 12 microservices under `apps/` and shared code under `libs/modules/`. Each app is independently deployable. Path aliases: `@apps/*` → `apps/*`, `@libs/*` → `libs/*`.

### Service Ports

| Service | Local | Container |
|---|---|---|
| audit | 3001 | 9001 |
| logistics | 3002 | 9002 |
| order | 3003 | 9003 |
| payment | 3004 | 9004 |
| user | 3005 | 9005 |
| incident | 3006 | 9006 |
| knowledge | 3007 | 9007 |
| orchestrator-agent | 3010 | 9010 |
| logistics-agent | 3011 | 9011 |
| resolution-agent | 3012 | 9012 |
| guardian-agent | 3013 | 9013 |
| qa-agent | 3014 | 9014 |

Kong API Gateway proxies all services at port **8000** locally.

### Inter-Service Communication
Two transports run simultaneously in every service bootstrap (`main.ts`):
1. **HTTP** — REST API with Swagger at `/<service-name>/api`, health check at `/health`
2. **RabbitMQ** — async event bus via `@nestjs/microservices` (`Transport.RMQ`). Each service has a dedicated queue (`<service>_queue`). Prefetch is 1, queues are non-durable.

Services never share a database schema. All use the same Postgres instance but with isolated schemas (`order`, `logistics`, `payment`, etc.).

### AI Agent Architecture
The **orchestrator-agent** is the entry point for all customer interactions. It runs a LangGraph state machine with:
- `SemanticRouterService` — classifies intent (`ACTION`, `FAQ`, `ESCALATE`, `END_SESSION`, `UNKNOWN`) using GPT-4o-mini
- `McpToolRegistryService` — manages available LangChain tools (registered in `onModuleInit`)
- `SpecializedAgentsService` — invokes the action agent (GPT-4o) or FAQ agent (GPT-4o-mini) depending on routed intent
- `ModerationService` — input validation + output evaluation guards
- `PrivacyService` — PII redaction before the message reaches the LLM

The orchestrator routes to downstream **specialized agents** (logistics-agent, resolution-agent) via RabbitMQ tools (`Route_To_Logistics`, `Route_To_Resolution`). The **qa-agent** receives completed sessions fire-and-forget via the `End_Chat_Session` tool.

### LangSmith Evaluation Pattern
Eval scripts live at `apps/<service>/scripts/langsmith-eval.ts`. They instantiate the service **in-process** (no HTTP server needed) with mocked dependencies — see `apps/qa-agent/scripts/langsmith-eval.ts` as the reference implementation. The orchestrator-agent eval (`apps/orchestrator-agent/scripts/langsmith-eval.ts`) follows the same pattern: mock `MemoryService`, `AgentsClientService`, and `KnowledgeClientService`; call `mcpToolRegistry.onModuleInit()` manually after instantiation.

### Shared Library (`libs/modules`)
Contains `CommonService` which provides `sendViaRMQ` — the standard helper all services use to send RabbitMQ messages and await responses. Import via `@libs/modules/common/common.service`.

### Database
Single Postgres 16 instance with pgvector extension. The `knowledge` service uses vector embeddings for semantic FAQ and SOP search (`SIMILARITY_THRESHOLD` env var, default 0.25). TypeORM `synchronize: true` is used in development — migrations are generated per-app under `src/database/migrations/`.

## Environment Setup
Copy `.env.example` to `.env`. Minimum required vars for local dev:
- `DATABASE_URL` / `DB_*` — Postgres connection
- `RABBITMQ_URL` — RabbitMQ AMQP URL
- `JWT_SECRET` — Auth signing key
- `OPENAI_API_KEY` — Required for all AI agent services
- `LANGSMITH_API_KEY` + `LANGCHAIN_API_KEY` — Required for eval scripts

## CI/CD Pipeline
Defined in `.github/workflows/pipeline.yml`. Calls three reusable workflows:
- **stage-ci.yml** — Trivy scan, lint, build, optional LangSmith evals (gated by `vars.ENABLE_LANGSMITH_EVALUATOR == 'true'`), SonarQube scans (matrix, parallel, 3-attempt retry via Docker)
- **stage-build-push.yml** — Builds all services in `.github/workflows/microservice.list` and pushes to ECR; runs only on `main` push or `workflow_dispatch`
- **stage-deploy-ecs.yml** — Deploys to ECS Fargate using a generated task definition per service; matrix parallelism

All services are built from a single `.docker/Dockerfile.template` using `SERVICE_NAME` and `EXPOSE_PORT` build args.
