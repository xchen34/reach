from __future__ import annotations

from app.services.case_merge_notes import (
    build_record_fields,
    compose_merge_note,
    diff_against_primary,
    parse_narrative_fields,
)


def test_only_conflicting_or_missing_fields_are_carried() -> None:
    """Repeating what both records agree on would bury the part that matters."""
    primary = build_record_fields(
        location="63 Rue du Parc, temporary shelter desk",
        narrative="Situation: Last seen asking for a charger.\nInformation source: I saw them myself",
    )
    other = build_record_fields(
        location="63 Rue du Parc, temporary shelter desk",  # agrees
        narrative=(
            "Situation: Update: seen later near the registration table.\n"  # conflicts
            "Information source: Some told me directly\n"  # conflicts
            "Already listed on Reach: Yes"  # primary is silent
        ),
    )

    differences = diff_against_primary(primary_fields=primary, other_fields=other)
    by_label = {d.label: d for d in differences}

    assert "Location" not in by_label, "an agreed value must not be repeated"
    assert by_label["Situation"].kind == "conflicts"
    assert by_label["Information source"].kind == "conflicts"
    assert by_label["Already listed on Reach"].kind == "adds"


def test_whitespace_and_case_differences_are_not_treated_as_conflicts() -> None:
    primary = build_record_fields(location="12  Rue Des Lilas", narrative=None)
    other = build_record_fields(location="12 rue des lilas", narrative=None)
    assert diff_against_primary(primary_fields=primary, other_fields=other) == []


def test_note_names_its_source_and_says_it_is_unverified() -> None:
    differences = diff_against_primary(
        primary_fields={"Location": "A"},
        other_fields={"Location": "B", "Age": "42"},
    )
    note = compose_merge_note(
        source_code="RPT-N08UDQ4G3T",
        source_kind="report",
        differences=differences,
        submitted_at="2026-07-27 11:50",
    )
    assert note is not None
    # Provenance and the fact that nobody has checked it yet both matter: this is
    # a reporter's claim, not a finding.
    assert "RPT-N08UDQ4G3T" in note
    assert "2026-07-27 11:50" in note
    assert "not yet verified" in note
    assert "Location (differs): B" in note
    assert "Age (additional): 42" in note


def test_a_record_that_adds_nothing_produces_no_note() -> None:
    """Merging identical records must not leave noise behind."""
    fields = build_record_fields(location="Same place", narrative="Situation: Same text")
    assert diff_against_primary(primary_fields=fields, other_fields=fields) == []
    assert compose_merge_note(source_code="C-1", source_kind="case", differences=[]) is None


def test_narrative_round_trips_through_the_parser() -> None:
    """The parser mirrors build_original_narrative's "Label: value" output."""
    parsed = parse_narrative_fields(
        "Situation: Door was blocked\nInformation source: I saw them myself\n\nLoose line"
    )
    assert parsed["Situation"] == "Door was blocked"
    assert parsed["Information source"] == "I saw them myself"
