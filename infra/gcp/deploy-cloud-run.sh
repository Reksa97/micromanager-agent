#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DOCKERFILE="${ROOT_DIR}/infra/gcp/cloudrun.Dockerfile"

PROJECT=""
REGION="us-central1"
SERVICE="micromanager-web"
REPO="micromanager"
REPO_LOCATION="us"
IMAGE=""
SECRET="micromanager-env"
SERVICE_ACCOUNT=""
PLATFORM="managed"
PORT="8080"

usage() {
  cat <<USAGE
Usage: $0 --project PROJECT_ID [options]

Options:
  --project PROJECT_ID           Google Cloud project id (required)
  --region REGION                Cloud Run region (default: ${REGION})
  --service NAME                 Cloud Run service name (default: ${SERVICE})
  --repository NAME              Artifact Registry repo (default: ${REPO})
  --repository-location CODE     Artifact Registry location (default: ${REPO_LOCATION})
  --image IMAGE_PATH             Full image path (default: auto-generated)
  --secret SECRET_NAME           Secret Manager name containing .env (default: ${SECRET})
  --service-account EMAIL        Service account for runtime (default: ${SERVICE_ACCOUNT:-"<derived>"})
  --port PORT                    Container port (default: ${PORT})
  --help                         Show this help message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT="$2"; shift 2 ;;
    --region)
      REGION="$2"; shift 2 ;;
    --service)
      SERVICE="$2"; shift 2 ;;
    --repository)
      REPO="$2"; shift 2 ;;
    --repository-location)
      REPO_LOCATION="$2"; shift 2 ;;
    --image)
      IMAGE="$2"; shift 2 ;;
    --secret)
      SECRET="$2"; shift 2 ;;
    --service-account)
      SERVICE_ACCOUNT="$2"; shift 2 ;;
    --port)
      PORT="$2"; shift 2 ;;
    --help|-h)
      usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1 ;;
  esac
done

if [[ -z "$PROJECT" ]]; then
  echo "--project is required" >&2
  usage
  exit 1
fi

if [[ -z "$SERVICE_ACCOUNT" ]]; then
  SERVICE_ACCOUNT="micromanager-runner@${PROJECT}.iam.gserviceaccount.com"
fi

if [[ -z "$IMAGE" ]]; then
  IMAGE="${REPO_LOCATION}-docker.pkg.dev/${PROJECT}/${REPO}/${SERVICE}:latest"
fi

REPO_HOST="${REPO_LOCATION}-docker.pkg.dev"

echo "▶ Using image: ${IMAGE}"

echo "▶ Configuring docker auth for ${REPO_HOST}"
gcloud auth configure-docker "${REPO_HOST}" --project "${PROJECT}" --quiet >/dev/null

echo "▶ Building container"
docker build -f "${DOCKERFILE}" -t "${IMAGE}" "${ROOT_DIR}"

echo "▶ Pushing container"
docker push "${IMAGE}"

TMP_ENV=$(mktemp)
cleanup() {
  rm -f "${TMP_ENV}"
}
trap cleanup EXIT

echo "▶ Fetching env vars from Secret Manager (${SECRET})"
gcloud secrets versions access latest \
  --secret="${SECRET}" \
  --project="${PROJECT}" > "${TMP_ENV}"

echo "▶ Deploying to Cloud Run (${SERVICE})"
gcloud run deploy "${SERVICE}" \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --platform="${PLATFORM}" \
  --service-account="${SERVICE_ACCOUNT}" \
  --allow-unauthenticated \
  --port="${PORT}" \
  --set-env-vars-file="${TMP_ENV}" \
  --max-instances=2 \
  --cpu=1 \
  --memory=1Gi

echo "✅ Deployment complete"
