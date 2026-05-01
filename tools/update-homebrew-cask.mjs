import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const caskPath = join(root, "Casks", "xvdl.rb");

export async function updateHomebrewCask({ version, sha256 = ":no_check" }) {
  if (!/^\d{6}\.\d+$/.test(version)) {
    throw new Error(`Cask version must use yymmdd.patch format, got ${version}`);
  }

  const checksum = normalizeChecksum(sha256);
  const text = await readFile(caskPath, "utf8");
  const next = text
    .replace(/version "[^"]+"/, `version "${version}"`)
    .replace(/sha256 (?::no_check|"[a-f0-9]{64}")/i, `sha256 ${checksum}`);

  if (next === text) {
    return false;
  }

  await writeFile(caskPath, next);
  return true;
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const version = options.version || (await readPackageVersion());
  const sha256 = options.fetchReleaseSha
    ? await fetchReleaseSha(version)
    : options.sha256 || ":no_check";

  await updateHomebrewCask({ version, sha256 });
  console.log(`Updated Homebrew cask to ${version} with ${normalizeChecksum(sha256)}.`);
}

function parseArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--version") {
      options.version = readValue(args, ++index, arg);
    } else if (arg === "--sha256") {
      options.sha256 = readValue(args, ++index, arg);
    } else if (arg === "--no-check") {
      options.sha256 = ":no_check";
    } else if (arg === "--fetch-release-sha") {
      options.fetchReleaseSha = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

async function readPackageVersion() {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  return pkg.version;
}

async function fetchReleaseSha(version) {
  const checksumUrl = `https://github.com/cxa/xvdl/releases/download/v${version}/XVDL-${version}-macos.sha256`;
  const response = await fetch(checksumUrl, {
    headers: {
      "User-Agent": "xvdl-release-tool"
    }
  });

  if (!response.ok) {
    throw new Error(`Could not fetch ${checksumUrl}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const hash = text.match(/\b[a-f0-9]{64}\b/i)?.[0]?.toLowerCase();

  if (!hash) {
    throw new Error(`Could not find a SHA-256 checksum in ${checksumUrl}`);
  }

  return hash;
}

function normalizeChecksum(value) {
  if (value === ":no_check" || value === "no_check") {
    return ":no_check";
  }

  if (/^[a-f0-9]{64}$/i.test(value)) {
    return `"${value.toLowerCase()}"`;
  }

  throw new Error(`Invalid SHA-256 checksum: ${value}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli();
}
