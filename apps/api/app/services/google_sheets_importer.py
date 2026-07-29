from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol

from jose import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.audit_log_entry import AuditLogEntry
from app.models.enums import AuditActorType, AuditEventType, ReportSourceChannel, ReportTriageStatus, SubjectType
from app.models.incident import Incident
from app.models.incident_intake_source import IncidentIntakeSource
from app.models.report import Report
from app.schemas.incident import IncidentIntakeImportResponse
from app.schemas.staff import StaffUserSummary
from app.services.google_sheets_mapping import (
    build_location_text,
    build_original_narrative,
    extract_reporter_contact,
    map_google_sheet_row,
)
from app.services.report_service import ReportService
from app.services.report_attachment_service import ReportAttachmentService


class GoogleSheetsRowReader(Protocol):
    def read_rows(self, *, spreadsheet_id: str, sheet_name: str) -> list[list[str]]:
        ...


@dataclass
class ImportRowResult:
    imported: bool
    skipped: bool
    failed: bool
    error: str | None = None


class GoogleSheetsApiRowReader:
    def read_rows(self, *, spreadsheet_id: str, sheet_name: str) -> list[list[str]]:
        settings = get_settings()
        if not settings.google_sheets_import_enabled:
            raise RuntimeError("Google Sheets import is disabled.")
        if not settings.google_service_account_json:
            raise RuntimeError("Google service account JSON is not configured.")

        access_token = self._get_access_token(settings.google_service_account_json)
        encoded_range = urllib.parse.quote(f"{sheet_name}!A:ZZ", safe="")
        url = (
            f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/"
            f"{encoded_range}?majorDimension=ROWS"
        )
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {access_token}"})
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return payload.get("values", [])

    def _get_access_token(self, service_account_json: str) -> str:
        credentials = json.loads(service_account_json)
        now = int(datetime.now(timezone.utc).timestamp())
        claims = {
            "iss": credentials["client_email"],
            "scope": "https://www.googleapis.com/auth/spreadsheets.readonly",
            "aud": "https://oauth2.googleapis.com/token",
            "iat": now,
            "exp": now + 3600,
        }
        assertion = jwt.encode(claims, credentials["private_key"], algorithm="RS256")
        body = urllib.parse.urlencode(
            {
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            "https://oauth2.googleapis.com/token",
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return payload["access_token"]


class GoogleSheetsImportService:
    def __init__(self, db: Session, row_reader: GoogleSheetsRowReader | None = None) -> None:
        self.db = db
        self.row_reader = row_reader or GoogleSheetsApiRowReader()

    def import_intake_source(
        self,
        *,
        incident_id: int,
        source_id: int,
        actor: StaffUserSummary,
    ) -> IncidentIntakeImportResponse:
        source = self.db.get(IncidentIntakeSource, source_id)
        if source is None or source.incident_id != incident_id:
            raise LookupError("Intake source not found.")
        if not source.is_active:
            raise ValueError("Intake source is inactive.")
        incident = self.db.get(Incident, incident_id)
        if incident is None:
            raise LookupError("Incident not found.")

        rows = self.row_reader.read_rows(
            spreadsheet_id=source.google_spreadsheet_id,
            sheet_name=source.google_sheet_name,
        )
        if not rows:
            return self._response(source, imported=0, skipped=0, failed=0, errors=[])

        headers = [str(header).strip() for header in rows[0]]
        imported = skipped = failed = 0
        errors: list[str] = []
        highest_successful_row = source.last_imported_row

        for row_number, row_values in enumerate(rows[1:], start=2):
            if row_number <= source.last_imported_row:
                continue
            result = self._import_row(source=source, headers=headers, row_number=row_number, row_values=row_values)
            imported += int(result.imported)
            skipped += int(result.skipped)
            failed += int(result.failed)
            if result.error:
                errors.append(result.error)
            if not result.failed:
                highest_successful_row = row_number

        source.last_imported_row = max(source.last_imported_row, highest_successful_row)
        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.STAFF,
                actor_user_id=actor.id,
                event_type=AuditEventType.INTAKE_SOURCE_IMPORTED,
                metadata_json={
                    "incident_id": incident_id,
                    "intake_source_id": source_id,
                    "imported": imported,
                    "skipped": skipped,
                    "failed": failed,
                },
            )
        )
        self.db.commit()
        self.db.refresh(source)

        return self._response(source, imported=imported, skipped=skipped, failed=failed, errors=errors)

    def _import_row(
        self,
        *,
        source: IncidentIntakeSource,
        headers: list[str],
        row_number: int,
        row_values: list[str],
    ) -> ImportRowResult:
        row = {header: row_values[index] if index < len(row_values) else "" for index, header in enumerate(headers)}
        if not any(str(value).strip() for value in row.values()):
            return ImportRowResult(imported=False, skipped=True, failed=False)

        mapped = map_google_sheet_row(row, row_number=row_number)
        source_entry_id = f"{source.google_sheet_name}:{row_number}"
        existing = self.db.scalar(
            select(Report.id).where(
                Report.source_channel == ReportSourceChannel.GOOGLE_FORM,
                Report.source_form_id == source.google_spreadsheet_id,
                Report.source_entry_id == source_entry_id,
            )
        )
        if existing is not None:
            return ImportRowResult(imported=False, skipped=True, failed=False)

        reporter_email, reporter_phone = extract_reporter_contact(mapped)
        report = Report(
            incident_id=source.incident_id,
            intake_source_id=source.id,
            report_code=ReportService._generate_report_code(),
            source_channel=ReportSourceChannel.GOOGLE_FORM,
            source_form_id=source.google_spreadsheet_id,
            source_form_name=source.google_sheet_name,
            source_entry_id=source_entry_id,
            submitted_at=_parse_iso_datetime(mapped.get("submitted_at_parsed")),
            received_at=datetime.now(timezone.utc),
            language_code="en",
            raw_answers_json=mapped,
            original_narrative=build_original_narrative(mapped),
            location_text=build_location_text(mapped),
            reporter_name=_clean_optional(mapped.get("reporter_name")),
            reporter_email=reporter_email,
            reporter_phone=reporter_phone,
            reporter_relationship=_clean_optional(mapped.get("reporter_relationship")),
            permission_to_contact=bool(mapped.get("reporter_contact")),
            subject_type=SubjectType(mapped.get("subject_type") or SubjectType.UNKNOWN.value),
            triage_status=ReportTriageStatus.AWAITING_REVIEW,
        )
        self.db.add(report)
        self.db.flush()
        link_errors = ReportAttachmentService(self.db).link_code_to_report(
            incident_id=source.incident_id,
            report_id=report.id,
            attachment_code=mapped.get("attachment_code"),
        )

        self.db.add(
            AuditLogEntry(
                actor_type=AuditActorType.SYSTEM,
                event_type=AuditEventType.REPORT_RECEIVED,
                metadata_json={
                    "report_id": report.id,
                    "report_code": report.report_code,
                    "incident_id": source.incident_id,
                    "intake_source_id": source.id,
                    "source_channel": report.source_channel.value,
                    "source_entry_id": report.source_entry_id,
                },
            )
        )
        return ImportRowResult(imported=True, skipped=False, failed=False, error=link_errors[0] if link_errors else None)

    @staticmethod
    def _response(
        source: IncidentIntakeSource,
        *,
        imported: int,
        skipped: int,
        failed: int,
        errors: list[str],
    ) -> IncidentIntakeImportResponse:
        return IncidentIntakeImportResponse(
            incident_id=source.incident_id,
            intake_source_id=source.id,
            imported=imported,
            skipped=skipped,
            failed=failed,
            last_imported_row=source.last_imported_row,
            errors=errors[:20],
        )


def _clean_optional(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None
