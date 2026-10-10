/**
 * Toast and modal use the same fact: a report was saved, and whether an email went out.
 * Sending is off, so a new run says that nothing was sent.
 */

export function reportSavedToast(emailed: boolean): string {
  return emailed
    ? "Report ready — emailed to you and saved below."
    : "Report saved below. No report email was sent.";
}

export function reportEmailModalNote(emailed: boolean): string {
  return emailed ? " A copy was emailed to you." : " No report email was sent.";
}
