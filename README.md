# Grout

> _Your desktop, composed._

<p align="center">
  <img src="assets/branding/compact-256.png" alt="Grout" width="120" height="120" />
</p>

A browser extension that tells [MosaicShell](https://github.com/uairhahs/MosaicShell) what your browser is
playing: title, artist, cover, and the heart and thumbs-down on YouTube Music. Grout fills the gaps that Windows'
own media session leaves.

It runs only on YouTube Music, YouTube, Spotify and SoundCloud, and it talks only to MosaicShell on your computer.

## Why an extension

Windows' media session carries title, artist and cover, but no like state. Reading the buttons through Windows
accessibility works only while the browser window is on screen: a browser stops updating a window it cannot see,
so the state freezes when the window is covered or minimised. Grout reads the page itself, so it works whatever
the window is doing, and in a background tab.

It also keeps working when another extension replaces the page's Media Session (KDE's Plasma Integration does),
because it reads the page's Media Session in the page's own world, where the page's copy is what the page set.

## How it works

```text
page (its own world)  ->  content script  ->  service worker  ->  native messaging
   -> MosaicShell.BrowserRelay.exe  ->  named pipe (this user only)  ->  MosaicShell
```

- `src/page/` runs in the page's own world. It reads the page's Media Session and media elements, and on YouTube
  Music the like and dislike buttons, and answers the content script over window messages. Only the four supported
  sites are ever read.
- `src/content/` runs in the extension's isolated world. It polls the page about once a second and sends the
  service worker a message only when something changed. It passes like and dislike requests back to the page.
- `src/background/` keeps the native messaging port open, reports each tab, and passes requests to the right tab.
  The wire format is `BrowserProtocol` in MosaicShell (`host/MosaicShell.Core/Services/BrowserBridge/`).

## Like and dislike

The state is read from the two buttons in YouTube Music's player bar and a request presses at most one of them,
so from any state one press reaches the wanted state. If the page does not say what the state is, nothing is
pressed and the buttons are not offered for that moment: a button that is already on would turn off.

Other sites report what is playing and nothing more, until their buttons have been measured.

## The toolbar popup

Click Grout's icon to see whether it is working. The dot says how the link to MosaicShell is doing:

- **Green, connected.** MosaicShell answered. If the tab you are on is playing, the popup shows what Grout is reporting
  for it.
- **Blue, waiting.** MosaicShell is not running. Start it; Grout connects by itself and keeps trying.
- **Amber, needs you.** Either MosaicShell has not registered Grout's connection yet (start MosaicShell once), or it
  does not trust this copy because the extension ID is not the one it allows (install Grout from a release, or update
  MosaicShell). The popup shows the extension ID for exactly this case, and the icon carries a `!` badge until it is
  fixed.

The popup adds no permission and shows only what Grout already sends to MosaicShell on your own computer.

## Privacy

- Nothing is sent for a tab that plays nothing.
- Nothing leaves your computer: the only connection is the local native messaging port to MosaicShell.
- Permissions are `nativeMessaging` and `alarms` (a keepalive so the worker reconnects). There are no host
  permissions, so the extension cannot read pages or tab addresses itself; its scripts run only on the four sites.

## Install

1. Start MosaicShell once. It registers the native messaging host for the current user (Edge and Chrome) and needs
   no administrator rights.
2. Install Grout. Until it is listed in the browser stores: run `npm install` and `npm run build`, open
   `edge://extensions` (or `chrome://extensions`), turn on Developer mode, choose Load unpacked, and pick the `dist`
   folder.
3. Reload any tab that was already playing; a content script only runs in pages loaded after it.

The manifest has a fixed key, so an unpacked copy always has the ID `aaffcapodpfecchmelidkkhgiaamijpe`, which is the
ID MosaicShell's native host manifest allows. A store listing gets its own ID, which MosaicShell adds when it exists.

## Develop

```text
npm install
npm test          # builds, then runs the tests (Node 22 or later; CI runs Node 24)
npm run typecheck
```

The tests run the page adapters, the content script's mapping and the service worker's logic against fakes of the
site and of `chrome`. There is no browser in the loop; MosaicShell's repository has an end-to-end script that drives a
real browser, the real relay and a stand-in for the Host.

### Branches

Use `dev` as the integration branch and `main` as the release branch. Work should move through pull requests in this
order:

```text
feature/<name> -> dev -> main
```

Start a feature from the latest `dev`, open its pull request against `dev`, and open a second pull request from `dev`
to `main` when a release is ready. The `CI` workflow tests both branches and all pull requests targeting them. Protect
both `dev` and `main` in GitHub and require the `CI / test` job before merging; require pull requests for `main` and
disable direct pushes to it. Create and publish the initial `dev` branch from the first commit before opening feature
pull requests:

```text
git switch -c dev
git push -u origin dev
git switch main
git push -u origin main
git switch dev
git switch -c feature/<name>
```

## Release

Every push to `main` runs `.github/workflows/release.yml`, the same way MosaicShell's release workflow does. It
typechecks and tests the extension, builds it, and publishes a GitHub release with:

- `Grout-<version>.zip`, the package to load unpacked;
- `Grout-<version>-store.zip`, the same package without the manifest `key`, to upload to a browser store;
- `Grout.zip`, the first zip under a name that never changes;
- `SHA256SUMS.txt`.

There is no `.crx`. Edge and Chrome install a `.crx` only if their own store has signed it, so one signed with Grout's
own key is refused with `Package is invalid: 'CRX_REQUIRED_PROOF_MISSING'` however valid it is, and only enterprise
policy could deploy one, which is not what Grout is for. To install Grout by hand use the zip and Load unpacked; the
browser then shows a developer-mode notice when it starts. Once Grout is listed in the Edge Add-ons or Chrome Web
Store, that listing is the one-click route, and the store's extension ID must then be added to MosaicShell's
`AllowedExtensionIds`.

**Versions** follow MosaicShell's date-build scheme, `yyyy.M.d-b{run_number}` (UTC date, no zero padding), which is
also the release tag. A browser's manifest `version` accepts only dot-separated integers, so the packaged manifest
gets `version` `yyyy.M.d.{run_number}` for the browser to compare and `version_name` `yyyy.M.d-b{run_number}` for
people to read. The source manifest is never edited. See `scripts/version.mjs`.

**The extension ID** is fixed by the public `key` in `extension/manifest.json`. MosaicShell's native host allows exactly
that ID, so the key must never change. Nothing needs the matching private key: releases are plain zips and the stores
sign their own packages. `scripts/extension-id.mjs` derives the ID from the manifest, the tests check it, and the
release notes state it.

**Uploading to a store.** The Chrome Web Store and Edge Add-ons refuse a manifest with a `key` ("key field is not
allowed in manifest") and a `description` over 132 characters. Upload the `-store.zip` (or run `npm run package:store`
and zip the `store` folder). `scripts/store-package.mjs` makes it and fails the build if the name or description is over
what a store accepts, and a test keeps the source manifest inside those limits.

A store picks the listing's extension ID itself, so it will not be the unpacked one above. After the first upload:

1. Open the item's **Package** tab in the developer dashboard, choose **View public key**, and put that key in
   `extension/manifest.json` as `key`. Unpacked copies then get the store's ID too, and there is one ID to trust.
2. Update the pinned ID in `test/manifest.test.mjs`.
3. Add the store's ID to `AllowedExtensionIds` in MosaicShell's `NativeHostRegistration`. Edge Add-ons assigns a
   different ID from Chrome's, so each store's ID is added separately.

Each upload needs a higher `version` than the last; the date-build `version` from a release always is.

**Trying it without publishing.** Run the workflow by hand from the Actions tab and untick `publish`. It builds and
packages the extension and keeps the zip as a workflow artifact only.

## Branding

Grout uses MosaicShell's mark, palette and tagline unchanged. See [docs/branding.md](docs/branding.md).

## License

Copyright (c) 2026 S Uddin. Grout is free software under the GNU General Public License, version 3 or (at your
option) any later version; see [LICENSE](LICENSE). Anyone who distributes Grout, or a modified version of it, must
pass on the same freedoms and make the source available under the same license. The package carries its own copy of
the license, and the source is this repository. The bottom of [LICENSE](LICENSE) also preserves, unchanged, the
copyright and permission notice of MIT-licensed work that this project may incorporate or be derived from in part.

See [AI_CONTRIBUTIONS.md](AI_CONTRIBUTIONS.md) for how AI assistance is handled in contributions.
