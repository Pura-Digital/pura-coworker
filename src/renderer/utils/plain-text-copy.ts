import type { ClipboardEvent } from 'react';

/** Force manual copy from chat UI to plain text only (no HTML / theme styling). */
export function copySelectionAsPlainText(event: ClipboardEvent): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    return;
  }

  const plainText = selection.toString();
  if (!plainText) {
    return;
  }

  event.preventDefault();
  event.clipboardData.setData('text/plain', plainText);
}
