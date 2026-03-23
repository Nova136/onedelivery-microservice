# Logistics Agent: Isolated Testing Guide

This guide outlines the test scenarios for the **Logistics Agent** in isolation. Testing this agent directly bypasses the Orchestrator, allowing you to specifically validate the Standard Operating Procedure (SOP) logic, mathematical SLA checks, and deterministic tool execution.

## How to Test

You can test these scenarios by sending a POST request directly to the Logistics Agent's HTTP fallback endpoint, or by running the isolated LangSmith evaluation script (`npm run eval` in the `apps/logistics-agent` directory).

**Endpoint:** `POST http://localhost:3011/logistics/execute` (Adjust port as necessary)

---

## Phase 1: Standard Cancellations

### Test 1: Standard Cancellation (Created Status)

**Scenario:** The order has just been created and has not started preparation or delivery. It should be eligible for standard cancellation without SLA math checks.

**Input Payload:**

```json
{
    "userId": "test-user-1",
    "sessionId": "test-session-1",
    "action": "cancel_order",
    "orderId": "FD-0000-000002"
}
```

**Expected Output:**

> Starts with `SUCCESS:` (e.g., "SUCCESS: Order successfully cancelled and refunded")

### Test 2: Cancellation Rejection (Already Delivered)

**Scenario:** The order has already been delivered to the customer. The SOP strictly forbids cancelling delivered orders.

**Input Payload:**

```json
{
    "userId": "test-user-2",
    "sessionId": "test-session-2",
    "action": "cancel_order",
    "orderId": "FD-0000-000001"
}
```

**Expected Output:**

> Starts with `REJECTED:` (e.g., "REJECTED: Order has already been delivered.")

---

## Phase 2: SLA & Late Delivery Logic

### Test 3: Late Delivery Cancellation (Over 3 hours)

**Scenario:** The order is currently `IN_DELIVERY`, but the timestamp shows it is more than 3 hours late. The agent must calculate the difference between the 'updatedAt' field and the 'CURRENT SYSTEM TIME' to allow the late-cancellation exception.

**Input Payload:**

```json
{
    "userId": "test-user-3",
    "sessionId": "test-session-3",
    "action": "cancel_order",
    "orderId": "FD-0000-000004"
}
```

**Expected Output:**

> Starts with `SUCCESS:` (Confirming the exception was met and Guardian approved)

### Test 4: Standard Out for Delivery Rejection (Under 3 hours)

**Scenario:** The order is `IN_DELIVERY` but is _not_ over 3 hours late. The agent must do the math, recognize it's within the acceptable SLA window, and reject the cancellation request.

**Input Payload:**

```json
{
    "userId": "test-user-4",
    "sessionId": "test-session-4",
    "action": "cancel_order",
    "orderId": "FD-0000-000008"
}
```

**Expected Output:**

> Starts with `REJECTED:` (e.g., "REJECTED: The food is currently out for delivery and cannot be cancelled.")

---

## Phase 3: Edge Cases & Fallbacks

### Test 5: Missing or Invalid Data

**Scenario:** The agent is sent an invalid or hallucinated order ID that doesn't exist, or no order ID at all. It must strictly fallback to a rejection without hallucinating details.

**Input Payload:**

```json
{
    "userId": "test-user-5",
    "sessionId": "test-session-5",
    "action": "cancel_order",
    "orderId": "INVALID-ID-999"
}
```

**Expected Output:**

> Starts with `REJECTED:` (Fallback rule prevents processing)
