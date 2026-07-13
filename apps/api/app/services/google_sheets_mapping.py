from __future__ import annotations

from datetime import datetime
from typing import Any, Optional


GOOGLE_FORM_FIELD_MAP: dict[str, str] = {
    "Horodateur": "submitted_at",
    "What are you submitting?": "submission_type",
    "If update , what has changed?": "update_details",
    "Previous Report or Case Reference (Optional)": "previous_reference",
    "Full Name of the Person Being Reported": "person_name",
    "Other Name or Nickname (Optional)": "other_name",
    "Approximate Age": "approximate_age",
    "Gender": "gender",
    "Phone Number of the Person (Optional)": "person_phone",
    "Physical or Identifying Description": "identifying_description",
    "What is currently known about this person?": "current_status",
    "What is currently known about the person's situation?": "situation_details",
    "Exact Address or Last Confirmed Location": "exact_location",
    "Building or Residence Name (Optional)": "building_name",
    "Block or Tower (Optional)": "block_or_tower",
    "Floor (Optional)": "floor",
    "Apartment or Unit Number (Optional)": "apartment_or_unit",
    "Entrance or Access Instructions (Optional)": "access_instructions",
    "Date and Time Last Successfully Contacted or Seen": "last_contact_at",
    "Possible Current Location (Optional)": "possible_current_location",
    "Does any of the following apply to the person?": "vulnerabilities",
    "Essential Medication, Equipment or Assistance Needs (Optional)": "assistance_needs",
    "Are other people believed to be at the same address?": "other_people_same_address",
    "If yes, provide any known details (Optional)": "other_people_details",
    "Who has already been contacted?": "already_contacted",
    "What was the result of those checks or contacts? (Optional)": "contact_result",
    "What is the source of this information?": "information_source",
    "How would you like to submit this report?": "reporter_submission_mode",
    "Your Name": "reporter_name",
    "Your Relationship to the Person": "reporter_relationship",
    "Preferred Contact Method": "reporter_contact",
    "Consent and Acknowledgment": "consent_acknowledgment",
}


CHECKBOX_FIELDS = {"vulnerabilities"}


def map_google_sheet_row(row: dict[str, str], *, row_number: int) -> dict[str, Any]:
    mapped: dict[str, Any] = {"source_row_number": row_number, "raw_row": dict(row)}
    unknown: dict[str, str] = {}

    for label, value in row.items():
        internal_name = GOOGLE_FORM_FIELD_MAP.get(label)
        if internal_name is None:
            unknown[label] = value
            continue
        mapped[internal_name] = _parse_checkbox(value) if internal_name in CHECKBOX_FIELDS else value
        mapped[f"{internal_name}_raw"] = value

    if unknown:
        mapped["unknown_columns"] = unknown

    submitted_at_parsed = _parse_datetime(mapped.get("submitted_at"))
    mapped["submitted_at_parsed"] = submitted_at_parsed.isoformat() if submitted_at_parsed else None
    return mapped


def build_original_narrative(mapped: dict[str, Any]) -> str:
    pieces = [
        ("Submission type", mapped.get("submission_type")),
        ("Person", mapped.get("person_name")),
        ("Current status", mapped.get("current_status")),
        ("Situation", mapped.get("situation_details")),
        ("Last contact", mapped.get("last_contact_at")),
        ("Vulnerabilities", _join_value(mapped.get("vulnerabilities"))),
        ("Information source", mapped.get("information_source")),
        ("Update details", mapped.get("update_details")),
        ("Previous reference", mapped.get("previous_reference")),
    ]
    lines = [f"{label}: {value}" for label, value in pieces if value]
    return "\n".join(lines) or "Google Forms submission imported for staff review."


def build_location_text(mapped: dict[str, Any]) -> str:
    location_parts = [
        mapped.get("exact_location"),
        mapped.get("building_name"),
        mapped.get("block_or_tower"),
        mapped.get("floor"),
        mapped.get("apartment_or_unit"),
    ]
    location = ", ".join(str(part).strip() for part in location_parts if str(part or "").strip())
    return location[:280] if location else "Location not provided"


def extract_reporter_contact(mapped: dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
    contact = str(mapped.get("reporter_contact") or "").strip()
    if "@" in contact:
        return contact, None
    return None, contact or None


def _parse_checkbox(value: Any) -> list[str]:
    if not isinstance(value, str):
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _parse_datetime(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None

    normalized = value.strip()
    for fmt in (
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
    ):
        try:
            return datetime.strptime(normalized, fmt)
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _join_value(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(str(item) for item in value)
    return str(value or "")
