// What the toolbar popup says. A pure function of the worker's status and the current tab, so it is tested without a
// browser; popup.ts only puts the result on the page.

export type Tone = "good" | "wait" | "attention";

export type View = {
  tone: Tone;
  heading: string;
  body: string;
  /** What the current tab is reporting to MosaicShell. Only shown while connected. */
  track?: { title: string; artist: string; playing: boolean };
  /** The ID MosaicShell has to allow, for support and for a copy it does not trust. */
  extensionId?: string;
};

type Link = "starting" | "waiting" | "connected" | "unavailable" | "refused";
const LINKS = new Set<string>(["starting", "waiting", "connected", "unavailable", "refused"]);

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const SUPPORTED = "Grout reads YouTube Music, YouTube, Spotify and SoundCloud.";

const COPY: Record<Exclude<Link, "connected">, { tone: Tone; heading: string; body: string }> = {
  starting: { tone: "wait", heading: "Starting", body: "Grout is connecting to MosaicShell." },
  waiting: { tone: "wait", heading: "Waiting for MosaicShell", body: "Start MosaicShell. Grout connects by itself and keeps trying." },
  unavailable: {
    tone: "attention",
    heading: "MosaicShell has not set Grout up",
    body: "Start MosaicShell once. It registers Grout's connection for your account, and Grout retries by itself.",
  },
  refused: {
    tone: "attention",
    heading: "MosaicShell does not trust this copy of Grout",
    body: "MosaicShell only accepts the Grout it was built for. Install Grout from the release page, or update MosaicShell.",
  },
};

/** The popup's view of a status, which is untrusted input: a worker that has just woken has said nothing, so anything odd reads as starting. */
export function describeStatus(status: unknown, tabId: number | undefined): View {
  const known = record(status) && typeof status.state === "string" && LINKS.has(status.state);
  const state: Link = known ? ((status as Record<string, unknown>).state as Link) : "starting";
  const extensionId = record(status) && typeof status.extensionId === "string" ? status.extensionId : undefined;

  if (state !== "connected") return { ...COPY[state], extensionId };

  const sessions = record(status) && Array.isArray(status.sessions) ? status.sessions : [];
  const mine = sessions.find((s): s is Record<string, unknown> => record(s) && tabId !== undefined && s.tabId === tabId);
  if (!mine) return { tone: "good", heading: "Connected to MosaicShell", body: `Nothing is playing on this tab. ${SUPPORTED}`, extensionId };

  return {
    tone: "good",
    heading: "Connected to MosaicShell",
    body: "Reporting this tab to MosaicShell.",
    track: {
      title: typeof mine.title === "string" ? mine.title : "",
      artist: typeof mine.artist === "string" ? mine.artist : "",
      playing: mine.playbackState === "playing",
    },
    extensionId,
  };
}
