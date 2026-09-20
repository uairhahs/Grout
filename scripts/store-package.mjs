// Makes the copy of the package that goes to a browser store.
//
// It is the same package as the one loaded unpacked, except for the manifest's `key`. The `key` is what gives an unpacked
// copy a stable extension ID, and the stores refuse it on a new item ("key field is not allowed in manifest") because they
// choose the ID themselves. So the release publishes both: the ordinary zip, with the key, and a store zip without it.
//
// It also checks the limits the store enforces in the manifest, so a change that would fail the upload fails the build.
//
// Usage: node scripts/store-package.mjs <package folder> <output folder>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MAX_NAME = 75;
const MAX_DESCRIPTION = 132;

/** The manifest without `key`, and otherwise unchanged. */
export function storeManifest(manifest) {
  const { key: _key, ...rest } = manifest;
  return rest;
}

/** What a store would refuse in this manifest, as sentences; empty when it would accept it. */
export function storeProblems(manifest) {
  const problems = [];
  if (typeof manifest.name === "string" && manifest.name.length > MAX_NAME) {
    problems.push(`the name is ${manifest.name.length} characters; a store allows ${MAX_NAME}`);
  }
  if (typeof manifest.description === "string" && manifest.description.length > MAX_DESCRIPTION) {
    problems.push(`the description is ${manifest.description.length} characters; a store allows ${MAX_DESCRIPTION}`);
  }
  if ("key" in manifest) problems.push("the manifest has a key, which a store refuses on a new item");
  return problems;
}

/** Copies a built package to `to` without the manifest key, refusing before it writes anything if a store would refuse it. */
export function packageForStore(from, to) {
  const manifest = storeManifest(JSON.parse(fs.readFileSync(path.join(from, "manifest.json"), "utf8")));
  const problems = storeProblems(manifest);
  if (problems.length > 0) throw new Error(`the package would be refused by a store: ${problems.join("; ")}`);

  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  fs.writeFileSync(path.join(to, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    packageForStore(process.argv[2], process.argv[3]);
    console.log(`store package written to ${process.argv[3]}`);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
