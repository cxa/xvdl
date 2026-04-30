(() => {
  const extensionApi = globalThis.browser ?? globalThis.chrome;

  extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "xvdl-download") {
      return false;
    }

    sendNativeDownload(message)
      .then((response) => sendResponse(response))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error?.message || String(error)
        });
      });

    return true;
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

    const response = await extensionApi.runtime.sendNativeMessage("application.id", payload);
    if (!response?.ok) {
      throw new Error(response?.error || "Native download failed.");
    }

    return response;
  }
})();
