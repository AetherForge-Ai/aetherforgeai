/**
 * Login field state that survives a remount.
 * A fast first attempt used to wipe the inputs when the form mounted again,
 * and the error from that attempt disappeared with it.
 */

export interface LoginDraft {
  email: string;
  password: string;
  error: string;
}

const empty = (): LoginDraft => ({ email: "", password: "", error: "" });

let draft: LoginDraft = empty();
const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) listener();
}

export function readLoginDraft(): LoginDraft {
  return draft;
}

export function writeLoginDraft(patch: Partial<LoginDraft>): LoginDraft {
  draft = { ...draft, ...patch };
  publish();
  return draft;
}

/** A failed submit keeps what was typed and records why. */
export function failLoginDraft(email: string, password: string, error: string): LoginDraft {
  return writeLoginDraft({ email, password, error: error || "Error signing in. Please check your credentials." });
}

export function clearLoginDraft(): void {
  draft = empty();
  publish();
}

export function subscribeLoginDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
