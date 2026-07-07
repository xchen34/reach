"use client";

import { useMemo, useState } from "react";
import {
  type AnonymousCaseSubmissionRequest,
  type CaseSubmissionResponse,
  incidentTypes,
  urgencyLevels,
} from "@/lib/api-types";
import { ApiError, submitAnonymousCase } from "@/lib/api";
import type { Dictionary, Locale } from "@/lib/i18n";
import {
  buildSubmissionPayload,
  submissionLimits,
  type SubmissionErrors,
  validateSubmissionPayload,
} from "@/lib/public-case";

const initialFormState = {
  incident_type: "medical",
  urgency: "medium",
  location_summary: "",
  needs_summary: "",
  reporter_name: "",
  reporter_email: "",
  reporter_phone: "",
} satisfies Omit<AnonymousCaseSubmissionRequest, "language_code">;

type FormState = typeof initialFormState;

export function AnonymousCaseSubmissionFlow({
  locale,
  dictionary,
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [fieldErrors, setFieldErrors] = useState<SubmissionErrors>({});
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<CaseSubmissionResponse | null>(null);

  const statusCopy = useMemo(() => {
    if (!result) {
      return null;
    }

    return dictionary.caseStatus.labels[result.status];
  }, [dictionary.caseStatus.labels, result]);

  const sharePageUrl = useMemo(() => {
    if (!result) {
      return null;
    }

    const sharePath = `/${locale}/share/${result.share_link.token}`;
    if (typeof window === "undefined") {
      return sharePath;
    }

    return new URL(sharePath, window.location.origin).toString();
  }, [locale, result]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNetworkError(null);

    const payload = buildSubmissionPayload({
      ...formState,
      language_code: locale,
    });
    const nextFieldErrors = validateSubmissionPayload(payload);

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await submitAnonymousCase(payload);
      setResult(response);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 400 && error.detail) {
          setNetworkError(error.detail);
        } else if (error.status === null) {
          setNetworkError(dictionary.home.form.errors.network);
        } else {
          setNetworkError(dictionary.home.form.errors.server);
        }
      } else {
        setNetworkError(dictionary.home.form.errors.server);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));

    if (fieldErrors[key]) {
      setFieldErrors((current) => ({ ...current, [key]: undefined }));
    }
  }

  if (result && statusCopy && sharePageUrl) {
    return (
      <section className="success-panel" aria-live="polite">
        <span className="status-pill">{dictionary.home.success.badge}</span>
        <h2 className="section-title">{dictionary.home.success.title}</h2>
        <p className="lede compact-lede">{dictionary.home.success.description}</p>

        <dl className="detail-grid">
          <div className="detail-card">
            <dt>{dictionary.home.success.caseCodeLabel}</dt>
            <dd>{result.case_code}</dd>
          </div>
          <div className="detail-card">
            <dt>{dictionary.home.success.statusLabel}</dt>
            <dd>{statusCopy}</dd>
          </div>
          <div className="detail-card detail-card-wide">
            <dt>{dictionary.home.success.shareLinkLabel}</dt>
            <dd className="break-all">{sharePageUrl}</dd>
          </div>
        </dl>

        <p className="support-copy">{dictionary.home.success.shareLinkHelp}</p>

        <div className="button-row">
          <a
            className="button-primary"
            href={sharePageUrl}
            rel="noreferrer"
          >
            {dictionary.home.success.openShareLink}
          </a>
          <button
            className="button-secondary"
            type="button"
            onClick={() => {
              setResult(null);
              setNetworkError(null);
              setFieldErrors({});
              setFormState(initialFormState);
            }}
          >
            {dictionary.home.success.submitAnother}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="form-stack" noValidate onSubmit={handleSubmit}>
      <div className="section-grid form-grid">
        <label className="field">
          <span className="field-label">{dictionary.home.form.incidentType.label}</span>
          <select
            className="field-control"
            name="incident_type"
            value={formState.incident_type}
            onChange={(event) => updateField("incident_type", event.target.value as FormState["incident_type"])}
          >
            {incidentTypes.map((incidentType) => (
              <option key={incidentType} value={incidentType}>
                {dictionary.home.form.incidentType.options[incidentType]}
              </option>
            ))}
          </select>
          <span className="field-hint">{dictionary.home.form.incidentType.hint}</span>
          <FieldError errorKey={fieldErrors.incident_type} dictionary={dictionary} />
        </label>

        <label className="field">
          <span className="field-label">{dictionary.home.form.urgency.label}</span>
          <select
            className="field-control"
            name="urgency"
            value={formState.urgency}
            onChange={(event) => updateField("urgency", event.target.value as FormState["urgency"])}
          >
            {urgencyLevels.map((urgency) => (
              <option key={urgency} value={urgency}>
                {dictionary.home.form.urgency.options[urgency]}
              </option>
            ))}
          </select>
          <span className="field-hint">{dictionary.home.form.urgency.hint}</span>
          <FieldError errorKey={fieldErrors.urgency} dictionary={dictionary} />
        </label>
      </div>

      <label className="field">
        <span className="field-label">{dictionary.home.form.locationSummary.label}</span>
        <textarea
          className="field-control field-textarea"
          name="location_summary"
          maxLength={submissionLimits.locationSummaryMax}
          minLength={submissionLimits.locationSummaryMin}
          rows={4}
          value={formState.location_summary}
          onChange={(event) => updateField("location_summary", event.target.value)}
        />
        <span className="field-hint">{dictionary.home.form.locationSummary.hint}</span>
        <FieldError errorKey={fieldErrors.location_summary} dictionary={dictionary} />
      </label>

      <label className="field">
        <span className="field-label">{dictionary.home.form.needsSummary.label}</span>
        <textarea
          className="field-control field-textarea"
          name="needs_summary"
          maxLength={submissionLimits.needsSummaryMax}
          minLength={submissionLimits.needsSummaryMin}
          rows={6}
          value={formState.needs_summary}
          onChange={(event) => updateField("needs_summary", event.target.value)}
        />
        <span className="field-hint">{dictionary.home.form.needsSummary.hint}</span>
        <FieldError errorKey={fieldErrors.needs_summary} dictionary={dictionary} />
      </label>

      <div className="section-grid form-grid">
        <label className="field">
          <span className="field-label">{dictionary.home.form.reporterName.label}</span>
          <input
            className="field-control"
            maxLength={submissionLimits.reporterNameMax}
            name="reporter_name"
            type="text"
            value={formState.reporter_name}
            onChange={(event) => updateField("reporter_name", event.target.value)}
          />
          <span className="field-hint">{dictionary.home.form.reporterName.hint}</span>
          <FieldError errorKey={fieldErrors.reporter_name} dictionary={dictionary} />
        </label>

        <label className="field">
          <span className="field-label">{dictionary.home.form.reporterPhone.label}</span>
          <input
            className="field-control"
            maxLength={submissionLimits.reporterPhoneMax}
            name="reporter_phone"
            type="tel"
            value={formState.reporter_phone}
            onChange={(event) => updateField("reporter_phone", event.target.value)}
          />
          <span className="field-hint">{dictionary.home.form.reporterPhone.hint}</span>
          <FieldError errorKey={fieldErrors.reporter_phone} dictionary={dictionary} />
        </label>
      </div>

      <label className="field">
        <span className="field-label">{dictionary.home.form.reporterEmail.label}</span>
        <input
          className="field-control"
          name="reporter_email"
          type="email"
          value={formState.reporter_email}
          onChange={(event) => updateField("reporter_email", event.target.value)}
        />
        <span className="field-hint">{dictionary.home.form.reporterEmail.hint}</span>
        <FieldError errorKey={fieldErrors.reporter_email} dictionary={dictionary} />
      </label>

      {networkError ? (
        <p className="error-banner" role="alert">
          {networkError}
        </p>
      ) : null}

      <div className="button-row">
        <button className="button-primary" disabled={isSubmitting} type="submit">
          {isSubmitting
            ? dictionary.home.form.submitting
            : dictionary.home.form.submit}
        </button>
      </div>
    </form>
  );
}

function FieldError({
  dictionary,
  errorKey,
}: {
  dictionary: Dictionary;
  errorKey?: keyof Dictionary["home"]["form"]["validation"];
}) {
  if (!errorKey) {
    return null;
  }

  return (
    <span className="field-error" role="alert">
      {dictionary.home.form.validation[errorKey]}
    </span>
  );
}
