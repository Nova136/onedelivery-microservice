# AI Customer Support Orchestrator

A production-ready, multi-layer AI Orchestrator built with **LangGraph**, **Express**, and **React**. This system handles complex customer support workflows with built-in PII redaction, input/output validation, and durable state management.

## 🚀 Key Features

### 1. Multi-Layer AI Pipeline
The orchestrator processes every message through a series of specialized layers:
- **PII Redaction**: Automatically detects and tokenizes sensitive data (Emails, Phones, Names) using NLP and Regex.
- **Summarizer**: Maintains a high-fidelity, structured summary (Current Goal, Key Facts, Agent History, Status & Resolutions, Pending Actions, User Sentiment) to ensure continuity across agent handoffs and long sessions.
- **Input Validation**: Guards against prompt injection, toxicity, and off-topic queries using a security-first prompt.
- **Semantic Routing**: Classifies user intent into specific SOP or FAQ codes.
- **Central Router (SOP Agent)**: Executes Standard Operating Procedures (SOPs) with slot-filling capabilities.
- **Output Evaluation**: A self-correcting layer that validates AI responses for safety and accuracy before they reach the user.

### 2. Advanced Intent Management
- **Multi-Intent Guidance**: Detects when a user asks multiple questions at once and guides them through each one sequentially.
- **Confirmation Flow**: Summarizes gathered information and asks for user confirmation before triggering backend handoffs.
- **FAQ Knowledge Base**: Integrated with a mock knowledge client to answer common questions instantly.

### 3. Durable & Scalable Infrastructure
- **Postgres Checkpointer**: Uses LangGraph's checkpointer to persist conversation state across server restarts. The AI never forgets where it was in a multi-turn SOP.
- **Redis Token Storage**: PII tokens are stored in Redis with a **1-hour TTL** for security. Includes an automatic **In-Memory Fallback** if Redis is unavailable.
- **Real-Time WebSocket Chat**: Bi-directional communication for instant chat responses and live "Agent Updates" (e.g., "Refund Processed").
- **Asynchronous Agent Callbacks**: Dedicated API endpoints for external agents (Logistics, Resolution) to push task results back to the orchestrator. Callbacks are context-aware, prioritizing **Order ID** or **Request ID** to handle multiple concurrent requests in a single session without ambiguity.
- **Anonymized Handoffs**: Internal agent names (e.g., "Logistics Agent") are hidden from the end user. The AI refers to them as "specialized teams" to maintain a professional, customer-facing interface.

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
  - **Semantic Routing**: Classifies the message into specific intents.
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
  - **Knowledge Retrieval**: Fetches the verified answer from the mock knowledge client.
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

## 🏗️ AI Architectural Decisions

This system was designed with **Safety**, **Observability**, and **Scalability** in mind. Below are the key AI architectural choices and their justifications:

### **1. Model Strategy: Multi-Model Hybrid Approach**
- **Decision**: Deploy a tiered model architecture that pairs high-reasoning "Strong" models with high-throughput "Light" models, backed by a cross-provider fallback system.
- **Rationale**: No single model is optimal for all tasks. By using a hybrid approach, we achieve:
  - **Reliability**: Cross-cloud fallback (OpenAI -> Google) ensures high availability even during provider-specific outages.
  - **Performance**: Simple tasks (routing, validation) use sub-second latency models, while complex tasks (SOPs) use high-reasoning models.
  - **Cost Optimization**: 80% of tasks are handled by "mini/flash" models, significantly reducing operational costs compared to a monolithic architecture.
  - **State-of-the-Art Reasoning**: Leveraging the **GPT-5.4** series for its superior chain-of-thought reasoning and tool-calling precision.

### **2. Model Selection & Comparison**

| Tier | Primary Model | Fallback Model | Rationale |
| :--- | :--- | :--- | :--- |
| **Reasoning** | `gpt-5.4` | `gemini-3.1-pro` | Used for complex SOP execution, self-correction, and output evaluation. GPT-5.4 offers superior reasoning and tool precision for these high-stakes tasks. |
| **Intelligence** | `gpt-5.4-mini` | `gemini-3-flash` | Used for routing, FAQ handling, and aggregation. GPT-5.4-mini provides enhanced classification accuracy over 4o-mini while maintaining good performance. |
| **Latency** | `gpt-4o-mini` | `gemini-3-flash` | Used for critical, low-latency tasks like input validation and summarization. GPT-4o-mini is optimized for ultra-fast response times and cost-efficiency. |

### **3. Model Strategy: Multi-Model Hybrid Approach**

We employ a **Multi-Model Hybrid Approach** to balance reasoning depth, latency, and cost:

1.  **GPT-5.4 (Reasoning Tier)**: Selected for tasks requiring deep logical deduction and precise tool usage. While it has higher latency and cost than mini models, its ability to handle complex SOPs without hallucination is critical.
2.  **GPT-5.4-mini (Intelligence Tier)**: A balanced model that offers significantly better reasoning than 4o-mini, making it ideal for the Semantic Router where intent classification accuracy is paramount.
3.  **GPT-4o-mini (Latency Tier)**: The "speed demon" of the stack. It handles the initial guardrails (Input Validator) and background tasks (Summarizer) to ensure the user perceives a highly responsive system.
4.  **Gemini 3 Series (Fallback Tier)**: Provides robust redundancy. `gemini-3.1-pro` matches GPT-5.4 in reasoning for critical fallbacks, while `gemini-3-flash` ensures the system remains operational even during OpenAI outages.

### **4. Orchestration: LangGraph (vs. Simple Chains)**
- **Decision**: Use LangGraph for state management and workflow orchestration.
- **Alternative**: Linear LangChain sequences or custom state machines.
- **Why**: LangGraph provides a robust way to handle **loops** (e.g., retrying output evaluation) and **state persistence**. The built-in checkpointer ensures that if a server restarts, the AI can resume exactly where it left off in a complex SOP.

### **4. PII Redaction: Hybrid Regex + NLP (vs. LLM-only)**
- **Decision**: Use local NLP (`compromise`) and Regex for PII detection.
- **Alternative**: Sending raw text to an LLM for redaction.
- **Why**: **Privacy First**. By redacting PII locally before it ever reaches an external API, we minimize the risk of sensitive data leakage. It is also significantly faster and cheaper than using LLM tokens for basic pattern matching.

### **5. Self-Correction Loop: Critic-Actor Pattern**
- **Decision**: Implement an `OutputEvaluator` node that acts as a "Critic" for the `CentralRouter`'s output.
- **Why**: Even strong models like GPT-4o can occasionally hallucinate or leak internal SOP codes. By having a separate node (often with a different system prompt) evaluate the output, we create a "double-check" mechanism that can trigger a retry or escalation if the response is unsafe or inaccurate.

### **6. Dynamic Intent Classification**
- **Decision**: Inject category-specific intents into the `IntentClassifier` prompt at runtime.
- **Why**: Instead of having one massive prompt with 50+ intents, the system first routes to a category (e.g., *Logistics*) and then only loads the intents relevant to that category. This reduces token usage, improves accuracy, and makes the system easier to maintain as new SOPs are added.

### **7. Real-Time Communication: WebSocket (vs. HTTP Polling)**
- **Decision**: Use WebSockets for primary chat interactions and agent updates.
- **Why**: Provides lower latency for chat responses and enables the server to push "Agent Updates" asynchronously as backend tasks complete, creating a more interactive and responsive user experience.

### **8. Decoupled Architecture: Controller Pattern**
- **Decision**: Use a dedicated `OrchestratorController` to manage request handling.
- **Why**: Separates the transport layer (HTTP/WebSocket) from the orchestration logic, making the system easier to test, maintain, and extend with new communication protocols.

## 🧪 Testing & Evaluation

The orchestrator includes a comprehensive test suite covering:
- **Functional Tests**: Validating routing and node logic.
- **Adversarial Tests**: Testing guardrails against prompt injection and PII leaks.
- **Workflow Tests**: End-to-end validation of complex SOPs (e.g., Refund, Cancellation).

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
4.  **Semantic Routing**: Classify into specific intents (e.g., `REFUND_REQUEST`, `FAQ`).
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
| **LLM01: Prompt Injection** | **Multi-Layer Validation**: `InputValidatorService` uses keyword filtering, regex for obfuscated payloads (Base64/Hex), and character-level manipulation detection. The `SemanticRouter` prompt includes "Security First" instructions to ignore context-based overrides. |
| **LLM02: Insecure Output Handling** | **Output Evaluation**: `OutputEvaluatorService` programmatically scans for XSS (HTML/JS tags) and uses an LLM "Critic" to flag internal leakage or malicious instructions before they reach the user. |
| **LLM03: Training Data Poisoning** | *N/A (This system uses pre-trained models and does not perform online fine-tuning).* |
| **LLM04: Model Denial of Service** | **Input Constraints**: Strict length limits (300 chars) and "Excessive Repetition" detection in `InputValidatorService` prevent resource exhaustion attacks. |
| **LLM05: Supply Chain Vulnerabilities** | **Dependency Auditing**: Uses trusted libraries like `LangGraph` and `@google/genai`. All external clients (Knowledge, Orders) are isolated via service layers. |
| **LLM06: Sensitive Information Disclosure** | **PII Redaction Layer**: A dedicated `PiiRedactionService` tokenizes sensitive data (Emails, Phones, SSNs) before it ever reaches the LLM. `OutputEvaluator` also scans for accidental leakage of system prompts or SOP codes. |
| **LLM07: Insecure Plugin Design** | **Human-in-the-Loop**: No side-effect actions (like processing a refund) occur without explicit user confirmation. All "plugins" (Clients) are read-only or require a multi-step verification flow. |
| **LLM08: Excessive Agency** | **Restricted SOPs**: The AI is confined to specific Standard Operating Procedures. It cannot "drift" into unauthorized actions because the `SemanticRouter` and `SopService` strictly define the available state transitions. |
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
│   │   ├── semantic-router/      # Layer 3: Category Classification
│   │   └── summarizer/           # Conversation Summarization
│   ├── orchestrator-agent/       # Core Orchestration Logic (LangGraph)
│   │   ├── entities/             # Database Entities (TypeORM)
│   │   ├── nodes/                # Individual LangGraph Nodes
│   │   ├── prompts/              # Prompts used by the orchestrator
│   │   ├── tools/                # Tools used by the orchestrator
│   │   ├── utils/                # Utility functions
│   │   ├── checkpointer.ts       # LangGraph Checkpointing logic
│   │   ├── database.ts           # TypeORM & SQLite Setup
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
│       └── semantic-router/      # Routing & Classification Tests
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
- **Storage**: Postgres (Graph State), SQLite (Chat History), Redis (PII Tokens).

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

### 4. Run Input Validator Tests
To verify the security and accuracy of the input validation layer, run:
```bash
npm run test:input-validator
```

### 5. Run Adversarial Red-Team Test
To stress-test the system with LLM-generated attacks and an LLM-as-a-Judge, run:
```bash
npm run test:adversarial
```

### 6. Run Output Evaluator Tests
To verify the accuracy of the output evaluation layer, run:
```bash
npm run test:output-evaluator
```

### 7. Run Output Adversarial Red-Team Test
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
