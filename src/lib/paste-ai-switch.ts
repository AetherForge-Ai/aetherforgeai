/**
 * b65 G-24 (GOAL-LOCK #59): the member's AI-off switch for paste-anything import.
 * AI reading is used only when BOTH the site flag (NEXT_PUBLIC_PASTE_IMPORT_AI=1) and the member's own
 * switch are on. The switch defaults to OFF and is remembered on this device only. With AI off, pasted
 * text is read in the browser by fixed rules and is never sent anywhere. PDF and screenshot reading stay
 * parked until a 20-sample set exists.
 */
export const PASTE_AI_STORAGE_KEY = "af:paste-import-ai";

export type PasteAiMode = "rules-only" | "ai-assisted";

export function pasteAiMode(siteFlagOn: boolean, memberSwitchOn: boolean): PasteAiMode {
  return siteFlagOn && memberSwitchOn ? "ai-assisted" : "rules-only";
}

export function readMemberSwitch(storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  try {
    return storage?.getItem(PASTE_AI_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function writeMemberSwitch(storage: Pick<Storage, "setItem"> | null | undefined, on: boolean): void {
  try {
    storage?.setItem(PASTE_AI_STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* private mode: stays off */
  }
}

export function pasteAiNote(siteFlagOn: boolean, memberSwitchOn: boolean): string {
  if (!siteFlagOn) return "AI reading is off for everyone: pasted text is read in your browser by fixed rules and is not sent anywhere. PDFs and screenshots are not read yet.";
  if (!memberSwitchOn) return "AI reading is off (your choice): pasted text is read in your browser by fixed rules and is not sent anywhere.";
  return "AI reading is on: it may help read pasted text. You still review every row before anything is saved.";
}
