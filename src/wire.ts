// What Grout tells MosaicShell about a tab, in the shape MosaicShell's `BrowserProtocol` accepts.

export type Rating = "liked" | "disliked" | "none";
export type PlaybackState = "playing" | "paused" | "none";
export type Artwork = { src: string; sizes: string };

export type WireSnapshot = {
  title: string;
  artist: string;
  album: string;
  artwork: Artwork[];
  playbackState: PlaybackState;
  rating?: Rating;
  capabilities?: string[];
};
