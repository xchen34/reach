"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export function ImagePreviewDialog({
  imageUrl,
  label,
  onClose,
  variant = "photo",
}: {
  imageUrl: string;
  label: string;
  onClose: () => void;
  variant?: "avatar" | "photo";
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const dialog = (
    <div className="image-preview-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-label={label}
        aria-modal="true"
        className={`image-preview-dialog image-preview-dialog-${variant}`}
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="image-preview-close" type="button" onClick={onClose}>
          Close
        </button>
        <div className="image-preview-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="image-preview-image" src={imageUrl} />
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
