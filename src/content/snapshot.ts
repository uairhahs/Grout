import type { PlaybackState, Rating, WireSnapshot } from "../wire.ts";

// What MosaicShell's `BrowserProtocol` accepts, so nothing here is cut again over there.
const MAX_TEXT = 512;
const MAX_ARTWORK = 8;
const MAX_URL = 2048;
const MAX_SIZES = 32;

const PLAYBACK = new Set<PlaybackState>(["playing", "paused", "none"]);
const RATINGS = new Set<Rating>(["liked", "disliked", "none"]);

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const clip = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

/**
 * Turns what the page said into what is sent on. The page's world is not trusted, so every field is checked and cut
 * to size here, in the isolated world, whatever the page returned. Null means the page plays nothing, which clears what
 * was said before.
 */
export function toSnapshot(reading: unknown): WireSnapshot | null {
  if (!record(reading)) return null;

  const title = clip(reading.title, MAX_TEXT);
  const artist = clip(reading.artist, MAX_TEXT);
  if (title === "" && artist === "") return null;

  const artwork = (Array.isArray(reading.artwork) ? reading.artwork : [])
    .filter((image): image is Record<string, unknown> => record(image) && typeof image.src === "string" && image.src !== "" && image.src.length <= MAX_URL)
    .slice(0, MAX_ARTWORK)
    .map((image) => ({ src: image.src as string, sizes: clip(image.sizes, MAX_SIZES) }));

  const snapshot: WireSnapshot = {
    title,
    artist,
    album: clip(reading.album, MAX_TEXT),
    artwork,
    playbackState: PLAYBACK.has(reading.playbackState as PlaybackState) ? (reading.playbackState as PlaybackState) : "none",
  };

  // Buttons are offered only while the page says what the rating is; from an unknown state no press is safe.
  if (RATINGS.has(reading.rating as Rating)) {
    snapshot.rating = reading.rating as Rating;
    snapshot.capabilities = ["rating", "dislike"];
  }
  return snapshot;
}

/** The rating a Host command asks for; null for anything that is not a rating command. */
export function ratingFor(action: unknown): Rating | null {
  return action === "like" ? "liked" : action === "dislike" ? "disliked" : action === "clear" ? "none" : null;
}
