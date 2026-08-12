"use client";

import { useEffect } from "react";

export function ImagePreviewDialog({
  imageUrl,
  label,
  onClose,
}: {
  imageUrl: string;
  label: string;
  onClose: () => void;
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

  return (
    <div className="image-preview-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-label={label}
        aria-modal="true"
        className="image-preview-dialog"
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
}
