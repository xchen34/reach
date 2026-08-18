"""Seed local demo data with synthetic people/pet records and curated avatar photos.

Run inside the API container:

    python -m app.scripts.seed_demo_records --count 60
    python -m app.scripts.seed_demo_records --count 60 --photo-preset dicebear-robohash
    python -m app.scripts.seed_demo_records --count 60 --photo-dir /app/data/seed_ai_photos
    python -m app.scripts.seed_demo_records --count 60 --photo-manifest-url https://example.com/photos.json

When --photo-dir or --photo-manifest-url is provided, the script uses
JPEG, PNG, or WebP images from that source. Otherwise it uses a small fixed
avatar set and reuses those images across records.

Preferred remote manifest format:

    {"person": ["https://..."], "pet": ["https://..."]}

Legacy manifest formats still work and are reused for all subject types:

    ["https://..."]
    {"photos": ["https://..."]}
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
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
    return True


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
    return curated_seed_avatar_content(index, is_pet=is_pet)


def curated_seed_avatar_content(index: int, *, is_pet: bool) -> tuple[bytes, str]:
    directory = seed_avatar_root() / ("pets" if is_pet else "humans")
    assets = sorted(path for path in directory.iterdir() if path.is_file() and detect_image_content_type(path.read_bytes()))
    if not assets:
        raise RuntimeError(f"No seed avatar PNG/WebP/JPEG assets found in {directory}.")
    path = assets[index % len(assets)]
    content = path.read_bytes()
    content_type = detect_image_content_type(content)
    if content_type is None:
        raise RuntimeError(f"Unsupported seed avatar asset: {path}")
    return content, content_type


def seed_avatar_root() -> Path:
    return Path(__file__).resolve().parents[1] / "assets" / "seed-avatars"


if __name__ == "__main__":
    raise SystemExit(main())
