import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { setReleaseVersion } from "../scripts/release-version.mjs";

const filenames = [
  "package.json",
  "package-lock.json",
  "demo/package-lock.json",
];
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), "webnim-version-"));
  try {
    await mkdir(join(root, "demo"));
    const documents = [
      { name: "webnim", version: "0.2.0", dependencies: { example: "^1.0.0" } },
      {
        name: "webnim",
        version: "0.2.0",
        packages: {
          "": { name: "webnim", version: "0.2.0" },
          "node_modules/example": { version: "1.2.3" },
        },
      },
      {
        name: "webnim-demo",
        version: "0.1.0",
        packages: {
          "": { name: "webnim-demo", version: "0.1.0" },
          "..": { name: "webnim", version: "0.2.0" },
        },
      },
    ];
    await Promise.all(
      filenames.map((file, i) =>
        writeFile(join(root, file), JSON.stringify(documents[i])),
      ),
    );
    await fn(root, async () =>
      Promise.all(
        filenames.map(async (file) =>
          JSON.parse(await readFile(join(root, file), "utf8")),
        ),
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("release tag updates both manifests and the linked dependency without changing dependencies", async () =>
  fixture(async (root, read) => {
    const result = await setReleaseVersion(root, "v0.3.0");
    assert.equal(result.changed, true);
    const [pkg, lock, demo] = await read();
    assert.equal(pkg.version, "0.3.0");
    assert.equal(lock.version, "0.3.0");
    assert.equal(lock.packages[""].version, "0.3.0");
    assert.equal(demo.packages[".."].version, "0.3.0");
    assert.equal(demo.version, "0.1.0");
    assert.equal(demo.packages[""].version, "0.1.0");
    assert.deepEqual(pkg.dependencies, { example: "^1.0.0" });
    assert.equal(lock.packages["node_modules/example"].version, "1.2.3");
    assert.equal((await setReleaseVersion(root, "v0.3.0")).changed, false);
  }));

test("invalid release tags are rejected before changing any file", async () =>
  fixture(async (root, read) => {
    const before = await read();
    for (const tag of [
      "0.3.0",
      "v01.2.3",
      "v1.2",
      "v1.2.3-01",
      "v1.2.3\n",
      "v9007199254740992.0.0",
      "v1.2.3\nNPM_DIST_TAG=evil",
      undefined,
    ]) {
      await assert.rejects(setReleaseVersion(root, tag));
      assert.deepEqual(await read(), before);
    }
  }));

test("repository synchronization advances prereleases numerically and never downgrades newer versions", async () =>
  fixture(async (root, read) => {
    for (const tag of ["v0.3.0-beta.2", "v0.3.0-beta.10", "v0.3.0"]) {
      assert.equal(
        (await setReleaseVersion(root, tag, { onlyIfNewer: true })).changed,
        true,
      );
    }
    for (const tag of ["v0.2.9", "v0.3.0-beta.11"]) {
      assert.equal(
        (await setReleaseVersion(root, tag, { onlyIfNewer: true })).skipped,
        true,
      );
      assert.equal((await read())[0].version, "0.3.0");
    }
  }));

test("CLI chooses latest or next from version/prerelease status", async () =>
  fixture(async (root) => {
    const envfile = join(root, "env");
    for (const [tag, prerelease, expected] of [
      ["v0.3.0", "false", "latest"],
      ["v0.4.0-rc.1", "false", "next"],
      ["v0.4.0", "true", "next"],
      ["v0.4.0+build-info", "false", "latest"],
    ]) {
      await writeFile(envfile, "");
      execFileSync(
        process.execPath,
        [new URL("../scripts/release-version.mjs", import.meta.url).pathname],
        {
          cwd: root,
          env: {
            ...process.env,
            RELEASE_TAG: tag,
            PRERELEASE: prerelease,
            GITHUB_ENV: envfile,
          },
        },
      );
      assert.equal(
        await readFile(envfile, "utf8"),
        `NPM_DIST_TAG=${expected}\n`,
      );
    }
  }));
