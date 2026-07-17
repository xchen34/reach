from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import IncidentStatus, IntakeSourceType
from app.models.incident import Incident
from app.models.incident_intake_source import IncidentIntakeSource
from app.schemas.incident import PublicIncidentReportPageResponse, StaffIncidentSummary


LEGACY_INCIDENT_SLUG = "legacy-reach-intake"


class IncidentService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_or_create_legacy_incident(self) -> Incident:
        incident = self.db.scalar(select(Incident).where(Incident.slug == LEGACY_INCIDENT_SLUG))
        if incident is not None:
            return incident

        incident = Incident(
            internal_name="Legacy imported incident",
            public_name="Legacy Reach intake",
            slug=LEGACY_INCIDENT_SLUG,
            disaster_type="legacy",
            affected_area="Legacy records before incident scoping",
            public_description="Compatibility incident for records created before Incident-scoped intake.",
            supported_languages=["en", "fr", "zh"],
            status=IncidentStatus.ARCHIVED,
            owning_team="Reach migration",
        )
        self.db.add(incident)
        self.db.flush()
        return incident

    def list_staff_incidents(self) -> list[StaffIncidentSummary]:
        incidents = self.db.scalars(select(Incident).order_by(Incident.created_at.desc(), Incident.id.desc())).all()
        return [StaffIncidentSummary.model_validate(incident) for incident in incidents]

    def get_current_public_report_page(self) -> Optional[PublicIncidentReportPageResponse]:
        incidents = self.db.scalars(
            select(Incident)
            .where(Incident.status == IncidentStatus.ACTIVE)
            .order_by(Incident.created_at.desc(), Incident.id.desc())
        ).all()
        for incident in incidents:
            public_page = self.get_public_report_page(incident.slug)
            if public_page is not None:
                return public_page
        return None

    def get_public_report_page(self, slug: str) -> Optional[PublicIncidentReportPageResponse]:
        incident = self.db.scalar(select(Incident).where(Incident.slug == slug))
        if incident is None or not self._is_intake_open(incident):
            return None

        source = self.db.scalar(
            select(IncidentIntakeSource)
            .where(
                IncidentIntakeSource.incident_id == incident.id,
                IncidentIntakeSource.source_type == IntakeSourceType.GOOGLE_SHEETS,
                IncidentIntakeSource.is_active.is_(True),
            )
            .order_by(IncidentIntakeSource.id.asc())
        )
        if source is None:
            return None

        return PublicIncidentReportPageResponse(
            id=incident.id,
            public_name=incident.public_name,
            slug=incident.slug,
            disaster_type=incident.disaster_type,
            affected_area=incident.affected_area,
            incident_start_time=incident.incident_start_time,
            public_description=incident.public_description,
            supported_languages=list(incident.supported_languages or []),
            status=incident.status,
            google_form_url=source.google_form_url,
        )

    @staticmethod
    def _is_intake_open(incident: Incident) -> bool:
        if incident.status != IncidentStatus.ACTIVE:
            return False
        now = datetime.now(timezone.utc)
        opening_time = IncidentService._coerce_utc(incident.form_opening_time)
        closing_time = IncidentService._coerce_utc(incident.form_closing_time)
        if opening_time is not None and opening_time > now:
            return False
        if closing_time is not None and closing_time <= now:
            return False
        return True

    @staticmethod
    def _coerce_utc(value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
