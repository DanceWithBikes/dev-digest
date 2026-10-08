/* ConfirmDialog — the one destructive-confirmation surface of the Skills Lab.
   It replaces window.confirm: a native dialog cannot be themed, cannot be
   tested through the DOM, and blocks the whole tab while it is open. Both the
   card's Delete and the preview pane's Delete route through this component so
   the wording and the escape paths (Cancel / X / backdrop) stay identical. */
"use client";

import React from "react";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      width={440}
      title={title}
      onClose={onCancel}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button kind="danger" size="sm" icon="Trash" disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={s.body}>{body}</div>
    </Modal>
  );
}
