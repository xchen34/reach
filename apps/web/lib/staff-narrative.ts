export type NarrativeField = {
  label: string;
  value: string;
};

export type ParsedNarrative = {
  /** Recognised "Label: value" pairs, in source order. */
  fields: NarrativeField[];
  /** Lines that did not look like labelled fields, joined back together. */
  rest: string;
};

// Intake narratives arrive as newline-separated "Label: value" lines built by the
// Google Sheets importer. Rendering them as a definition list is far easier to scan
// than the raw blob, but the text is free-form, so anything unrecognised is preserved.
const fieldPattern = /^\s*([\p{L}\p{N} '/&()-]{2,40}?)\s*:\s*(.+?)\s*$/u;

export function parseNarrativeFields(narrative: string | null | undefined): ParsedNarrative {
  const source = (narrative ?? "").trim();
  if (!source) {
    return { fields: [], rest: "" };
  }

  const fields: NarrativeField[] = [];
  const rest: string[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const match = fieldPattern.exec(line);
    if (match) {
      const [, label, value] = match;
      fields.push({ label: label.trim(), value: value.trim() });
      continue;
    }

    // A continuation of the previous field reads better appended to it than
    // orphaned at the bottom of the card.
    const previous = fields[fields.length - 1];
    if (previous && rest.length === 0) {
      previous.value = `${previous.value} ${line}`.trim();
      continue;
    }

    rest.push(line);
  }

  // A single unlabelled sentence is a narrative, not a broken field list.
  if (fields.length < 2) {
    return { fields: [], rest: source };
  }

  return { fields, rest: rest.join("\n") };
}

/**
 * Collapses a narrative to a short one-line preview for list and candidate cards,
 * dropping the bookkeeping fields that repeat on every record.
 */
// "Person" repeats the card title, and the rest is bookkeeping that is identical
// on every record — none of it helps a reviewer tell two candidates apart.
const previewSkipLabels = new Set([
  "submission type",
  "subject type",
  "information source",
  "person",
]);

export function buildNarrativePreview(narrative: string | null | undefined, maxLength = 180) {
  const { fields, rest } = parseNarrativeFields(narrative);

  const parts = fields.length
    ? fields
        .filter((field) => !previewSkipLabels.has(field.label.toLowerCase()))
        .map((field) => `${field.label}: ${field.value}`)
    : [rest];

  const text = parts.filter(Boolean).join(" · ").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}…`;
}
