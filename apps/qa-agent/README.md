# Orchestrator Agent

This microservice acts as the orchestrator in the multi-agent AI system. It receives customer requests, identifies intent, collects order context, and routes tasks to other agents.

## Getting Started

```bash
cd apps/orchestrator-agent
npm install
npm run start:dev
```

## Key Concepts

- **LangChain**: Integrate with chains and agents to process language input.
- **NestJS**: Follows standard module/controller/service structure.

You can expand with additional modules for intent classification, routing logic, and communication with other microservices.
