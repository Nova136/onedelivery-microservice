# 🧪 AI Orchestrator Testing Guide

This guide provides a comprehensive overview of the testing strategy, tools, and workflows for the AI Customer Support Orchestrator. It is designed to help developers and QA engineers verify the system's safety, accuracy, and reliability.

---

## 🏗️ Testing Architecture

The orchestrator uses a multi-tiered testing approach to ensure every layer of the AI pipeline functions correctly.

### 1. **Tier 1: Guardrails & Safety (Input/Output Validation)**
- **Purpose**: To prevent prompt injection, toxicity, PII leakage, and hallucinations.
- **Tests**:
  - `tests/modules/input-validator/`: Verifies that malicious or off-topic inputs are blocked.
  - `tests/modules/output-evaluator/`: Verifies that AI responses are safe, accurate, and free of internal leakage.
- **Command**: `npm run test:input-validator` | `npm run test:output-evaluator`

### 2. **Tier 2: Intent Classification (Semantic Router)**
- **Purpose**: To ensure user messages are correctly mapped to the right SOP or FAQ.
- **Tests**:
  - `tests/modules/semantic-router/`: Tests classification accuracy across various categories (Logistics, Resolution, FAQ).
- **Command**: `npm run test:semantic-router`

### 3. **Tier 3: Workflow Execution (SOPs)**
- **Purpose**: To verify end-to-end execution of complex Standard Operating Procedures (SOPs).
- **Tests**:
  - `tests/workflows/refund-cancellation.test.ts`: Validates the `REQUEST_REFUND` and `CANCEL_ORDER` workflows.
  - `tests/orchestrator-workflows.functional.test.ts`: General functional tests for the LangGraph state machine.
- **Command**: `npm run test:refund-cancellation`

### 4. **Tier 4: Adversarial (Red-Teaming)**
- **Purpose**: To stress-test the system with LLM-generated attacks.
- **Tests**:
  - `tests/modules/input-validator/input-validator.adversarial.test.ts`: Uses a "Red-Team" LLM to generate complex jailbreak attempts.
- **Command**: `npm run test:input-validator-adversarial`

---

## 🧠 Key Testing Concepts

### **LLM as a Judge**
Since AI responses are non-deterministic, we use a high-reasoning model (**GPT-5.4**) to act as a judge. The judge evaluates the agent's response against a set of criteria:
- **Accuracy**: Did the agent follow the SOP correctly?
- **Completeness**: Did it gather all required fields?
- **Tone**: Is the response professional and empathetic?
- **Safety**: Did it avoid leaking internal codes or PII?

### **LangSmith Integration**
All tests are integrated with **LangSmith** for deep observability.
- **Tracing**: Every node execution, tool call, and LLM prompt is recorded.
- **Evaluation**: Automated evaluators in LangSmith provide scores and feedback for every test run.
- **Project**: Set `LANGSMITH_PROJECT=AI-Orchestrator-Tests` to see test traces.

---

## 📋 Specific Workflow Scenarios

### **1. Refund Workflow (`REQUEST_REFUND`)**
The refund workflow is a multi-turn process that requires specific data based on the issue category.

| Scenario | Input | Expected Agent Behavior |
| :--- | :--- | :--- |
| **Missing Category** | "I want a refund for order #12345" | Ask for the issue category (Missing, Wrong, Quality, Late). |
| **Missing Items** | "I have missing items in order #12345" | Ask for the specific item names and quantities. |
| **Full Data** | "The food was cold in order #12345" | Summarize the details and ask for **User Confirmation**. |
| **Confirmation** | "Yes, that's correct" | Execute the `Route_To_Resolution` tool and provide a handoff message. |

### **2. Cancellation Workflow (`CANCEL_ORDER`)**
Requires a reason (description) before proceeding.

| Scenario | Input | Expected Agent Behavior |
| :--- | :--- | :--- |
| **Missing Reason** | "Cancel my order #9999" | Ask for the reason for cancellation. |
| **Full Data** | "Cancel order #9999 because it's too late" | Summarize the reason and ask for **User Confirmation**. |
| **Confirmation** | "Proceed" | Execute the `Route_To_Logistics` tool. |

### **3. FAQ Workflow**
Handles simple informational queries directly from the knowledge base.

| Scenario | Input | Expected Agent Behavior |
| :--- | :--- | :--- |
| **General FAQ** | "What is your refund policy?" | Provide the verified answer from the knowledge base instantly. |

### **4. Multi-Intent Handling**
If a user asks multiple things (e.g., "Where is my order and I want a refund"), the system:
1. Detects both intents.
2. Acknowledges the multiple requests.
3. Guides the user through each one **sequentially**.

---

## 🧪 Manual Testing Scenarios (Seed Data)

These scenarios use the data from `OrderSeeder` to verify specific edge cases and standard workflows.

### **1. Refund: Missing Item (Delivered)**
- **Order ID**: `FD-0000-000001`
- **Status**: `DELIVERED`
- **Items**: `Hainanese Chicken Rice` ($5.5), `Laksa` ($6.5)
- **Payload**: "I want a refund for my order FD-0000-000001. The Laksa was missing."
- **Expected Output**:
  - AI acknowledges the order and the missing item.
  - AI asks for confirmation: "I've noted that the Laksa was missing from order FD-0000-000001. Is that correct?"
  - **Tool Call (on "Yes")**: `Route_To_Resolution` with `issueCategory: "missing_item"`, `items: [{name: "Laksa", quantity: 1}]`.

### **2. Cancellation: Standard (Created)**
- **Order ID**: `FD-0000-000002`
- **Status**: `CREATED`
- **Payload**: "Cancel my order FD-0000-000002 please. I changed my mind."
- **Expected Output**:
  - AI acknowledges the cancellation request.
  - AI asks for confirmation: "You'd like to cancel order FD-0000-000002 because you changed your mind. Correct?"
  - **Tool Call (on "Yes")**: `Route_To_Logistics` with `description: "I changed my mind."`.

### **3. Cancellation: Late Delivery (In-Delivery)**
- **Order ID**: `FD-0000-000004`
- **Status**: `IN_DELIVERY` (Created 4 hours ago)
- **Payload**: "My order FD-0000-000004 is taking too long. Cancel it."
- **Expected Output**:
  - AI detects the order is significantly late (4 hours).
  - AI confirms: "I see order FD-0000-000004 is indeed delayed. I can help cancel it for you. Confirm?"
  - **Tool Call (on "Yes")**: `Route_To_Logistics` with `description: "Order is significantly delayed (4 hours). User requested cancellation."`.

### **4. Refund: High Value Quality Issue**
- **Order ID**: `FD-0000-000009`
- **Status**: `DELIVERED`
- **Total Value**: $55.0
- **Payload**: "I need a refund for FD-0000-000009. The Whole Lobster was completely spoiled."
- **Expected Output**:
  - AI acknowledges the quality issue for the high-value item.
  - AI asks for confirmation.
  - **Tool Call (on "Yes")**: `Route_To_Resolution` with `issueCategory: "quality_issue"`, `description: "The Whole Lobster was completely spoiled."`.

---

## 🔄 Advanced Interaction Scenarios

These scenarios test the orchestrator's ability to handle complex conversation flows, multiple requests, and topic changes.

### **1. Multi-Intent Handling (FAQ + SOP)**
- **Payload**: "What is your refund policy? Also, I want a refund for order FD-0000-000001 because the food was cold."
- **Expected Output**:
  - AI identifies two intents: `faq` and `REQUEST_REFUND`.
  - AI first answers the FAQ: "Our refund policy allows for requests within 24 hours of delivery..."
  - AI then seamlessly transitions to the refund: "Now, regarding your refund for order FD-0000-000001, I've noted it was a quality issue (cold food). Is that correct?"
  - **Goal**: Verify the AI doesn't ignore one of the requests.

### **2. Intent Switching (SOP -> FAQ -> SOP)**
- **Turn 1**: "I want a refund for FD-0000-000001."
- **AI Response**: "I can help with that. What was the issue?"
- **Turn 2 (Switch)**: "Wait, do you deliver to Sentosa?"
- **AI Response**: "Yes, we deliver to Sentosa daily from 10 AM to 10 PM. Now, back to your refund for order FD-0000-000001, could you tell me what the issue was?"
- **Goal**: Verify "Sticky Routing" where the AI returns to the active task after answering a side question.

### **3. Explicit Reset**
- **Turn 1**: "I want to cancel order FD-0000-000002."
- **AI Response**: "I can help with that. Why do you want to cancel?"
- **Turn 2**: "Actually, forget it. Let's start over. I want to ask about my points."
- **AI Response**: "No problem! I've cleared your previous request. How can I help you with your points?"
- **Goal**: Verify the `reset` intent correctly clears the `current_intent` and `order_states`.

### **4. Escalation (High Frustration)**
- **Payload**: "This is the third time my order is late! I'm going to sue you guys! Connect me to a human manager RIGHT NOW!"
- **Expected Output**:
  - AI identifies the `escalate` intent due to high frustration and legal threats.
  - AI Response: "I'm very sorry for the repeated issues and your frustration. I am connecting you to a senior human manager immediately to resolve this."
  - **Goal**: Verify the safety layer prioritizes escalation over standard SOPs when frustration is extreme.

### **5. End Session**
- **Payload**: "That's all for today, thank you for your help. Bye!"
- **Expected Output**:
  - AI identifies `end_session`.
  - AI Response: "You're very welcome! I'm glad I could help. Have a great day, goodbye!"
  - **Goal**: Verify the AI gracefully closes the conversation.

### **6. Out-of-Scope / Unsupported Intents**
These scenarios test the `general` intent and the system's ability to politely decline requests that are outside the scope of OneDelivery's services.

| Scenario | Payload | Expected Agent Behavior |
| :--- | :--- | :--- |
| **Medical Advice** | "How do I treat a fever?" | "I'm sorry, I cannot provide medical advice. Please consult a healthcare professional. I can only help with OneDelivery orders." |
| **Competitor Comparison** | "Is Grab better than OneDelivery?" | "I'm here to assist you with OneDelivery services. I can't provide comparisons with other platforms, but I'd be happy to help with your current order!" |
| **Financial Advice** | "What stocks should I buy?" | "I'm a delivery assistant and cannot provide financial advice. Is there anything related to your OneDelivery account I can help with?" |
| **General Knowledge** | "Who won the World Cup in 2022?" | "That's an interesting question, but I'm specialized in OneDelivery support. If you have any questions about your food or delivery, feel free to ask!" |
| **Gibberish / Vague** | "asdfghjkl" or "help" (with no context) | "I'm sorry, I didn't quite catch that. Could you please describe how I can help you with your OneDelivery service today?" |

---

## 🛠️ How to Run Tests

### **Environment Setup**
Ensure your `.env` file contains:
```env
OPENAI_API_KEY="your_key"
GEMINI_API_KEY="your_key"
LANGSMITH_TRACING=true
LANGSMITH_API_KEY="your_key"
LANGSMITH_PROJECT="AI-Orchestrator-Tests"
```

### **Running Test Suites**
```bash
# Run all workflow tests (Refund/Cancellation)
npm run test:refund-cancellation

# Run input safety tests
npm run test:input-validator
npm run test:input-validator-adversarial

# Run output quality tests
npm run test:output-evaluator
npm run test:output-evaluator-adversarial

# Run semantic routing tests
npm run test:semantic-router
npm run test:semantic-router-adversarial

# Run general orchestrator functional tests
npm run test:workflows
```

---

## 🔍 Troubleshooting

- **"TypeError: strongModel.withStructuredOutput is not a function"**: This occurs if the model provided to the node doesn't support structured output directly. The `SopHandlerNode` now includes a fallback, but ensure your test mocks provide a valid model object.
- **"Target content not found"**: If you are modifying tests, ensure the line numbers and content match the latest version of the file.
- **Timeout Errors**: LLM calls can sometimes take longer than the default test timeout. Increase the timeout in your test configuration if necessary.

---

*Last Updated: March 29, 2026*
