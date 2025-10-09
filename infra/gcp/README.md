# Google Cloud Project Setup

This guide bootstraps a Google Cloud project for Micromanager so you can host the web app and calendar integration without Vercel. All commands assume you have the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and authenticated (`gcloud auth login`).

## 1. Define project variables

```bash
export PROJECT_ID="micromanager-demo-$RANDOM"
export REGION="us-central1"
export REPO_LOCATION="us"
export SERVICE_ACCOUNT="micromanager-runner"
```

## 2. Create or select a project

```bash
# Create a new project (skip if you already have one)
gcloud projects create "$PROJECT_ID" --name="Micromanager"

# Make the project active for subsequent commands
gcloud config set project "$PROJECT_ID"
```

> ❗ If you created a brand-new project, you must link billing once (the Cloud Run free tier still sits on a billed project).

```bash
gcloud beta billing projects link "$PROJECT_ID" --billing-account=YOUR_BILLING_ACCOUNT_ID
```

## 3. Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  calendar-json.googleapis.com
```

## 4. Create an Artifact Registry for container images

```bash
gcloud artifacts repositories create micromanager \
  --repository-format=docker \
  --location="$REPO_LOCATION" \
  --description="Micromanager containers"
```

## 5. Create a runtime service account

```bash
gcloud iam service-accounts create "$SERVICE_ACCOUNT" \
  --display-name="Micromanager Cloud Run"

# Allow it to run services and read secrets
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.reader"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

If you plan to deploy from your local machine or CI, grant your own user (or CI service account) the ability to run deployments:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="your.user@example.com" \
  --role="roles/run.admin"
```

## 6. Provision Secret Manager entries

Store environment variables in Secret Manager so Cloud Run can mount them safely. Create one secret per key or a single `.env` blob—below uses a single secret file.

```bash
cat > .env.production <<'VARS'
MONGODB_URI=
OPENAI_API_KEY=
AUTH_SECRET=
TELEGRAM_SERVER_SECRET=
TELEGRAM_BOT_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_MICROMANAGER_MCP_SERVER_URL=
ALLOW_USER_REGISTRATION=true
VARS

gcloud secrets create micromanager-env \
  --replication-policy="automatic"

gcloud secrets versions add micromanager-env \
  --data-file=.env.production
```

> 🔁 Update a secret later with the same `gcloud secrets versions add` command. Remember to delete `.env.production` when you are done (`rm .env.production`).

## 7. Configure OAuth credentials

1. Open the [Google Cloud Console OAuth screen](https://console.cloud.google.com/apis/credentials/oauthclient) for your project.
2. Create an **OAuth Client ID** of type **Web application**.
3. Add authorised redirect URIs:
   - `https://YOUR_DOMAIN/api/auth/callback/google`
   - `https://YOUR_DOMAIN/oauth2/callback` (optional alternative for testing)
4. Add authorised JavaScript origins:
   - `https://YOUR_DOMAIN`
5. Copy the client ID/secret into the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` fields in the secret above.

While testing, add your users as test accounts on the OAuth consent screen. Publish the app once you are ready for broader access.

## 8. (Optional) Create a service account key for local scripts

Only do this if you need programmatic access from CI/CD that cannot use `gcloud auth login`.

```bash
gcloud iam service-accounts keys create infra/gcp/micromanager-runner-key.json \
  --iam-account="$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com"
```

Add `infra/gcp/micromanager-runner-key.json` to `.gitignore` (already ignored) and keep it out of source control.

## 9. Prepare Cloud Run deploy script

This repository includes `infra/gcp/deploy-cloud-run.sh` (see below) to build the container, push it to Artifact Registry, and deploy a Cloud Run service wired to your secret environment file.

```bash
./infra/gcp/deploy-cloud-run.sh \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --service micromanager-web \
  --repository micromanager \
  --image micromanager-web:latest \
  --secret micromanager-env \
  --service-account "$SERVICE_ACCOUNT@$PROJECT_ID.iam.gserviceaccount.com"
```

That script expects the Docker context at the repository root and uses `infra/gcp/cloudrun.Dockerfile`.

---

At this point the Google project is ready to host Micromanager and the calendar tools. Continue with the deployment guide to run the app on Cloud Run.
