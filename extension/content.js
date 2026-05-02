(() => {
  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const mediaByTweetId = new Map();
  const mediaResolvers = new Map();
  const toastTimers = new WeakMap();
  let observer = null;
  let scanScheduled = false;

  injectPageProbe();
  window.addEventListener("message", handlePageMessage, false);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  function start() {
    scan();

    observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "src", "aria-label", "data-testid"]
    });

    window.addEventListener("locationchange", scheduleScan);
    patchHistory();
  }

  function injectPageProbe() {
    const source = extensionApi.runtime.getURL("injected.js");
    const script = document.createElement("script");
    script.src = source;
    script.async = false;
    script.dataset.xvdl = "probe";
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  function patchHistory() {
    if (window.__xvdlHistoryPatched) {
      return;
    }

    window.__xvdlHistoryPatched = true;
    const notify = () => window.dispatchEvent(new Event("locationchange"));

    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        notify();
        return result;
      };
    }

    window.addEventListener("popstate", notify);
  }

  function handlePageMessage(event) {
    if (event.source !== window || event.data?.source !== "xvdl-page") {
      return;
    }

    if (event.data.type === "media-items") {
      let changed = false;
      for (const item of event.data.items || []) {
        if (!item.tweetId || !Array.isArray(item.variants) || item.variants.length === 0) {
          continue;
        }

        const previous = mediaByTweetId.get(item.tweetId);
        const next = mergeMediaItem(previous, item);
        mediaByTweetId.set(item.tweetId, next);
        resolveMediaRequest(item.tweetId, next);
        changed = true;
      }

      if (changed) {
        scheduleScan();
      }
    }
    if (event.data.type === "media-error" && event.data.tweetId) {
      rejectMediaRequest(event.data.tweetId, new Error(event.data.error || "Could not load video data."));
    }
  }

  function mergeMediaItem(previous, item) {
    const variants = new Map();

    for (const variant of previous?.variants || []) {
      if (variant.url) {
        variants.set(variant.url, variant);
      }
    }

    for (const variant of item.variants || []) {
      if (variant.url) {
        variants.set(variant.url, variant);
      }
    }

    return {
      tweetId: item.tweetId || previous?.tweetId,
      poster: item.poster || previous?.poster || "",
      source: item.source || previous?.source || "",
      variants: [...variants.values()].sort(compareVariants)
    };
  }

  function scheduleScan() {
    if (scanScheduled) {
      return;
    }

    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scan();
    });
  }

  function scan() {
    for (const article of document.querySelectorAll('article[data-testid="tweet"], article')) {
      enhanceArticle(article);
    }

    enhanceStandaloneVideoPlayers();
    enhanceVideoThumbnails();
  }

  function enhanceArticle(article) {
    if (!(article instanceof HTMLElement)) {
      return;
    }

    const hasVideo = Boolean(
      article.querySelector("video") ||
        article.querySelector('[data-testid="videoPlayer"]') ||
        article.querySelector('[aria-label*="Play video" i]')
    );

    const existing = article.querySelector(":scope .xvdl-download-button");
    if (!hasVideo) {
      existing?.remove();
      return;
    }

    const tweetId = findTweetId(article);
    const media = tweetId ? mediaByTweetId.get(tweetId) : null;
    const target = findVideoOverlayHost(article);

    if (!target) {
      return;
    }

    target.classList.add("xvdl-video-overlay-host");

    const button = existing || createButton();
    button.dataset.tweetId = tweetId || "";
    updateButton(button, media, tweetId);

    if (button.parentElement !== target) {
      target.append(button);
    }
  }

  function enhanceVideoThumbnails() {
    for (const link of document.querySelectorAll('a[href*="/status/"]')) {
      enhanceVideoThumbnail(link);
    }
  }

  function enhanceStandaloneVideoPlayers() {
    const tweetId = getTweetIdFromUrl(location.href);
    if (!tweetId) {
      return;
    }

    const media = mediaByTweetId.get(tweetId);
    const candidates = document.querySelectorAll('[data-testid="videoPlayer"], video');

    for (const candidate of candidates) {
      const target = normalizeStandaloneVideoHost(candidate);
      if (!target) {
        continue;
      }

      target.classList.add("xvdl-video-overlay-host", "xvdl-detail-overlay-host");

      const button = target.querySelector(":scope > .xvdl-download-button--detail") || createButton();
      button.classList.add("xvdl-download-button--detail");
      button.dataset.tweetId = tweetId;
      updateButton(button, media, tweetId);

      if (button.parentElement !== target) {
        target.append(button);
      }
    }
  }

  function enhanceVideoThumbnail(link) {
    if (!(link instanceof HTMLElement) || link.closest("article")) {
      return;
    }

    const tweetId = getTweetIdFromUrl(link.href);
    const target = findThumbnailOverlayHost(link);
    const existing = target?.querySelector(":scope > .xvdl-download-button--thumbnail") || null;
    const nested = link.querySelector(":scope .xvdl-download-button--thumbnail");
    const media = tweetId ? mediaByTweetId.get(tweetId) : null;

    if (!tweetId || !target || !isVideoThumbnailLink(link, media)) {
      existing?.remove();
      nested?.remove();
      return;
    }

    target.classList.add("xvdl-video-overlay-host", "xvdl-thumbnail-overlay-host");

    const button = existing || nested || createButton();
    button.classList.add("xvdl-download-button--thumbnail");
    button.dataset.tweetId = tweetId;
    updateButton(button, media, tweetId);

    if (button.parentElement !== target) {
      target.append(button);
    }
  }

  function createButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "xvdl-download-button";
    button.setAttribute("aria-label", "Download video");
    button.title = "Download video";
    button.innerHTML = [
      '<svg class="xvdl-download-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none">',
      '<path d="M12 3v11"/>',
      '<path d="m7 10 5 5 5-5"/>',
      '<path d="M5 20h14"/>',
      "</svg>",
      '<svg class="xvdl-spinner-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none">',
      '<circle cx="12" cy="12" r="8"/>',
      "</svg>",
      "<span>XVDL</span>"
    ].join("");

    for (const eventName of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend"]) {
      button.addEventListener(eventName, stopButtonEvent, true);
    }

    button.addEventListener("click", onDownloadClick, true);
    return button;
  }

  function updateButton(button, media, tweetId) {
    const ready = Boolean(media && chooseBestVariant(media));
    button.disabled = false;
    button.setAttribute("aria-disabled", String(!ready));
    button.classList.toggle("xvdl-download-button--ready", ready);
    button.classList.toggle("xvdl-download-button--pending", !ready);
    button.title = ready
      ? describeBestVariant(media)
      : tweetId
        ? "Video URL is still loading"
        : "Waiting for post video data";
  }

  async function onDownloadClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    const tweetId = button.dataset.tweetId;
    let media = mediaByTweetId.get(tweetId);
    let variant = media ? chooseBestVariant(media) : null;

    if (!tweetId) {
      flashButton(button, "pending");
      return;
    }

    button.classList.add("xvdl-download-button--busy");
    const toastHost = button.parentElement instanceof HTMLElement ? button.parentElement : document.documentElement;

    try {
      if (!variant) {
        media = await requestTweetMedia(tweetId);
        variant = media ? chooseBestVariant(media) : null;
      }

      if (!variant) {
        flashButton(button, "pending");
        showToast(toastHost, "Video URL is still loading. Try again in a moment.", "error");
        return;
      }

      const filename = buildFilename(tweetId, variant);
      const response = await saveMediaWithNativeApp(variant.url, filename);
      flashButton(button, "done");
      showToast(toastHost, `Saved to: ${response.path || filenameFromPath(response.path) || filename}`, "done");
    } catch (error) {
      console.warn("[XVDL] Direct video download failed.", error);
      flashButton(button, "error");
      showToast(toastHost, formatDownloadError(error), "error");
    } finally {
      button.classList.remove("xvdl-download-button--busy");
    }
  }

  function stopButtonEvent(event) {
    event.stopPropagation();
  }

  async function saveMediaWithNativeApp(url, filename) {
    if (!isMp4Url(url)) {
      throw new Error("Only direct MP4 variants can be downloaded.");
    }

    const response = await extensionApi.runtime.sendMessage({
      type: "xvdl-download",
      url,
      filename
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Native download failed.");
    }

    return response;
  }

  function requestTweetMedia(tweetId) {
    const cached = mediaByTweetId.get(tweetId);
    if (chooseBestVariant(cached)) {
      return Promise.resolve(cached);
    }

    const pending = mediaResolvers.get(tweetId);
    if (pending) {
      return pending.promise;
    }

    let timeout = 0;
    const promise = new Promise((resolve, reject) => {
      timeout = window.setTimeout(() => {
        mediaResolvers.delete(tweetId);
        reject(new Error("Timed out while loading video data."));
      }, 7000);

      mediaResolvers.set(tweetId, {
        reject,
        resolve,
        timeout
      });
    });

    window.postMessage({
      source: "xvdl-content",
      type: "resolve-tweet-media",
      tweetId
    }, "*");

    return promise;
  }

  function resolveMediaRequest(tweetId, media) {
    const pending = mediaResolvers.get(tweetId);
    if (!pending) {
      return;
    }

    window.clearTimeout(pending.timeout);
    mediaResolvers.delete(tweetId);
    pending.resolve(media);
  }

  function rejectMediaRequest(tweetId, error) {
    const pending = mediaResolvers.get(tweetId);
    if (!pending) {
      return;
    }

    window.clearTimeout(pending.timeout);
    mediaResolvers.delete(tweetId);
    pending.reject(error);
  }

  function filenameFromPath(path) {
    const value = String(path || "");
    return value.split(/[\\/]/).filter(Boolean).pop() || "";
  }

  function formatDownloadError(error) {
    const message = String(error?.message || "Unknown error");
    if (/operation (couldn.?t|could not) be completed|operation not permitted|NSPOSIXErrorDomain Code=1/i.test(message)) {
      return "Download failed: XVDL needs network and Downloads permission. Install the latest release, reopen XVDL, then restart Safari.";
    }

    return `Download failed: ${message}`;
  }

  function showToast(host, message, state) {
    const toast = getToast(host);
    toast.textContent = message;
    toast.title = message;
    toast.dataset.xvdlState = state;
    toast.classList.add("xvdl-toast--visible");

    window.clearTimeout(toastTimers.get(toast));
    toastTimers.set(toast, window.setTimeout(() => {
      toast.classList.remove("xvdl-toast--visible");
    }, state === "error" ? 6000 : 3600));
  }

  function getToast(host) {
    let toast = [...host.children].find((child) => child.classList?.contains("xvdl-toast"));
    if (toast instanceof HTMLElement) {
      return toast;
    }

    toast = document.createElement("div");
    toast.className = "xvdl-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    host.append(toast);
    return toast;
  }

  function flashButton(button, state) {
    button.dataset.xvdlFlash = state;
    window.setTimeout(() => {
      if (button.dataset.xvdlFlash === state) {
        delete button.dataset.xvdlFlash;
      }
    }, 900);
  }

  function findVideoOverlayHost(article) {
    const candidates = article.querySelectorAll(
      '[data-testid="videoPlayer"], video, [aria-label*="Play video" i]'
    );

    for (const candidate of candidates) {
      const host = normalizeVideoHost(candidate, article);
      if (host) {
        return host;
      }
    }

    return null;
  }

  function normalizeStandaloneVideoHost(candidate) {
    if (!(candidate instanceof HTMLElement) || candidate.closest("article")) {
      return null;
    }

    const player = candidate.closest('[data-testid="videoPlayer"]');
    if (player instanceof HTMLElement && !player.closest("article")) {
      return player;
    }

    const video = candidate instanceof HTMLVideoElement ? candidate : candidate.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) {
      return null;
    }

    let host = video.parentElement;
    let depth = 0;

    while (host instanceof HTMLElement && depth < 6) {
      if (host.closest("article")) {
        return null;
      }

      const rect = host.getBoundingClientRect();
      if (rect.width > 120 && rect.height > 120) {
        return host;
      }

      host = host.parentElement;
      depth += 1;
    }

    return video.parentElement instanceof HTMLElement ? video.parentElement : null;
  }

  function findThumbnailOverlayHost(link) {
    const linkRect = link.getBoundingClientRect();
    let host = link.parentElement;
    let depth = 0;

    while (host instanceof HTMLElement && depth < 4) {
      const hostRect = host.getBoundingClientRect();
      if (hostRect.width >= linkRect.width * 0.9 && hostRect.height >= linkRect.height * 0.9) {
        return host;
      }

      host = host.parentElement;
      depth += 1;
    }

    return link.parentElement instanceof HTMLElement ? link.parentElement : null;
  }

  function isVideoThumbnailLink(link, media) {
    if (!isMediaThumbnailLink(link)) {
      return false;
    }

    return Boolean(
      chooseBestVariant(media) ||
        linkPathLooksVideo(link.href) ||
        hasDurationText(link) ||
        hasVideoLabel(link)
    );
  }

  function isMediaThumbnailLink(link) {
    return Boolean(
      link.querySelector("img, video") ||
        /\/(?:photo|video)\/\d+(?:\?|$|\/)/i.test(new URL(link.href, location.origin).pathname)
    );
  }

  function linkPathLooksVideo(href) {
    return /\/video\/\d+(?:\?|$|\/)/i.test(new URL(href, location.origin).pathname);
  }

  function hasDurationText(element) {
    return /\b\d{1,2}:\d{2}(?::\d{2})?\b/.test(element.textContent || "");
  }

  function hasVideoLabel(element) {
    const labeled = [element, ...element.querySelectorAll("[aria-label], [data-testid]")];
    return labeled.some((node) => {
      const ariaLabel = node.getAttribute?.("aria-label") || "";
      const testId = node.getAttribute?.("data-testid") || "";
      return /video|play/i.test(`${ariaLabel} ${testId}`);
    });
  }

  function normalizeVideoHost(candidate, article) {
    let host = candidate;

    if (host instanceof HTMLVideoElement) {
      host = host.parentElement;
    }

    if (!(host instanceof HTMLElement)) {
      return null;
    }

    const player = host.closest('[data-testid="videoPlayer"]');
    if (player instanceof HTMLElement && article.contains(player)) {
      return player;
    }

    if (/^(a|button)$/i.test(host.tagName)) {
      host = host.parentElement;
    }

    while (host instanceof HTMLElement && host !== article) {
      if (host.querySelector("video") || host.matches('[aria-label*="Play video" i]')) {
        return host;
      }

      host = host.parentElement;
    }

    return null;
  }

  function findTweetId(article) {
    const currentUrlId = getTweetIdFromUrl(location.href);
    const candidates = [];

    for (const anchor of article.querySelectorAll('a[href*="/status/"]')) {
      const id = getTweetIdFromUrl(anchor.href);
      if (id) {
        candidates.push(id);
      }
    }

    if (currentUrlId && candidates.includes(currentUrlId)) {
      return currentUrlId;
    }

    const timeLink = article.querySelector('time')?.closest('a[href*="/status/"]');
    const timeLinkId = timeLink ? getTweetIdFromUrl(timeLink.href) : "";
    if (timeLinkId) {
      return timeLinkId;
    }

    return candidates[0] || currentUrlId || "";
  }

  function getTweetIdFromUrl(value) {
    try {
      const match = new URL(value, location.origin).pathname.match(/\/status(?:es)?\/(\d+)/);
      return match?.[1] || "";
    } catch {
      return "";
    }
  }

  function chooseBestVariant(media) {
    return [...(media?.variants || [])].filter(isMp4Variant).sort(compareVariants)[0] || null;
  }

  function compareVariants(a, b) {
    const aMp4 = isMp4Variant(a);
    const bMp4 = isMp4Variant(b);

    if (aMp4 !== bMp4) {
      return aMp4 ? -1 : 1;
    }

    const aBitrate = Number(a.bitrate || 0);
    const bBitrate = Number(b.bitrate || 0);
    return bBitrate - aBitrate;
  }

  function isMp4Variant(variant) {
    return /video\/mp4/i.test(variant?.contentType || "") || isMp4Url(variant?.url);
  }

  function isMp4Url(url) {
    return /\.mp4(?:\?|$)/i.test(String(url || ""));
  }

  function describeBestVariant(media) {
    const variant = chooseBestVariant(media);
    const bitrate = Number(variant?.bitrate || 0);
    if (bitrate > 0) {
      return `Download video (${Math.round(bitrate / 1000)} kbps)`;
    }

    return "Download video";
  }

  function buildFilename(tweetId, variant) {
    const extension = isMp4Url(variant.url) ? "mp4" : "m3u8";
    const bitrate = Number(variant.bitrate || 0);
    const quality = bitrate > 0 ? `-${Math.round(bitrate / 1000)}kbps` : "";
    return `x-${tweetId}${quality}.${extension}`;
  }
})();
