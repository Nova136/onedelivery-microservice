# PROJECT REPORT: AI CUSTOMER SUPPORT ORCHESTRATOR (V3.0)

**Course:** Architecting Agentic Systems  
**Date:** April 2026  
**Tech Stack:** NestJS, LangGraph, Express, React, Postgres, Redis, RabbitMQ

---

## 1. INTRODUCTION

### Objective and Scope

**Objective:** To build a production-ready, multi-layer AI Orchestrator that automates complex food delivery support (refunds, logistics, delays) while maintaining durable state and enterprise-grade security.
**Scope:** Handles multi-turn conversations, detects multiple intents, redacts PII in real-time, and integrates with backend microservices via asynchronous callbacks.

### Solution Overview

The system is built on a **Controller-Service Architecture**. The **Orchestrator Agent** (LangGraph) serves as the "brain," managing a 5-layer pipeline (PII → Input Val → Intent Class → SOP Execution → Output Eval). It uses **WebSockets** for real-time customer updates and **RabbitMQ** for reliable, decoupled communication with specialized worker agents.

---

## 2. SYSTEM ARCHITECTURE

### 2.1. Durable State & Orchestration (LangGraph)

- **Postgres Checkpointer:** Every node execution is a checkpoint. If the server restarts, the AI resumes exactly where it left off, ensuring no customer is "dropped."
- **Sticky Routing:** The graph locks the user into a specific intent (e.g., `REFUND_REQUEST`) until the SOP is resolved or explicitly changed.
- **Conditional Edges:** Allows the graph to branch dynamically—routing to "Human Escalation" if validation fails twice or to "FAQ" for simple queries.

### 2.2. Multi-Model Hybrid & Fallback Strategy

- **Tier 1 (gpt-5.4-mini):** Used for high-speed preprocessing (PII, Validation, Routing).
- **Tier 2 (gpt-4o / Gemini 3.1 Pro):** Used for deep reasoning and SOP execution.
- **Prompt-Based JSON Fallback:** If a model provider’s "Structured Output" API fails, the system automatically switches to raw prompt-based JSON extraction to maintain 100% uptime.

### 2.3. Distributed Communication

- **WebSockets:** Provides instant "Agent is typing..." and "Refund Processed" feedback.
- **Context-Aware Callbacks:** External agents (Logistics/Resolution) hit specific API endpoints. The Orchestrator uses **Order IDs** as correlation keys to update the correct conversation state asynchronously.

---

## 3. AGENT DESIGN & WORKFLOW NODES

| Node / Agent         | Model        | Purpose & Logic                                                                        |
| :------------------- | :----------- | :------------------------------------------------------------------------------------- |
| **Preprocessing**    | gpt-5.4-mini | PII Redaction (`compromise` library) + Input Security Check.                           |
| **Routing**          | gpt-5.4-mini | Intent classification and Multi-Intent Queueing.                                       |
| **Dialogue (SOP)**   | gpt-4o       | Slot-filling for required data (Order ID, Photo, Reason).                              |
| **Guardian Agent**   | gpt-4o       | Isolated approval gatekeeper; checks refund logic against Postgres facts.              |
| **Output Evaluator** | gpt-5.4-mini | The "Critic" node; scans for hallucinations or internal data leaks.                    |
| **Summarizer**       | gpt-5.4-mini | Updates 6-pillar structured memory (Goal, Facts, History, Status, Actions, Sentiment). |

---

## 4. CORE DESIGN PRINCIPLES

### 4.1. Security & PII Tokenization

1.  **Detect:** Names/Places found via NLP; Emails/Cards found via Regex.
2.  **Tokenize:** Replaced with `REDACTED_TOKEN_X`.
3.  **Store:** Original values stored in **Redis** with a 1-hour TTL.
4.  **Zero Trust:** The LLM never sees raw PII; it only reasons over tokens.

### 4.2. Self-Correction (Actor-Critic)

If the **Output Evaluator** detects a hallucination or a system prompt leak, it triggers the **Self-Correction Node**. This node uses the error feedback to rewrite the response before the user ever sees it.

---

## 5. OBSERVABILITY & MLSECOPS

### 5.1. AWS ECS & CloudWatch Integration

- **Structured JSON Logging:** Every node transition and tool call is logged via `nestjs-pino`.
- **Audit Trails:** Dedicated `log_type: "AUDIT_EVENT"` allows admins to query the full reasoning trace of any refund in CloudWatch.

### 5.2. LangSmith Integration

- **Tracing:** Full visibility into nested LLM calls and RabbitMQ callback latency.
- **LLM-as-a-Judge:** Automated red-team testing where gpt-4o evaluates the agent's performance against "Golden Datasets."

---

## 6. APPLICATION DEMO SCENARIOS

1.  **Multi-Intent Handling:** User asks "Where is my pizza and can I get a refund for the cold wings from yesterday?" Show the AI queuing both and solving them sequentially.
2.  **Confirmation Flow:** Show the AI summarizing all gathered data and waiting for a "Yes" before triggering the Resolution Agent.
3.  **Adversarial Defense:** Attempt a "System Prompt Leak" attack and show the **Output Evaluator** blocking the response.
4.  **Anonymized Handoff:** Show how the UI says "Consulting our Logistics team..." while the backend is actually routing to a specific microservice.

---

## 7. FUTURE ROADMAP

- **Proactive Outreach:** Listening to GPS streams to apologize for delays before the user chats.
- **Multimodal Vision:** Resolution Agent automatically verifying "damaged food" claims via photo uploads.
- **Local Distillation:** Fine-tuning a Llama 3 model to replace gpt-5.4-mini for 10x lower costs.
