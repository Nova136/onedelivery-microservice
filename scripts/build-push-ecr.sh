#!/usr/bin/env bash
# =============================================================================
# build-push-ecr.sh — Build Docker images locally and push to AWS ECR
#
# Usage:
#   ./scripts/build-push-ecr.sh                      # build & push all services
#   ./scripts/build-push-ecr.sh user order payment   # build & push specific services
#
# Prerequisites:
#   - Docker running
#   - AWS CLI configured (AWS_PROFILE=onedelivery or env vars set)
#   - jq installed
#
# Environment overrides:
#   AWS_PROFILE   default: onedelivery
#   AWS_REGION    default: ap-southeast-1
#   IMAGE_TAG     default: git short SHA
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
AWS_PROFILE="${AWS_PROFILE:-onedelivery}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"
ACCOUNT_ID=$(AWS_PROFILE=$AWS_PROFILE aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
DOCKERFILE=".docker/Dockerfile.template"
SERVICE_LIST=".github/workflows/microservice.list"

# ---------------------------------------------------------------------------
# Port map (mirrors stage-build-push.yml)
# ---------------------------------------------------------------------------
get_port() {
  case "$1" in
    audit)              echo "9001" ;;
    logistics)          echo "9002" ;;
    order)              echo "9003" ;;
    payment)            echo "9004" ;;
    user)               echo "9005" ;;
    incident)           echo "9006" ;;
    knowledge)          echo "9007" ;;
    orchestrator-agent) echo "9010" ;;
    logistics-agent)    echo "9011" ;;
    resolution-agent)   echo "9012" ;;
    guardian-agent)     echo "9013" ;;
    qa-agent)           echo "9014" ;;
    *)                  echo "80"   ;;
  esac
}

# ---------------------------------------------------------------------------
# Resolve which services to build
# ---------------------------------------------------------------------------
if [[ $# -gt 0 ]]; then
  SERVICES=("$@")
else
  mapfile -t SERVICES < <(sed '/^[[:space:]]*$/d' "$SERVICE_LIST")
fi

# ---------------------------------------------------------------------------
# ECR login
# ---------------------------------------------------------------------------
echo "==> Logging in to ECR ($ECR_REGISTRY)..."
AWS_PROFILE=$AWS_PROFILE aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"
echo ""

# ---------------------------------------------------------------------------
# Build & push loop
# ---------------------------------------------------------------------------
FAILED=()

for name in "${SERVICES[@]}"; do
  name=$(echo "$name" | tr -d '[:space:]')
  [[ -z "$name" ]] && continue

  port=$(get_port "$name")
  repo="onedelivery-$name"
  tag_sha="$ECR_REGISTRY/$repo:$IMAGE_TAG"
  tag_latest="$ECR_REGISTRY/$repo:latest"

  echo "==> [$name] Building image (port $port, tag $IMAGE_TAG)..."

  if docker build \
      --provenance=false \
      --platform linux/amd64 \
      --progress=plain \
      --file "$DOCKERFILE" \
      --build-arg SERVICE_NAME="$name" \
      --build-arg EXPOSE_PORT="$port" \
      --tag "$tag_sha" \
      --tag "$tag_latest" \
      .; then
    echo "==> [$name] Build succeeded. Pushing..."
    docker push "$tag_sha"
    docker push "$tag_latest"
    echo "==> [$name] Pushed: $tag_sha"
  else
    echo "ERROR: [$name] Build failed — skipping push."
    FAILED+=("$name")
  fi

  echo ""
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "============================================="
echo "  Build & push complete"
echo "  Tag   : $IMAGE_TAG"
echo "  Region: $AWS_REGION"
echo "  Total : ${#SERVICES[@]} service(s)"
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "  FAILED: ${FAILED[*]}"
  exit 1
else
  echo "  Status: all succeeded"
fi
echo "============================================="

# ---------------------------------------------------------------------------
# Force-redeploy ECS services so Fargate pulls the new :latest image.
# Without this, ECS may reuse the cached image layer even after a new push.
# ---------------------------------------------------------------------------
DEPLOYED=()
DEPLOY_FAILED=()

for name in "${SERVICES[@]}"; do
  name=$(echo "$name" | tr -d '[:space:]')
  [[ -z "$name" ]] && continue

  echo "==> [$name] Force-redeploying ECS service..."
  if AWS_PROFILE=$AWS_PROFILE aws ecs update-service \
      --cluster onedelivery-cluster \
      --service "$name" \
      --force-new-deployment \
      --region "$AWS_REGION" \
      --no-cli-pager \
      --query 'service.serviceName' \
      --output text > /dev/null 2>&1; then
    echo "==> [$name] Redeployment triggered."
    DEPLOYED+=("$name")
  else
    echo "WARN: [$name] ECS service not found or redeploy failed — skipping."
    DEPLOY_FAILED+=("$name")
  fi
done

echo ""
echo "============================================="
echo "  ECS redeploy triggered for: ${DEPLOYED[*]:-none}"
if [[ ${#DEPLOY_FAILED[@]} -gt 0 ]]; then
  echo "  Skipped (no ECS service): ${DEPLOY_FAILED[*]}"
fi
echo "  Services will be live in ~2-3 minutes."
echo "============================================="
