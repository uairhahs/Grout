// Release versions follow MosaicShell's date-build scheme, yyyy.M.d-b{run_number} (UTC date, no zero padding), so the two
// projects' releases read alike. A browser's manifest `version` cannot carry the "-b" part (it accepts one to four
// dot-separated integers), so the release stamps two fields: `version` 2026.9.20.5 for the browser to compare, and
// `version_name` 2026.9.20-b5, which is what users see and which equals the release tag.

// No zero padding anywhere: a browser rejects a version part with a leading zero, and a tag must map to one.
const TAG = /^([1-9]\d{3})\.([1-9]\d?)\.([1-9]\d?)-b([1-9]\d*)$/;
const MAX_PART = 65535;

/** The tag for a UTC date and a workflow run number: what the release workflow computes with `date -u`. */
export function releaseTag(date, run) {
  return `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}-b${run}`;
}

/** The two manifest fields for a release tag; throws for anything a browser would refuse. */
export function manifestVersions(tag) {
  const match = TAG.exec(tag);
  if (!match) throw new Error(`"${tag}" is not a release tag of the form yyyy.M.d-b{run}`);

  const [year, month, day, run] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error(`"${tag}" is not a calendar date`);
  if (run < 1) throw new Error(`"${tag}" has a run number below 1`);
  for (const part of [year, month, day, run]) {
    if (part > MAX_PART) throw new Error(`"${tag}" has a part above ${MAX_PART}, which a browser's version cannot hold`);
  }

  return { version: `${year}.${month}.${day}.${run}`, version_name: tag };
}
