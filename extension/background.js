(() => {
  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const DAY = 24 * 60 * 60 * 1000;
  let updateNoticeTask = Promise.resolve();

  extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "xvdl-check-update") {
      // Serialize claims so multiple X tabs cannot show the same daily reminder.
      updateNoticeTask = updateNoticeTask.then(checkUpdateNotice).catch(() => null);
      updateNoticeTask.then(sendResponse);
      return true;
    }

    if (message?.type === "xvdl-open-update") {
      extensionApi.runtime.sendNativeMessage("application.id", { type: "open-update" })
        .then(sendResponse)
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    return false;
  });

  async function checkUpdateNotice() {
    const now = Date.now();
    const installedVersion = extensionApi.runtime.getManifest().version;
    const { updateState = {} } = await extensionApi.storage.local.get("updateState");
    if (now - (updateState.promptedAt || 0) < DAY) return null;

    if (updateState.installedVersion !== installedVersion || now - (updateState.checkedAt || 0) >= DAY) {
      const response = await extensionApi.runtime.sendNativeMessage("application.id", { type: "check-update" });
      if (!response?.ok) return null;
      updateState.version = /^\d{6}\.\d+$/.test(response.version) ? response.version : "";
      updateState.installedVersion = installedVersion;
      updateState.checkedAt = now;
    }

    if (updateState.version) updateState.promptedAt = now;
    await extensionApi.storage.local.set({ updateState });
    return updateState.version ? { version: updateState.version } : null;
  }

  extensionApi.runtime.onConnect.addListener((port) => {
    if (port.name !== "xvdl-download") {
      return;
    }

    let started = false;
    let disconnected = false;
    port.onDisconnect.addListener(() => { disconnected = true; });
    port.onMessage.addListener((message) => {
      if (message?.type !== "xvdl-download" || started) {
        return;
      }

      started = true;
      sendNativeDownload(message)
        .then((response) => {
          if (!disconnected) {
            port.postMessage(response);
          }
        })
        .catch(() => {
          port.disconnect();
        });
    });
  });

  async function sendNativeDownload(message) {
    if (!extensionApi?.runtime?.sendNativeMessage) {
      throw new Error("Native messaging is not available.");
    }

    const payload = {
      type: "download",
      url: message.url,
      filename: message.filename
    };

    return extensionApi.runtime.sendNativeMessage("application.id", payload);
  }
})();
