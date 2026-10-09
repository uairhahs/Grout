// The pages Grout reads, and nothing else. The manifest already limits where the scripts run; this checks again in the
// page's own world, so a change to the manifest alone can never make Grout read a page it was not built for.

const SITES = new Set(["music.youtube.com", "www.youtube.com", "open.spotify.com", "soundcloud.com"]);

/**
 * YouTube is read only where a video is the page. Its browsing pages (home, search, channels) play a muted preview when
 * a thumbnail is hovered and publish that video's title to the Media Session, which would make every hover look like a
 * track change. Embedded players are not a place anyone is listening from either.
 */
export function isSupported(location: { hostname: string; pathname: string }): boolean {
  if (location.hostname === "www.youtube.com") return location.pathname.startsWith("/watch") || location.pathname.startsWith("/shorts");
  return SITES.has(location.hostname);
}

/**
 * Only YouTube Music has had its like and dislike buttons measured. Offering buttons nobody has checked on another
 * site would risk pressing the wrong thing, so the others report what is playing and nothing more.
 */
export function hasRating(location: { hostname: string }): boolean {
  return location.hostname === "music.youtube.com";
}
