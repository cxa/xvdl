import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const extensionDir = join(root, "extension");
const manifestPath = join(extensionDir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const packageSafariScript = await readFile(join(root, "tools", "package-safari.mjs"), "utf8");
const homebrewCask = await readFile(join(root, "Casks", "xvdl.rb"), "utf8");

const requiredFiles = [
  "background.js",
  "content.js",
  "injected.js",
  "styles.css",
  "icons/icon-48.png",
  "icons/icon-96.png",
  "icons/icon-128.png",
  "icons/icon-256.png"
];

assert(manifest.manifest_version === 3, "manifest_version must be 3");
assert(manifest.name === "XVDL", "extension name must be XVDL");
assert(/^\d{6}\.\d+$/.test(pkg.version), "package version must use yymmdd.patch format");
assert(manifest.version === pkg.version, "manifest version must match package.json version");
assert(homebrewCask.includes(`version "${pkg.version}"`), "Homebrew cask version must match package.json version");
assert(
  /sha256 (?::no_check|"[a-f0-9]{64}")/i.test(homebrewCask),
  "Homebrew cask must define a SHA-256 checksum or :no_check"
);
assert(
  homebrewCask.includes('url "https://github.com/cxa/xvdl/releases/download/v#{version}/XVDL-#{version}-macos.zip"'),
  "Homebrew cask must install the release macOS zip"
);
assert(homebrewCask.includes('app "XVDL.app"'), "Homebrew cask must install XVDL.app");
assert(homebrewCask.includes('depends_on macos: ">= :sequoia"'), "Homebrew cask must require macOS Sequoia or newer");
assert(/macOS/i.test(manifest.description || ""), "manifest description should make macOS scope clear");
assert(manifest.icons?.["128"] === "icons/icon-128.png", "128px icon is required");
assert(manifest.permissions?.includes("nativeMessaging"), "nativeMessaging permission is required");
assert(manifest.host_permissions?.includes("https://x.com/*"), "x.com host permission is required");
assert(manifest.host_permissions?.includes("https://twitter.com/*"), "twitter.com host permission is required");
assert(manifest.host_permissions?.includes("https://video.twimg.com/*"), "video.twimg.com host permission is required");
assert(manifest.content_scripts?.[0]?.js?.includes("content.js"), "content script is required");
assert(manifest.background?.service_worker === "background.js", "background service worker is required");
assert(
  manifest.web_accessible_resources?.some((entry) => entry.resources?.includes("injected.js")),
  "injected page probe must be web-accessible"
);
assert(packageSafariScript.includes("--macos-only"), "Safari packaging must remain macOS-only");

for (const file of requiredFiles) {
  await readFile(join(extensionDir, file), "utf8");
}

for (const file of requiredFiles.filter((file) => file.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", join(extensionDir, file)], {
    encoding: "utf8"
  });

  assert(result.status === 0, `${file} failed syntax check:\n${result.stderr}`);
}

console.log("Extension manifest and scripts look valid.");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
