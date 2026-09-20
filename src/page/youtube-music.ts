import type { Rating } from "../wire.ts";

const SELECTORS = {
  renderer: "ytmusic-player-bar ytmusic-like-button-renderer#like-button-renderer",
  liked: "#button-shape-like button",
  disliked: "#button-shape-dislike button",
} as const;

type RatingControls = {
  renderer: Element;
  liked: HTMLElement;
  disliked: HTMLElement;
};

function controlsIn(document: ParentNode): RatingControls | null {
  const renderer = document.querySelector(SELECTORS.renderer);
  if (!renderer) return null;

  const liked = renderer.querySelector<HTMLElement>(SELECTORS.liked);
  const disliked = renderer.querySelector<HTMLElement>(SELECTORS.disliked);
  return liked && disliked ? { renderer, liked, disliked } : null;
}

function buttonRating(controls: RatingControls): Rating | null {
  const liked = controls.liked.getAttribute("aria-pressed");
  const disliked = controls.disliked.getAttribute("aria-pressed");

  if (liked === "true") return "liked";
  if (disliked === "true") return "disliked";
  if (liked === "false" && disliked === "false") return "none";

  const status = controls.renderer.getAttribute("like-status");
  if (status === "LIKE") return "liked";
  if (status === "DISLIKE") return "disliked";
  if (status === "INDIFFERENT") return "none";
  return null;
}

export function readRating(document: ParentNode): Rating | null {
  const controls = controlsIn(document);
  return controls ? buttonRating(controls) : null;
}

export function buttonFor(current: Rating, wanted: Rating): "like" | "dislike" | null {
  if (current === wanted) return null;
  return wanted === "liked" ? "like" : wanted === "disliked" ? "dislike" : current === "liked" ? "like" : "dislike";
}

export type RateResult = "pressed" | "already" | "unknown";

export function rate(document: ParentNode, wanted: Rating): RateResult {
  const controls = controlsIn(document);
  const current = controls ? buttonRating(controls) : null;
  if (!controls || current === null) return "unknown";

  const button = buttonFor(current, wanted);
  if (!button) return "already";
  (button === "like" ? controls.liked : controls.disliked).click();
  return "pressed";
}
