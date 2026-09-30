"use client";

import { createContext, useContext } from "react";

/**
 * How this document was classified from the request cookie.
 * "guest" is final for the page: a later /api/session body must not paint
 * a name or a book. A real member sends the cookie on the document request,
 * so middleware marks that document "member".
 */
export type DocumentSessionMode = "guest" | "member";

const DocumentSessionContext = createContext<DocumentSessionMode>("guest");

export function DocumentSessionProvider({
  mode,
  children,
}: {
  mode: DocumentSessionMode;
  children: React.ReactNode;
}) {
  return <DocumentSessionContext.Provider value={mode}>{children}</DocumentSessionContext.Provider>;
}

export function useDocumentSessionMode(): DocumentSessionMode {
  return useContext(DocumentSessionContext);
}
