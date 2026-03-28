# WebSocket Chat — Frontend Integration Guide

The orchestrator chat uses a WebSocket connection for real-time async messaging. The client sends a message and receives the AI reply as a push event — no polling required.

## Endpoints

| Environment | URL |
|-------------|-----|
| Local dev | `ws://localhost:8000/ws` |
| Production | `wss://{api-gateway-id}.execute-api.ap-southeast-1.amazonaws.com/prod` |

The production URL is available as the `websocket_url` Terraform output after `terraform apply`.

---

## Authentication

Authentication is handled at **connection time** via a JWT passed as a query parameter. The token must belong to a user with role `User` or `Admin`.

```
ws://localhost:8000/ws?token=<JWT>[&sessionId=<existing-session-id>]
```

| Query param | Required | Description |
|-------------|----------|-------------|
| `token` | Yes | JWT obtained from `POST /user/auth/login` |
| `sessionId` | No | Resume an existing chat session. Omit to start a new one. |

The connection is **rejected immediately** (close code `4001`) if:
- `token` is missing, expired, or has an invalid signature
- The user's role is not `User` or `Admin`
- The user has exceeded the rate limit (20 messages/minute by default)

---

## Connection lifecycle

```
Client                         Server
  │                               │
  │── WS Upgrade ?token=<JWT> ───>│  JWT validated, rate limit checked
  │<─ 101 Switching Protocols ────│  connection accepted
  │                               │
  │── { action: "sendMessage" } ──│  message queued to RabbitMQ
  │<─ { ack: true }               │  immediate acknowledgement
  │                               │  (orchestrator-agent processes async)
  │<─ { reply, sessionId } ───────│  AI reply pushed when ready (seconds later)
  │                               │
  │── WS Close ───────────────────│  session state preserved in DB
```

The reply arrives **asynchronously** — typically 3–15 seconds depending on the complexity of the query. The `ack` response confirms the message was queued, not that it was answered.

---

## Message format

### Sending a message

```json
{
  "action": "sendMessage",
  "message": "Where is my order?",
  "sessionId": "session-abc123"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `action` | Yes | Must be `"sendMessage"` |
| `message` | Yes | The user's chat message (non-empty string) |
| `sessionId` | No | Override the session for this message. Defaults to the session established at connect time. |

### Receiving a reply

```json
{
  "reply": "Your order #ORD-9821 is out for delivery and will arrive by 6pm today.",
  "sessionId": "session-abc123"
}
```

### Acknowledgement (sent immediately after queueing)

```json
{ "ack": true }
```

### Error responses

```json
{ "error": "message is required" }
{ "error": "Rate limit exceeded" }
{ "error": "Failed to queue message" }
```

---

## Rate limiting

Each user is limited to **20 messages per minute** (1-minute tumbling window, counted per `userId` from the JWT — not per connection). Exceeding the limit:

- At **connect time**: connection is rejected with close code `4001`
- During an **active session**: the server sends `{ "error": "Rate limit exceeded" }` and the connection stays open

---

## Example — plain JavaScript

```js
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9...'; // from login response
const SESSION_ID = 'session-abc123';       // optional: resume existing session

const url = new URL('ws://localhost:8000/ws');
url.searchParams.set('token', TOKEN);
url.searchParams.set('sessionId', SESSION_ID); // omit to start fresh

const ws = new WebSocket(url.toString());

ws.addEventListener('open', () => {
  console.log('Connected');
});

ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.ack) {
    // Message queued — show a "thinking..." indicator
    console.log('Message queued, waiting for reply...');
    return;
  }

  if (data.error) {
    console.error('Error:', data.error);
    return;
  }

  if (data.reply) {
    // AI reply received — render in chat UI
    console.log('Reply:', data.reply);
  }
});

ws.addEventListener('close', (event) => {
  console.log(`Disconnected: code=${event.code} reason=${event.reason}`);
  // code 4001 = auth failure (bad token, wrong role, rate limited at connect)
});

ws.addEventListener('error', (event) => {
  console.error('WebSocket error', event);
});

function sendMessage(message, sessionId) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ action: 'sendMessage', message, sessionId }));
}
```

---

## Example — TypeScript / React hook

```ts
import { useEffect, useRef, useCallback } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UseWsChatOptions {
  token: string;
  sessionId?: string;
  onReply: (reply: string, sessionId: string) => void;
  onError?: (message: string) => void;
}

export function useWsChat({ token, sessionId, onReply, onError }: UseWsChatOptions) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = new URL(
      process.env.NODE_ENV === 'production'
        ? (process.env.NEXT_PUBLIC_WS_URL ?? 'wss://REPLACE_ME')
        : 'ws://localhost:8000/ws',
    );
    url.searchParams.set('token', token);
    if (sessionId) url.searchParams.set('sessionId', sessionId);

    const ws = new WebSocket(url.toString());
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      if (data.reply)  onReply(data.reply, data.sessionId);
      if (data.error)  onError?.(data.error);
    };

    ws.onclose = (event) => {
      if (event.code === 4001) onError?.(`Auth failed: ${event.reason}`);
    };

    return () => ws.close();
  }, [token, sessionId]);

  const sendMessage = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'sendMessage', message, sessionId }));
    }
  }, [sessionId]);

  return { sendMessage };
}
```

Usage in a component:

```tsx
const { sendMessage } = useWsChat({
  token: authToken,
  sessionId: currentSessionId,
  onReply: (reply, sid) => setMessages(prev => [...prev, { role: 'assistant', content: reply }]),
  onError: (err) => toast.error(err),
});

// On form submit:
sendMessage(inputValue);
setMessages(prev => [...prev, { role: 'user', content: inputValue }]);
```

---

## Session management

Chat history is stored server-side. You can retrieve it over HTTP after the session (the existing REST endpoints are unchanged):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /orchestrator-agent/get-history-listing` | Bearer token | List all sessions for the current user |
| `POST /orchestrator-agent/get-chat-history` | Bearer token | Full message history for a session |
| `POST /orchestrator-agent/end-chat-session` | Bearer token | Close a session (triggers QA review) |

The `sessionId` returned in WebSocket replies is the same ID used by these REST endpoints.

---

## Reconnection

The server does not automatically reconnect. Implement exponential backoff on the client:

```ts
function connectWithRetry(token: string, attempt = 0) {
  const ws = new WebSocket(`ws://localhost:8000/ws?token=${token}`);

  ws.onclose = (event) => {
    if (event.code === 4001) return; // auth failure — don't retry
    const delay = Math.min(1000 * 2 ** attempt, 30_000);
    setTimeout(() => connectWithRetry(token, attempt + 1), delay);
  };

  return ws;
}
```

---

## Local dev quick test (wscat)

```bash
# Install wscat
npm install -g wscat

# Get a token first (replace with a real user)
TOKEN=$(curl -s -X POST http://localhost:8000/user/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"password"}' | jq -r '.token')

# Connect
wscat -c "ws://localhost:8000/ws?token=$TOKEN"

# Send a message (after connected)
> {"action":"sendMessage","message":"Where is my order?"}
```
