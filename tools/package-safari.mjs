import { spawnSync } from "node:child_process";

const args = [
  "safari-web-extension-converter",
  "--macos-only",
  "--app-name",
  "XVDL",
  "--bundle-identifier",
  "com.realazy.xvdl",
  "--project-location",
  "Safari",
  "--force",
  "--no-open",
  "--no-prompt",
  "extension"
];

const result = spawnSync("xcrun", args, {
  stdio: "inherit"
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

await import("./fix-safari-project.mjs");
