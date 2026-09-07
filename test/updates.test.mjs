import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";

const background = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
const DAY = 86_400_000;

test("update reminders are claimed once per day across tabs and worker restarts", async () => {
  const storage = {};
  const first = createBackground(storage);
  assert.deepEqual(await Promise.all([first.check(), first.check(), first.check()]), ["260907.1", null, null]);
  assert.equal(first.requests, 1);
  const restarted = createBackground(storage);
  assert.equal(await restarted.check(), null);
  assert.equal(restarted.requests, 0);
  restarted.now += DAY;
  assert.equal(await restarted.check(), "260907.1");
});

test("no-update results are cached, installation invalidates them, and failures stay silent", async () => {
  const storage = {};
  const worker = createBackground(storage);
  worker.response = { ok: true, version: "" };
  assert.equal(await worker.check(), null);
  assert.equal(await worker.check(), null);
  assert.equal(worker.requests, 1);
  worker.installedVersion = "260907.1";
  assert.equal(await worker.check(), null);
  assert.equal(worker.requests, 2);

  worker.now += DAY;
  worker.response = { ok: false };
  assert.equal(await worker.check(), null);
  worker.response = { ok: true, version: '<script>alert("update")</script>' };
  assert.equal(await worker.check(), null);
  assert.equal(storage.updateState.promptedAt, undefined);
});

test("native feed parsing uses the signed feed's build number and rejects invalid versions", { skip: process.platform !== "darwin" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "xvdl-feed-test-"));
  try {
    const source = await readFile(new URL("../tools/safari/SafariWebExtensionHandler.swift", import.meta.url), "utf8");
    const checks = String.raw`
let item = "<item><sparkle:version>2</sparkle:version><sparkle:shortVersionString>260907.1</sparkle:shortVersionString></item>"
let xml = "<!-- Sparkle signed feed --><rss xmlns:sparkle=\"http://www.andymatuschak.org/xml-namespaces/sparkle\"><channel>" + item + "</channel></rss>"
let data = Data(xml.utf8)
assert(UpdateFeed.availableVersion(in: data, installedBuild: 1) == "260907.1")
assert(UpdateFeed.availableVersion(in: data, installedBuild: 2) == "")
assert(UpdateFeed.availableVersion(in: data, installedBuild: 3) == "")
assert(UpdateFeed.availableVersion(in: Data("<broken>".utf8), installedBuild: 1) == nil)
assert(UpdateFeed.availableVersion(in: Data(xml.replacingOccurrences(of: "260907.1", with: "bad-version").utf8), installedBuild: 1) == nil)
print("Native update feed checks passed.")
`;
    const path = join(directory, "check.swift");
    await writeFile(path, source + checks);
    const result = spawnSync("xcrun", ["swift", path], { encoding: "utf8", timeout: 60_000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    await rm(directory, { recursive: true });
  }
});

function createBackground(storage) {
  let listener;
  const worker = { now: DAY * 100, installedVersion: "260907.0", response: { ok: true, version: "260907.1" }, requests: 0 };
  vm.runInNewContext(background, {
    Date: { now: () => worker.now },
    browser: {
      runtime: {
        onConnect: { addListener() {} },
        onMessage: { addListener: (callback) => { listener = callback; } },
        getManifest: () => ({ version: worker.installedVersion }),
        sendNativeMessage: async (app, message) => {
          assert.equal(message.type, "check-update");
          worker.requests++;
          return worker.response;
        }
      },
      storage: { local: {
        get: async () => structuredClone(storage),
        set: async (value) => Object.assign(storage, structuredClone(value))
      } }
    }
  });
  worker.check = () => new Promise((resolve) => {
    listener({ type: "xvdl-check-update" }, {}, (notice) => resolve(notice?.version || null));
  });
  return worker;
}
