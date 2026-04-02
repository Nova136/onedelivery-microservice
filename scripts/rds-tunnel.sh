#!/usr/bin/env bash
# Opens an SSM port-forward tunnel from localhost:5433 → RDS:5432 via a running ECS task.
# Usage: ./scripts/rds-tunnel.sh [service] [local-port]
#   service    ECS service to tunnel through (default: user)
#   local-port Local port to bind                (default: 5433)
#
# Connect pgAdmin to: localhost:<local-port>, DB=onedelivery, user=postgres (see .env.cloud)

set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-onedelivery}"
REGION="${AWS_REGION:-ap-southeast-1}"
CLUSTER="onedelivery-cluster"
SERVICE="${1:-user}"
LOCAL_PORT="${2:-5433}"
RDS_HOST="onedelivery-postgres.chqkmym8y08l.ap-southeast-1.rds.amazonaws.com"
RDS_PORT="5432"

export AWS_PROFILE

echo "==> Looking up running task for service '$SERVICE'..."
TASK_ARN=$(aws ecs list-tasks \
  --cluster "$CLUSTER" \
  --service-name "$SERVICE" \
  --region "$REGION" \
  --query 'taskArns[0]' \
  --output text)

if [ -z "$TASK_ARN" ] || [ "$TASK_ARN" = "None" ]; then
  echo "ERROR: No running tasks found for service '$SERVICE'." >&2
  exit 1
fi

TASK_ID=$(basename "$TASK_ARN")
echo "==> Task: $TASK_ID"

echo "==> Fetching container runtime ID..."
RUNTIME_ID=$(aws ecs describe-tasks \
  --cluster "$CLUSTER" \
  --tasks "$TASK_ID" \
  --region "$REGION" \
  --query 'tasks[0].containers[0].runtimeId' \
  --output text)

if [ -z "$RUNTIME_ID" ] || [ "$RUNTIME_ID" = "None" ]; then
  echo "ERROR: Could not get runtime ID. Is ECS Exec enabled on the service?" >&2
  echo "       Run: aws ecs update-service --cluster $CLUSTER --service $SERVICE --enable-execute-command --force-new-deployment --region $REGION" >&2
  exit 1
fi

SSM_TARGET="ecs:${CLUSTER}_${TASK_ID}_${RUNTIME_ID}"
echo "==> SSM target: $SSM_TARGET"
echo ""
echo "==> Opening tunnel: localhost:${LOCAL_PORT} -> ${RDS_HOST}:${RDS_PORT}"
echo "    Connect pgAdmin to: localhost:${LOCAL_PORT} (DB=onedelivery, user=postgres)"
echo "    Press Ctrl+C to close the tunnel."
echo ""

aws ssm start-session \
  --target "$SSM_TARGET" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "{\"host\":[\"${RDS_HOST}\"],\"portNumber\":[\"${RDS_PORT}\"],\"localPortNumber\":[\"${LOCAL_PORT}\"]}" \
  --region "$REGION"
