"use client";

import dynamic from "next/dynamic";

/** H-4/M-1: the guide (chat + animation) loads after the page, not in the first bundle. */
export const LazyPersonalGuide = dynamic(() => import("./PersonalGuide").then((m) => m.PersonalGuide), {
  ssr: false,
  loading: () => null,
});
