(() => {
  const extensionApi = globalThis.browser ?? globalThis.chrome;

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
