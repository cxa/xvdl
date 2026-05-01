import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { updateHomebrewCask } from "./update-homebrew-cask.mjs";

const root = new URL("..", import.meta.url).pathname;
const releaseDate = process.argv[2] || todayYYMMDD();
const releaseVersion = nextVersion(releaseDate);
const releaseTag = `v${releaseVersion}`;

await updateJson(join(root, "package.json"), (pkg) => {
  pkg.version = releaseVersion;
  return pkg;
});

await updateJson(join(root, "extension", "manifest.json"), (manifest) => {
  manifest.version = releaseVersion;
  return manifest;
});

await updateReadme(releaseVersion);
await writeReleaseNotes(releaseVersion);
await updateHomebrewCask({ version: releaseVersion, sha256: ":no_check" });

console.log(`Prepared ${releaseTag}`);

function todayYYMMDD() {
  const date = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}`;
}

function nextVersion(datePrefix) {
  if (!/^\d{6}$/.test(datePrefix)) {
    throw new Error(`Release date must use yymmdd format, got ${datePrefix}`);
  }

  const tags = listTags();
  const patches = tags
    .map((tag) => tag.match(new RegExp(`^v?${datePrefix}\\.(\\d+)$`))?.[1])
    .filter(Boolean)
    .map(Number);

  const nextPatch = patches.length > 0 ? Math.max(...patches) + 1 : 0;
  return `${datePrefix}.${nextPatch}`;
}

function listTags() {
  run("git", ["fetch", "--tags", "--quiet"], { allowFailure: true });
  const result = run("git", ["tag", "--list"], { allowFailure: true });
  return result.stdout.split(/\r?\n/).map((tag) => tag.trim()).filter(Boolean);
}

async function updateJson(path, updater) {
  const data = JSON.parse(await readFile(path, "utf8"));
  const next = updater(data);
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`);
}

async function updateReadme(version) {
  const path = join(root, "README.md");
  const text = await readFile(path, "utf8");
  const next = text
    .replace(/v\d{6}\.\d+/g, `v${version}`)
    .replace(/XVDL-\d{6}\.\d+-macos/g, `XVDL-${version}-macos`);

  await writeFile(path, next);
}

async function writeReleaseNotes(version) {
  const path = join(root, "RELEASE_NOTES.md");
  const notes = `# XVDL v${version}

## What's Changed

- Initial macOS Safari Web Extension for adding an XVDL download button to X/Twitter videos.
- Saves direct MP4 variants to the macOS Downloads folder through the native Safari app extension.
- Shows download success or failure feedback inside the video container.
- Supports Safari web apps created with Add to Dock after enabling the extension for that web app.

## Install

### Homebrew

\`\`\`sh
brew tap cxa/xvdl https://github.com/cxa/xvdl
brew install --cask xvdl
open -a XVDL
\`\`\`

Then enable XVDL in \`Safari > Settings > Extensions\` and grant website access for \`x.com\` and \`twitter.com\`.

### Manual

1. Download \`XVDL-${version}-macos.zip\` from this release.
2. Unzip it and move \`XVDL.app\` to \`/Applications\`.
3. Open \`XVDL.app\` once.
4. Enable XVDL in \`Safari > Settings > Extensions\`.
5. Grant website access for \`x.com\` and \`twitter.com\`.

For Safari web apps created with Add to Dock, open the web app, choose the app name in the menu bar, then \`Settings > Extensions\`, enable XVDL, and grant website access.
`;

  await writeFile(path, notes);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8"
  });

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }

  return result;
}
