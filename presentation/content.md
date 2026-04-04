# OneDelivery — Agentic AI for Customer Service
### NUSISS Practice Module | Architecting AI Systems
**Team: NCS Team 16**
*Chee Lim Peng · Yeoh Yong Shan · Chia Kai Xiang · Tan Yee Yuan · Chia Yi Hang*

<!--
DESIGN INSTRUCTIONS — apply these to every slide:

Color Palette (ocean blue gradient — use consistently across all slides):
  Primary / backgrounds:  #03045E (navy)   #023E8A (dark blue)
  Accents / headings:     #0077B6 (medium blue)   #0096C7 (ocean blue)
  Highlights / badges:    #00B4D8 (cyan blue)   #48CAE4 (light cyan)
  Subtle fills / borders: #90E0EF (pale cyan)   #ADE8F4 (very light blue)
  Slide background tint:  #CAF0F8 (near-white blue)

Usage guidance:
- Slide background: #CAF0F8 or white with #03045E text
- Section headers / title bars: #03045E or #023E8A fill, white text
- Accent bars, icons, callout boxes: #0077B6 or #0096C7
- Table header rows: #00B4D8 fill, white text
- Highlighted keywords / badges: #48CAE4 background, #03045E text
- Borders, dividers, subtle elements: #90E0EF or #ADE8F4
- Charts / diagrams: use the full 9-color ramp as a sequential scale
-->

---

## 1. Introduction
### Project Objective & Scope

**Problem:** Customer service teams are overwhelmed with repetitive refund, logistics, and order queries — manual resolution is slow, inconsistent, and hard to scale.

**Objective:** Build a production-grade agentic AI system that autonomously handles customer service interactions for a delivery platform — from intent classification to action execution and quality assurance.

**Scope:**
- 12 microservices: Order, Logistics, Payment, Audit, Incident, Knowledge, User + 5 AI Agents
- Full e2e flow: customer chat → AI routing → automated resolution → audit trail
- Deployed on AWS ECS Fargate with CI/CD pipeline

---

## 1b. How Agents Work Together
### High-Level Workflow

```
Customer Message
      ↓
Orchestrator Agent  ←── LangGraph State Machine
      ↓
Semantic Router  ──→  ACTION / FAQ / ESCALATE / END_SESSION
      ↓                        ↓
Action Agent              FAQ Agent
(GPT-4o)                 (GPT-4o-mini)
      ↓                        ↓
Guardian Agent         Knowledge Service
(SOP compliance)       (pgvector semantic search)
      ↓
Logistics Agent / Resolution Agent
      ↓
QA Agent  ←── Post-session quality scoring (async)
```

Each agent has a defined role, tools, and memory — they hand off via RabbitMQ and never share a database schema.

---

## 2. Overall Effort to Date
### Team Effort by Member

| Member | Report 1 (27 Feb) | Report 2 (13 Mar) | Cumulative |
|---|---|---|---|
| Chee Lim Peng | 24 hrs | 36 hrs | **60 hrs** |
| Yeoh Yong Shan | 24 hrs | 36 hrs | **60 hrs** |
| Chia Kai Xiang | 24 hrs | 24 hrs | **48 hrs** |
| Tan Yee Yuan | 24 hrs | 24 hrs | **48 hrs** |
| Chia Yi Hang | 48 hrs | 24 hrs | **72 hrs** |
| **Total** | **144 hrs** | **144 hrs** | **288 hrs** |

**Report 1 (27 Feb) — Foundation:**
Repo setup, branching strategy, NestJS/ViteJS base, Docker/Kong/Terraform DevOps, architecture alignment

**Report 2 (13 Mar) — Core Build:**
User stories, AI agent workflow design, incident/messaging microservice, service scaffolding, database schema planning

### Estimate vs Actual

| Area | Estimated | Actual | Notes |
|---|---|---|---|
| Microservices setup (12 services) | 3 days | 4 days | RabbitMQ + TypeORM config overhead |
| AI Agent implementation | 4 days | 5 days | LangGraph state machine complexity |
| Infrastructure (Terraform + AWS) | 2 days | 3 days | API Gateway path routing, VPC issues |
| CI/CD pipeline | 1 day | 1.5 days | SonarQube matrix, ECR permissions |
| Database seeding + migrations | 1 day | 1 day | SSL + schema isolation |
| LangSmith evaluations | 1 day | 2 days | In-process eval pattern with mocks |
| Testing (unit + integration) | 2 days | 2 days | On track |
| **Total** | **14 days** | **18.5 days** | ~32% overrun |

**Key overruns:** LangGraph complexity, AWS networking (VPC Link → direct ALB DNS pivot), ECS Exec SSM permissions debugging.

---

## 3. System Architecture
### Logical Architecture

![Logical Architecture](../infrastructure/architecture_logical.png)

**Layer breakdown (top → bottom):**
- **Presentation** — Browser/Mobile + React SPA (GitHub Pages)
- **Gateway** — HTTP REST API (CORS, JWT) + WebSocket API (JWT + RBAC authorizer)
- **AI Orchestration** — Orchestrator Agent (LangGraph) with Privacy Service, Moderation Guard, Semantic Router
- **AI Agent Layer** — Core: Action Agent (GPT-4o), FAQ Agent (GPT-4o-mini); Specialist: Logistics, Resolution, Guardian, QA
- **Domain Services** — 7 NestJS services, TypeORM, per-service schema
- **Data** — RabbitMQ event bus + PostgreSQL 17 + pgvector
- **External AI** — OpenAI GPT-4o / GPT-4o-mini, LangSmith tracing

**Design Patterns:** Saga (refund resolution), Publisher/Subscriber (RabbitMQ event bus), Chain of Responsibility (Router → Agent → Guardian → Service)

---

## 3b. Physical Architecture
### Infrastructure Diagram

![Physical Architecture](../infrastructure/architecture.png)

**Key flows:**
- **Blue** — HTTPS REST: Browser → HTTP API GW → ALB → ECS services (path-based)
- **Purple** — WebSocket: Browser → WS API GW → Lambda Authorizer → RabbitMQ → Orchestrator → push reply
- **Orange** — Agentic routing: Orchestrator → RabbitMQ → Logistics / Resolution / QA agents
- **Red** — Guardian SOP gate: Resolution Agent ↔ Guardian Agent · Logistics Agent ↔ Guardian Agent
- **Green dashed** — TypeORM + pgvector → RDS PostgreSQL 17.6 (private subnets)

**AWS Services:** ECS Fargate, ALB, API Gateway v2 (HTTP + WebSocket), Lambda (nodejs22.x), RDS PostgreSQL 17.6, ECR, CloudWatch, SSM Parameter Store (Lambda secrets + ECS Exec)

---

## 3c. Deployment Strategy & Tech Choices
### Containerization & Cloud

**Containerization:**
- Single `Dockerfile.template` with `SERVICE_NAME` + `EXPOSE_PORT` build args
- All 12 services built from same template — consistent base, isolated ports
- Images tagged with Git SHA for traceability; `:latest` also updated

**Deployment:**
- ECS Fargate — serverless containers, scale-to-zero for cost optimisation
- No EC2 to manage; task definitions generated per service in CI/CD
- `enable_execute_command = true` for ECS Exec debugging

**Justification of Architectural Choices:**
- **NestJS monorepo**: Shared libs (`@libs/modules`), consistent DI, TypeORM per service
- **RabbitMQ over REST**: Decoupled async communication; agents don't block waiting for domain services
- **pgvector over external vector DB**: Keeps semantic search co-located with relational data; simpler ops
- **API Gateway + ALB**: API Gateway handles CORS and auth edge; ALB handles path-based internal routing

---

## 3d. Tech Stack

| Layer | Technology |
|---|---|
| Backend Framework | NestJS (TypeScript) monorepo |
| AI/LLM | LangChain + LangGraph, GPT-4o, GPT-4o-mini |
| Vector Search | PostgreSQL 17 + pgvector |
| Event Bus | RabbitMQ (AMQP) |
| Database ORM | TypeORM |
| Infrastructure | AWS ECS Fargate, ALB, API Gateway v2, RDS, ECR |
| IaC | Terraform |
| API Gateway (local) | Kong |
| CI/CD | GitHub Actions |
| Security Scan | Trivy (container), SonarQube (SAST) |
| Observability | LangSmith (LLM eval), CloudWatch |
| Auth | JWT (RS256), bcrypt |

---

## 4. Agent Design
### Orchestrator Agent

**Purpose:** Entry point for all customer interactions. Coordinates the entire agentic pipeline.

**Responsibilities:**
- Receive customer messages via REST API
- Invoke Semantic Router to classify intent
- Dispatch to Action Agent or FAQ Agent based on intent
- Apply PII redaction before any LLM call
- Apply moderation guards (input validation + output evaluation)
- Publish completed sessions to QA Agent

**Planning/Reasoning:** LangGraph state machine — deterministic transitions between ROUTE → ACT/FAQ → GUARDIAN → RESPOND states

**Memory:** `MemoryService` maintains conversation history per session (in-memory, keyed by sessionId)

**Tools:** `Route_To_Logistics`, `Route_To_Resolution`, `End_Chat_Session`, `Escalate_To_Human`

---

## 4b. Agent Design
### Logistics Agent & Resolution Agent

**Logistics Agent**
- Purpose: Order cancellation workflow executor — validates cancellation eligibility, enforces SOP rules, executes cancellation and refund
- Reasoning: GPT-4o (temperature 0, deterministic); SOP workflow injected at runtime from Knowledge service (`PROCESS_CANCELLATION_LOGIC`)
- Memory: Stateless — fresh scratchpad per invocation, max 5 reasoning iterations
- Tools: `Get_Order_Details`, `Route_To_Guardian`, `Execute_Cancellation_And_Refund`
- Returns plain text: `SUCCESS: <reason>` or `REJECTED: <reason>`

**Resolution Agent**
- Purpose: Refund request processor — validates eligibility, calculates refund amount, enforces financial controls, executes item-level refunds
- Reasoning: GPT-4o-mini (temperature 0); SOP workflow injected from Knowledge service (`PROCESS_REFUND_LOGIC`); 2-hour delivery window enforced, refund math computed per line item (quantity × unit price)
- Memory: Stateless — no session history between calls
- Tools: `Get_Order_Details`, `Route_To_Guardian`, `Execute_Refund`
- Returns structured JSON: `{status, orderId, amount, summary}` on success or `{status, reason, summary}` on rejection
- Refunds **≤ $20**: Guardian approval required before execution; refunds **> $20**: auto-rejected immediately, Guardian is never called

---

## 4c. Agent Design
### Guardian Agent & QA Agent

**Guardian Agent**
- Purpose: Dual-mode compliance gate — (1) **GATE**: pre-execution approval/block of high-risk tool calls; (2) **VERIFY**: post-loop validation of proposed responses against SOP
- Reasoning: Dual LLM — `gpt-4o` (temperature 0) for gate/verify decisions; `gpt-4o-mini` for indirect prompt injection scanning. 8 layered guardrails including deny-list regex, hardcoded $20 cap, session compliance budget (1 refund/cancellation per session)
- Memory: **Stateful per session** — tracks `gatedActions` list and `refundCount` in-memory per sessionId
- Tools: **None** — pure LLM verification; SOP fetched directly from Knowledge service
- Called by both Resolution Agent (refund gate) and Logistics Agent (cancellation gate); fail-open on VERIFY, fail-closed on GATE
- Returns `"APPROVED"` / `"BLOCKED: <reason>"` for gate; `"VERIFIED"` / `"FEEDBACK: <reason>"` for verify

**QA Agent**
- Purpose: Post-session incident logging, sentiment capture, and trend analysis
- Reasoning: `gpt-4o-mini` (temperature 0) reviews completed chat sessions to detect service failures, score customer sentiment, and surface incident trends
- Memory: **Stateful** — reads and persists chat history via User service over RabbitMQ
- Tools: `log_incident` (logs failure type + summary to Incident service), `save_sentiment` (saves score −1.0→1.0 + escalation flag), `get_incidents_by_date_range` (fetches incidents for trend analysis)
- Receives sessions fire-and-forget from Orchestrator via `End_Chat_Session` tool; cron-based trend review is implemented but currently disabled
- Returns structured JSON: `{status, sentiment_captured, message}` for session review; trend JSON for analysis requests

---

## 5. Explainable & Responsible AI Practices

**Alignment with XAI/RAI Principles:**

| Principle | Implementation |
|---|---|
| Explainability | Resolution Agent returns structured JSON `{status, summary, reason/amount}` explaining each refund decision; all agents return decision context to the orchestrator |
| Transparency | LangSmith evaluation suite for agent accuracy; Audit service logs Guardian policy decisions and orchestrator node transitions to CloudWatch |
| Fairness | SOP-grounded responses — decisions based on human-authored rules, not LLM opinion; pgvector used for FAQ semantic search |
| Privacy | `PrivacyService` redacts PII (name, email, phone, credit card) via regex + NLP before any LLM call; tokens stored in Redis (1-hour TTL) |
| Human Oversight | Guardian blocks non-compliant actions (fail-closed on gate); `Escalate_To_Human` tool always available in orchestrator |
| Accountability | Key agent decisions logged with sessionId, userId, action, and timestamps — Guardian policy decisions, orchestrator node transitions, output evaluation results |

**Bias Mitigation:** SOP retrieved just-in-time from the Knowledge service by intentCode anchors all agent decisions to documented policy — reduces model hallucination and inconsistent treatment across customers.

---

## 5b. Responsible AI — Governance Framework
### IMDA Model AI Governance Alignment

| IMDA Framework Principle | OneDelivery Implementation |
|---|---|
| Internal Governance | Agent role separation — no single agent has unrestricted authority |
| Decision-Making with Human Involvement | Guardian gate + human escalation for edge cases |
| Operations Management | LangSmith evals, CloudWatch monitoring, QA Agent scoring |
| Stakeholder Interaction | Transparent summaries in all agent responses; audit trail accessible |

**Responsible AI by Design:**
- Moderation service validates inputs (jailbreak detection) and evaluates outputs (hallucination check)
- No PII reaches the LLM — redacted in-process before API call
- All SOP knowledge is human-authored and version-controlled

---

## 6. AI Security Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Prompt Injection | High | Input moderation service; system prompt isolation; Guardian deny-list + injection scan; output evaluation |
| PII Leakage to LLM | High | PrivacyService redacts name, email, phone, credit card before every LLM call |
| Jailbreak / Role Confusion | High | System prompt hardening; moderation guard rejects out-of-scope inputs; Guardian 8-layer guardrails |
| Hallucinated SOP Decisions | Medium | pgvector retrieval grounds FAQ responses; Guardian verifies agent responses against SOP |
| Excessive LLM Authority | Medium | Tool-based architecture — LLM can only call defined tools, not arbitrary code |
| API Key Exposure | Medium | Keys in AWS SSM Parameter Store (SecureString + KMS encryption); injected at runtime; never in code or logs |
| Model Denial-of-Service | Low | Rate limiting at WebSocket API (PostgreSQL-backed per-user window); Guardian session compliance budget |
| Supply Chain (LLM Provider) | Low | LLM abstracted behind LangChain; provider can be swapped without app changes |

**Security Tools (CI/CD Pipeline):**

| Tool | Type | Scope |
|---|---|---|
| Trivy | Filesystem vulnerability scan | All source files + dependencies on every push |
| OWASP Dependency Check | SCA (Software Composition Analysis) | Known CVEs in npm dependencies (NVD database) |
| Semgrep | SAST | TypeScript/Node.js rules; SARIF uploaded to GitHub Security tab |
| SonarCloud | SAST + Code Quality | 10 of 11 microservices; coverage report per app |
| OWASP ZAP | DAST (Dynamic) | Baseline scan against live target URL (gated by `ENABLE_DAST_SCAN`) |

**Runtime Security:** JWT auth on all HTTP endpoints; WebSocket CUSTOM authorizer (JWT + RBAC + rate limit)

---

## 7. Application Demo
### Live Walkthrough

**Demo Flow:**
1. Customer login → POST `/user/auth/login`
2. Start chat session → POST `/orchestrator-agent/chat`
3. Send refund request → Semantic Router classifies as ACTION
4. Action Agent routes to Resolution Agent via RabbitMQ
5. Guardian Agent reviews SOP compliance → approves
6. Refund processed → structured JSON response returned
7. Session ends → QA Agent scores quality async

**Key Demo Scenarios:**
- Happy path: ≤$20 refund auto-approved
- Edge case: >$20 refund blocked by Guardian, escalated
- FAQ query: pgvector semantic search returns grounded SOP answer
- PII test: customer sends personal data — redacted before LLM

---

## 8. MLSecOps / LLMSecOps Pipeline
### CI/CD Security Pipeline

```
Push to any branch / PR → Stage 1 (all 6 jobs run in PARALLEL)
┌──────────────────────────────┬──────────────────────────────────┐
│  [run-tests]                 │  [langsmith-eval]                 │
│  • Trivy filesystem scan     │  • Orchestrator agent eval        │
│    (SARIF → GitHub Security) │  • QA agent eval                  │
│  • ESLint code quality       │  • Logistics agent eval           │
│  • NestJS build (12 svcs)    │  • Resolution agent eval          │
│                              │  • QA trends eval                 │
├──────────────────────────────┼───────────────────────────────────┤
│  [owasp-dependency-check]    │  [sast-semgrep]                   │
│  • OWASP dep-check scan      │  • Semgrep SAST rules scan        │
│  • HTML report artifact      │  • SARIF → GitHub Security tab    │
├──────────────────────────────┼───────────────────────────────────┤
│  [dast-zap]                  │  [sonar-scan]                     │
│  • OWASP ZAP baseline scan   │  • SonarCloud scan                │
│  • Against DAST_TARGET_URL   │  • 10-app matrix, parallel        │
│  • Report artifact           │  • 3-attempt retry per app        │
└──────────────────────────────┴───────────────────────────────────┘
      ↓  (main branch push or workflow_dispatch only)
[Stage 2 — Build & Push]
  ├── Build all NestJS apps (npx nest build per service)
  ├── Docker buildx per service (SERVICE_NAME + EXPOSE_PORT args)
  ├── Tag with Git SHA + :latest
  └── Push to AWS ECR (12 repositories)
      ↓
[Stage 3 — Deploy]
  ├── Generate ECS task definition per service
  ├── Deploy to ECS Fargate (matrix parallel)
  └── Force-new-deployment to pull fresh images
      ↓
[Stage 4 — Notify]  (always runs)
  └── Report final pipeline outcome
```

**LLMSecOps additions:** LangSmith evals gate merges; eval scripts run in-process with mocked dependencies for deterministic scoring. All 6 Stage 1 security jobs run in parallel — no single scan blocks others.

---

## 9. Testing Summary
### Test Coverage & Results

| Test Type | Scope | Tool | Status |
|---|---|---|---|
| Unit Tests | 22 spec files across 11 services + shared libs | Jest | Passing |
| E2E Tests | Per-service flows with in-memory PostgreSQL (pg-mem) | Jest | Core scenarios covered |
| SCA / Dependency Scan | Known CVEs in npm packages | OWASP Dependency Check | Passing |
| Container / FS Scan | Filesystem vulnerabilities (SARIF → GitHub Security) | Trivy (fs scan) | No critical CVEs |
| SAST | TypeScript source code, secrets, misconfigs | Semgrep | No blocker issues |
| Code Quality | Per-app quality gates, coverage, duplication | SonarCloud (10-app matrix) | No blocker issues |
| DAST | Live HTTP baseline scan against deployed endpoint | OWASP ZAP | Passing |
| LLM Evaluation | Agent accuracy, intent routing, session scoring | LangSmith | Eval suite active |

**LangSmith Eval Results (5 eval suites):**
- Orchestrator: intent classification accuracy — correct routing across ACTION / FAQ / ESCALATE / END_SESSION
- Logistics Agent: order cancellation eligibility — correct accept/reject across 5 state scenarios
- Resolution Agent: refund processing — structured JSON output, correct amount calculation, quantity/time-window validation
- QA Agent: session scoring — tool invocation correctness (log_incident vs save_sentiment) across 3 session types
- QA Trends: trend analysis accuracy across date-range aggregation scenarios

---

## Thank You
### OneDelivery — Built with NestJS · LangChain · AWS · pgvector

**Summary of What Was Built:**
- 12 production-grade microservices deployed on AWS ECS Fargate with RabbitMQ async event bus and isolated per-service PostgreSQL schemas
- LangGraph-powered orchestrator with semantic routing, PII redaction, moderation guards, and multi-turn conversation memory
- 5 AI agents (Orchestrator, Logistics, Resolution, Guardian, QA) backed by GPT-4o / GPT-4o-mini with SOP-grounded pgvector retrieval — reduces hallucination
- Deterministic guardrails: Guardian SOP compliance gate (dual-model, 8 guardrails, stateful), output evaluator with self-correction, and $20 auto-approval ceiling with human escalation path
- Full MLSecOps pipeline: 6 parallel CI security jobs (Trivy, Semgrep, OWASP, ZAP, SonarCloud, LangSmith evals) gating every merge

*Questions welcome*
