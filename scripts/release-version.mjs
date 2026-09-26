import { readFile, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

function parseVersion(version) {
  const match = typeof version === "string" && version.match(versionPattern);
  if (
    !match ||
    match[0] !== version ||
    version.length > 256 ||
    match
      .slice(1, 4)
      .some((part) => BigInt(part) > BigInt(Number.MAX_SAFE_INTEGER))
  )
    throw new Error(`Invalid semantic version: ${version}`);
  return { core: match.slice(1, 4).map(BigInt), pre: match[4]?.split(".") };
}

function compareVersions(a, b) {
  const left = parseVersion(a),
    right = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (left.core[i] !== right.core[i])
      return left.core[i] > right.core[i] ? 1 : -1;
  }
  if (!left.pre || !right.pre) return !left.pre ? (right.pre ? 1 : 0) : -1;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i],
      y = right.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const nx = /^\d+$/.test(x),
      ny = /^\d+$/.test(y);
    if (nx && ny) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (nx !== ny) return nx ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

export async function setReleaseVersion(
  root,
  tag,
  { onlyIfNewer = false } = {},
) {
  if (typeof tag !== "string" || !tag.startsWith("v"))
    throw new Error("Release tag must be v followed by a semantic version");
  const version = tag.slice(1);
  parseVersion(version);
  const names = ["package.json", "package-lock.json", "demo/package-lock.json"];
  const docs = await Promise.all(
    names.map(async (name) =>
      JSON.parse(await readFile(resolve(root, name), "utf8")),
    ),
  );
  const [pkg, lock, demo] = docs;
  if (
    pkg.name !== "webnim" ||
    lock.name !== "webnim" ||
    lock.packages?.[""]?.name !== "webnim" ||
    demo.packages?.[".."]?.name !== "webnim"
  )
    throw new Error("Expected the Webnim package and its root/demo lockfiles");
  if (onlyIfNewer && compareVersions(pkg.version, version) > 0)
    return { version, changed: false, skipped: true };
  const changed = [
    pkg.version,
    lock.version,
    lock.packages[""].version,
    demo.packages[".."].version,
  ].some((value) => value !== version);
  pkg.version =
    lock.version =
    lock.packages[""].version =
    demo.packages[".."].version =
      version;
  if (changed)
    await Promise.all(
      names.map((name, i) =>
        writeFile(resolve(root, name), JSON.stringify(docs[i], null, 2) + "\n"),
      ),
    );
  return { version, changed, skipped: false };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await setReleaseVersion(
    process.cwd(),
    process.env.RELEASE_TAG,
    { onlyIfNewer: process.argv.includes("--only-if-newer") },
  );
  const distTag =
    process.env.PRERELEASE === "true" || parseVersion(result.version).pre
      ? "next"
      : "latest";
  if (process.env.GITHUB_ENV)
    await appendFile(process.env.GITHUB_ENV, `NPM_DIST_TAG=${distTag}\n`);
  console.log(
    result.skipped
      ? `Keeping newer repository version; skipping ${result.version}`
      : `Release version ${result.version} (${distTag})${result.changed ? " synchronized" : " already synchronized"}`,
  );
}
