import type * as React from "react";

type ModelViewerProps = React.HTMLAttributes<HTMLElement> & {
  src?: string;
  alt?: string;
  poster?: string;
  exposure?: string | number;
  "camera-controls"?: boolean;
  "camera-orbit"?: string;
  "field-of-view"?: string;
  "min-camera-orbit"?: string;
  "max-camera-orbit"?: string;
  "auto-rotate"?: boolean;
  "auto-rotate-delay"?: string | number;
  "rotation-per-second"?: string;
  "interaction-prompt"?: string;
  "shadow-intensity"?: string | number;
  "environment-image"?: string;
  loading?: "auto" | "lazy" | "eager";
  reveal?: "auto" | "interaction" | "manual";
  ar?: boolean;
  style?: React.CSSProperties;
  className?: string;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerProps;
    }
  }
}

export {};
