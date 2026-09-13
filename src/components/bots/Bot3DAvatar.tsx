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
  /**
   * Use the TripoSR GLB. Default true.
   * Pass false to force the polished 2D poster.
   */
  enable3d?: boolean;
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
 * TripoSR meshes often import lying on their back — orientation rolls them upright.
 */
export function Bot3DAvatar({
  bot,
  alt,
  className,
  mediaClassName,
  autoRotate = true,
  cameraControls = false,
  poster,
  enable3d = true,
}: Props) {
  const posterSrc = poster ?? BOT_3D_POSTER[bot];
  const src = BOT_3D_GLB[bot];
  const reducedMotion = usePrefersReducedMotion();
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!enable3d) return;
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
  }, [enable3d]);

  const showPoster = !enable3d || failed || reducedMotion || !ready;

  return (
    <div className={cn("relative", className)}>
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
          exposure="1.15"
          shadow-intensity="0.55"
          // TripoSR GLBs from T-pose photos often load on their side / back.
          // Rotate so the character stands upright facing the camera.
          orientation="-90deg 0deg 0deg"
          camera-orbit="0deg 75deg 105%"
          min-camera-orbit="auto auto 60%"
          max-camera-orbit="auto auto 200%"
          field-of-view="30deg"
          interaction-prompt="none"
          auto-rotate={autoRotate || undefined}
          auto-rotate-delay={0}
          rotation-per-second="16deg"
          camera-controls={cameraControls || undefined}
          loading="eager"
          reveal="auto"
          className={cn("h-full w-full bg-transparent", mediaClassName)}
          style={{
            width: "100%",
            height: "100%",
            minHeight: "100%",
            backgroundColor: "transparent",
            // Keep the canvas from spilling weirdly
            display: "block",
          }}
        />
      )}
    </div>
  );
}

export default Bot3DAvatar;
