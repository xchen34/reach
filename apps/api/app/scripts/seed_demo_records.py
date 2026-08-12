"""Seed local demo data with synthetic people/pet records and generated cartoon photos.

Run inside the API container:

    python -m app.scripts.seed_demo_records --count 60
    python -m app.scripts.seed_demo_records --count 60 --photo-preset dicebear-robohash
    python -m app.scripts.seed_demo_records --count 60 --photo-dir /app/data/seed_ai_photos
    python -m app.scripts.seed_demo_records --count 60 --photo-manifest-url https://example.com/photos.json

When --photo-dir or --photo-manifest-url is provided, the script uses
AI-generated JPEG, PNG, or WebP images from that source. Otherwise it uses a
small fixed cartoon avatar set and reuses those images across records. If the
remote avatar preset is unavailable, it falls back to synthetic PNGs generated
in code.

Preferred remote manifest format:

    {"person": ["https://..."], "pet": ["https://..."]}

Legacy manifest formats still work and are reused for all subject types:

    ["https://..."]
    {"photos": ["https://..."]}
"""

from __future__ import annotations

import argparse
import binascii
import json
import struct
import sys
import urllib.error
import urllib.request
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import NamedTuple

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
PHOTO_COVERAGE_MODULUS = 5
REMOTE_PHOTO_TIMEOUT_SECONDS = 10
REMOTE_PHOTO_MAX_BYTES = 8 * 1024 * 1024
DICEBEAR_ROBOHASH_PRESET = "dicebear-robohash"
PHOTO_EXTENSIONS_BY_CONTENT_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


class PhotoAsset(NamedTuple):
    content: bytes
    content_type: str


class PhotoAssetPool(NamedTuple):
    person: list[PhotoAsset]
    pet: list[PhotoAsset]
    fallback: list[PhotoAsset]

    def has_assets(self) -> bool:
        return bool(self.person or self.pet or self.fallback)


class PhotoManifest(NamedTuple):
    person: list[str]
    pet: list[str]
    fallback: list[str]


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
    parser.add_argument(
        "--photo-dir",
        type=Path,
        help=(
            "Optional directory of local AI-generated JPEG, PNG, or WebP images "
            "to use for demo attachments. Files are copied into Reach storage."
        ),
    )
    parser.add_argument(
        "--photo-manifest-url",
        help=(
            "Optional URL for a JSON or text manifest of AI-generated image URLs. "
            "JSON can be a list of URLs or an object with a photos/images/urls list."
        ),
    )
    parser.add_argument(
        "--photo-preset",
        choices=[DICEBEAR_ROBOHASH_PRESET],
        default=DICEBEAR_ROBOHASH_PRESET,
        help="Optional built-in online avatar preset: DiceBear Open Peeps people and Robohash cats.",
    )
    args = parser.parse_args()

    settings = get_settings()
    if settings.app_env.lower() == "production":
        print("Refusing to seed demo records while Reach_APP_ENV=production.", file=sys.stderr)
        return 2
    if args.count < 20:
        print("--count must be at least 20 so the demo has enough status variety.", file=sys.stderr)
        return 2
    local_photo_assets = load_photo_assets(args.photo_dir)
    manifest_photo_assets = empty_photo_asset_pool()
    preset_photo_assets = empty_photo_asset_pool()
    if not local_photo_assets.has_assets():
        manifest_photo_assets = load_remote_photo_assets(args.photo_manifest_url)
    if not local_photo_assets.has_assets() and not manifest_photo_assets.has_assets():
        preset_photo_assets = load_preset_photo_assets(args.photo_preset)
    photo_assets = local_photo_assets
    if not photo_assets.has_assets():
        photo_assets = manifest_photo_assets if manifest_photo_assets.has_assets() else preset_photo_assets
    photo_source = photo_source_label(
        has_local_assets=local_photo_assets.has_assets(),
        has_manifest_assets=manifest_photo_assets.has_assets(),
        has_preset_assets=preset_photo_assets.has_assets(),
    )
    if args.photo_dir and not photo_assets.has_assets():
        print(
            f"No usable JPEG, PNG, or WebP images found in {args.photo_dir}; "
            "checking remote manifest or falling back to generated placeholder PNGs.",
            file=sys.stderr,
        )
    if (args.photo_manifest_url or args.photo_preset) and not photo_assets.has_assets():
        print(
            "No usable JPEG, PNG, or WebP images found from remote photo source; "
            "falling back to generated placeholder PNGs.",
            file=sys.stderr,
        )

    with SessionLocal() as db:
        incident_result = bootstrap_demo_incident(db, google_sheet_name="Form Responses 1")
        if not args.keep_existing:
            removed = clear_existing_seed(db)
        else:
            removed = 0
        user = get_or_create_seed_user(db)
        created = create_seed_records(db, incident_result.incident_id, user.id, args.count, photo_assets=photo_assets)
        db.commit()

    print("Reach demo bulk seed complete.")
    print(f"removed_previous_records={removed}")
    print(f"created_reports={created['reports']}")
    print(f"created_cases={created['cases']}")
    print(f"created_attachments={created['attachments']}")
    print(f"photo_source={photo_source}")
    print("Open http://127.0.0.1:3000/staff and http://127.0.0.1:3000/board")
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


def create_seed_records(
    db,
    incident_id: int,
    user_id: int,
    count: int,
    *,
    photo_assets: PhotoAssetPool,
) -> dict[str, int]:
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
            language_code="en",
            raw_answers_json={
                "submission_type": submission_type(index=index, is_pet=is_pet),
                "person_name": person_name,
                "approximate_age": age,
                "gender": gender,
                "current_status": "Temporarily unreachable; waiting for verification.",
                "identifying_description": detail,
            },
            original_narrative=build_narrative(is_pet=is_pet, name=person_name, location=location, detail=detail),
            location_text=location,
            reporter_name=None if index % 6 == 0 else f"Reporter {index + 1}",
            reporter_email=None,
            reporter_phone=f"6{1000000 + index:07d}" if has_phone else None,
            reporter_relationship=None if index % 4 == 0 else "Neighbor or family",
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
            if should_add_demo_photo(index):
                attachment_count += add_demo_attachment(
                    db,
                    incident_id,
                    report.id,
                    case.id,
                    index,
                    public=True,
                    photo_assets=photo_assets,
                )
        elif should_add_demo_photo(index):
            attachment_count += add_demo_attachment(
                db,
                incident_id,
                report.id,
                None,
                index,
                public=False,
                photo_assets=photo_assets,
            )

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
    latest_public_update = "Waiting for a volunteer to claim this task."
    confirmed_at = None

    if status_bucket in {4, 5, 6}:
        status = CaseStatus.ACTIVE
        handling = CaseHandlingStatus.BEING_INVESTIGATED
        assigned_staff_user_id = user_id
        latest_public_update = "Volunteer follow-up is in progress."
    elif status_bucket in {7, 8, 9}:
        status = CaseStatus.SAFE_RESOLVED
        safety = CaseSafetyStatus.CONFIRMED_SAFE
        handling = CaseHandlingStatus.ARCHIVED
        latest_public_update = "Safe confirmation received."
        confirmed_at = datetime.now(timezone.utc) - timedelta(hours=index)
    elif status_bucket == 10:
        status = CaseStatus.CLOSED
        safety = CaseSafetyStatus.CONFIRMED_DECEASED
        handling = CaseHandlingStatus.ARCHIVED
        latest_public_update = "Confirmed death information received."
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
        language_code="en",
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


def add_demo_attachment(
    db,
    incident_id: int,
    report_id: int,
    case_id: int | None,
    index: int,
    *,
    public: bool,
    photo_assets: PhotoAssetPool,
) -> int:
    storage = LocalReportAttachmentStorage()
    content, content_type = demo_photo_content(index, is_pet=index % 5 in {1, 4}, photo_assets=photo_assets)
    extension = PHOTO_EXTENSIONS_BY_CONTENT_TYPE[content_type]
    storage_key = f"{ATTACHMENT_PREFIX.lower()}-{index + 1:05d}.{extension}"
    storage.write_bytes(storage_key, content)
    db.add(
        ReportAttachment(
            incident_id=incident_id,
            report_id=report_id,
            case_id=case_id,
            attachment_code=f"{ATTACHMENT_PREFIX}{index + 1:05d}",
            storage_key=storage_key,
            original_filename=f"demo-photo-{index + 1:05d}.{extension}",
            content_type=content_type,
            byte_size=len(content),
            public_visibility=public,
            moderation_status=AttachmentModerationStatus.APPROVED if public else AttachmentModerationStatus.PENDING,
            linked_at=datetime.now(timezone.utc),
        )
    )
    return 1


def build_narrative(*, is_pet: bool, name: str | None, location: str, detail: str) -> str:
    subject = name or ("Unnamed pet" if is_pet else "Unnamed person")
    if is_pet:
        return f"{subject} was last seen near {location}. Details: {detail}. Please watch for updates."
    return f"{subject} was last seen near {location}. Identifying details: {detail}. Volunteer verification is needed."


def submission_type(*, index: int, is_pet: bool) -> str:
    if is_pet:
        return "Missing pet"
    return "Person update" if index % 7 == 0 else "Missing person"


def pet_age(index: int) -> str:
    return f"{1 + index % 12} years"


def should_add_demo_photo(index: int) -> bool:
    return index % PHOTO_COVERAGE_MODULUS != 0


def empty_photo_asset_pool() -> PhotoAssetPool:
    return PhotoAssetPool(person=[], pet=[], fallback=[])


def load_photo_assets(photo_dir: Path | None) -> PhotoAssetPool:
    if photo_dir is None:
        return empty_photo_asset_pool()
    if not photo_dir.exists() or not photo_dir.is_dir():
        return empty_photo_asset_pool()

    assets: list[PhotoAsset] = []
    for path in sorted(photo_dir.iterdir()):
        if not path.is_file():
            continue
        try:
            content = path.read_bytes()
        except OSError:
            continue
        content_type = detect_image_content_type(content)
        if content_type:
            assets.append(PhotoAsset(content=content, content_type=content_type))
    return PhotoAssetPool(person=[], pet=[], fallback=assets)


def load_remote_photo_assets(manifest_url: str | None) -> PhotoAssetPool:
    if not manifest_url:
        return empty_photo_asset_pool()
    try:
        manifest_content = fetch_remote_bytes(manifest_url, max_bytes=1024 * 1024)
    except RuntimeError as exc:
        print(f"Could not load photo manifest: {exc}", file=sys.stderr)
        return empty_photo_asset_pool()

    manifest = parse_photo_manifest(manifest_content)
    return PhotoAssetPool(
        person=download_photo_assets(manifest.person),
        pet=download_photo_assets(manifest.pet),
        fallback=download_photo_assets(manifest.fallback),
    )


def load_preset_photo_assets(photo_preset: str | None) -> PhotoAssetPool:
    if photo_preset != DICEBEAR_ROBOHASH_PRESET:
        return empty_photo_asset_pool()
    return PhotoAssetPool(
        person=download_photo_assets(dicebear_open_peeps_urls()),
        pet=download_photo_assets(robohash_cat_urls()),
        fallback=[],
    )


def dicebear_open_peeps_urls() -> list[str]:
    return [
        f"https://api.dicebear.com/10.x/open-peeps/png?seed=person-{index:03d}&size=256"
        for index in range(1, 11)
    ]


def robohash_cat_urls() -> list[str]:
    return [
        f"https://robohash.org/pet-{index:03d}.png?set=set4&size=256x256"
        for index in range(1, 11)
    ]


def download_photo_assets(urls: list[str]) -> list[PhotoAsset]:
    downloaded: list[PhotoAsset] = []
    for url in urls:
        try:
            content = fetch_remote_bytes(url, max_bytes=REMOTE_PHOTO_MAX_BYTES)
        except RuntimeError as exc:
            print(f"Skipping remote photo {url}: {exc}", file=sys.stderr)
            continue
        content_type = detect_image_content_type(content)
        if content_type:
            downloaded.append(PhotoAsset(content=content, content_type=content_type))
        else:
            print(f"Skipping remote photo {url}: unsupported image content.", file=sys.stderr)
    return downloaded


def parse_photo_manifest(content: bytes) -> PhotoManifest:
    text = content.decode("utf-8", errors="replace")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return PhotoManifest(person=[], pet=[], fallback=parse_plain_text_photo_manifest(text))

    if isinstance(parsed, list):
        return PhotoManifest(person=[], pet=[], fallback=filter_http_urls(parsed))
    if isinstance(parsed, dict):
        person_urls = filter_http_urls(parsed.get("person", []))
        pet_urls = filter_http_urls(parsed.get("pet", []))
        if person_urls or pet_urls:
            return PhotoManifest(person=person_urls, pet=pet_urls, fallback=[])
        for key in ("photos", "images", "urls"):
            value = parsed.get(key)
            if isinstance(value, list):
                return PhotoManifest(person=[], pet=[], fallback=filter_http_urls(value))
    return PhotoManifest(person=[], pet=[], fallback=[])


def filter_http_urls(values: object) -> list[str]:
    if not isinstance(values, list):
        return []
    return [item for item in values if isinstance(item, str) and is_http_url(item)]


def parse_plain_text_photo_manifest(text: str) -> list[str]:
    urls: list[str] = []
    for line in text.splitlines():
        value = line.strip()
        if not value or value.startswith("#"):
            continue
        if is_http_url(value):
            urls.append(value)
    return urls


def fetch_remote_bytes(url: str, *, max_bytes: int) -> bytes:
    if not is_http_url(url):
        raise RuntimeError("URL must start with http:// or https://.")

    request = urllib.request.Request(url, headers={"User-Agent": "Reach-demo-seed/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=REMOTE_PHOTO_TIMEOUT_SECONDS) as response:
            content = response.read(max_bytes + 1)
    except (OSError, urllib.error.URLError) as exc:
        raise RuntimeError(str(exc)) from exc

    if len(content) > max_bytes:
        raise RuntimeError(f"response exceeds {max_bytes} bytes.")
    return content


def is_http_url(value: str) -> bool:
    return value.startswith("https://") or value.startswith("http://")


def photo_source_label(*, has_local_assets: bool, has_manifest_assets: bool, has_preset_assets: bool) -> str:
    if has_local_assets:
        return "local_ai_directory"
    if has_manifest_assets:
        return "remote_ai_manifest"
    if has_preset_assets:
        return "remote_photo_preset"
    return "generated_placeholders"


def detect_image_content_type(content: bytes) -> str | None:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def demo_photo_content(index: int, *, is_pet: bool, photo_assets: PhotoAssetPool) -> tuple[bytes, str]:
    preferred_assets = photo_assets.pet if is_pet else photo_assets.person
    assets = preferred_assets or photo_assets.fallback or photo_assets.pet or photo_assets.person
    if assets:
        asset = assets[index % len(assets)]
        return asset.content, asset.content_type
    return demo_png_bytes(index, is_pet=is_pet), "image/png"


def demo_png_bytes(index: int, *, is_pet: bool) -> bytes:
    width = height = 256
    bg = avatar_background(index)
    rows = []
    for y in range(height):
        row = bytearray()
        for x in range(width):
            color = avatar_base_pixel(x, y, index, bg)
            if is_pet:
                color = pet_avatar_pixel(x, y, index, color)
            else:
                color = human_avatar_pixel(x, y, index, color)
            row.extend(color)
        rows.append(b"\x00" + bytes(row))
    raw = b"".join(rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + png_chunk(b"IDAT", zlib.compress(raw, 9))
        + png_chunk(b"IEND", b"")
    )


INK = (48, 56, 58)
SOFT_INK = (86, 94, 93)
LIGHT_LINE = (178, 188, 184)


def avatar_base_pixel(x: int, y: int, index: int, bg: tuple[int, int, int]) -> tuple[int, int, int]:
    if ellipse_fill(x, y, 128, 132, 112, 112):
        return tint(bg, 12)
    if ellipse_stroke(x, y, 128, 132, 112, 112, 0.965):
        return LIGHT_LINE
    return bg


def human_avatar_pixel(x: int, y: int, index: int, current: tuple[int, int, int]) -> tuple[int, int, int]:
    skin = skin_palette(index)
    hair = hair_palette(index)
    clothing = clothing_palette(index)
    head_rx = [38, 42, 36, 44, 40, 39][index % 6]
    head_ry = [52, 48, 56, 50, 54, 47][index % 6]
    head_cy = 128 + [0, -1, 1, 0, 2, -2][index % 6]
    style = index % 7

    if ellipse_fill(x, y, 128, 226, 75, 40):
        current = clothing
    if ellipse_stroke(x, y, 128, 226, 75, 40, 0.91):
        current = INK
    if 112 <= x <= 144 and 172 <= y <= 204:
        current = skin
    if (line_distance(x, y, 118, 204, 128, 220) <= 1.2) or (line_distance(x, y, 138, 204, 128, 220) <= 1.2):
        current = tint(clothing, 36)

    if ellipse_fill(x, y, 92, head_cy + 6, 8, 15) or ellipse_fill(x, y, 164, head_cy + 6, 8, 15):
        current = skin
    if ellipse_fill(x, y, 128, head_cy, head_rx, head_ry):
        current = skin
    if ellipse_stroke(x, y, 128, head_cy, head_rx, head_ry, 0.94):
        current = INK

    current = human_hair_pixel(x, y, style, hair, current)

    if ellipse_fill(x, y, 112, head_cy + 7, 3, 3) or ellipse_fill(x, y, 144, head_cy + 7, 3, 3):
        current = INK
    if line_distance(x, y, 128, head_cy + 12, 124, head_cy + 25) <= 0.85:
        current = tint(SOFT_INK, 12)
    if line_distance(x, y, 118, head_cy + 35, 138, head_cy + 35) <= 1.1:
        current = muted_mouth(index)
    if style in {2, 5}:
        if ellipse_stroke(x, y, 112, head_cy + 7, 10, 7, 0.74) or ellipse_stroke(x, y, 144, head_cy + 7, 10, 7, 0.74):
            current = INK
        if 122 <= x <= 134 and head_cy + 6 <= y <= head_cy + 8:
            current = INK
    if style == 6 and ellipse_stroke(x, y, 128, head_cy + 1, 21, 31, 0.88):
        current = tint(skin, -18)
    return current


def human_hair_pixel(
    x: int,
    y: int,
    style: int,
    hair: tuple[int, int, int],
    current: tuple[int, int, int],
) -> tuple[int, int, int]:
    if style == 0:
        if ellipse_fill(x, y, 128, 91, 44, 24) or (86 <= x <= 170 and 91 <= y <= 112):
            return hair
    elif style == 1:
        if ellipse_fill(x, y, 128, 106, 50, 43) and not ellipse_fill(x, y, 128, 131, 37, 36):
            return hair
        if 82 <= x <= 101 and 103 <= y <= 160:
            return hair
        if 155 <= x <= 174 and 103 <= y <= 160:
            return hair
    elif style == 2:
        if ellipse_fill(x, y, 128, 91, 37, 21):
            return hair
        if triangle_fill(x, y, 97, 99, 116, 75, 133, 101):
            return hair
    elif style == 3:
        if ellipse_fill(x, y, 128, 94, 48, 27):
            return hair
        if ellipse_fill(x, y, 97, 113, 17, 34):
            return hair
    elif style == 4:
        if ellipse_fill(x, y, 128, 88, 34, 19):
            return hair
        if 92 <= x <= 164 and 96 <= y <= 110:
            return hair
    elif style == 5:
        if ellipse_fill(x, y, 128, 93, 46, 25):
            return hair
        if ellipse_fill(x, y, 168, 132, 13, 31):
            return hair
    else:
        if ellipse_stroke(x, y, 128, 95, 44, 25, 0.62):
            return hair
    return current


def pet_avatar_pixel(x: int, y: int, index: int, current: tuple[int, int, int]) -> tuple[int, int, int]:
    species = index % 2
    fur = fur_palette(index)
    patch = pet_patch_palette(index)
    collar = clothing_palette(index + 2)
    if species == 0:
        return cat_avatar_pixel(x, y, index, current, fur, patch, collar)
    return dog_avatar_pixel(x, y, index, current, fur, patch, collar)


def cat_avatar_pixel(
    x: int,
    y: int,
    index: int,
    current: tuple[int, int, int],
    fur: tuple[int, int, int],
    patch: tuple[int, int, int],
    collar: tuple[int, int, int],
) -> tuple[int, int, int]:
    ear_shift = (index % 3) * 4
    if triangle_fill(x, y, 78, 96, 99, 43 + ear_shift, 118, 105) or triangle_fill(x, y, 178, 96, 157, 43, 138, 105):
        current = fur
    if triangle_stroke(x, y, 78, 96, 99, 43 + ear_shift, 118, 105) or triangle_stroke(x, y, 178, 96, 157, 43, 138, 105):
        current = INK
    if triangle_fill(x, y, 91, 91, 101, 61 + ear_shift, 110, 94) or triangle_fill(x, y, 165, 91, 155, 61, 146, 94):
        current = tint(patch, 12)
    if ellipse_fill(x, y, 128, 137, 67, 58):
        current = fur
    if ellipse_stroke(x, y, 128, 137, 67, 58, 0.94):
        current = INK
    if index % 4 in {1, 2} and ellipse_fill(x, y, 105, 129, 20, 26):
        current = patch
    if ellipse_fill(x, y, 106, 138, 4, 6) or ellipse_fill(x, y, 150, 138, 4, 6):
        current = INK
    if ellipse_fill(x, y, 128, 156, 8, 6):
        current = INK
    if ellipse_stroke(x, y, 128, 175, 28, 13, 0.77):
        current = tint(fur, 34)
    if line_distance(x, y, 91, 161, 118, 164) <= 1.0 or line_distance(x, y, 138, 164, 165, 161) <= 1.0:
        current = SOFT_INK
    if 94 <= x <= 162 and 200 <= y <= 207:
        current = collar
    return current


def dog_avatar_pixel(
    x: int,
    y: int,
    index: int,
    current: tuple[int, int, int],
    fur: tuple[int, int, int],
    patch: tuple[int, int, int],
    collar: tuple[int, int, int],
) -> tuple[int, int, int]:
    floppy = index % 3 != 0
    if floppy:
        if ellipse_fill(x, y, 83, 125, 22, 48) or ellipse_fill(x, y, 173, 125, 22, 48):
            current = tint(fur, -18)
        if ellipse_stroke(x, y, 83, 125, 22, 48, 0.9) or ellipse_stroke(x, y, 173, 125, 22, 48, 0.9):
            current = INK
    else:
        if triangle_fill(x, y, 81, 103, 100, 62, 117, 112) or triangle_fill(x, y, 175, 103, 156, 62, 139, 112):
            current = tint(fur, -12)
        if triangle_stroke(x, y, 81, 103, 100, 62, 117, 112) or triangle_stroke(x, y, 175, 103, 156, 62, 139, 112):
            current = INK
    if ellipse_fill(x, y, 128, 135, 62, 55):
        current = fur
    if ellipse_stroke(x, y, 128, 135, 62, 55, 0.94):
        current = INK
    if index % 4 in {0, 3} and ellipse_fill(x, y, 151, 124, 20, 25):
        current = patch
    if ellipse_fill(x, y, 128, 162, 32, 22):
        current = tint(fur, 30)
    if ellipse_stroke(x, y, 128, 162, 32, 22, 0.88):
        current = SOFT_INK
    if ellipse_fill(x, y, 106, 134, 4, 6) or ellipse_fill(x, y, 150, 134, 4, 6):
        current = INK
    if ellipse_fill(x, y, 128, 154, 9, 7):
        current = INK
    if line_distance(x, y, 128, 161, 128, 171) <= 1.0:
        current = SOFT_INK
    if 96 <= x <= 160 and 200 <= y <= 207:
        current = collar
    return current


def avatar_background(index: int) -> tuple[int, int, int]:
    colors = [(232, 237, 235), (238, 232, 224), (229, 234, 239), (236, 230, 232), (231, 236, 226)]
    return colors[index % len(colors)]


def skin_palette(index: int) -> tuple[int, int, int]:
    colors = [(224, 177, 137), (188, 127, 87), (241, 199, 162), (142, 91, 67), (207, 154, 111), (116, 77, 58)]
    return colors[index % len(colors)]


def hair_palette(index: int) -> tuple[int, int, int]:
    colors = [(45, 39, 35), (86, 63, 46), (35, 48, 54), (113, 82, 54), (67, 63, 69), (154, 145, 124)]
    return colors[index % len(colors)]


def clothing_palette(index: int) -> tuple[int, int, int]:
    colors = [(54, 101, 100), (82, 96, 124), (126, 88, 80), (95, 111, 78), (108, 92, 124), (91, 103, 105)]
    return colors[index % len(colors)]


def fur_palette(index: int) -> tuple[int, int, int]:
    colors = [(93, 70, 47), (58, 61, 58), (151, 120, 81), (210, 199, 178), (117, 91, 70), (70, 79, 82)]
    return colors[index % len(colors)]


def pet_patch_palette(index: int) -> tuple[int, int, int]:
    colors = [(226, 218, 199), (116, 96, 78), (74, 70, 65), (186, 159, 120), (238, 232, 216), (139, 127, 112)]
    return colors[index % len(colors)]


def muted_mouth(index: int) -> tuple[int, int, int]:
    colors = [(119, 76, 70), (101, 67, 65), (132, 83, 77)]
    return colors[index % len(colors)]


def ellipse_fill(x: int, y: int, cx: int, cy: int, rx: int, ry: int) -> bool:
    return ellipse_value(x, y, cx, cy, rx, ry) <= 1


def ellipse_stroke(x: int, y: int, cx: int, cy: int, rx: int, ry: int, inner: float) -> bool:
    value = ellipse_value(x, y, cx, cy, rx, ry)
    return inner <= value <= 1.04


def ellipse_value(x: int, y: int, cx: int, cy: int, rx: int, ry: int) -> float:
    return ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry)


def triangle_fill(x: int, y: int, ax: int, ay: int, bx: int, by: int, cx: int, cy: int) -> bool:
    weights = triangle_weights(x, y, ax, ay, bx, by, cx, cy)
    return weights is not None and all(value >= 0 for value in weights)


def triangle_stroke(x: int, y: int, ax: int, ay: int, bx: int, by: int, cx: int, cy: int) -> bool:
    weights = triangle_weights(x, y, ax, ay, bx, by, cx, cy)
    return weights is not None and all(value >= -0.02 for value in weights) and min(weights) <= 0.035


def triangle_weights(
    x: int,
    y: int,
    ax: int,
    ay: int,
    bx: int,
    by: int,
    cx: int,
    cy: int,
) -> tuple[float, float, float] | None:
    denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if denominator == 0:
        return None
    a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator
    b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator
    return a, b, 1 - a - b


def line_distance(x: int, y: int, ax: int, ay: int, bx: int, by: int) -> float:
    dx = bx - ax
    dy = by - ay
    if dx == 0 and dy == 0:
        return ((x - ax) * (x - ax) + (y - ay) * (y - ay)) ** 0.5
    t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    px = ax + t * dx
    py = ay + t * dy
    return ((x - px) * (x - px) + (y - py) * (y - py)) ** 0.5


def tint(color: tuple[int, int, int], amount: int) -> tuple[int, int, int]:
    return tuple(max(0, min(255, channel + amount)) for channel in color)


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", binascii.crc32(kind + data) & 0xFFFFFFFF)


if __name__ == "__main__":
    raise SystemExit(main())
