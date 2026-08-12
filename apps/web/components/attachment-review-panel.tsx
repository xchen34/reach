"use client";

import { useEffect, useState } from "react";
import { updateStaffAttachment } from "@/lib/api";
import type { StaffAttachment } from "@/lib/api-types";
import { ImagePreviewDialog } from "@/components/image-preview-dialog";

/**
 * Approve or reject the photos attached to a case.
 *
 * The public board only shows an attachment that is both approved and marked
 * publicly visible. Uploads arrive as pending and not visible, and nothing in
 * the app could change that, so photos never reached the board. Approving here
 * sets both, which is the decision staff are actually making.
 */
export function AttachmentReviewPanel({
  accessToken,
  attachments,
  onChanged,
}: {
  accessToken: string | null;
  attachments: StaffAttachment[];
  onChanged: () => void;
}) {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (attachments.length === 0) {
    return null;
  }

  async function decide(attachment: StaffAttachment, approve: boolean) {
    if (!accessToken || pendingId !== null) {
      return;
    }
    setPendingId(attachment.id);
    setError(null);
    try {
      await updateStaffAttachment(accessToken, attachment.id, {
        moderation_status: approve ? "approved" : "rejected",
        // Approval is what makes a photo public; rejecting must also un-publish
        // one that was previously approved.
        public_visibility: approve,
      });
      onChanged();
    } catch {
      setError("The photo could not be updated. Try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="detail-card staff-rail-card" aria-labelledby="staff-photo-review-title">
      <div className="staff-rail-card-head">
        <h3 className="staff-rail-card-title" id="staff-photo-review-title">
          Photos
          <span className="staff-rail-count">{attachments.length}</span>
        </h3>
      </div>

      {error ? (
        <p className="staff-sync-error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="staff-photo-list">
        {attachments.map((attachment) => (
          <li className="staff-photo-item" key={attachment.id}>
            <AttachmentThumb accessToken={accessToken} attachment={attachment} />
            <div className="staff-photo-meta">
              <span className={moderationPillClass(attachment)}>{moderationLabel(attachment)}</span>
              <span className="staff-photo-size">{formatBytes(attachment.byte_size)}</span>
            </div>
            <div className="staff-photo-actions">
              {attachment.moderation_status !== "approved" ? (
                <button
                  className="button-primary staff-photo-button"
                  disabled={pendingId !== null || !accessToken}
                  type="button"
                  onClick={() => void decide(attachment, true)}
                >
                  {pendingId === attachment.id ? "..." : "Publish"}
                </button>
              ) : null}
              {attachment.moderation_status !== "rejected" ? (
                <button
                  className="button-danger staff-photo-button"
                  disabled={pendingId !== null || !accessToken}
                  type="button"
                  onClick={() => void decide(attachment, false)}
                >
                  {pendingId === attachment.id ? "..." : "Reject"}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="staff-action-note">
        Only published photos appear on the public board.
      </p>
    </section>
  );
}

/** Attachment content needs the staff bearer token, so it cannot be a plain src. */
function AttachmentThumb({
  accessToken,
  attachment,
}: {
  accessToken: string | null;
  attachment: StaffAttachment;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    let isMounted = true;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const response = await fetch(`/api/staff/attachments/${attachment.id}/content`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        objectUrl = URL.createObjectURL(await response.blob());
        if (isMounted) {
          setImageUrl(objectUrl);
        }
      } catch {
        // A thumbnail that fails to load is not worth surfacing as an error.
      }
    })();
    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, attachment.id]);

  if (!imageUrl) {
    return <div className="staff-photo-thumb staff-photo-thumb-empty" aria-hidden="true" />;
  }
  return (
    <>
      <button
        aria-label="Open photo preview"
        className="staff-photo-thumb"
        type="button"
        onClick={() => setIsPreviewOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" className="staff-photo-image" src={imageUrl} />
      </button>
      {isPreviewOpen ? (
        <ImagePreviewDialog
          imageUrl={imageUrl}
          label="Attachment photo preview"
          onClose={() => setIsPreviewOpen(false)}
        />
      ) : null}
    </>
  );
}

function moderationLabel(attachment: StaffAttachment) {
  if (attachment.moderation_status === "approved") {
    return attachment.public_visibility ? "Published" : "Approved, not public";
  }
  if (attachment.moderation_status === "rejected") {
    return "Rejected";
  }
  return "Awaiting review";
}

function moderationPillClass(attachment: StaffAttachment) {
  if (attachment.moderation_status === "approved" && attachment.public_visibility) {
    return "status-pill status-pill-success staff-photo-pill";
  }
  if (attachment.moderation_status === "rejected") {
    return "status-pill status-pill-alert staff-photo-pill";
  }
  return "status-pill status-pill-info staff-photo-pill";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
