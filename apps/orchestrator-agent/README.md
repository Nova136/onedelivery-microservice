# Orchestrator Agent

The Orchestrator Agent is the central intelligent routing and reasoning hub of the OneDelivery microservice architecture. Built on top of **LangChain** and **LangGraph**, it handles user interactions, manages conversational memory, enforces guardrails, and dynamically delegates tasks to specialized sub-agents.

## Architecture Overview

The Orchestrator uses a stateful multi-step reasoning loop (compiled via `StateGraph` in LangGraph) powered by the `gpt-4o-mini` LLM. The core workflow loops through a maximum of 10 iterations per request, following this cycle:

1. **Agent Node (`agentNode`)**: The LLM evaluates the prompt, chat history, and available tools to decide whether to respond directly or invoke a tool.
2. **Tools Node (`toolsNode`)**: Executes selected tools, captures their output, handles errors (Circuit Breaker), and dynamically binds newly unlocked tools based on Standard Operating Procedures (SOPs).
3. **Evaluator Node (`evaluatorNode`)**: Acts as a final guardrail. It evaluates the drafted AI response against current context and backend actions. If approved, the response is finalized; if rejected, the agent is forced to rewrite it.

### Request Pipeline

When a user message is received (`processChat`), it undergoes a strict pipeline before hitting the LLM:

1. **PII Redaction**: Strips sensitive information via `PrivacyService`.
2. **Input Validation**: Checks for injection/abuse via `ModerationService`.
3. **Context Preparation**: Loads chat history, applies sliding windows, and summarizes older context.
4. **Agent Reasoning Loop**: The LangGraph state machine executes.
5. **Response Sanitization**: Strips hidden `<thinking>` tags for a clean user experience.
6. **Persistence**: Saves the final response back to the database.

## Agentic Design Patterns Implemented

The Orchestrator leverages several advanced AI design patterns to ensure reliability, accuracy, and safety:

- **Multi-Agent Orchestration (Supervisor Pattern)**: Acts as a central router that delegates complex, domain-specific tasks to specialized sub-agents (e.g., Logistics, Resolution) via TCP microservice communication.
- **Dynamic Tool Binding (Just-In-Time Capabilities)**: To prevent prompt bloat and hallucination, the agent starts with minimal tools. Additional tools are dynamically bound to the LLM's active registry only when explicitly authorized by an SOP.
- **Evaluator / Reflection Node (Output Guardrails)**: Implements a "Critique and Revise" loop. Before a response is sent to the user, an evaluation node analyzes the draft. If it violates rules (e.g., leaking tool names), the agent is forced to rewrite its answer.
- **Sliding Window & Rolling Summary Memory**: Combines short-term raw conversational memory with long-term background summarization to maintain context without exceeding LLM token limits.
- **ReAct (Reason + Act) Loop**: Utilizes a cyclic reasoning loop within LangGraph, allowing the agent to plan, execute tools, observe outcomes, and evaluate them over up to 10 iterations.

## State Management (`GraphState`)

The LangGraph state tracks the entire lifecycle of a single request:

- `contextWindow`: The sliding window of recent user/AI messages + the overarching session summary.
- `scratchpad`: Intermediate reasoning steps, tool calls, and tool messages for the current iteration.
- `activeToolNames`: The list of tools currently available to the LLM.
- `circuitBreakerTriggered`: A flag to halt execution and return a fallback error message if a tool fails critically.
- `iterations`: Tracks the number of loops to prevent infinite loops (max 10).
- `userId`, `sessionId`, `activeOrderId`, `message`: Contextual routing metadata.

## Memory & Summarization

The agent implements an advanced memory management strategy via `MemoryService`:

- **Sliding Window**: Keeps the last `6` messages (`CHAT_HISTORY_WINDOW_SIZE`) in raw format for immediate context.
- **Rolling Summarization**: When unsummarized overflow reaches `4` messages (`SUMMARIZE_BATCH_SIZE`), it triggers a background LLM summarization process. This summary is injected into the context window as a `SystemMessage`, ensuring the LLM remembers past context without bloating the token limit.

## Dynamic Tool Binding & SOPs

To prevent prompt bloat and keep the agent focused, the Orchestrator starts with a limited set of default tools:

- `Search_Internal_SOP`
- `Search_FAQ`
- `Escalate_To_Human`

When a user makes a specific request (e.g., "Cancel my order"), the agent uses `Search_Internal_SOP` with an intent code (e.g., `CANCEL_ORDER`). The Knowledge Microservice returns the SOP, which outlines:

1. **Required Data**: Fields the agent must collect before proceeding (e.g., `orderId`, `description`).
2. **Workflow Steps**: Step-by-step instructions.
3. **Permitted Tools**: Tools required to execute the workflow (e.g., `Route_To_Logistics`).

The Orchestrator dynamically detects permitted tools in the SOP output and binds them to the LLM's active tool list (`Dynamic Tool Binding`), granting the agent new capabilities precisely when needed.

## Sub-Agent Tool Registry

The Orchestrator delegates specialized tasks to domain-specific agents using the following tools via TCP microservice communication (`AgentsClientService`):

### 1. `Search_Internal_SOP`

- **Purpose**: Fetches the internal rulebook from the Knowledge Microservice.
- **Usage**: Must be used first for any actionable request to understand required parameters and unlock downstream tools.

### 2. `Get_User_Recent_Orders`

- **Purpose**: Queries the Order Microservice for recent orders.
- **Usage**: Used to contextually determine the `orderId` when the user asks about an order without explicitly providing the ID.

### 3. `Route_To_Logistics`

- **Purpose**: Delegates order tracking, modifications, and order cancellation intake to the Logistics Agent.
- **Payload**: Requires `userId`, `sessionId`, `action`, and optionally `orderId` and `description`.

### 4. `Route_To_Resolution`

- **Purpose**: Delegates issue resolution and refund calculations/intake to the Resolution Agent.
- **Payload**: Requires `userId`, `sessionId`, `action` (`request_refund`), `issueCategory`, `description`, and affected `items`.

### 5. `End_Chat_Session`

- **Purpose**: Ends the chat session and handoff to QA agent Serves to review the message exchange between the user and AI for data analysis purposes.
- **Payload**: Requires `userId` and `sessionId`.

### 6. `Escalate_To_Human`

- **Purpose**: Requests a handoff to a human support agent.
- **Usage**: Triggered by explicit user request, extreme abuse, or when an SOP dictates manual review is required.

## Security & Guardrails

- **PII Redaction**: All incoming user messages are scrubbed.
- **Input Moderation**: Blocks prompt injections and abusive content before processing.
- **Output Evaluation (Evaluator Node)**: A dedicated LangGraph node checks the drafted LLM response against context. It enforces internal safety guidelines and prevents the agent from leaking internal tools, intents, or unverified claims before the user sees the message.
- **Circuit Breaker**: If any tool throws a `System Error:`, the Orchestrator halts execution and returns a standardized technical difficulty message.
