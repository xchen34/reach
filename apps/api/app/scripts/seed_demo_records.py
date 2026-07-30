"""Seed local demo data with synthetic people/pet records and generated PNG photos.

Run inside the API container:

    python -m app.scripts.seed_demo_records --count 60

The generated photos are deliberately synthetic placeholders. They avoid real
faces, real pets, copyright questions, and consent issues in disaster demos.
"""

from __future__ import annotations

import argparse
import binascii
import struct
import sys
import zlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, or_, select

from app.config import get_settings
from app.db import SessionLocal
from app.models.audit_log_entry import AuditLogEntry
from app.models.case import Case
from app.models.case_action import CaseAction
from app.models.case_report import CaseReport
from app.models.enums import (
    AttachmentModerationStatus,
    AuditActorType,
    AuditEventType,
    CaseActionType,
    CaseHandlingStatus,
    CaseSafetyStatus,
    CaseStatus,
    IncidentType,
    ReportSourceChannel,
    ReportTriageActionType,
    ReportTriageStatus,
    StaffRole,
    SubjectType,
    UrgencyLevel,
)
from app.models.report import Report
from app.models.report_attachment import ReportAttachment
from app.models.report_triage_action import ReportTriageAction
from app.models.user import User
from app.services.dev_bootstrap import bootstrap_demo_incident
from app.services.report_attachment_storage import LocalReportAttachmentStorage


SEED_FORM_NAME = "Reach demo bulk seed"
CASE_PREFIX = "DCASE"
REPORT_PREFIX = "DREP"
ATTACHMENT_PREFIX = "DATT"

PERSON_NAMES = [
    "Sara Kim",
    "Noah Bernard",
    "Victor Nguyen",
    "Mei Wong",
    "Hugo Fernandes",
    "Leila Haddad",
    "Omar Haddad",
    "Amina Diallo",
    "Louis Martin",
    "Chen Wai",
    "Grace Lau",
    "Ibrahim Saleh",
    "Nadia Petrova",
    "Tariq Khan",
    "Elena Rossi",
    "Maya Singh",
]
PET_NAMES = ["Black cat", "Mochi", "Lucky", "Brown poodle", "Nana", "Grey parrot", "Small white dog"]
LOCATIONS = [
    "Tower Lumiere, 4/F corridor",
    "Station entrance near avenue de France",
    "Residence Colonie, Block B lobby",
    "School gym shelter registration desk",
    "Wang Yan House A108",
    "North playground assembly area",
    "Community hall relief station",
    "3 impasse des Roses, stairwell C",
    "16 rue des Peupliers, 7/F landing",
    "Temporary shelter near the pharmacy",
    "South bus stop outside the estate",
    "Riverside community clinic entrance",
]
APPEARANCE = [
    "grey coat, reduced mobility",
    "blue backpack, glasses",
    "black jacket, may need medication",
    "school uniform, carrying a red bag",
    "uses a walking stick",
    "white shirt, smoke exposure reported",
    "black fur with white chest patch",
    "brown collar, nervous around crowds",
    "small carrier may have been left near shelter desk",
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed local Reach demo reports, tasks, pets, and public photos.")
    parser.add_argument("--count", type=int, default=60, help="Total demo reports to create. Default: 60.")
    parser.add_argument(
        "--keep-existing",
        action="store_true",
        help="Do not remove previous demo bulk seed records first.",
    )
    args = parser.parse_args()

    settings = get_settings()
    if settings.app_env.lower() == "production":
        print("Refusing to seed demo records while Reach_APP_ENV=production.", file=sys.stderr)
        return 2
    if args.count < 20:
        print("--count must be at least 20 so the demo has enough status variety.", file=sys.stderr)
        return 2

    with SessionLocal() as db:
        incident_result = bootstrap_demo_incident(db, google_sheet_name="Form Responses 1")
        if not args.keep_existing:
            removed = clear_existing_seed(db)
        else:
            removed = 0
        user = get_or_create_seed_user(db)
        created = create_seed_records(db, incident_result.incident_id, user.id, args.count)
        db.commit()

    print("Reach demo bulk seed complete.")
    print(f"removed_previous_records={removed}")
    print(f"created_reports={created['reports']}")
    print(f"created_cases={created['cases']}")
    print(f"created_attachments={created['attachments']}")
    print("Open http://127.0.0.1:3000/zh/staff and http://127.0.0.1:3000/zh/board")
    return 0


def clear_existing_seed(db) -> int:
    reports = db.scalars(select(Report).where(Report.report_code.like(f"{REPORT_PREFIX}%"))).all()
    cases = db.scalars(select(Case).where(Case.case_code.like(f"{CASE_PREFIX}%"))).all()
    report_ids = [item.id for item in reports]
    case_ids = [item.id for item in cases]
    attachment_ids: list[int] = []
    storage = LocalReportAttachmentStorage()
    attachment_filters = [ReportAttachment.attachment_code.like(f"{ATTACHMENT_PREFIX}%")]

    if report_ids:
        attachment_filters.append(ReportAttachment.report_id.in_(report_ids))
    if case_ids:
        attachment_filters.append(ReportAttachment.case_id.in_(case_ids))

    attachments = db.scalars(select(ReportAttachment).where(or_(*attachment_filters))).all()
    for attachment in attachments:
        attachment_ids.append(attachment.id)
        try:
            storage.path_for(attachment.storage_key).unlink(missing_ok=True)
        except OSError:
            pass

    if attachment_ids:
        db.execute(delete(ReportAttachment).where(ReportAttachment.id.in_(attachment_ids)))
    if report_ids:
        db.execute(delete(ReportTriageAction).where(ReportTriageAction.report_id.in_(report_ids)))
    if case_ids:
        db.execute(delete(CaseAction).where(CaseAction.case_id.in_(case_ids)))
        db.execute(delete(AuditLogEntry).where(AuditLogEntry.case_id.in_(case_ids)))
    if report_ids or case_ids:
        statement = delete(CaseReport)
        if report_ids and case_ids:
            statement = statement.where((CaseReport.report_id.in_(report_ids)) | (CaseReport.case_id.in_(case_ids)))
        elif report_ids:
            statement = statement.where(CaseReport.report_id.in_(report_ids))
        else:
            statement = statement.where(CaseReport.case_id.in_(case_ids))
        db.execute(statement)
    if report_ids:
        db.execute(delete(Report).where(Report.id.in_(report_ids)))
    if case_ids:
        db.execute(delete(Case).where(Case.id.in_(case_ids)))
    db.commit()
    return len(report_ids) + len(case_ids)


def get_or_create_seed_user(db) -> User:
    email = "seed-volunteer@example.com"
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, role=StaffRole.VOLUNTEER, is_active=True)
        db.add(user)
        db.flush()
    return user


def create_seed_records(db, incident_id: int, user_id: int, count: int) -> dict[str, int]:
    case_count = max(1, int(count * 0.75))
    report_count = count
    attachment_count = 0
    now = datetime.now(timezone.utc)

    for index in range(report_count):
        subject_type = SubjectType.PET if index % 5 in {1, 4} else SubjectType.PERSON
        is_pet = subject_type == SubjectType.PET
        has_name = index % 4 != 0
        has_age = index % 5 != 0
        has_phone = index % 3 == 0
        if has_name:
            person_name = PET_NAMES[index % len(PET_NAMES)] if is_pet else PERSON_NAMES[index % len(PERSON_NAMES)]
        else:
            person_name = None
        age = pet_age(index) if is_pet and has_age else (str(12 + (index * 7) % 78) if has_age else None)
        gender = None if is_pet or index % 6 == 0 else ("Female" if index % 2 else "Male")
        location = LOCATIONS[index % len(LOCATIONS)]
        detail = APPEARANCE[index % len(APPEARANCE)]
        submitted_at = now - timedelta(hours=index * 2 + (index % 3) * 7)
        report = Report(
            incident_id=incident_id,
            intake_source_id=None,
            report_code=f"{REPORT_PREFIX}{index + 1:05d}",
            source_channel=ReportSourceChannel.GOOGLE_FORM,
            source_form_id="demo-bulk-seed-form",
            source_form_name=SEED_FORM_NAME,
            source_entry_id=f"bulk-seed-{index + 1:05d}",
            submitted_at=submitted_at,
            received_at=submitted_at + timedelta(minutes=12),
            language_code="zh",
            raw_answers_json={
                "submission_type": submission_type(index=index, is_pet=is_pet),
                "person_name": person_name,
                "approximate_age": age,
                "gender": gender,
                "current_status": "暂时联系不上，正在等待核实。",
                "identifying_description": detail,
            },
            original_narrative=build_narrative(is_pet=is_pet, name=person_name, location=location, detail=detail),
            location_text=location,
            reporter_name=None if index % 6 == 0 else f"上报人 {index + 1}",
            reporter_email=None,
            reporter_phone=f"6{1000000 + index:07d}" if has_phone else None,
            reporter_relationship=None if index % 4 == 0 else "邻居或家属",
            permission_to_contact=has_phone,
            subject_type=subject_type,
            triage_status=ReportTriageStatus.AWAITING_REVIEW,
            is_legacy_backfill=False,
        )
        db.add(report)
        db.flush()

        if index < case_count:
            case = build_case(
                incident_id=incident_id,
                index=index,
                report=report,
                person_name=person_name,
                age=age,
                detail=detail,
                location=location,
                user_id=user_id,
            )
            db.add(case)
            db.flush()
            report.triage_status = ReportTriageStatus.LINKED_TO_NEW_CASE
            db.add(
                CaseReport(
                    case_id=case.id,
                    report_id=report.id,
                    linked_by_user_id=user_id,
                    link_reason="Created by local demo bulk seed.",
                )
            )
            db.add(
                CaseAction(
                    case_id=case.id,
                    actor_user_id=user_id,
                    action_type=CaseActionType.NOTE,
                    note="Demo seed record.",
                    from_status=case.status,
                    to_status=case.status,
                )
            )
            if index % 2 == 0 or is_pet:
                attachment_count += add_demo_attachment(
                    db,
                    incident_id,
                    report.id,
                    case.id,
                    index,
                    public=index % 3 != 0,
                )
        elif index % 3 == 0:
            attachment_count += add_demo_attachment(db, incident_id, report.id, None, index, public=False)

        if index < case_count:
            db.add(
                ReportTriageAction(
                    report_id=report.id,
                    actor_user_id=user_id,
                    action_type=ReportTriageActionType.CREATE_CASE,
                    from_status=ReportTriageStatus.AWAITING_REVIEW,
                    to_status=ReportTriageStatus.LINKED_TO_NEW_CASE,
                    case_id=case.id,
                    note="Created by local demo bulk seed.",
                )
            )
        db.add(
            AuditLogEntry(
                actor_type=AuditActorType.SYSTEM,
                case_id=case.id if index < case_count else None,
                event_type=AuditEventType.REPORT_RECEIVED,
                metadata_json={"source": SEED_FORM_NAME, "report_code": report.report_code},
            )
        )

    return {"reports": report_count, "cases": case_count, "attachments": attachment_count}


def build_case(
    *,
    incident_id: int,
    index: int,
    report: Report,
    person_name: str | None,
    age: str | None,
    detail: str,
    location: str,
    user_id: int,
) -> Case:
    status_bucket = index % 12
    status = CaseStatus.PENDING_REVIEW
    safety = CaseSafetyStatus.UNKNOWN
    handling = CaseHandlingStatus.AWAITING_ACTION
    assigned_staff_user_id = None
    latest_public_update = "正在等待志愿者领取。"
    confirmed_at = None

    if status_bucket in {4, 5, 6}:
        status = CaseStatus.ACTIVE
        handling = CaseHandlingStatus.BEING_INVESTIGATED
        assigned_staff_user_id = user_id
        latest_public_update = "志愿者正在跟进。"
    elif status_bucket in {7, 8, 9}:
        status = CaseStatus.SAFE_RESOLVED
        safety = CaseSafetyStatus.CONFIRMED_SAFE
        handling = CaseHandlingStatus.ARCHIVED
        latest_public_update = "已收到安全确认。"
        confirmed_at = datetime.now(timezone.utc) - timedelta(hours=index)
    elif status_bucket == 10:
        status = CaseStatus.CLOSED
        safety = CaseSafetyStatus.CONFIRMED_DECEASED
        handling = CaseHandlingStatus.ARCHIVED
        latest_public_update = "已收到死亡确认。"
        confirmed_at = datetime.now(timezone.utc) - timedelta(hours=index)

    return Case(
        incident_id=incident_id,
        case_code=f"{CASE_PREFIX}{index + 1:05d}",
        status=status,
        urgency=[UrgencyLevel.LOW, UrgencyLevel.MEDIUM, UrgencyLevel.HIGH, UrgencyLevel.CRITICAL][index % 4],
        incident_type=[
            IncidentType.FIRE,
            IncidentType.EVACUATION,
            IncidentType.SHELTER,
            IncidentType.MEDICAL,
        ][index % 4],
        language_code="zh",
        location_summary=location,
        needs_summary=report.original_narrative,
        latest_public_update=latest_public_update,
        reporter_name=report.reporter_name,
        reporter_phone=report.reporter_phone,
        subject_type=report.subject_type,
        person_label=person_name,
        approximate_age=age,
        identifying_details=detail,
        last_known_location=location,
        last_known_time=report.submitted_at,
        safety_status=safety,
        handling_status=handling,
        assigned_staff_user_id=assigned_staff_user_id,
        confirmed_at=confirmed_at,
    )


def add_demo_attachment(db, incident_id: int, report_id: int, case_id: int | None, index: int, *, public: bool) -> int:
    storage = LocalReportAttachmentStorage()
    content = demo_png_bytes(index, is_pet=index % 5 in {1, 4})
    storage_key = f"{ATTACHMENT_PREFIX.lower()}-{index + 1:05d}.png"
    storage.write_bytes(storage_key, content)
    db.add(
        ReportAttachment(
            incident_id=incident_id,
            report_id=report_id,
            case_id=case_id,
            attachment_code=f"{ATTACHMENT_PREFIX}{index + 1:05d}",
            storage_key=storage_key,
            original_filename=f"demo-photo-{index + 1:05d}.png",
            content_type="image/png",
            byte_size=len(content),
            public_visibility=public,
            moderation_status=AttachmentModerationStatus.APPROVED if public else AttachmentModerationStatus.PENDING,
            linked_at=datetime.now(timezone.utc),
        )
    )
    return 1


def build_narrative(*, is_pet: bool, name: str | None, location: str, detail: str) -> str:
    subject = name or ("未命名宠物" if is_pet else "姓名不详人员")
    if is_pet:
        return f"{subject} 最后在 {location} 附近被看到。特征：{detail}。请协助留意。"
    return f"{subject} 最后在 {location} 附近被看到。识别信息：{detail}。目前需要志愿者核实。"


def submission_type(*, index: int, is_pet: bool) -> str:
    if is_pet:
        return "宠物失联"
    return "人员补充资料" if index % 7 == 0 else "人员失联"


def pet_age(index: int) -> str:
    return f"{1 + index % 12}岁"


def demo_png_bytes(index: int, *, is_pet: bool) -> bytes:
    width, height = 360, 240
    bg = palette(index)
    fg = (30, 64, 55) if not is_pet else (80, 55, 35)
    rows = []
    for y in range(height):
        row = bytearray()
        for x in range(width):
            color = bg
            if is_pet:
                dx = (x - width // 2) / 92
                dy = (y - height // 2) / 60
                if dx * dx + dy * dy < 1:
                    color = fg
                if 126 < y < 146 and 132 < x < 228:
                    color = (245, 245, 232)
            else:
                dx = (x - width // 2) / 42
                dy = (y - 80) / 42
                if dx * dx + dy * dy < 1 or (105 < y < 205 and 125 < x < 235):
                    color = fg
            row.extend(color)
        rows.append(b"\x00" + bytes(row))
    raw = b"".join(rows)
    return png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + png_chunk(
        b"IDAT", zlib.compress(raw, 9)
    ) + png_chunk(b"IEND", b"")


def palette(index: int) -> tuple[int, int, int]:
    colors = [
        (222, 238, 232),
        (252, 236, 202),
        (224, 230, 218),
        (232, 221, 210),
        (214, 229, 239),
        (240, 226, 230),
    ]
    return colors[index % len(colors)]


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", binascii.crc32(kind + data) & 0xFFFFFFFF)


if __name__ == "__main__":
    raise SystemExit(main())
