# ECS task definitions

A single **generic** task definition is used for all microservices. The script generates one JSON per service and pushes to AWS.

## Files

- **task-definition.json** – Generic template. Every occurrence of `${MICROSERVICE_NAME}` is replaced with each microservice name.
- **microservice.txt** – One microservice name per line (e.g. order, logistics, payment, audit, user). Defines which services get a task definition.

## Generate resolved definitions and deploy to AWS

From the repo root:

```bash
node scripts/deploy-task-definitions.js
```

The script:

1. Reads `task-definition.json` and `microservice.txt`.
2. For each name in `microservice.txt`, replaces `${MICROSERVICE_NAME}` in the template.
3. Writes `.aws/task-definitions/resolved/<name>.json`.
4. Registers each with `aws ecs register-task-definition`.
5. Updates the ECS service with `aws ecs update-service ... --force-new-deployment`.
6. Deregisters all previous task definition revisions for that family (keeps only the new one).

**Requirements:** AWS CLI installed and configured (credentials and region). Ensure the ECS cluster and services already exist (e.g. from Terraform).

**Env (optional):**

- `ECS_CLUSTER` – ECS cluster name (default: `onedelivery-cluster`).
- `AWS_REGION` – AWS region (default: `ap-southeast-1`).

## Adding a new microservice

1. Add the name to `microservice.txt` (one line).
2. Ensure the generic `task-definition.json` fits the new service (family, container name, image, and log group all use `${MICROSERVICE_NAME}`).
3. Run `node scripts/deploy-task-definitions.js` after creating the ECS service (e.g. via Terraform).
