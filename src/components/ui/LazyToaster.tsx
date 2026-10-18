"use client";

import dynamic from "next/dynamic";

/** Goal b19 M-1: sonner's Toaster mounts after hydration; toasts raised later still show. */
export const LazyToaster = dynamic(() => import("@/components/ui/sonner").then((m) => m.Toaster), { ssr: false });
