"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AnonymousCaseSubmissionRequest,
  type CaseSubmissionResponse,
  type VoiceIntakeView,
  incidentTypes,
  urgencyLevels,
} from "@/lib/api-types";
import {
  ApiError,
  confirmVoiceIntake,
  retrieveVoiceIntake,
  submitAnonymousCase,
  uploadVoiceIntake,
} from "@/lib/api";
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
} satisfies Omit<AnonymousCaseSubmissionRequest, "language_code" | "voice_intake_token">;

type FormState = typeof initialFormState;
type MicrophonePermissionState = "unknown" | "prompt" | "granted" | "denied" | "unavailable";
type VoiceStage = "idle" | "recording" | "selected" | "uploading" | "processing" | "ready" | "confirmed";

interface VoiceClip {
  blob: Blob;
  durationSeconds?: number;
  fileName: string;
  objectUrl: string;
}

const transcriptPollingLimit = 8;

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
  const [microphonePermission, setMicrophonePermission] = useState<MicrophonePermissionState>("unknown");
  const [voiceStage, setVoiceStage] = useState<VoiceStage>("idle");
  const [voiceClip, setVoiceClip] = useState<VoiceClip | null>(null);
  const [voiceView, setVoiceView] = useState<VoiceIntakeView | null>(null);
  const [voiceToken, setVoiceToken] = useState<string | null>(null);
  const [voiceTranscriptDraft, setVoiceTranscriptDraft] = useState("");
  const [confirmedTranscript, setConfirmedTranscript] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceStatusMessage, setVoiceStatusMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isConfirmingVoice, setIsConfirmingVoice] = useState(false);
  const [canRecord, setCanRecord] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const transcriptPollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setCanRecord(
      typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);

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

  useEffect(() => {
    if (!canRecord) {
      setMicrophonePermission("unavailable");
      return;
    }

    if (!navigator.permissions?.query) {
      setMicrophonePermission("prompt");
      return;
    }

    let cancelled = false;
    let permissionStatus: PermissionStatus | null = null;

    async function readPermission() {
      try {
        permissionStatus = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });

        if (cancelled) {
          return;
        }

        setMicrophonePermission(normalizePermissionState(permissionStatus.state));
        permissionStatus.onchange = () => {
          setMicrophonePermission(normalizePermissionState(permissionStatus?.state ?? "prompt"));
        };
      } catch {
        if (!cancelled) {
          setMicrophonePermission("prompt");
        }
      }
    }

    void readPermission();

    return () => {
      cancelled = true;
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, [canRecord]);

  useEffect(() => {
    return () => {
      clearTranscriptPolling();
      stopRecordingTracks();
      replaceVoiceClip(null);
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNetworkError(null);

    if (voiceToken && !confirmedTranscript) {
      setVoiceError(dictionary.home.form.voice.errors.confirmBeforeSubmit);
      return;
    }

    const payload = buildSubmissionPayload({
      ...formState,
      language_code: locale,
      voice_intake_token: confirmedTranscript && voiceToken ? voiceToken : undefined,
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
      setNetworkError(getSubmissionErrorMessage(error, dictionary));
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

  async function startRecording() {
    if (!canRecord || voiceStage === "uploading" || voiceStage === "processing" || isSubmitting) {
      return;
    }

    clearTranscriptPolling();
    setVoiceError(null);
    setVoiceStatusMessage(dictionary.home.form.voice.states.recording);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stopRecordingTracks();
      mediaStreamRef.current = stream;
      const mimeType = getPreferredRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recordingChunksRef.current = [];
      recordingStartedAtRef.current = window.performance.now();
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("stop", () => {
        const blobType = mimeType || recorder.mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: blobType });
        const startedAt = recordingStartedAtRef.current;
        const durationSeconds =
          startedAt === null ? undefined : Math.max(0, (window.performance.now() - startedAt) / 1000);

        stopRecordingTracks();
        mediaRecorderRef.current = null;
        recordingStartedAtRef.current = null;

        if (blob.size === 0) {
          setVoiceStage("idle");
          setVoiceStatusMessage(null);
          setVoiceError(dictionary.home.form.voice.errors.emptyRecording);
          return;
        }

        void prepareVoiceClip({
          blob,
          durationSeconds,
          fileName: `voice-intake${getFileExtension(blob.type)}`,
        });
      });

      mediaRecorderRef.current = recorder;
      setMicrophonePermission("granted");
      setVoiceStage("recording");
      recorder.start();
    } catch (error) {
      stopRecordingTracks();
      mediaRecorderRef.current = null;
      recordingStartedAtRef.current = null;

      if (isPermissionDeniedError(error)) {
        setMicrophonePermission("denied");
        setVoiceError(dictionary.home.form.voice.permission.denied);
      } else {
        setMicrophonePermission("unavailable");
        setVoiceError(dictionary.home.form.voice.permission.unavailable);
      }

      setVoiceStatusMessage(null);
      setVoiceStage("idle");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  async function prepareVoiceClip(nextClip: Omit<VoiceClip, "objectUrl">) {
    clearTranscriptPolling();
    stopRecordingTracks();
    setVoiceError(null);
    setVoiceStatusMessage(dictionary.home.form.voice.states.selected);
    setVoiceView(null);
    setVoiceToken(null);
    setVoiceTranscriptDraft("");
    setConfirmedTranscript(null);
    setUploadProgress(null);
    setVoiceStage("selected");

    replaceVoiceClip({
      ...nextClip,
      objectUrl: URL.createObjectURL(nextClip.blob),
    });

    await uploadCurrentClip({
      blob: nextClip.blob,
      durationSeconds: nextClip.durationSeconds,
      fileName: nextClip.fileName,
    });
  }

  async function uploadCurrentClip(clipOverride?: Pick<VoiceClip, "blob" | "durationSeconds" | "fileName">) {
    const clip = clipOverride ?? voiceClip;

    if (!clip) {
      return;
    }

    clearTranscriptPolling();
    setVoiceError(null);
    setVoiceView(null);
    setVoiceToken(null);
    setVoiceTranscriptDraft("");
    setConfirmedTranscript(null);
    setUploadProgress(0);
    setVoiceStage("uploading");
    setVoiceStatusMessage(dictionary.home.form.voice.states.uploading);

    try {
      const response = await uploadVoiceIntake({
        audioFile: clip.blob,
        fileName: clip.fileName,
        languageCode: locale,
        durationSeconds: clip.durationSeconds,
        onUploadProgress: setUploadProgress,
      });

      setUploadProgress(100);
      setVoiceToken(response.voice_intake_token);
      setVoiceStage("processing");
      setVoiceStatusMessage(dictionary.home.form.voice.states.processing);

      await retrieveTranscript(response.voice_intake_token, 0);
    } catch (error) {
      setVoiceStage("selected");
      setUploadProgress(null);
      setVoiceStatusMessage(null);
      setVoiceError(getVoiceErrorMessage(error, dictionary));
    }
  }

  async function retrieveTranscript(currentToken: string, attempt: number) {
    try {
      const response = await retrieveVoiceIntake(currentToken);
      setVoiceView(response);

      if (response.processing_status === "pending") {
        setVoiceStage("processing");
        setVoiceStatusMessage(dictionary.home.form.voice.states.processing);

        if (attempt < transcriptPollingLimit) {
          transcriptPollTimeoutRef.current = window.setTimeout(() => {
            void retrieveTranscript(currentToken, attempt + 1);
          }, 1500);
        }

        return;
      }

      if (response.processing_status === "failed") {
        setVoiceStage("selected");
        setVoiceStatusMessage(null);
        setVoiceError(dictionary.home.form.voice.errors.transcriptUnavailable);
        return;
      }

      const nextTranscript =
        response.confirmed_transcript_text?.trim() || response.transcription_text?.trim() || "";

      if (!nextTranscript) {
        setVoiceStage("selected");
        setVoiceStatusMessage(null);
        setVoiceError(dictionary.home.form.voice.errors.transcriptUnavailable);
        return;
      }

      setVoiceTranscriptDraft(nextTranscript);
      const isAlreadyConfirmed = response.transcript_state === "confirmed" || response.transcript_state === "edited";
      setConfirmedTranscript(isAlreadyConfirmed ? response.confirmed_transcript_text ?? nextTranscript : null);
      setVoiceStage(isAlreadyConfirmed ? "confirmed" : "ready");
      setVoiceStatusMessage(
        isAlreadyConfirmed
          ? dictionary.home.form.voice.confirmedMessage
          : dictionary.home.form.voice.states.ready,
      );
    } catch (error) {
      setVoiceStage("selected");
      setVoiceStatusMessage(null);
      setVoiceError(getVoiceErrorMessage(error, dictionary));
    }
  }

  async function handleConfirmTranscript() {
    if (!voiceToken) {
      setVoiceError(dictionary.home.form.voice.errors.transcriptUnavailable);
      return;
    }

    const normalizedTranscript = voiceTranscriptDraft.trim();
    if (!normalizedTranscript) {
      setVoiceError(dictionary.home.form.voice.errors.transcriptRequired);
      return;
    }

    setVoiceError(null);
    setIsConfirmingVoice(true);

    try {
      const response = await confirmVoiceIntake(voiceToken, normalizedTranscript);
      setVoiceView(response);
      setVoiceTranscriptDraft(response.confirmed_transcript_text ?? normalizedTranscript);
      setConfirmedTranscript(response.confirmed_transcript_text ?? normalizedTranscript);
      setVoiceStage("confirmed");
      setVoiceStatusMessage(dictionary.home.form.voice.confirmedMessage);
    } catch (error) {
      setVoiceError(getVoiceErrorMessage(error, dictionary));
    } finally {
      setIsConfirmingVoice(false);
    }
  }

  function handleTranscriptChange(value: string) {
    setVoiceTranscriptDraft(value);
    setVoiceError(null);

    if (confirmedTranscript !== null && value.trim() !== confirmedTranscript.trim()) {
      setConfirmedTranscript(null);
      setVoiceStage("ready");
      setVoiceStatusMessage(dictionary.home.form.voice.editedAfterConfirm);
    }
  }

  function handleUseTranscriptInReport() {
    updateField("needs_summary", voiceTranscriptDraft);
    setVoiceStatusMessage(
      confirmedTranscript
        ? dictionary.home.form.voice.confirmedMessage
        : dictionary.home.form.voice.states.ready,
    );
  }

  function handleRetryTranscript() {
    if (voiceToken) {
      setVoiceError(null);
      setVoiceStatusMessage(dictionary.home.form.voice.states.processing);
      setVoiceStage("processing");
      void retrieveTranscript(voiceToken, 0);
      return;
    }

    void uploadCurrentClip();
  }

  function handleDiscardVoice() {
    clearTranscriptPolling();
    stopRecordingTracks();
    replaceVoiceClip(null);
    setVoiceView(null);
    setVoiceToken(null);
    setVoiceTranscriptDraft("");
    setConfirmedTranscript(null);
    setVoiceError(null);
    setVoiceStatusMessage(null);
    setUploadProgress(null);
    setVoiceStage("idle");
  }

  function handleResetForm() {
    setResult(null);
    setNetworkError(null);
    setFieldErrors({});
    setFormState(initialFormState);
    handleDiscardVoice();
  }

  function replaceVoiceClip(nextClip: VoiceClip | null) {
    setVoiceClip((current) => {
      if (current?.objectUrl) {
        URL.revokeObjectURL(current.objectUrl);
      }

      return nextClip;
    });
  }

  function clearTranscriptPolling() {
    if (transcriptPollTimeoutRef.current !== null) {
      window.clearTimeout(transcriptPollTimeoutRef.current);
      transcriptPollTimeoutRef.current = null;
    }
  }

  function stopRecordingTracks() {
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }

      mediaStreamRef.current = null;
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
          <a className="button-primary" href={sharePageUrl} rel="noreferrer">
            {dictionary.home.success.openShareLink}
          </a>
          <button className="button-secondary" type="button" onClick={handleResetForm}>
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

      <fieldset className="voice-panel">
        <legend className="field-label">{dictionary.home.form.voice.title}</legend>
        <p className="field-hint voice-panel-copy">{dictionary.home.form.voice.description}</p>

        <div className="voice-panel-card">
          <div className="voice-toolbar">
            <button
              aria-label={
                voiceStage === "recording"
                  ? dictionary.home.form.voice.stopButton
                  : dictionary.home.form.voice.recordButton
              }
              className={`voice-record-button${voiceStage === "recording" ? " is-recording" : ""}`}
              disabled={(!canRecord && voiceStage !== "recording") || isSubmitting || isConfirmingVoice}
              type="button"
              onClick={() => {
                if (voiceStage === "recording") {
                  stopRecording();
                  return;
                }

                void startRecording();
              }}
            >
              <VoiceRecordIcon isRecording={voiceStage === "recording"} />
            </button>
            <div className="voice-toolbar-copy">
              <p className="voice-toolbar-label">
                {voiceStage === "recording"
                  ? dictionary.home.form.voice.states.recording
                  : dictionary.home.form.voice.recordButton}
              </p>
              <p className="voice-toolbar-hint">
                {voiceStage === "recording"
                  ? dictionary.home.form.voice.stopButton
                  : dictionary.home.form.voice.permission[microphonePermission]}
              </p>
              {voiceClip && voiceStage !== "recording" ? (
                <button className="voice-inline-action" type="button" onClick={handleDiscardVoice}>
                  {dictionary.home.form.voice.discardButton}
                </button>
              ) : null}
            </div>
          </div>

          <p className="voice-permission-note">
            <strong>{dictionary.home.form.voice.permission.label}</strong>{" "}
            {dictionary.home.form.voice.permission[microphonePermission]}
          </p>

          {voiceClip ? (
            <div className="voice-preview-card">
              <dl className="voice-preview-meta">
                <div>
                  <dt>{dictionary.home.form.voice.selectedAudioLabel}</dt>
                  <dd>{voiceClip.fileName}</dd>
                </div>
                <div>
                  <dt>{dictionary.home.form.voice.audioSizeLabel}</dt>
                  <dd>{formatBytes(voiceClip.blob.size)}</dd>
                </div>
                <div>
                  <dt>{dictionary.home.form.voice.audioDurationLabel}</dt>
                  <dd>{formatDuration(voiceClip.durationSeconds)}</dd>
                </div>
              </dl>
              <audio className="voice-preview-player" controls src={voiceClip.objectUrl}>
                {dictionary.home.form.voice.audioPreviewFallback}
              </audio>
            </div>
          ) : null}

          {voiceStatusMessage ? (
            <p className="info-banner" aria-live="polite">
              {voiceStatusMessage}
              {voiceStage === "uploading" && uploadProgress !== null ? ` ${uploadProgress}%` : ""}
            </p>
          ) : null}

          {voiceError ? (
            <p className="error-banner" role="alert">
              {voiceError}
            </p>
          ) : null}

          {voiceView && voiceView.processing_status === "pending" ? (
            <button className="button-secondary" type="button" onClick={handleRetryTranscript}>
              {dictionary.home.form.voice.checkTranscriptButton}
            </button>
          ) : null}

          {voiceToken && (voiceStage === "ready" || voiceStage === "confirmed") ? (
            <div className="voice-transcript-panel">
              <label className="field">
                <span className="field-label">{dictionary.home.form.voice.transcriptLabel}</span>
                <textarea
                  className="field-control field-textarea"
                  maxLength={submissionLimits.needsSummaryMax}
                  rows={6}
                  value={voiceTranscriptDraft}
                  onChange={(event) => handleTranscriptChange(event.target.value)}
                />
                <span className="field-hint">{dictionary.home.form.voice.transcriptHint}</span>
              </label>

              <div className="button-row">
                <button className="button-secondary" type="button" onClick={handleUseTranscriptInReport}>
                  {dictionary.home.form.voice.useTranscriptButton}
                </button>
                <button
                  className="button-primary"
                  disabled={isConfirmingVoice}
                  type="button"
                  onClick={() => {
                    void handleConfirmTranscript();
                  }}
                >
                  {isConfirmingVoice
                    ? dictionary.home.form.voice.confirmingButton
                    : dictionary.home.form.voice.confirmButton}
                </button>
              </div>

              {confirmedTranscript ? (
                <p className="voice-confirmed-note" aria-live="polite">
                  {dictionary.home.form.voice.confirmedMessage}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </fieldset>

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
        <button
          className="button-primary"
          disabled={isSubmitting || voiceStage === "recording" || isConfirmingVoice}
          type="submit"
        >
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

function getSubmissionErrorMessage(error: unknown, dictionary: Dictionary) {
  if (error instanceof ApiError) {
    if (error.status === 400 && error.detail) {
      return error.detail;
    }

    if (error.status === null) {
      return dictionary.home.form.errors.network;
    }
  }

  return dictionary.home.form.errors.server;
}

function getVoiceErrorMessage(error: unknown, dictionary: Dictionary) {
  if (error instanceof ApiError) {
    if (error.detail) {
      return error.detail;
    }

    if (error.status === null) {
      return dictionary.home.form.voice.errors.network;
    }
  }

  return dictionary.home.form.voice.errors.server;
}

function normalizePermissionState(state: PermissionState): MicrophonePermissionState {
  if (state === "granted") {
    return "granted";
  }

  if (state === "denied") {
    return "denied";
  }

  return "prompt";
}

function isPermissionDeniedError(error: unknown) {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
}

function getPreferredRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const supportedTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

  for (const candidate of supportedTypes) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "";
}

function getFileExtension(contentType: string) {
  if (contentType.includes("mp4")) {
    return ".m4a";
  }

  if (contentType.includes("ogg")) {
    return ".ogg";
  }

  if (contentType.includes("wav")) {
    return ".wav";
  }

  return ".webm";
}

function VoiceRecordIcon({ isRecording }: { isRecording: boolean }) {
  if (isRecording) {
    return (
      <svg aria-hidden="true" className="voice-record-icon" viewBox="0 0 24 24">
        <rect x="7" y="7" width="10" height="10" rx="2.5" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="voice-record-icon" viewBox="0 0 24 24">
      <path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V8.5a3.5 3.5 0 1 0-7 0V12a3.5 3.5 0 0 0 3.5 3.5Z" />
      <path d="M6.5 11.5a.75.75 0 0 1 .75.75 4.75 4.75 0 1 0 9.5 0 .75.75 0 0 1 1.5 0 6.26 6.26 0 0 1-5.5 6.21V21a.75.75 0 0 1-1.5 0v-2.54a6.26 6.26 0 0 1-5.5-6.21.75.75 0 0 1 .75-.75Z" />
    </svg>
  );
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  const kilobytes = size / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function formatDuration(durationSeconds?: number) {
  if (!durationSeconds || durationSeconds < 1) {
    return "< 1s";
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.round(durationSeconds % 60);

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}
