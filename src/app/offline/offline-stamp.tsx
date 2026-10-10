"use client";

import { useEffect, useState } from "react";
import { SHELL_UPDATED_KEY } from "@/components/PwaRegister";

export function OfflineStamp() {
  const [updated, setUpdated] = useState("unavailable");
  useEffect(() => {
    const stored = window.localStorage.getItem(SHELL_UPDATED_KEY);
    if (stored) setUpdated(stored);
  }, []);
  return <time dateTime={updated === "unavailable" ? undefined : updated}>{updated}</time>;
}
