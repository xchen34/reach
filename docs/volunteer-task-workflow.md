# Volunteer task workflow

Reach is a task-distribution and information-coordination tool. It is not an
official registry and it is not a real-time status tracker.

The intended workflow is:

1. Public reports are collected and preserved as immutable source records.
2. Desk staff review incoming reports and create or link person follow-up tasks.
3. Coordinators or desk volunteers assign tasks to people who can follow up.
4. Follow-up happens primarily outside Reach by phone, message, WhatsApp, in
   person, or through direct contact with families, shelters, hospitals,
   responders, and relevant organizations.
5. Staff may record a meaningful outcome when information comes back, but final
   outcome updates are helpful rather than mandatory.

## Operational statuses

The staff and public UI exposes four simplified statuses:

- `unassigned`: Reach has not yet recorded an assignment. This does not prove
  that nobody is helping.
- `in_progress`: Reach has recorded an assignment. This does not prove the
  person is still missing or that no progress has been made.
- `found_alive`: Reach has received information that the person is safe. This is
  not necessarily an official determination.
- `confirmed_deceased`: Reach has received confirmed information that the person
  has died. Staff must record a confirmation source or explanation.

Internally, Reach still uses Reports as source records and Cases as durable
person/task records. Legacy Case status fields remain for compatibility, but
ordinary staff should work from the simplified task board.

## Public information

Public pages show information currently recorded by the Reach volunteer network.
They do not claim to be official or real-time. Public cards must not expose
reporter contact details, internal notes, volunteer contact information, Google
Sheet metadata, or credentials.
