"""Preserve what a non-primary record knew when it is merged away.

Merging kept only the primary record's values, so anything a duplicate or an
incoming update said that the primary did not was silently dropped — including
the case where the merged-away record held the *newer* information.

Field-level selection was the obvious alternative and is the wrong shape: it
forces a decision at the moment there is least basis for one, before anybody has
verified anything. Different reporters disagree and there is usually no way to
tell at merge time which is right.

So nothing is chosen. Differences are written onto the primary case as a single
note, attributed to the record they came from, and the decision waits until a
volunteer actually verifies. Only fields that conflict with or are absent from
the primary are recorded; repeating what both already agree on would bury the
part that matters.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


# Mirrors build_original_narrative, which writes "Label: value" lines.
_FIELD_LINE = re.compile(r"^\s*([^:\n]{2,40}?)\s*:\s*(.+?)\s*$")


def parse_narrative_fields(narrative: Optional[str]) -> dict[str, str]:
    """Recover the labelled fields from a composed narrative."""
    fields: dict[str, str] = {}
    for raw_line in (narrative or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = _FIELD_LINE.match(line)
        if match:
            label, value = match.groups()
            fields.setdefault(label.strip(), value.strip())
    return fields


@dataclass(frozen=True)
class MergeDifference:
    label: str
    value: str
    kind: str  # "conflicts" when the primary says something else, "adds" when it is silent


def _normalize(value: Optional[str]) -> str:
    return " ".join(str(value or "").split()).strip().lower()


def diff_against_primary(
    *,
    primary_fields: dict[str, str],
    other_fields: dict[str, str],
) -> list[MergeDifference]:
    """What `other` says that the primary contradicts or does not mention."""
    differences: list[MergeDifference] = []
    for label, value in other_fields.items():
        if not str(value or "").strip():
            continue
        primary_value = primary_fields.get(label)
        if not str(primary_value or "").strip():
            differences.append(MergeDifference(label=label, value=value, kind="adds"))
        elif _normalize(primary_value) != _normalize(value):
            differences.append(MergeDifference(label=label, value=value, kind="conflicts"))
    return differences


def build_record_fields(
    *,
    location: Optional[str],
    narrative: Optional[str],
    person_label: Optional[str] = None,
    approximate_age: Optional[str] = None,
    identifying_details: Optional[str] = None,
) -> dict[str, str]:
    """Structured columns plus the narrative's own labelled fields, in one map."""
    fields: dict[str, str] = {}
    if str(location or "").strip():
        fields["Location"] = str(location).strip()
    if str(person_label or "").strip():
        fields["Name"] = str(person_label).strip()
    if str(approximate_age or "").strip():
        fields["Age"] = str(approximate_age).strip()
    if str(identifying_details or "").strip():
        fields["Identifying details"] = str(identifying_details).strip()
    fields.update(parse_narrative_fields(narrative))
    return fields


def compose_merge_note(
    *,
    source_code: str,
    source_kind: str,
    differences: list[MergeDifference],
    submitted_at: Optional[str] = None,
) -> Optional[str]:
    """One note per merged record. Returns None when it adds nothing new."""
    if not differences:
        return None

    when = f", {submitted_at}" if submitted_at else ""
    lines = [f"From merged {source_kind} {source_code}{when} — not yet verified:"]
    for difference in differences:
        marker = "differs" if difference.kind == "conflicts" else "additional"
        lines.append(f"- {difference.label} ({marker}): {difference.value}")
    return "\n".join(lines)[:4000]
