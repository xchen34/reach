"""Backfill photos for existing local demo seed records.

Run inside the API container:

    python -m app.scripts.backfill_seed_demo_photos

By default, the script only touches records created by seed_demo_records.py.
Use --all-local-records for local imported demo rows with generated report
codes. It adds one attachment to missing cases/reports and reuses the same demo
image source logic as the seed script.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import exists, select

from app.config import get_settings
from app.db import SessionLocal
from app.models.case import Case
from app.models.case_report import CaseReport
from app.models.enums import AttachmentModerationStatus, SubjectType
from app.models.report import Report
from app.models.report_attachment import ReportAttachment
from app.services.report_attachment_storage import LocalReportAttachmentStorage
from app.scripts.seed_demo_records import (
    ATTACHMENT_PREFIX,
    CASE_PREFIX,
    DICEBEAR_ROBOHASH_PRESET,
    PHOTO_EXTENSIONS_BY_CONTENT_TYPE,
    REPORT_PREFIX,
    PhotoAssetPool,
    curated_seed_avatar_content,
    empty_photo_asset_pool,
    load_photo_assets,
    load_preset_photo_assets,
    load_remote_photo_assets,
    photo_source_label,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill missing photos for local Reach demo seed records.")
    parser.add_argument(
        "--photo-dir",
        type=Path,
        help="Optional directory of local JPEG, PNG, or WebP images to use for backfilled attachments.",
    )
    parser.add_argument(
        "--photo-manifest-url",
        help="Optional URL for a JSON or text manifest of image URLs.",
    )
    parser.add_argument(
        "--photo-preset",
        choices=[DICEBEAR_ROBOHASH_PRESET],
        default=DICEBEAR_ROBOHASH_PRESET,
        help="Optional built-in online avatar preset: DiceBear Open Peeps people and Robohash cats.",
    )
    parser.add_argument(
        "--no-remote-preset",
        action="store_true",
        help="Skip online avatar presets and use the seed script's generated PNG fallback.",
    )
    parser.add_argument(
        "--all-local-records",
        action="store_true",
        help="Backfill all local non-production case/report records instead of only DCASE/DREP bulk seed records.",
    )
    parser.add_argument(
        "--refresh-backfilled",
        action="store_true",
        help="Overwrite existing datt-backfill-* images with generated cartoon avatar PNGs.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Report what would be added without writing.")
    args = parser.parse_args()

    settings = get_settings()
    if settings.app_env.lower() == "production":
        print("Refusing to backfill demo photos while Reach_APP_ENV=production.")
        return 2

    local_photo_assets = load_photo_assets(args.photo_dir)
    manifest_photo_assets = empty_photo_asset_pool()
    preset_photo_assets = empty_photo_asset_pool()
    if not local_photo_assets.has_assets():
        manifest_photo_assets = load_remote_photo_assets(args.photo_manifest_url)
    if not local_photo_assets.has_assets() and not manifest_photo_assets.has_assets() and not args.no_remote_preset:
        preset_photo_assets = load_preset_photo_assets(args.photo_preset)

    photo_assets = local_photo_assets
    if not photo_assets.has_assets():
        photo_assets = manifest_photo_assets if manifest_photo_assets.has_assets() else preset_photo_assets

    with SessionLocal() as db:
        if args.refresh_backfilled:
            refreshed = refresh_backfilled_avatars(db, dry_run=args.dry_run)
            if not args.dry_run:
                db.commit()
            print("Reach demo photo backfill complete.")
            print(f"target_attachments={refreshed}")
            print(f"refreshed_attachments={0 if args.dry_run else refreshed}")
            print("photo_source=curated_seed_avatars")
            return 0

        case_query = select(Case)
        report_query = select(Report)
        if not args.all_local_records:
            case_query = case_query.where(Case.case_code.like(f"{CASE_PREFIX}%"))
            report_query = report_query.where(Report.report_code.like(f"{REPORT_PREFIX}%"))
        case_targets = db.scalars(
            case_query.where(
                ~exists().where(
                    (ReportAttachment.case_id == Case.id)
                    & (ReportAttachment.public_visibility.is_(True))
                    & (ReportAttachment.moderation_status == AttachmentModerationStatus.APPROVED)
                )
            ).order_by(Case.id)
        ).all()
        report_targets = db.scalars(
            report_query.where(~exists().where(ReportAttachment.report_id == Report.id))
            .where(~exists().where(CaseReport.report_id == Report.id))
            .order_by(Report.id)
        ).all()

        if not args.dry_run:
            for offset, case in enumerate(case_targets):
                linked_report = linked_report_for_case(db, case.id)
                add_backfill_attachment(
                    db,
                    incident_id=case.incident_id,
                    report_id=linked_report.id if linked_report is not None else None,
                    case_id=case.id,
                    subject_type=subject_type_for_case(case, linked_report),
                    seed_index=seed_index(case.case_code, fallback=offset),
                    public=True,
                    photo_assets=photo_assets,
                )
            for offset, report in enumerate(report_targets, start=len(case_targets)):
                add_backfill_attachment(
                    db,
                    incident_id=report.incident_id,
                    report_id=report.id,
                    case_id=None,
                    subject_type=report.subject_type,
                    seed_index=seed_index(report.report_code, fallback=offset),
                    public=False,
                    photo_assets=photo_assets,
                )
            db.commit()

    print("Reach demo photo backfill complete.")
    print(f"missing_seed_cases={len(case_targets)}")
    print(f"missing_seed_reports={len(report_targets)}")
    print(f"created_attachments={0 if args.dry_run else len(case_targets) + len(report_targets)}")
    print(
        "photo_source="
        + photo_source_label(
            has_local_assets=local_photo_assets.has_assets(),
            has_manifest_assets=manifest_photo_assets.has_assets(),
            has_preset_assets=preset_photo_assets.has_assets(),
        )
    )
    return 0


def linked_report_for_case(db, case_id: int) -> Report | None:
    return db.scalar(
        select(Report).join(CaseReport, CaseReport.report_id == Report.id).where(CaseReport.case_id == case_id)
    )


def subject_type_for_case(case: Case, linked_report: Report | None) -> SubjectType:
    if case.subject_type in {SubjectType.PERSON, SubjectType.PET}:
        return case.subject_type
    if linked_report is not None and linked_report.subject_type in {SubjectType.PERSON, SubjectType.PET}:
        return linked_report.subject_type
    return SubjectType.PERSON


def add_backfill_attachment(
    db,
    *,
    incident_id: int,
    report_id: int | None,
    case_id: int | None,
    subject_type: SubjectType,
    seed_index: int,
    public: bool,
    photo_assets: PhotoAssetPool,
) -> None:
    is_pet = subject_type == SubjectType.PET
    content, content_type = backfill_photo_content(seed_index, is_pet=is_pet, photo_assets=photo_assets)
    extension = PHOTO_EXTENSIONS_BY_CONTENT_TYPE[content_type]
    owner = f"case-{case_id}" if case_id is not None else f"report-{report_id}"
    storage_key = f"{ATTACHMENT_PREFIX.lower()}-backfill-{owner}.{extension}"
    LocalReportAttachmentStorage().write_bytes(storage_key, content)
    db.add(
        ReportAttachment(
            incident_id=incident_id,
            report_id=report_id,
            case_id=case_id,
            attachment_code=f"{ATTACHMENT_PREFIX}B{seed_index + 1:05d}",
            storage_key=storage_key,
            original_filename=f"demo-backfill-photo-{seed_index + 1:05d}.{extension}",
            content_type=content_type,
            byte_size=len(content),
            public_visibility=public,
            moderation_status=AttachmentModerationStatus.APPROVED if public else AttachmentModerationStatus.PENDING,
            linked_at=datetime.now(timezone.utc),
        )
    )


def refresh_backfilled_avatars(db, *, dry_run: bool) -> int:
    attachments = db.scalars(
        select(ReportAttachment)
        .where(ReportAttachment.storage_key.like(f"{ATTACHMENT_PREFIX.lower()}-backfill-%"))
        .order_by(ReportAttachment.id)
    ).all()
    storage = LocalReportAttachmentStorage()
    for offset, attachment in enumerate(attachments):
        subject_type = subject_type_for_attachment(attachment)
        content, _ = curated_seed_avatar_content(offset, is_pet=subject_type == SubjectType.PET)
        if dry_run:
            continue
        storage.write_bytes(attachment.storage_key, content)
        attachment.content_type = "image/png"
        attachment.byte_size = len(content)
        attachment.original_filename = f"demo-cartoon-avatar-{offset + 1:05d}.png"
    return len(attachments)


def subject_type_for_attachment(attachment: ReportAttachment) -> SubjectType:
    if attachment.case is not None and attachment.case.subject_type in {SubjectType.PERSON, SubjectType.PET}:
        return attachment.case.subject_type
    if attachment.report is not None and attachment.report.subject_type in {SubjectType.PERSON, SubjectType.PET}:
        return attachment.report.subject_type
    return SubjectType.PERSON


def backfill_photo_content(index: int, *, is_pet: bool, photo_assets: PhotoAssetPool) -> tuple[bytes, str]:
    preferred_assets = photo_assets.pet if is_pet else photo_assets.person
    assets = preferred_assets or photo_assets.fallback or photo_assets.pet or photo_assets.person
    if assets:
        asset = assets[index % len(assets)]
        return asset.content, asset.content_type
    return curated_seed_avatar_content(index, is_pet=is_pet)


def seed_index(code: str, *, fallback: int) -> int:
    digits = "".join(char for char in code if char.isdigit())
    if not digits:
        return fallback
    return max(0, int(digits) - 1)


if __name__ == "__main__":
    raise SystemExit(main())
