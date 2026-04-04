# AI Customer Support Orchestrator

A production-ready, multi-layer AI Orchestrator built with **LangGraph**, **Express**, and **React**. This system handles complex customer support workflows for a food delivery app (e.g., missing food, late drivers, refunds) with built-in PII redaction, input/output validation, and durable state management.

## 🚀 Key Features

### 1. Multi-Layer AI Pipeline
The orchestrator processes every message through a series of specialized layers:
- **PII Redaction**: Automatically detects and tokenizes sensitive data (Emails, Phones, Names) using NLP and Regex.
- **Summarizer**: Maintains a high-fidelity, structured summary (Current Goal, Key Facts, Agent History, Status & Resolutions, Pending Actions, User Sentiment) to ensure continuity across agent handoffs and long sessions.
- **Input Validation**: Guards against prompt injection, toxicity, and off-topic queries using a security-first prompt.
- **Intent Classification**: Classifies user intent into specific SOP or FAQ codes.
- **Central Router (SOP Agent)**: Executes Standard Operating Procedures (SOPs) with slot-filling capabilities.
- **Output Evaluation**: A self-correcting layer that validates AI responses for safety and accuracy before they reach the user.

### 2. Advanced Intent Management
- **Multi-Intent Guidance**: Detects when a user asks multiple questions at once and guides them through each one sequentially.
- **Confirmation Flow**: Summarizes gathered information and asks for user confirmation before triggering backend handoffs.
- **FAQ Knowledge Base**: Integrated with a Postgres database to answer common questions instantly.

### 3. Durable & Scalable Infrastructure
- **Postgres Checkpointer**: Uses LangGraph's checkpointer to persist conversation state across server restarts. The AI never forgets where it was in a multi-turn SOP.
- **Redis Token Storage**: PII tokens are stored in Redis with a **1-hour TTL** for security. Includes an automatic **In-Memory Fallback** if Redis is unavailable.
- **Real-Time WebSocket Chat**: Bi-directional communication for instant chat responses and live "Agent Updates" (e.g., "Refund Processed").
- **Asynchronous Agent Callbacks**: Dedicated API endpoints for external agents (Logistics, Resolution) to push task results back to the orchestrator. Callbacks are context-aware, prioritizing **Order ID** or **Request ID** to handle multiple concurrent requests in a single session without ambiguity.
- **Anonymized Handoffs**: Internal agent names (e.g., "Logistics Agent") are hidden from the end user. The AI refers to them as "specialized teams" to maintain a professional, customer-facing interface.

### 4. Observability & Auditing (AWS ECS Ready)
- **Structured JSON Logging**: Uses `nestjs-pino` to output all application logs, HTTP requests, and audit trails as structured JSON. This is optimized for **AWS CloudWatch Logs Insights**, allowing complex SQL-like queries across your entire agentic history.
- **Audit Trail**: A dedicated `AuditService` captures every node transition, input, and output, logging it with a specific `log_type: "AUDIT_EVENT"` for easy filtering in production.
- **LangSmith Integration**: Full tracing of LLM calls, tool executions, and graph state transitions.

### 5. Multi-Agent Microservice Ecosystem
The Orchestrator acts as the central brain, but delegates specific domain tasks to a fleet of specialized microservice agents communicating asynchronously via **RabbitMQ**:
- **Logistics Agent**: Handles order cancellation and tracking workflows.
- **Resolution Agent**: Handles refund processing and financial compensation workflows.
- **Guardian Agent**: Acts as an "AI-in-the-loop" gatekeeper, reviewing and approving the actions of the Logistics and Resolution agents before they execute.
- **Review Agent**: Analyzes historical chat data to provide actionable insights and metrics to human administrators.

---

## 🌟 Core Pillars

Our architecture is built upon five foundational pillars to ensure enterprise readiness:

- **Scalability**: By hosting each agent (Orchestrator, Logistics, Resolution) in separate microservices, we can scale them independently based on load (e.g., scaling the Logistics agent during holiday shipping seasons). RabbitMQ acts as a buffer to handle traffic spikes.
- **Flexibility**: The event-driven RabbitMQ architecture allows us to easily plug in new agents (e.g., a "Billing Agent") without modifying the core Orchestrator logic.
- **Security**: The Orchestrator redacts PII before passing context to downstream agents. The Guardian agent acts as a strict security gatekeeper, ensuring no destructive actions (like refunds) occur without policy compliance.
- **Explainability**: Every agent logs its reasoning and state transitions as structured JSON to CloudWatch. The Review Agent continuously analyzes chat histories to provide human-readable insights to admins.
- **Governance**: The system enforces "AI-in-the-loop" and "Human-in-the-loop" governance. The Guardian agent enforces strict business policies on other agents, aligning with frameworks like IMDA's Model AI Governance Framework.

---

## 🧠 Techniques & Architecture

### **State-Based Orchestration (LangGraph)**
The system uses a directed acyclic graph (DAG) to manage the conversation flow. Unlike linear chains, this allows for:
- **Sticky Routing**: The AI stays in a specific "Intent" (e.g., `REFUND_REQUEST`) until the SOP is completed.
- **Conditional Edges**: The graph can branch to an "Escalation" node if validation fails or if the user requests a human.
- **Persistence**: Every node execution is a "checkpoint," allowing the system to resume from any point in the graph.

### **Controller-Service Architecture**
The backend follows a clean architecture pattern to decouple transport layers from business logic:
- **OrchestratorController**: A centralized hub that handles chat processing (HTTP/WebSocket) and agent callbacks. It delegates core logic to the service layer.
- **OrchestratorService**: Contains the core business logic, LangGraph execution, and session management.
- **Shared Processing Logic**: Both HTTP and WebSocket chat paths utilize the same `processChat` pipeline in the service, ensuring consistent behavior across all communication channels.

### **LangGraph State (`OrchestratorState`)**
The `OrchestratorState` is the source of truth for the LangGraph workflow. It is persisted in the `ChatSession` entity.

| State Variable | Type | Description |
| :--- | :--- | :--- |
| `messages` | `BaseMessage[]` | The history of the conversation (Human and AI messages). |
| `summary` | `string` | A rolling summary of older conversation context to stay within token limits. |
| `current_intent` | `string \| null` | The currently active routing intent code (e.g., `REFUND_REQUEST`). Acts as a "sticky session" for the agent. |
| `decomposed_intents` | `Array<{intent: string, query: string}>` | The current batch of intents being processed in parallel. |
| `remaining_intents` | `Array<{intent: string, query: string}>` | The queue of remaining intents to process in subsequent turns. |
| `order_states` | `Record<string, any>` | A map of order IDs to their current processing state/data. |
| `user_orders` | `any[]` | A list of orders associated with the user, fetched during the session. |
| `is_awaiting_confirmation` | `boolean` | Flag indicating the orchestrator is waiting for user confirmation before proceeding with an action. |
| `multi_intent_acknowledged` | `boolean` | Flag used to track if the user has acknowledged that multiple intents were detected. |
| `last_evaluation` | `any` | The result of the last output evaluation (safety/quality check). |
| `retry_count` | `number` | Counter for internal retries if a node fails or evaluation fails. |
| `layers` | `Layer[]` | A list of processing layers (e.g., `input_validation`, `routing`) and their status for UI feedback. |

> **Note on Redundancy:** The `active_agent` state was removed as it was redundant with `current_intent`. Both served to track the currently active agent/intent for sticky sessions.

### **PII Tokenization & Redaction**
To ensure privacy, sensitive data is never sent to the LLM in its raw form:
1.  **Detection**: Uses `compromise` (NLP) for names/places and Regex for structured data (Emails/Cards).
2.  **Tokenization**: Replaces PII with unique tokens (e.g., `REDACTED_EMAIL_a1b2c3d4`).
3.  **Secure Storage**: Original values are stored in Redis (or memory fallback) with a 1-hour expiry.
4.  **De-tokenization**: Backend systems can swap tokens back for original values when authorized.

### **Slot Filling & SOP Execution**
The Central Router uses a "Slot Filling" technique to gather required information:
- **Intent Mapping**: Maps user messages to specific SOP codes (e.g., `REFUND_REQUEST`).
- **Entity Extraction**: Uses a strong LLM to extract specific fields (Order ID, Email, Reason) from the conversation.
- **Missing Data Detection**: Compares extracted data against the SOP's `requiredData` list and prompts the user for missing fields.

### **Self-Correction (Output Evaluation)**
Every AI response is evaluated by a separate "Critic" node before being shown to the user:
- **Safety Check**: Ensures no PII leaked into the response.
- **Accuracy Check**: Verifies the response matches the user's input and the current SOP state.
- **Leakage Prevention**: Scans for internal tool names, system instructions, or agent-specific identifiers.
- **Retry Logic**: If the evaluation fails, the graph triggers a **Self-Correction Node** that uses the evaluator's feedback to generate a safe, accurate response.

### **9. Structured Output & Fallbacks**
- **Decision**: Implement a robust fallback mechanism for structured data extraction in nodes like `SopHandlerNode`.
- **Rationale**: While high-reasoning models (GPT-5.4, Gemini 3.1 Pro) natively support `withStructuredOutput`, the use of **Multi-Model Fallbacks** (via LangChain's `RunnableWithFallbacks`) often obscures these specific methods in the resulting runnable object.
- **Justification**: To maintain 100% uptime and resilience across different model providers, the system detects if `withStructuredOutput` is available at runtime. If not, it falls back to **Prompt-Based JSON Extraction**. This ensures that even during primary model outages or when using fallback models, the agent can still reliably extract structured entities (Order IDs, Emails, Reasons) from raw text responses using strict JSON formatting instructions.
- **Log Reference**: `[SopHandlerNode] strongModel does not support withStructuredOutput directly. Using prompt-based JSON extraction.`

---

## 🛠️ Graph Nodes & Workflow Context

The AI Orchestrator is built as a stateful graph where each node performs a specific task and passes its results through the `OrchestratorState`.

### **1. Preprocessing Node**
- **Purpose**: The entry point for every user message. It ensures safety and fetches initial context.
- **Context Received**:
  - `messages`: The raw user input.
  - `user_id`: Used to fetch the user's recent order history.
- **Outputs**:
  - `messages`: Redacted version of the user input.
  - `user_orders`: List of recent orders for the user.
  - `is_input_valid`: Boolean flag for safety check.
- **Actions**:
  - **PII Redaction**: Redacts sensitive data before it reaches any LLM.
  - **Input Validation**: Scans for prompt injection or toxic content.
  - **Context Fetching**: Retrieves recent orders to provide the AI with immediate background.

### **2. Routing Node**
- **Purpose**: Determines the user's intent and sets the "sticky" intent for the session.
- **Context Received**:
  - `messages`: Recent conversation history.
  - `summary`: Structured memory of the session.
  - `user_orders`: User's order history for intent disambiguation.
- **Outputs**:
  - `current_intent`: The specific SOP or FAQ intent code.
  - `decomposed_intents`: The current batch of intents being processed in parallel.
  - `remaining_intents`: The queue of remaining intents to process in subsequent turns.
- **Actions**:
  - **Intent Classification**: Classifies the message into specific intents.
  - **Intent Detection**: Identifies specific SOP codes (e.g., `REFUND_REQUEST`).
  - **Multi-Intent Queueing**: If multiple requests are detected, it queues them for sequential processing.

### **3. FAQ Handler Node**
- **Purpose**: Provides instant, high-accuracy answers to common questions.
- **Context Received**:
  - `messages`: The user's specific question.
  - `current_intent`: The detected FAQ intent code.
- **Outputs**:
  - `messages`: Appends the verified answer as an `AIMessage`.
- **Actions**:
  - **Knowledge Retrieval**: Fetches the verified answer from the Postgres database (RAG).
  - **Direct Response**: Bypasses complex SOP logic for simple informational queries.

### **4. SOP Retrieval Node**
- **Purpose**: Loads the specific Standard Operating Procedure (SOP) for the detected intent.
- **Context Received**:
  - `current_intent`: The intent code used to look up the SOP.
- **Outputs**:
  - `current_sop`: The full SOP definition (required fields, owner, etc.).
- **Actions**:
  - **Schema Loading**: Retrieves the `requiredData` fields and `agentOwner` for the task.

### **5. Dialogue Node**
- **Purpose**: The core interaction engine. It manages the conversation, gathers data, and triggers actions.
- **Context Received**:
  - `messages`: **Recent History (Sliding Window)**. Uses the last 5 turns to maintain immediate context.
  - `summary`: **Long-term Memory**. Provides the background of the entire conversation without consuming excessive tokens.
  - `current_sop`: The active SOP definition.
  - `order_states`: Currently gathered data (e.g., `orderId`, `reason`).
  - `is_awaiting_confirmation`: Whether the AI is waiting for a "YES/NO" from the user.
- **Outputs**:
  - `messages`: Appends the AI's response (question, confirmation, or handoff).
  - `order_states`: Updated map of gathered entities (Slot Filling).
  - `is_awaiting_confirmation`: Boolean flag for the confirmation step.
- **Actions**:
  - **Slot Filling**: Identifies missing information and asks the user for it.
  - **Confirmation Flow**: Summarizes gathered data and asks for final approval.
  - **Tool Execution**: Triggers background handoffs (Logistics/Resolution) using specialized tools.
  - **Multi-Intent Guidance**: Manages transitions between multiple queued intents.

### **6. Output Validation Node (The Critic)**
- **Purpose**: A safety and quality gate that inspects AI responses before they are shown to the user.
- **Context Received**:
  - `messages`: The generated AI response and the original user input.
  - `order_states`: The data the AI *should* have used.
- **Outputs**:
  - `last_evaluation`: JSON object containing `isSafe`, `isHallucination`, and `isLeakage` flags.
- **Actions**:
  - **PII Leakage Check**: Ensures no sensitive data was accidentally included.
  - **Hallucination Check**: Verifies the AI didn't invent order details or status.
  - **Safety Score**: Assigns a pass/fail score based on professional standards.

### **7. Self-Correction Node**
- **Purpose**: Automatically fixes responses that failed validation.
- **Context Received**:
  - `last_evaluation`: The specific issues identified by the Critic.
  - `messages`: The failed AI response.
- **Outputs**:
  - `messages`: Replaces the failed response with a corrected `AIMessage`.
  - `retry_count`: Increments the internal retry counter.
- **Actions**:
  - **Programmatic Repair**: Uses the evaluator's feedback to rewrite the response, removing PII or correcting inaccuracies.

### **8. Summarization Node**
- **Purpose**: Maintains the long-term memory of the session and keeps the context window clean.
- **Context Received**:
  - `messages`: **Unsummarized History**. The messages that haven't been compressed into the summary yet.
  - `summary`: The previous summary state.
- **Outputs**:
  - `summary`: The updated structured summary.
  - `messages`: Trims the history, keeping only the most recent turns.
- **Actions**:
  - **Incremental Summarization**: Updates the 6-pillar summary (Goal, Facts, History, Status, Actions, Sentiment).
  - **History Trimming**: After summarization, it trims the `messages` array in the state to only the most recent turns, preventing state bloat.

---

## 📐 Design Strategy

The orchestrator is built on four core design principles to ensure enterprise-grade reliability:

1. **Modular State Machine (LangGraph)**: Moving away from monolithic, fragile prompts to a Directed Acyclic Graph (DAG). Each node has a single responsibility (e.g., Extract, Validate, Summarize), making the system highly testable, debuggable, and predictable.
2. **Resiliency via Fallbacks**: The system assumes external dependencies (LLMs, APIs) will fail. It implements cross-provider LLM fallbacks (e.g., OpenAI to Google) and structural fallbacks (Prompt-based JSON vs. native structured outputs) to guarantee maximum uptime.
3. **Asynchronous & Event-Driven**: Designed for real-world customer support where actions (like checking a warehouse) take time. WebSockets provide real-time user feedback, while asynchronous callbacks allow external systems to update the orchestrator without blocking the main thread.
4. **Separation of Concerns**: Strict adherence to the Controller-Service pattern. The transport layer (HTTP/WS) is completely decoupled from the AI orchestration logic, allowing seamless scaling and protocol swaps.

## 🔐 Security Strategy

Our security posture treats the LLM as an untrusted entity, employing a **Defense in Depth** approach:

1. **Zero Trust Execution**: The AI cannot autonomously execute side-effecting actions (e.g., issuing a refund). It must stage the action and explicitly request **Human-in-the-Loop (HITL)** confirmation from the user.
2. **Data Minimization (Tokenization)**: Sensitive user data (PII) is intercepted and replaced with secure tokens (e.g., `REDACTED_EMAIL_X`) *before* leaving our infrastructure. The LLM only reasons over tokens, ensuring compliance with GDPR/CCPA.
3. **Input & Output Guardrails**: 
   - *Pre-processing*: Defends against prompt injection, jailbreaks, and malicious payloads (Base64/Hex).
   - *Post-processing (The Critic)*: A secondary, isolated LLM evaluates the primary LLM's output for hallucinations, toxicity, and internal data leakage before the user sees it.
4. **Cloud-Native Auditing**: 100% of state transitions, inputs, and outputs are logged as structured JSON to AWS CloudWatch, providing an immutable, queryable audit trail for security forensics.

---

## 🏗️ Architecture Deep Dive: The "Why" Behind the Design

This system was designed with **Safety**, **Observability**, and **Scalability** in mind. Below are the key architectural choices, the alternatives we rejected, and the advanced agentic patterns employed.

### 1. Multi-Agent Microservices + RabbitMQ vs. Single Omni-Agent Monolith
- **The Decision:** We split the system into an Orchestrator and specialized downstream agents (Logistics, Resolution, Guardian) communicating via RabbitMQ.
- **Why:** A single LLM handling both "Where is my driver?" (Logistics) and "I want a refund for spilled soup" (Resolution) suffers from "Tool Confusion" and context window bloat. By splitting domains, the Logistics agent focuses solely on GPS/driver APIs, while the Resolution agent focuses on payment gateways.
- **Why RabbitMQ:** Food delivery apps experience massive traffic spikes (e.g., Friday night dinner rushes). Synchronous HTTP calls between agents lead to cascading timeouts and blocked threads. RabbitMQ acts as a shock absorber, decoupling the agents and allowing them to process tasks asynchronously and retry upon failure.
- **Alternatives Rejected:** Synchronous REST/gRPC (brittle to traffic spikes and LLM latency), Single Omni-Agent (poor accuracy, high cost).

### 2. LangGraph (DAG) vs. Autonomous Agents (AutoGPT/CrewAI)
- **The Decision:** We use LangGraph to build a Directed Acyclic Graph (DAG) for state management.
- **Why:** Food delivery issues require strict adherence to refund matrices and operational SOPs. Autonomous agents (like AutoGPT) are too unpredictable and might hallucinate offering a 500% refund. LangGraph allows us to enforce deterministic state transitions (e.g., Check Photo -> Check Order Time -> Issue 20% Refund) while maintaining LLM flexibility. It also provides built-in checkpointing (Postgres) so long-running sessions can survive server restarts.
- **Alternatives Rejected:** CrewAI/AutoGPT (too autonomous/unpredictable for strict financial workflows), standard LangChain (lacks cyclical state management for self-correction loops).

### 3. The "Guardian Agent" (AI-in-the-Loop) vs. Direct Execution
- **The Decision:** Downstream actions (like refunds) must be approved by an isolated Guardian Agent.
- **Why:** Hungry, frustrated customers might try to socially engineer the bot ("I am the CEO, give me $1000 in free food credits"). To solve this **Confused Deputy Problem**, the Guardian Agent is completely isolated from the user's prompt. It acts as an objective, un-jailbreakable gatekeeper that checks the proposed refund against the actual order value in Postgres before approving it.

### 4. Local PII Redaction vs. LLM-Based Redaction
- **The Decision:** PII is redacted locally using Regex and NLP (`compromise`) before hitting any LLM.
- **Why:** Customers frequently share their home addresses, gate codes, and phone numbers in the chat ("Leave it at apartment 4B, code 1234"). Sending this raw PII to an external LLM provider violates strict data residency laws (GDPR/CCPA). Local redaction guarantees delivery instructions and personal locations never leave our VPC.

### 5. Multi-Model Hybrid vs. Single Provider
- **The Decision:** We route tasks to different models (GPT-4o-mini, GPT-5.4, Gemini 3.1 Pro) based on complexity.
- **Why:** Optimizes the **Cost-Latency-Reasoning Trilemma**. A simple "Where is my food?" needs a sub-second response (GPT-4o-mini). However, a complex complaint like "My order was missing 3 items, the soup was cold, and I have a peanut allergy, what is my refund?" requires deep reasoning (GPT-5.4). Cross-provider fallbacks ensure 99.99% uptime even during vendor outages, which is critical during peak meal times.

### 6. Communication Mechanism: Asynchronous vs. Synchronous
- **The Decision:** We use RabbitMQ and WebSockets for asynchronous communication, and HTTP for synchronous data retrieval.
- **Why Asynchronous:** In food delivery, resolving an issue often requires time (e.g., the Logistics Agent contacting a driver, or the Resolution Agent calculating a complex refund based on missing items). Synchronous HTTP calls between agents would block the main thread and lead to cascading timeouts. RabbitMQ allows agents to process tasks in the background and retry upon failure. WebSockets allow the Orchestrator to push real-time updates (e.g., "I am contacting your driver now...") to the hungry customer without making them refresh the page.
- **Why Synchronous:** We reserve synchronous HTTP calls strictly for fast, deterministic operations, such as querying the Postgres database for order history or fetching an SOP definition, where immediate data retrieval is required to construct the LLM prompt.

### Advanced Agentic Design Patterns Employed
- **Prompt Chaining:** Instead of one massive prompt, we break complex tasks into sequential LLM calls (e.g., Classify Intent as "Missing Item" -> Extract Entities like "Burger" -> Generate Response "I'll refund the burger"). This reduces token bloat and drastically improves accuracy.
- **Parallel Processing:** When a user has a multi-intent query (e.g., "Where is my driver and can I add fries?"), we execute these LLM calls and API requests concurrently (querying the driver GPS API and the restaurant menu API at the same time) to minimize latency.
- **Evaluator-Optimizer (Actor-Critic):** The Orchestrator generates a response (Actor), but before sending it to the user, the Output Evaluator (Critic) scores it for safety and accuracy. This ensures the bot doesn't accidentally promise a refund for an order that hasn't even been delivered yet. If it fails, it loops back for self-correction.
- **Slot-Filling & State Hydration:** Agents do not just generate text; their primary goal is to hydrate a structured JSON state object (e.g., extracting `order_id`, `missing_item_name`, and `photo_evidence_url` to process a refund).
- **Rolling Context Window Management:** To prevent the LLM from "forgetting" instructions as the chat history grows, the Summarizer node continuously compresses older turns into a dense "Key Facts" summary. If a customer complains about a missing drink, asks about a future order, then goes back to the drink, the bot remembers the context without blowing up token limits.
- **Semantic vs. Deterministic Routing:** We use semantic routing (LLMs) to classify the user's intent (e.g., "My pizza is squished" -> `REFUND_REQUEST`), followed by **Deterministic Routing** (code/graph edges) to direct the flow to the Resolution Agent. This prevents the LLM from accidentally routing a refund request to a generic FAQ node.

## 🧪 Testing & CI/CD

The orchestrator includes a comprehensive test suite powered by **Jest**, covering:
- **Unit Tests**: Fast, isolated tests for services and utilities (`npm run test:unit`).
- **Coverage**: Automated coverage reporting via Jest (`npm run test:coverage`).
- **Functional Tests**: Validating routing and node logic.
- **Adversarial Tests**: Testing guardrails against prompt injection and PII leaks.
- **Workflow Tests**: End-to-end validation of complex SOPs (e.g., Refund, Cancellation).

### CI/CD Pipeline
The project uses **GitHub Actions** (`.github/workflows/test.yml`) to automatically run the Jest test suite and generate coverage reports on every push and pull request to the `main` branch.

### Deployment Strategy
- **Containerization:** Dockerized NestJS application.
- **Shadow Deployment:** When testing new LLM models or prompts, we deploy a "Shadow Agent" alongside the production agent. Using RabbitMQ's fanout capabilities, the shadow agent receives real user traffic and generates responses, but these responses are only logged for the Review Agent to evaluate, never sent to the user. This allows risk-free performance evaluation in production.
- **Canary Deployment:** For live rollouts, we route a small percentage (e.g., 5%) of live traffic to the new agent version. We monitor the Output Evaluator (Critic) pass rates and error logs. If stable, traffic is gradually increased to 100%.

### LLM as a Judge
For complex workflow evaluations, we use an **LLM as a Judge** pattern. A high-reasoning model (GPT-5.4) evaluates the agent's response against the expected outcome, providing a score and reasoning. This allows for more nuanced testing than simple string matching.

### LangSmith Integration
All tests and production traces are integrated with **LangSmith** for deep observability.
- **Tracing**: Full visibility into every node execution, tool call, and LLM interaction.
- **Evaluation**: Automated evaluation of test runs using custom evaluators and LLM judges.
- **Feedback Loops**: Capturing user feedback to continuously improve model performance.

To run the latest workflow tests:
```bash
npm run test:refund-cancellation
```

---

## 🔄 Workflow Diagrams

### **1. FAQ Workflow**
Used for simple questions that have a verified answer in the knowledge base.
`Preprocessing` → `Routing` → `FAQ Handler` → `Output Validation` → `Summarization`

### **2. SOP Workflow (First Message)**
Triggered when the user starts a new request (e.g., "I want a refund").
`Preprocessing` → `Routing` → `SOP Retrieval` → `Dialogue` → `Output Validation` → `Summarization`

### **3. SOP Workflow (Subsequent Messages)**
Triggered during an active SOP as the AI gathers missing data (Slot Filling).
`Preprocessing` → `Routing (Sticky)` → `SOP Retrieval` → `Dialogue` → `Output Validation` → `Summarization`
*(Note: Routing node returns early because an intent is already active).*

### **4. General / Small Talk Workflow**
Fallback for queries that don't match a specific SOP or FAQ.
`Preprocessing` → `Routing` → `Dialogue` → `Output Validation` → `Summarization`

### **5. Safety Failure (Input)**
Triggered when the user's message fails the safety check.
`Preprocessing` → `Summarization` → `END`

### **6. Quality Failure (Output)**
Triggered when the AI response fails the Critic's evaluation.
`...` → `Output Validation` → `Self-Correction` → `Output Validation` → `Summarization`

---

1.  **User Input**: Message received via **WebSocket** (or HTTP fallback).
2.  **PII Redaction**: Sensitive data replaced with tokens (stored in Redis).
3.  **Input Validation**: Safety check (Jailbreak, Toxicity).
4.  **Intent Classification**: Classify into specific intents (e.g., `REFUND_REQUEST`, `FAQ`).
5.  **Central Router (SOP Agent)**:
    -   Identify Intent.
    -   Extract required data (Slot Filling).
    -   If data missing -> Ask user for specific details.
    -   If data complete -> Generate summary and ask for **User Confirmation**.
    -   If confirmed -> Trigger **Asynchronous Handoff** to backend agent.
6.  **Output Evaluation**: Check if the response is safe and accurate.
7.  **Summarization**: Update conversation summary for long-term context.
8.  **Response**: Send back to user via **WebSocket** (or HTTP).
9.  **Agent Callback**: External agents call `/api/callback/*` to update the orchestrator with results, which are then broadcasted to the user via WebSocket.

---

## 🛡️ OWASP Top 10 for LLM Applications - Defenses

This orchestrator is designed with a "Security-First" architecture, implementing specific mitigations for the **OWASP Top 10 for LLM Applications**:

| Vulnerability | Mitigation Strategy in this Orchestrator |
| :--- | :--- |
| **LLM01: Prompt Injection** | **Multi-Layer Validation**: `InputValidatorService` uses keyword filtering, regex for obfuscated payloads (Base64/Hex), and character-level manipulation detection. The `IntentClassifier` prompt includes "Security First" instructions to ignore context-based overrides. |
| **LLM02: Insecure Output Handling** | **Output Evaluation**: `OutputEvaluatorService` programmatically scans for XSS (HTML/JS tags) and uses an LLM "Critic" to flag internal leakage or malicious instructions before they reach the user. |
| **LLM03: Training Data Poisoning** | *N/A (This system uses pre-trained models and does not perform online fine-tuning).* |
| **LLM04: Model Denial of Service** | **Input Constraints**: Strict length limits (300 chars) and "Excessive Repetition" detection in `InputValidatorService` prevent resource exhaustion attacks. |
| **LLM05: Supply Chain Vulnerabilities** | **Dependency Auditing**: Uses trusted libraries like `LangGraph` and `@google/genai`. All external clients (Knowledge, Orders) are isolated via service layers. |
| **LLM06: Sensitive Information Disclosure** | **PII Redaction Layer**: A dedicated `PiiRedactionService` tokenizes sensitive data (Emails, Phones, SSNs) before it ever reaches the LLM. `OutputEvaluator` also scans for accidental leakage of system prompts or SOP codes. |
| **LLM07: Insecure Plugin Design** | **Human-in-the-Loop**: No side-effect actions (like processing a refund) occur without explicit user confirmation. All "plugins" (Clients) are read-only or require a multi-step verification flow. |
| **LLM08: Excessive Agency** | **Restricted SOPs**: The AI is confined to specific Standard Operating Procedures. It cannot "drift" into unauthorized actions because the `IntentClassifier` and `SopService` strictly define the available state transitions. |
| **LLM09: Overreliance** | **Self-Correction**: The `OutputEvaluator` cross-references AI responses against context facts and SOP requirements to ensure accuracy and prevent hallucinations. |
| **LLM10: Model Theft** | *N/A (The system uses hosted API models with standard authentication/authorization).* |

---

## 📂 Project Structure

```text
├── src/
│   ├── modules/                  # Modular AI Components
│   │   ├── clients/              # External API Clients
│   │   ├── input-validator/      # Layer 1: Safety & Jailbreak Detection
│   │   ├── output-evaluator/     # Layer 5: Response Quality Evaluation
│   │   ├── pii-redaction/        # Layer 2: PII Detection & Tokenization
│   │   ├── intent-classifier/      # Layer 3: Category Classification
│   │   └── summarizer/           # Conversation Summarization
│   ├── orchestrator-agent/       # Core Orchestration Logic (LangGraph)
│   │   ├── entities/             # Database Entities (TypeORM)
│   │   ├── nodes/                # Individual LangGraph Nodes
│   │   ├── prompts/              # Prompts used by the orchestrator
│   │   ├── tools/                # Tools used by the orchestrator
│   │   ├── utils/                # Utility functions
│   │   ├── checkpointer.ts       # LangGraph Checkpointing logic
│   │   ├── database.ts           # TypeORM & Postgres Setup
│   │   ├── graph.ts              # LangGraph Workflow Definition
│   │   ├── orchestrator.controller.ts # Centralized Request & Callback Handler
│   │   ├── orchestrator.module.ts # NestJS Module for Orchestrator
│   │   ├── orchestrator.service.ts # Core Orchestration Service
│   │   ├── session.controller.ts # Session Management API
│   │   └── state.ts              # Orchestrator State Schema
│   ├── app.module.ts             # NestJS Root Module
│   └── main.ts                   # NestJS Entry Point
├── tests/                        # Centralized Test Suite
│   └── modules/
│       ├── input-validator/      # Security & Adversarial Tests
│       ├── output-evaluator/     # Quality & Hallucination Tests
│       ├── pii-redaction/        # Redaction & Retrieval Tests
│       └── intent-classifier/      # Routing & Classification Tests
├── .env.example                  # Environment variable configuration
├── .gitignore                    # Git ignore rules
├── package.json                  # Project dependencies and scripts
├── README.md                     # Project documentation
└── tsconfig.json                 # TypeScript configuration
```

---

## 🛠️ Tech Stack

- **Backend**: Node.js (NestJS), LangGraph (orchestration), TypeORM (persistence), WebSocket (ws).
- **AI Models**: 
  - **GPT-5.4 / Gemini 3.1 Pro**: Complex reasoning & SOP execution.
  - **GPT-5.4-Mini / Gemini 3 Flash**: High-speed validation & routing.
- **Storage**: Postgres (Single source of truth for Graph State, Chat History, Orders, SOPs, FAQs), Redis (Ephemeral PII Tokens).

## ⚙️ Setup & Installation

### 1. Prerequisites
- Node.js 20+
- An OpenAI API Key.
- (Optional) Redis and Postgres instances.

### 2. Environment Variables
Create a `.env` file based on `.env.example`:
```env
OPENAI_API_KEY="your_api_key_here"
DATABASE_URL="postgres://user:password@localhost:5432/db"
REDIS_URL="redis://localhost:6379"
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Unit Tests & Coverage
To run the Jest unit test suite and generate a coverage report:
```bash
npm run test:unit
npm run test:coverage
```

### 5. Run Input Validator Tests
To verify the security and accuracy of the input validation layer, run:
```bash
npm run test:input-validator
```

### 6. Run Adversarial Red-Team Test
To stress-test the system with LLM-generated attacks and an LLM-as-a-Judge, run:
```bash
npm run test:adversarial
```

### 7. Run Output Evaluator Tests
To verify the accuracy of the output evaluation layer, run:
```bash
npm run test:output-evaluator
```

### 8. Run Output Adversarial Red-Team Test
To stress-test the output evaluator with LLM-generated adversarial outputs, run:
```bash
npm run test:output-adversarial
```

### 📊 Monitoring with LangSmith

The system is fully integrated with **LangSmith** for real-time tracing, debugging, and performance monitoring.

#### **Production Monitoring**
To enable tracing for the live application:
1.  Set `LANGSMITH_TRACING=true` in your environment secrets.
2.  Provide your `LANGSMITH_API_KEY`.
3.  Set `LANGSMITH_PROJECT` (e.g., `AI-Orchestrator-Prod`).
4.  All traces will include metadata (e.g., `environment: production`) and tags (e.g., `orchestrator`, `guardrail`) for easy filtering.

#### **Test Monitoring**
To monitor and trace all test results (including LLM calls and validation logic):
1.  Set `LANGSMITH_PROJECT` to a test-specific project (e.g., `AI-Orchestrator-Tests`).
2.  Run your tests as usual (`npm run test:...`).
3.  All subsequent test runs will be automatically traced to your LangSmith dashboard.

---

## 🚀 Future Roadmap & Improvements

To further elevate the food delivery customer experience, the following architectural and feature enhancements are planned:

- **Multimodal Vision Integration:** Integrating Vision LLMs (e.g., GPT-4o Vision) into the Resolution Agent to automatically analyze user-uploaded photos of damaged food, instantly verifying claims without human intervention.
- **Proactive Agentic Outreach:** Shifting from reactive to proactive support. If the Logistics Agent detects a severe driver delay via GPS, the Orchestrator will preemptively message the user with an apology and a discount credit before they even open a support ticket.
- **Voice-Enabled Support (STT/TTS):** Integrating WebRTC with Speech-to-Text and Text-to-Speech models to provide hands-free support for drivers on the road and customers who are busy cooking.
- **Model Fine-Tuning via RLHF:** Utilizing our structured JSON logs in Postgres and CloudWatch, combined with human admin corrections, to fine-tune a smaller, specialized open-source model (e.g., Llama 3 8B). This will reduce API costs and latency while maintaining high accuracy for our specific food delivery domain.
- **Advanced GraphRAG:** Implementing Knowledge Graphs to handle complex, multi-hop queries about cross-contamination, dietary restrictions, and restaurant menus much more reliably than standard vector search.

---
