// Bundles the three scripts and copies the manifest into dist/, which is the folder the browser loads.
import fs from "node:fs";
import { build } from "esbuild";
import { manifestVersions } from "./version.mjs";

const common = { bundle: true, target: "chrome116", sourcemap: false, legalComments: "none", logLevel: "warning" };

fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist", { recursive: true });

await Promise.all([
  // The page's own world and the isolated world each get one self-contained script.
  build({ ...common, entryPoints: { page: "src/page/main.ts" }, outdir: "dist", format: "iife" }),
  build({ ...common, entryPoints: { content: "src/content/content.ts" }, outdir: "dist", format: "iife" }),
  // The service worker is declared as a module.
  build({ ...common, entryPoints: { background: "src/background/background.js" }, outdir: "dist", format: "esm" }),
]);

// A release stamps its version into the packaged manifest (see scripts/version.mjs); the source manifest never changes.
const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));
if (process.env.GROUT_VERSION) Object.assign(manifest, manifestVersions(process.env.GROUT_VERSION));
fs.writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
fs.copyFileSync("LICENSE", "dist/LICENSE");
if (fs.existsSync("extension/icons")) fs.cpSync("extension/icons", "dist/icons", { recursive: true });
