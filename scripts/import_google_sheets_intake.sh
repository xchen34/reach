#!/usr/bin/env bash

set -euo pipefail

INCIDENT_ID="${1:-2}"
SOURCE_ID="${2:-1}"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8000}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.yml}"
EMAIL="${REACH_LOCAL_IMPORT_EMAIL:-reach-local-import-coordinator@example.com}"

APP_ENV="$(docker compose -f "${COMPOSE_FILE}" exec -T api python - <<'PY'
from app.config import get_settings

print(get_settings().app_env)
PY
)"

if [[ "${APP_ENV}" == "production" ]]; then
  echo "Refusing to run Google Sheets import helper in production." >&2
  exit 1
fi

IMPORT_READY="$(docker compose -f "${COMPOSE_FILE}" exec -T api python - <<'PY'
from app.config import get_settings

settings = get_settings()
print(settings.google_sheets_import_enabled and bool(settings.google_service_account_json))
PY
)"

if [[ "${IMPORT_READY}" != "True" ]]; then
  echo "Google Sheets import is not enabled or service-account JSON is not configured in the API container." >&2
  exit 1
fi

TOKEN="$(EMAIL="${EMAIL}" API_BASE_URL="${API_BASE_URL}" python3 - <<'PY'
import json
import os
import urllib.request
from urllib.parse import parse_qs, urlparse

payload = json.dumps({"email": os.environ["EMAIL"]}).encode("utf-8")
request = urllib.request.Request(
    f"{os.environ['API_BASE_URL']}/auth/request-magic-link",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(request, timeout=10) as response:
    body = json.loads(response.read().decode("utf-8"))

login_url = body.get("login_url")
if not login_url:
    raise SystemExit("Development magic-link response did not include login_url.")

print(parse_qs(urlparse(login_url).query)["token"][0])
PY
)"

docker compose -f "${COMPOSE_FILE}" exec -T api env IMPORT_COORDINATOR_EMAIL="${EMAIL}" python - <<'PY'
import os

from sqlalchemy import select

from app.db import get_db_session
from app.models.enums import StaffRole
from app.models.user import User

email = os.environ["IMPORT_COORDINATOR_EMAIL"]
with next(get_db_session()) as db:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise SystemExit("Development magic-link request did not create the local import user.")
    user.role = StaffRole.COORDINATOR
    db.add(user)
    db.commit()
PY

ACCESS_TOKEN="$(TOKEN="${TOKEN}" API_BASE_URL="${API_BASE_URL}" python3 - <<'PY'
import json
import os
import urllib.request

payload = json.dumps({"token": os.environ["TOKEN"]}).encode("utf-8")
request = urllib.request.Request(
    f"{os.environ['API_BASE_URL']}/auth/verify-magic-link",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(request, timeout=10) as response:
    body = json.loads(response.read().decode("utf-8"))

if body["user"]["role"] != "coordinator":
    raise SystemExit(f"Expected coordinator role, got {body['user']['role']}.")

print(body["access_token"])
PY
)"

INCIDENT_ID="${INCIDENT_ID}" SOURCE_ID="${SOURCE_ID}" ACCESS_TOKEN="${ACCESS_TOKEN}" API_BASE_URL="${API_BASE_URL}" python3 - <<'PY'
import json
import os
import urllib.error
import urllib.request

request = urllib.request.Request(
    f"{os.environ['API_BASE_URL']}/staff/incidents/{os.environ['INCIDENT_ID']}/intake-sources/{os.environ['SOURCE_ID']}/import",
    data=b"",
    headers={"Authorization": f"Bearer {os.environ['ACCESS_TOKEN']}"},
    method="POST",
)

try:
    with urllib.request.urlopen(request, timeout=60) as response:
        print(json.dumps(json.loads(response.read().decode("utf-8")), indent=2, ensure_ascii=False))
except urllib.error.HTTPError as exc:
    print(exc.read().decode("utf-8"), flush=True)
    raise
PY
