# Grout privacy policy

_Last updated 20 September 2026._

Grout is a browser extension that tells the MosaicShell desktop app, running on the same computer, what your browser
is playing. It has no server, no account and no analytics. Nothing Grout reads leaves your computer.

## What Grout reads

Only on YouTube Music, YouTube, Spotify (the web player) and SoundCloud, and only when a tab is playing media:

- the track's title, artist and album, and the address of its cover image;
- whether it is playing or paused, and whether the tab is making sound;
- on YouTube Music, whether the track is liked or disliked;
- the site the tab is on (for example `music.youtube.com`), and the browser's number for the tab and window.

Grout does not read your browsing history, the addresses of your tabs, page text, form fields, passwords, cookies or
anything on any other site.

## Where it goes

Grout hands the list above to MosaicShell over the browser's native messaging channel, which is a connection between the
browser and a program on your own computer. MosaicShell shows it in its flyouts. When you press like or dislike in
MosaicShell, MosaicShell sends the request back to Grout, which presses the matching button in that tab.

Grout makes no network requests of its own. It loads no code from anywhere and does not evaluate text as code.

## What Grout keeps

Grout stores nothing on disk: no cookies, no local storage, no history. What each tab last reported is held in the
extension's memory only while the browser runs, and is dropped when the tab closes or stops playing.

How MosaicShell handles what it receives is described by MosaicShell, not by this page.

## Permissions

- `nativeMessaging` lets Grout talk to MosaicShell, and only to the host MosaicShell registers for this purpose.
- `alarms` wakes Grout's background worker every 30 seconds so it can reconnect to MosaicShell after either one was
  restarted.
- Grout declares no separate `host_permissions` entry. Its two content scripts are declared for exactly the four HTTPS
  sites above and run only in the top frame. This is host access under browser-store terminology, limited to those sites;
  Grout cannot read arbitrary tab addresses or pages on any other site.

## Sharing and selling

Grout does not sell, share or transfer user data to anyone, and does not use it for advertising, credit or lending
decisions, or any purpose other than showing what is playing.

## Changes and contact

If this policy changes, the new version is published here with a new date. Questions and reports:
<https://github.com/uairhahs/Grout/issues>. Grout's source code is at <https://github.com/uairhahs/Grout>.
