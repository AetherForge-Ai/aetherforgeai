"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  BOT_3D_GLB,
  BOT_3D_POSTER,
  type Bot3DId,
} from "@/assets/files";

type Props = {
  bot: Bot3DId;
  alt: string;
  className?: string;
  /** Extra classes on the model-viewer / poster img itself */
  mediaClassName?: string;
  autoRotate?: boolean;
  cameraControls?: boolean;
  /** Optional override poster (defaults to the bot's fullbody PNG) */
  poster?: string;
};

let modelViewerLoader: Promise<void> | null = null;

function ensureModelViewer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("model-viewer")) return Promise.resolve();
  if (!modelViewerLoader) {
    modelViewerLoader = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-aetherforge-model-viewer="1"]'
      );
      if (existing) {
        customElements
          .whenDefined("model-viewer")
          .then(() => resolve())
          .catch(reject);
        return;
      }
      const script = document.createElement("script");
      script.type = "module";
      script.dataset.aetherforgeModelViewer = "1";
      script.src =
        "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js";
      script.onload = () => {
        customElements
          .whenDefined("model-viewer")
          .then(() => resolve())
          .catch(reject);
      };
      script.onerror = () => reject(new Error("Failed to load model-viewer"));
      document.head.appendChild(script);
    });
  }
  return modelViewerLoader;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Renders a TripoSR GLB bot avatar via Google model-viewer, with PNG poster fallback.
 */
export function Bot3DAvatar({
  bot,
  alt,
  className,
  mediaClassName,
  autoRotate = true,
  cameraControls = false,
  poster,
}: Props) {
  const posterSrc = poster ?? BOT_3D_POSTER[bot];
  const src = BOT_3D_GLB[bot];
  const reducedMotion = usePrefersReducedMotion();
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    ensureModelViewer()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showPoster = failed || reducedMotion || !ready;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {showPoster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterSrc}
          alt={alt}
          className={cn("h-full w-full object-contain object-bottom", mediaClassName)}
          loading="lazy"
        />
      ) : (
        // @ts-expect-error model-viewer is a custom element
        <model-viewer
          src={src}
          alt={alt}
          poster={posterSrc}
          exposure="1.05"
          shadow-intensity="0.4"
          camera-orbit="0deg 75deg 2.4m"
          field-of-view="28deg"
          interaction-prompt="none"
          auto-rotate={autoRotate || undefined}
          auto-rotate-delay={0}
          rotation-per-second="18deg"
          camera-controls={cameraControls || undefined}
          loading="lazy"
          reveal="auto"
          className={cn("h-full w-full bg-transparent", mediaClassName)}
          style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
        />
      )}
    </div>
  );
}

export default Bot3DAvatar;
