// Bundles the three scripts and copies the manifest into dist/, which is the folder the browser loads.
import fs from "node:fs";
import { build } from "esbuild";

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

fs.copyFileSync("extension/manifest.json", "dist/manifest.json");
fs.copyFileSync("LICENSE", "dist/LICENSE");
if (fs.existsSync("extension/icons")) fs.cpSync("extension/icons", "dist/icons", { recursive: true });
