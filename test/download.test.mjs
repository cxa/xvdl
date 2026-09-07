import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";

const backgroundSource = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
const contentSource = await readFile(new URL("../extension/content.js", import.meta.url), "utf8");

test("long downloads keep their reply channel alive and report the actual result", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  const page = createPage();
  const pending = page.click();

  // Model WebKit's 30-second background unload and 2-minute idle-port limit.
  for (let elapsed = 0; elapsed < 300_000; elapsed += 15_000) {
    t.mock.timers.tick(15_000);
    if ((elapsed + 15_000) % 30_000 === 0) page.unloadIdleBackground();
    await setImmediate();
    assert.equal(page.toast(), undefined, "a pending download must not report failure or success");
  }

  await page.click();
  assert.equal(page.nativeCalls, 1, "clicking a busy button must not download again");
  page.complete({ ok: true, path: "/Downloads/long-video.mp4" });
  await pending;
  assert.equal(page.toast().dataset.xvdlState, "done");
  assert.equal(page.toast().textContent, "Saved to: /Downloads/long-video.mp4");
  assert.equal(page.openPorts, 0);
  assert.equal(page.button.classList.contains("xvdl-download-button--busy"), false);
  const sent = page.portMessages;
  t.mock.timers.tick(60_000);
  assert.equal(page.portMessages, sent, "stop keepalive traffic when the download ends");
});

test("only an explicit native failure is shown as a download failure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
  for (const outcome of ["failure", "empty", "native-disconnect", "port-disconnect"]) {
    const page = createPage();
    const pending = page.click();
    if (outcome === "failure") page.complete({ ok: false, error: "Video request failed with HTTP 403." });
    if (outcome === "empty") page.complete(undefined);
    if (outcome === "native-disconnect") page.reject(new Error("Native connection closed."));
    if (outcome === "port-disconnect") page.disconnect();
    await pending;

    const toast = page.toast();
    if (outcome === "failure") {
      assert.equal(toast.dataset.xvdlState, "error");
      assert.match(toast.textContent, /Download failed: Video request failed with HTTP 403/);
    } else {
      assert.equal(toast.dataset.xvdlState, "unknown", outcome);
      assert.match(toast.textContent, /check Downloads/i);
      assert.doesNotMatch(toast.textContent, /Download failed|Saved to:/);
    }
    assert.equal(page.openPorts, 0);
    const sent = page.portMessages;
    t.mock.timers.tick(60_000);
    assert.equal(page.portMessages, sent);
  }
});

test("update prompts wait for downloads and their result, then open the updater or dismiss", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: Date.UTC(2026, 8, 7) });
  const page = createPage({ updateVersion: "260907.1" });
  const download = page.click();
  page.showUpdate();
  await setImmediate();
  assert.equal(page.prompt(), undefined);
  assert.equal(page.updateChecks, 0);

  page.complete({ ok: true, path: "/Downloads/video.mp4" });
  await download;
  assert.equal(page.updateChecks, 0, "let the download result remain visible");
  t.mock.timers.tick(3600);
  await setImmediate();
  assert.equal(page.prompt().children[0].textContent, "XVDL 260907.1 is available.");

  const second = page.click();
  assert.equal(page.prompt(), undefined, "hide an existing update prompt when downloading");
  page.complete({ ok: true, path: "/Downloads/video-2.mp4" });
  await second;
  t.mock.timers.tick(3600);
  await setImmediate();
  assert.ok(page.prompt());
  assert.equal(page.updateChecks, 1);
  page.openUpdateResult = { ok: false };
  await page.prompt().children[1].click();
  assert.match(page.prompt().children[0].textContent, /Open XVDL from Applications/);
  assert.equal(page.prompt().children[1].disabled, false);
  page.openUpdateResult = { ok: true };
  await page.prompt().children[1].click();
  page.showUpdate();
  assert.equal(page.prompt(), undefined);
  assert.equal(page.openUpdateCalls, 2);

  const later = createPage({ updateVersion: "260907.1" });
  later.showUpdate();
  await setImmediate();
  await later.prompt().children[2].click();
  later.showUpdate();
  assert.equal(later.prompt(), undefined);
  assert.equal(later.openUpdateCalls, 0);
  t.mock.timers.tick(86_400_000);
  later.showUpdate();
  await setImmediate();
  assert.ok(later.prompt(), "a long-lived tab can remind again the next day");
  assert.equal(later.updateChecks, 2);
});

function createPage({ updateVersion = "" } = {}) {
  let complete, reject, nativeCalls = 0, portMessages = 0, lastActivity = Date.now();
  let updateChecks = 0, openUpdateCalls = 0, openUpdateResult = { ok: true };
  const storage = {};
  const connections = new Set();
  const pendingReplies = new Set();
  const onMessage = event(), onConnect = event();
  vm.runInNewContext(backgroundSource, {
    Date,
    browser: { storage: { local: {
      get: async () => storage,
      set: async (value) => Object.assign(storage, value)
    } }, runtime: {
      onMessage, onConnect,
      getManifest: () => ({ version: "260907.0" }),
      sendNativeMessage: async (app, message) => {
        if (message.type === "check-update") { updateChecks++; return { ok: true, version: updateVersion }; }
        if (message.type === "open-update") { openUpdateCalls++; return openUpdateResult; }
        nativeCalls++;
        return new Promise((resolve, fail) => { complete = resolve; reject = fail; });
      }
    } }
  });
  const runtime = {
    getURL: (path) => path,
    sendMessage: (message) => new Promise((resolve) => {
      pendingReplies.add(resolve);
      onMessage.fire(message, {}, resolve);
    }),
    connect: ({ name }) => {
      const client = { name, onMessage: event(), onDisconnect: event() };
      const server = { name, onMessage: event(), onDisconnect: event() };
      let closed = false;
      client.disconnect = server.disconnect = () => {
        if (closed) return;
        closed = true;
        connections.delete(client);
        server.onDisconnect.fire();
        client.onDisconnect.fire();
      };
      for (const [from, to] of [[client, server], [server, client]]) {
        from.postMessage = (message) => {
          assert.equal(closed, false, "must not send on a closed port");
          lastActivity = Date.now();
          portMessages++;
          to.onMessage.fire(message);
        };
      }
      connections.add(client);
      onConnect.fire(server);
      return client;
    }
  };
  const host = new Element();
  const window = { addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval, innerHeight: 900 };
  vm.runInNewContext(contentSource.replace(/\}\)\(\);\s*$/, "window.check = { onDownloadClick, mediaByTweetId, maybeShowUpdate }; })();"), {
    browser: { runtime }, window, HTMLElement: Element, Date,
    console: { warn() {} },
    document: {
      readyState: "loading", addEventListener() {},
      visibilityState: updateVersion ? "visible" : "hidden",
      querySelector: () => host.children.find((child) => child.classList.contains("xvdl-toast--visible")),
      querySelectorAll: () => [host],
      createElement: () => new Element(),
      head: { appendChild() {} }
    }
  });
  const button = new Element();
  button.parentElement = host;
  button.dataset.tweetId = "2096755738123338145";
  window.check.mediaByTweetId.set(button.dataset.tweetId, {
    variants: [{ url: "https://video.twimg.com/example.mp4", contentType: "video/mp4" }]
  });
  return {
    button,
    click: () => window.check.onDownloadClick({ currentTarget: button, preventDefault() {}, stopPropagation() {} }),
    complete: (response) => complete(response),
    reject: (error) => reject(error),
    disconnect: () => { for (const port of connections) port.disconnect(); },
    toast: () => host.children.find((child) => child.classList.contains("xvdl-toast")),
    prompt: () => host.children.find((child) => child.classList.contains("xvdl-update-prompt")),
    showUpdate: () => window.check.maybeShowUpdate(),
    set openUpdateResult(value) { openUpdateResult = value; },
    get updateChecks() { return updateChecks; },
    get openUpdateCalls() { return openUpdateCalls; },
    get nativeCalls() { return nativeCalls; },
    get portMessages() { return portMessages; },
    get openPorts() { return connections.size; },
    unloadIdleBackground() {
      if (connections.size && Date.now() - lastActivity < 120_000) return;
      for (const reply of pendingReplies) reply(undefined);
      for (const port of connections) port.disconnect();
    }
  };
}

function event() {
  const listeners = new Set();
  return {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    fire: (...args) => { for (const listener of listeners) listener(...args); }
  };
}

class Element {
  dataset = {};
  children = [];
  className = "";
  classes = new Set();
  listeners = {};
  classList = {
    add: (...names) => names.forEach((name) => this.classes.add(name)),
    remove: (...names) => names.forEach((name) => this.classes.delete(name)),
    contains: (name) => this.classes.has(name) || this.className.split(" ").includes(name)
  };
  setAttribute() {}
  removeAttribute() {}
  addEventListener(type, listener) { this.listeners[type] = listener; }
  click() { return this.listeners.click?.(); }
  get isConnected() { return Boolean(this.parentElement); }
  getBoundingClientRect() { return { width: 600, height: 400, top: 0, bottom: 400 }; }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  append(...children) {
    for (const child of children) { child.parentElement = this; this.children.push(child); }
  }
}
