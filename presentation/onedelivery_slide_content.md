# OneDelivery — Agentic AI for Customer Service

**Context**: NUS ISS Practice Module | Architecting AI Systems  
**Team**: Yihang Chia

## Slide 1 — Cover

- Title: OneDelivery
- Subtitle: Agentic AI for Customer Service
- Footer: NUS ISS Practice Module | Architecting AI Systems • Team: Yihang Chia

## Slide 2 — Problem, Objective, Scope

**Problem**

- Customer service teams overwhelmed by repetitive refund, logistics, and order queries
- Manual handling is slow, inconsistent, and hard to scale

**Objective**

- Build a production-grade agentic AI system that autonomously handles customer service interactions
- From intent classification → action execution → quality assurance

**Scope (system boundaries)**

- 12 microservices: Order, Logistics, Payment, Audit, Incident, Knowledge, User + 5 AI Agents
- Full E2E flow: customer chat → AI routing → automated resolution → audit trail
- Deployed on AWS ECS Fargate with CI/CD

## Slide 3 — How Agents Work Together (High-level workflow)

- Customer message enters Orchestrator Agent (LangGraph state machine)
- Semantic Router routes: ACTION / FAQ / ESCALATE / END_SESSION
- ACTION: Action Agent → (Guardian SOP gate) → Logistics/Resolution agents
- FAQ: FAQ Agent → Knowledge Service (pgvector semantic search)
- Post-session QA Agent scores quality asynchronously
- Handoff via RabbitMQ; agents never share DB schema

## Slide 4 — Effort to Date (Estimate vs Actual)

Show estimate vs actual by workstream (days):

- Microservices setup: 3 → 4
- AI agent implementation: 4 → 5
- Infrastructure (Terraform + AWS): 2 → 3
- CI/CD pipeline: 1 → 1.5
- DB seeding + migrations: 1 → 1
- LangSmith evaluations: 1 → 2
- Testing: 2 → 2
- Total: 14 → 18.5 (~32% overrun)

Key overruns to call out:

- LangGraph state machine complexity
- AWS networking: VPC Link → direct ALB DNS pivot
- ECS Exec / SSM permissions debugging

## Slide 5 — System Architecture (Logical)

Layered view (top → bottom):

- Presentation: Browser/Mobile + React SPA (GitHub Pages)
- Gateway: HTTP REST API (CORS, JWT) + WebSocket API (JWT + RBAC authorizer)
- AI Orchestration: Orchestrator (LangGraph), Privacy Service, Moderation Guard, Semantic Router
- AI Agent Layer: Action (GPT-4o), FAQ (gpt-5.4-mini), Logistics, Resolution, Guardian, QA
- Domain Services: 7 NestJS services, TypeORM, per-service schema
- Data: RabbitMQ event bus + PostgreSQL 17 + pgvector
- External AI: OpenAI models, LangSmith tracing

Key patterns:

- Saga (refund resolution)
- Pub/Sub (RabbitMQ)
- Chain of Responsibility (Router → Agent → Guardian → Service)

## Slide 6 — Infrastructure (Physical)

Key flows:

- HTTPS REST: Browser → HTTP API GW → ALB → ECS services (path-based routing)
- WebSocket: Browser → WS API GW → Lambda Authorizer → RabbitMQ → Orchestrator → push reply
- Agentic routing: Orchestrator → RabbitMQ → Logistics/Resolution/QA agents
- Guardian gate: Resolution ↔ Guardian
- Data: TypeORM + pgvector → RDS PostgreSQL 17 (private subnets)

AWS services used:

- ECS Fargate, ALB, API Gateway v2 (HTTP + WebSocket), Lambda (nodejs20.x)
- RDS PostgreSQL 17, ECR, CloudWatch, SSM (ECS Exec)

## Slide 7 — Deployment Strategy & Key Tech Choices

**Containerization**

- Single Dockerfile template with build args (SERVICE_NAME, EXPOSE_PORT)
- 12 images built consistently; tagged with Git SHA and :latest

**Deployment**

- ECS Fargate; task definitions generated per service in CI/CD
- enable_execute_command = true for production debugging via ECS Exec

**Why these choices**

- NestJS monorepo: shared libs, consistent DI, TypeORM per service schema
- RabbitMQ over REST: decoupled async; agents don’t block on domain services
- pgvector: semantic search co-located with relational data; simpler ops
- API Gateway + ALB: auth/CORS at edge, path routing internally

## Slide 8 — Tech Stack (By layer)

Table format:

- Backend: NestJS (TypeScript) monorepo; TypeORM
- AI: LangChain + LangGraph; GPT-4o; gpt-5.4-mini
- Vector: PostgreSQL 17 + pgvector
- Event bus: RabbitMQ (AMQP)
- Infra: AWS ECS Fargate, ALB, API Gateway v2, RDS, ECR
- IaC: Terraform
- Local gateway: Kong
- CI/CD: GitHub Actions
- Security scan: Trivy, SonarQube
- Observability: LangSmith, CloudWatch
- Auth: JWT (RS256), bcrypt

## Slide 9 — Orchestrator Agent (Design)

Purpose: entry point; coordinates the entire pipeline

Responsibilities:

- Receive messages via REST API
- Invoke Semantic Router (intent)
- Dispatch to Action or FAQ
- PII redaction (PrivacyService) before any LLM call
- Moderation guards (input validation + output eval)
- Publish completed sessions to QA Agent

Planning/Reasoning:

- LangGraph deterministic state machine: ROUTE → ACT/FAQ → GUARDIAN → RESPOND

Memory:

- MemoryService maintains conversation history per sessionId (in-memory)

Tools:

- Route_To_Logistics; Route_To_Resolution; End_Chat_Session; Escalate_To_Human

## Slide 10 — Specialist Agents (Logistics, Resolution, Guardian, QA)

**Logistics Agent**

- Tracking, ETA, delay prediction
- GPT-4o; queries Logistics service via RabbitMQ
- Stateless; tools: Get_Order_Status, Get_Shipment_ETA, Predict_Delay

**Resolution Agent**

- End-to-end refunds with SOP grounding
- GPT-4o; returns structured JSON {status, orderId, amount/reason, summary}
- SOP context via Knowledge service (pgvector)
- Auto-approve ≤ $20; escalate higher to Guardian

**Guardian Agent**

- SOP compliance gate; approves/rejects with explanation
- 3 rejection cycles → escalate to human

**QA Agent**

- Async post-session scoring: accuracy, SOP compliance, sentiment, response quality
- Aggregates trend analysis via scheduled cron

## Slide 11 — Production Readiness: DevSecOps, Testing, Demo

**MLSecOps / LLMSecOps pipeline**

- CI: Trivy scan, ESLint, build (12 services), LangSmith eval gates, SonarQube SAST
- Build & Push: build images, tag SHA + latest, push to ECR
- Deploy: generate ECS task defs, deploy to Fargate (matrix), force-new-deployment

**Testing summary**

- Unit + Integration tests passing (Jest, Supertest)
- Trivy: no critical CVEs; SonarQube: no blocker issues
- LangSmith eval suite active: routing accuracy; Guardian compliance; QA scoring consistency; Resolution JSON correctness

**Live demo flow (walkthrough)**

- Login → start chat → refund request → ACTION route → Resolution → Guardian approve → refund JSON → end session → QA scoring async

## Slide 12 — Responsible AI & Security + Closing

**Explainable & Responsible AI**

- Explainability: structured JSON includes decision summary
- Transparency: LangSmith traces; audit trail in Audit service
- Fairness: SOP-grounded decisions (rules, not opinions)
- Privacy: PII redaction (name/email/phone/NRIC)
- Human oversight: Guardian gate + escalation path
- Accountability: full logging with sessionId/userId/decisions/timestamps

**AI security risk register (highlights)**

- Prompt injection, PII leakage, jailbreak/role confusion, hallucinated SOP decisions
- Mitigations: moderation service, prompt isolation, pgvector grounding, tool-based limits, Secrets Manager, API Gateway rate limits

Closing tagline

- Agentic AI with deterministic guardrails — production-grade microservices on AWS Fargate
