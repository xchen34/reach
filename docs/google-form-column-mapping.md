# Google Sheet Column Mapping

Reach imports Google Form responses by reading the linked Google Sheet. Apps
Script should only trigger `/ingest/sync-intake`; it should not map form fields
itself.

The mapping lives in:

```text
apps/api/app/services/google_sheets_mapping.py
```

## Current V2 Form Columns

Keep these question titles stable after publishing the form. The importer maps
headers by exact text.

- `Timestamp`
- `Who is this information about?`
- `Is this person or pet already listed on Reach?`
- `What is their name?`
- `What is their gender?`
- `What is their approximate age?`
- `Where were they last known to be?`
- `Tell us what happened and anything that may help us find or assist them.`
- `How did you know this information?`
- `Your phone or email`
- `Reach photo attachment code`

## Important Fields

`Who is this information about?`

- maps to `subject_type`
- accepted answers include person/pet/unknown variants in English, French, and
  Chinese
- if both person and pet are mentioned, or neither is clear, Reach stores
  `unknown`
- the importer must not infer pet/person from narrative text

`Reach photo attachment code`

- optional
- returned by Reach's public photo upload section
- links uploaded photos to the imported report
- Google Forms native file upload should not be used if it requires reporter
  Google sign-in

`Your phone or email`

- maps to reporter contact
- values containing `@` are treated as email
- other non-empty values are treated as phone/contact text

## Backward Compatibility

The importer still recognizes several older headers, including:

- `subject_type`
- `Who is this report about?`
- `Full Name of the Person Being Reported`
- `Exact Address or Last Confirmed Location`
- `What is currently known about this person?`
- `What is currently known about the person's situation?`
- `Photo attachment code`

Older Sheets can continue importing, but new forms should use the V2 columns
above.

## Unknown Columns

Unrecognized headers are preserved in `raw_answers_json.unknown_columns`. A new
required form question should be added to `GOOGLE_FORM_FIELD_MAP`; otherwise its
answer will be visible only as an unknown raw column and not used in structured
case/report fields.
