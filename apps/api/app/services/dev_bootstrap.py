from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import IncidentStatus, IntakeSourceType
from app.models.incident import Incident
from app.models.incident_intake_source import IncidentIntakeSource


DEMO_INCIDENT_SLUG = "reach-demo"
DEMO_GOOGLE_FORM_URL = (
    "https://docs.google.com/forms/d/e/"
    "1FAIpQLSdyeSF9JooekyHjSn_-HgaCyt7ZM2uaNM_UOfb6-c5APpyTiQ/viewform"
)
DEMO_GOOGLE_FORM_ID = "1FAIpQLSdyeSF9JooekyHjSn_-HgaCyt7ZM2uaNM_UOfb6-c5APpyTiQ"
DEMO_GOOGLE_SPREADSHEET_ID = "1EILq0xRcEhXziEtvHTV3agkAl2hiDrUVVfaHz_vYGmw"


@dataclass(frozen=True)
class DemoIncidentBootstrapResult:
    incident_id: int
    intake_source_id: int
    incident_created: bool
    intake_source_created: bool
    slug: str
    google_sheet_name: str


def bootstrap_demo_incident(db: Session, *, google_sheet_name: str) -> DemoIncidentBootstrapResult:
    sheet_name = google_sheet_name.strip()
    if not sheet_name:
        raise ValueError("Google sheet tab name is required.")

    incident = db.scalar(select(Incident).where(Incident.slug == DEMO_INCIDENT_SLUG))
    incident_created = incident is None
    now = datetime.now(timezone.utc)

    if incident is None:
        incident = Incident(
            internal_name="Reach demo incident",
            public_name="Reach Demo Incident",
            slug=DEMO_INCIDENT_SLUG,
            disaster_type="building_fire",
            affected_area="Demo affected area",
            incident_start_time=now,
            public_description=(
                "Development Incident for testing missing-person Google Forms intake."
            ),
            supported_languages=["en", "fr", "zh"],
            status=IncidentStatus.ACTIVE,
            form_opening_time=now,
            owning_team="Reach local development",
        )
        db.add(incident)
        db.flush()
    else:
        incident.internal_name = "Reach demo incident"
        incident.public_name = "Reach Demo Incident"
        incident.disaster_type = "building_fire"
        incident.affected_area = "Demo affected area"
        incident.public_description = (
            "Development Incident for testing missing-person Google Forms intake."
        )
        incident.supported_languages = ["en", "fr", "zh"]
        incident.status = IncidentStatus.ACTIVE
        incident.form_opening_time = incident.form_opening_time or now
        incident.form_closing_time = None
        incident.owning_team = "Reach local development"

    source = db.scalar(
        select(IncidentIntakeSource).where(
            IncidentIntakeSource.incident_id == incident.id,
            IncidentIntakeSource.source_type == IntakeSourceType.GOOGLE_SHEETS,
            IncidentIntakeSource.google_spreadsheet_id == DEMO_GOOGLE_SPREADSHEET_ID,
        )
    )
    intake_source_created = source is None

    if source is None:
        source = IncidentIntakeSource(
            incident_id=incident.id,
            source_type=IntakeSourceType.GOOGLE_SHEETS,
            google_form_url=DEMO_GOOGLE_FORM_URL,
            google_form_id=DEMO_GOOGLE_FORM_ID,
            google_spreadsheet_id=DEMO_GOOGLE_SPREADSHEET_ID,
            google_sheet_name=sheet_name,
            last_imported_row=1,
            is_active=True,
        )
        db.add(source)
        db.flush()
    else:
        source.google_form_url = DEMO_GOOGLE_FORM_URL
        source.google_form_id = DEMO_GOOGLE_FORM_ID
        source.google_sheet_name = sheet_name
        source.is_active = True

    db.commit()
    db.refresh(incident)
    db.refresh(source)

    return DemoIncidentBootstrapResult(
        incident_id=incident.id,
        intake_source_id=source.id,
        incident_created=incident_created,
        intake_source_created=intake_source_created,
        slug=incident.slug,
        google_sheet_name=source.google_sheet_name,
    )
