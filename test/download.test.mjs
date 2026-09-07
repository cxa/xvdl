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

function createPage() {
  let complete, reject, nativeCalls = 0, portMessages = 0, lastActivity = Date.now();
  const connections = new Set();
  const pendingReplies = new Set();
  const onMessage = event(), onConnect = event();
  vm.runInNewContext(backgroundSource, {
    browser: { runtime: {
      onMessage, onConnect,
      sendNativeMessage: () => {
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
  const window = { addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval };
  vm.runInNewContext(contentSource.replace(/\}\)\(\);\s*$/, "window.check = { onDownloadClick, mediaByTweetId }; })();"), {
    browser: { runtime }, window, HTMLElement: Element,
    console: { warn() {} },
    document: {
      readyState: "loading", addEventListener() {},
      createElement: () => new Element(),
      head: { appendChild() {} }
    }
  });
  const button = new Element();
  const host = new Element();
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
    toast: () => host.children[0],
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
  classList = {
    add: (...names) => names.forEach((name) => this.classes.add(name)),
    remove: (...names) => names.forEach((name) => this.classes.delete(name)),
    contains: (name) => this.classes.has(name) || this.className.split(" ").includes(name)
  };
  setAttribute() {}
  removeAttribute() {}
  remove() {}
  append(child) { this.children.push(child); }
}
