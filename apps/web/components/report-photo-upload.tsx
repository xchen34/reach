"use client";

import { useMemo, useState } from "react";
import { uploadPublicIncidentAttachments } from "@/lib/api";
import type { Dictionary } from "@/lib/i18n";

type ReportPhotoUploadProps = {
  dictionary: Dictionary;
  incidentSlug: string;
};

type UploadState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "success"; attachmentCode: string; fileCount: number }
  | { status: "error"; message: string };

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
const maxFiles = 4;

export function ReportPhotoUpload({ dictionary, incidentSlug }: ReportPhotoUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [didCopyCode, setDidCopyCode] = useState(false);
  const labels = dictionary.reportAttachments;

  const selectedSummary = useMemo(() => {
    if (files.length === 0) {
      return labels.emptySelection;
    }
    return files.map((file) => file.name).join(", ");
  }, [files, labels.emptySelection]);

  async function handleUpload() {
    if (files.length === 0 || state.status === "uploading") {
      return;
    }
    setState({ status: "uploading" });
    try {
      const response = await uploadPublicIncidentAttachments(incidentSlug, files);
      setState({
        status: "success",
        attachmentCode: response.attachment_code,
        fileCount: response.attachments.length,
      });
      setDidCopyCode(false);
    } catch {
      setState({ status: "error", message: labels.error });
    }
  }

  async function handleCopyCode(attachmentCode: string) {
    try {
      await navigator.clipboard.writeText(attachmentCode);
      setDidCopyCode(true);
    } catch {
      setDidCopyCode(false);
    }
  }

  return (
    <section className="report-photo-panel" aria-labelledby="report-photo-title">
      <div>
        <p className="eyebrow">{labels.eyebrow}</p>
        <h2 className="section-title" id="report-photo-title">
          {labels.title}
        </h2>
        <p className="support-copy compact-copy">{labels.description}</p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="report-photo-input">
          {labels.inputLabel}
        </label>
        <input
          accept={acceptedTypes.join(",")}
          className="field-control"
          disabled={state.status === "uploading"}
          id="report-photo-input"
          multiple
          type="file"
          onChange={(event) => {
            const nextFiles = Array.from(event.currentTarget.files ?? []).slice(0, maxFiles);
            setFiles(nextFiles);
            setState({ status: "idle" });
          }}
        />
        <p className="field-hint">{labels.limits}</p>
        <p className="field-hint compact-copy">{labels.missingFieldNotice}</p>
        <p className="field-hint compact-copy">{selectedSummary}</p>
      </div>

      <div className="button-row">
        <button
          className="button-secondary"
          disabled={files.length === 0 || state.status === "uploading"}
          type="button"
          onClick={() => void handleUpload()}
        >
          {state.status === "uploading" ? labels.uploading : labels.uploadButton}
        </button>
      </div>

      {state.status === "success" ? (
        <div className="info-banner" role="status">
          <strong>{labels.codeLabel}</strong>
          <span className="attachment-code">{state.attachmentCode}</span>
          <button
            className="button-secondary"
            type="button"
            onClick={() => void handleCopyCode(state.attachmentCode)}
          >
            {didCopyCode ? labels.copiedCode : labels.copyCode}
          </button>
          <p className="compact-copy">{labels.codeInstructions}</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <p className="error-banner" role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
