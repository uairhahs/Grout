import type { Artwork, PlaybackState, Rating } from "../wire.ts";
import { readRating } from "./youtube-music.ts";

export type PageReading = {
  title: string;
  artist: string;
  album: string;
  artwork: Artwork[];
  playbackState: PlaybackState;
  rating?: Rating;
};

export type PageEnvironment = {
  navigator: { mediaSession?: { metadata: MediaMetadata | null; playbackState: string } };
  document: ParentNode;
};

function hasPlayingMedia(document: ParentNode): boolean {
  for (const media of document.querySelectorAll<HTMLMediaElement>("audio, video")) {
    if (!media.paused && !media.ended) return true;
  }
  return false;
}

function playbackState(environment: PageEnvironment): PlaybackState {
  if (hasPlayingMedia(environment.document)) return "playing";
  return environment.navigator.mediaSession?.playbackState === "playing" ? "playing" : "paused";
}

function artworkFrom(metadata: MediaMetadata): Artwork[] {
  return Array.from(metadata.artwork ?? [], ({ src, sizes }) => ({
    src: String(src ?? ""),
    sizes: String(sizes ?? ""),
  }));
}

export function readPage(environment: PageEnvironment, withRating: boolean): PageReading | null {
  const metadata = environment.navigator.mediaSession?.metadata;
  if (!metadata) return null;

  const reading: PageReading = {
    title: String(metadata.title ?? ""),
    artist: String(metadata.artist ?? ""),
    album: String(metadata.album ?? ""),
    artwork: artworkFrom(metadata),
    playbackState: playbackState(environment),
  };

  if (withRating) {
    const rating = readRating(environment.document);
    if (rating !== null) reading.rating = rating;
  }
  return reading;
}
