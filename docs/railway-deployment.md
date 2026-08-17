# Railway Deployment

Reach should be deployed as two Railway services plus PostgreSQL.

## Services

### API Service

- Source repo: this repository
- Dockerfile path: `Dockerfile.api`
- Root directory: repository root

Required variables:

```env
Reach_APP_ENV=production
Reach_AUTH_TOKEN_SECRET=<long-random-secret-at-least-16-chars>
Reach_MAGIC_LINK_BASE_URL=https://<your-web-service-domain>
Reach_DEV_MAGIC_LINK_MODE=response
Reach_DEV_AUTO_CREATE_USERS=false
Reach_REPORT_ATTACHMENT_STORAGE_DIR=/tmp/Reach/report_attachments
```

For the database, attach a Railway PostgreSQL service. The API accepts Railway's
standard `DATABASE_URL` automatically. If you are not using Railway's automatic
Postgres variable, set `Reach_DATABASE_URL` to your Postgres connection string.

For Google Sheets intake:

```env
Reach_GOOGLE_SHEETS_IMPORT_ENABLED=true
Reach_GOOGLE_SERVICE_ACCOUNT_JSON=<one-line-service-account-json>
Reach_GOOGLE_FORM_INGEST_TOKEN=<long-random-secret>
Reach_INTAKE_AUTO_SYNC_ENABLED=true
Reach_INTAKE_AUTO_SYNC_INTERVAL_SECONDS=300
```

The API Dockerfile runs:

```bash
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Web Service

- Source repo: this repository
- Dockerfile path: `Dockerfile`
- Root directory: repository root

Required variables:

```env
API_INTERNAL_BASE_URL=https://<your-api-service-domain>
NEXT_PUBLIC_API_BASE_URL=https://<your-api-service-domain>
NEXT_PUBLIC_ENABLE_STAFF_DASHBOARD_MOCKS=false
```

If using legacy homepage form links, also set:

```env
NEXT_PUBLIC_SAFE_REPORT_FORM_URL=
NEXT_PUBLIC_MISSING_REPORT_FORM_URL=
NEXT_PUBLIC_UPDATE_REPORT_FORM_URL=
```

The web Dockerfile starts Next.js on Railway's `$PORT`.

## Google Apps Script

After the API is deployed, install `docs/google-form-apps-script-example.js` on
the Google Sheet connected to the response Form.

Set:

```js
var Reach_HOST = "https://<your-api-service-domain>";
var Reach_INGEST_TOKEN = "same-value-as-Reach_GOOGLE_FORM_INGEST_TOKEN";
```

Add trigger:

- Function: `onFormSubmit`
- Event source: `From spreadsheet`
- Event type: `On form submit`

## Common Failure

If no variables are set, Railway will not work:

- API defaults to a local Docker database hostname (`db`), which does not exist
  on Railway.
- Auth uses a development secret.
- Web proxy defaults to `http://localhost:8000`, which points to the web
  container itself, not the API service.
