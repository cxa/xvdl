(() => {
  if (window.__xvdlProbeInstalled) {
    return;
  }

  window.__xvdlProbeInstalled = true;

  const MAX_RESPONSE_CHARS = 10_000_000;
  const X_BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  const TWEET_RESULT_QUERY_ID = "R4GaE7QczPF2R7wRxgu70w";
  const TWEET_RESULT_FEATURES = [
    "creator_subscriptions_tweet_preview_api_enabled",
    "premium_content_api_read_enabled",
    "communities_web_enable_tweet_community_results_fetch",
    "c9s_tweet_anatomy_moderator_badge_enabled",
    "responsive_web_grok_analyze_button_fetch_trends_enabled",
    "responsive_web_grok_analyze_post_followups_enabled",
    "responsive_web_jetfuel_frame",
    "responsive_web_grok_share_attachment_enabled",
    "responsive_web_grok_annotations_enabled",
    "articles_preview_enabled",
    "responsive_web_edit_tweet_api_enabled",
    "graphql_is_translatable_rweb_tweet_is_translatable_enabled",
    "view_counts_everywhere_api_enabled",
    "longform_notetweets_consumption_enabled",
    "responsive_web_twitter_article_tweet_consumption_enabled",
    "content_disclosure_indicator_enabled",
    "content_disclosure_ai_generated_indicator_enabled",
    "responsive_web_grok_show_grok_translated_post",
    "responsive_web_grok_analysis_button_from_backend",
    "post_ctas_fetch_enabled",
    "rweb_cashtags_enabled",
    "freedom_of_speech_not_reach_fetch_enabled",
    "standardized_nudges_misinfo",
    "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled",
    "longform_notetweets_rich_text_read_enabled",
    "longform_notetweets_inline_media_enabled",
    "profile_label_improvements_pcf_label_in_post_enabled",
    "responsive_web_profile_redirect_enabled",
    "rweb_tipjar_consumption_enabled",
    "verified_phone_label_enabled",
    "responsive_web_grok_image_annotation_enabled",
    "responsive_web_grok_imagine_annotation_enabled",
    "responsive_web_grok_community_note_auto_translation_is_enabled",
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled",
    "responsive_web_graphql_timeline_navigation_enabled",
    "responsive_web_enhance_cards_enabled"
  ];
  const TWEET_RESULT_FIELD_TOGGLES = [
    "withArticleRichContentState",
    "withArticlePlainText",
    "withArticleSummaryText",
    "withArticleVoiceOver",
    "withGrokAnalyze",
    "withDisallowedReplyControls",
    "withPayments",
    "withAuxiliaryUserLabels"
  ];
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  window.fetch = async function xvdlFetch(...args) {
    const response = await originalFetch.apply(this, args);
    inspectResponse(response.url || getRequestUrl(args[0]), response.clone()).catch(noop);
    return response;
  };

  XMLHttpRequest.prototype.open = function xvdlOpen(method, url, ...rest) {
    this.__xvdlUrl = String(url || "");
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function xvdlSend(...args) {
    this.addEventListener("loadend", () => inspectXhr(this), { once: true });
    return originalSend.apply(this, args);
  };

  observeResources();
  inspectExistingScripts();
  window.addEventListener("message", handleContentMessage, false);

  function getRequestUrl(request) {
    if (typeof request === "string") {
      return request;
    }

    return request?.url || "";
  }

  async function inspectResponse(url, response) {
    if (!isInterestingUrl(url)) {
      return;
    }

    const contentType = response.headers?.get?.("content-type") || "";
    if (!/json|javascript|text/i.test(contentType) && !/graphql|\/i\/api\//i.test(url)) {
      return;
    }

    const text = await response.text();
    inspectText(url, text);
  }

  function inspectXhr(xhr) {
    const url = xhr.responseURL || xhr.__xvdlUrl || "";
    if (!isInterestingUrl(url) || xhr.status < 200 || xhr.status >= 400) {
      return;
    }

    const contentType = xhr.getResponseHeader?.("content-type") || "";
    if (!/json|javascript|text/i.test(contentType) && !/graphql|\/i\/api\//i.test(url)) {
      return;
    }

    if (xhr.responseType && xhr.responseType !== "text") {
      return;
    }

    inspectText(url, xhr.responseText || "");
  }

  function inspectText(url, text) {
    if (!text || text.length > MAX_RESPONSE_CHARS) {
      return;
    }

    const items = extractItemsFromText(text, url);
    if (items.length > 0) {
      emitItems(items);
    }
  }

  function handleContentMessage(event) {
    if (event.source !== window || event.data?.source !== "xvdl-content") {
      return;
    }

    if (event.data.type === "resolve-tweet-media" && toTweetId(event.data.tweetId)) {
      resolveTweetMedia(event.data.tweetId).catch((error) => {
        emitMediaError(event.data.tweetId, error?.message || String(error));
      });
    }
  }

  async function resolveTweetMedia(tweetId) {
    const variables = {
      tweetId,
      withCommunity: true,
      includePromotedContent: false,
      withVoice: false
    };
    const features = Object.fromEntries(TWEET_RESULT_FEATURES.map((key) => [key, true]));
    const fieldToggles = Object.fromEntries(TWEET_RESULT_FIELD_TOGGLES.map((key) => [key, true]));
    const url = `/i/api/graphql/${TWEET_RESULT_QUERY_ID}/TweetResultByRestId?${new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(features),
      fieldToggles: JSON.stringify(fieldToggles)
    })}`;

    const response = await originalFetch(url, {
      credentials: "include",
      headers: {
        authorization: `Bearer ${X_BEARER_TOKEN}`,
        "x-csrf-token": decodeURIComponent(getCookieValue("ct0")),
        "x-twitter-active-user": "yes",
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-client-language": document.documentElement.lang || "en"
      }
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Tweet media request failed with HTTP ${response.status}.`);
    }

    const items = extractItemsFromText(text, url).filter((item) => item.tweetId === tweetId);
    if (items.length === 0) {
      throw new Error("Tweet media request did not include downloadable video variants.");
    }

    emitItems(items);
  }

  function inspectExistingScripts() {
    for (const script of document.scripts || []) {
      const text = script.textContent || "";
      if (text.includes("video_info") || text.includes("video.twimg.com")) {
        inspectText("inline-script", text);
      }
    }
  }

  function observeResources() {
    if (!("PerformanceObserver" in window)) {
      return;
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const url = entry.name || "";
          if (/https:\/\/video\.twimg\.com\/.+\.(?:mp4|m3u8)(?:\?|$)/i.test(url)) {
            emitItems([
              {
                tweetId: "",
                source: "performance",
                variants: [variantFromUrl(url)]
              }
            ]);
          }
        }
      });

      observer.observe({ type: "resource", buffered: true });
    } catch {
      noop();
    }
  }

  function isInterestingUrl(url) {
    return /(?:x|twitter)\.com\/i\/api|graphql|video\.twimg\.com|syndication\.twitter\.com/i.test(String(url || ""));
  }

  function extractItemsFromText(text, source) {
    const items = [];

    for (const json of findJsonObjects(text)) {
      items.push(...extractMediaItems(json, source));
    }

    return dedupeItems(items);
  }

  function findJsonObjects(text) {
    const trimmed = text.trim();
    const objects = [];

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        objects.push(JSON.parse(trimmed));
        return objects;
      } catch {
        // Continue with embedded JSON extraction below.
      }
    }

    const markers = [
      "__INITIAL_STATE__",
      "__NEXT_DATA__",
      "video_info",
      "extended_entities"
    ];

    if (!markers.some((marker) => text.includes(marker))) {
      return objects;
    }

    for (const candidate of extractBalancedJsonCandidates(text)) {
      try {
        objects.push(JSON.parse(candidate));
      } catch {
        noop();
      }
    }

    return objects;
  }

  function extractBalancedJsonCandidates(text) {
    const candidates = [];
    const starts = [];

    for (const marker of ["{\"", "[{\"", "{\\\"", "[{\\\""]) {
      let index = text.indexOf(marker);
      while (index !== -1 && starts.length < 30) {
        starts.push(index);
        index = text.indexOf(marker, index + marker.length);
      }
    }

    starts.sort((a, b) => a - b);

    for (const start of starts) {
      const candidate = readBalancedJson(text, start);
      if (candidate && /video_info|video\.twimg\.com|extended_entities/.test(candidate)) {
        candidates.push(candidate.replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
      }
    }

    return candidates;
  }

  function readBalancedJson(text, start) {
    const opener = text[start];
    const closer = opener === "[" ? "]" : "}";
    const stack = [closer];
    let inString = false;
    let escaped = false;

    for (let index = start + 1; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{" || char === "[") {
        stack.push(char === "{" ? "}" : "]");
      } else if (char === "}" || char === "]") {
        if (stack.pop() !== char) {
          return "";
        }

        if (stack.length === 0) {
          return text.slice(start, index + 1);
        }
      }
    }

    return "";
  }

  function extractMediaItems(root, source) {
    const items = [];
    const seen = new WeakSet();

    walk(root, "", null);
    return items;

    function walk(value, tweetId, parentMedia) {
      if (!value || typeof value !== "object") {
        return;
      }

      if (seen.has(value)) {
        return;
      }

      seen.add(value);

      const nextTweetId = getTweetId(value) || tweetId;
      const media = getMediaObject(value) || parentMedia;
      const variants = getVariants(value);

      if (variants.length > 0) {
        const inferredTweetId = nextTweetId || getTweetIdFromMedia(media) || getTweetIdFromMedia(value);
        if (inferredTweetId) {
          items.push({
            tweetId: inferredTweetId,
            source,
            poster: getPoster(media || value),
            variants
          });
        }
      }

      if (Array.isArray(value)) {
        for (const child of value) {
          walk(child, nextTweetId, media);
        }
        return;
      }

      for (const child of Object.values(value)) {
        walk(child, nextTweetId, media);
      }
    }
  }

  function getTweetId(value) {
    if (!value || typeof value !== "object") {
      return "";
    }

    if (isTweetObject(value)) {
      return toTweetId(value.rest_id || value.id_str || value.id);
    }

    if (value.legacy && typeof value.legacy === "object" && isTweetObject(value.legacy)) {
      return toTweetId(value.rest_id || value.legacy.id_str || value.legacy.id);
    }

    return "";
  }

  function isTweetObject(value) {
    if (!value || typeof value !== "object") {
      return false;
    }

    return Boolean(
      value.full_text ||
        value.entities ||
        value.extended_entities ||
        value.conversation_id_str ||
        value.created_at && (value.id_str || value.rest_id || value.id)
    );
  }

  function getMediaObject(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    if (value.video_info || value.media_url_https || value.expanded_url) {
      return value;
    }

    return null;
  }

  function getVariants(value) {
    const variants = value?.video_info?.variants || value?.variants || [];
    if (!Array.isArray(variants)) {
      return [];
    }

    return variants
      .filter((variant) => variant?.url)
      .map((variant) => ({
        url: normalizeMediaUrl(variant.url),
        bitrate: Number(variant.bitrate || 0),
        contentType: variant.content_type || variant.contentType || contentTypeFromUrl(variant.url)
      }))
      .filter((variant) => /^https:\/\/video\.twimg\.com\//i.test(variant.url));
  }

  function variantFromUrl(url) {
    return {
      url: normalizeMediaUrl(url),
      bitrate: bitrateFromUrl(url),
      contentType: contentTypeFromUrl(url)
    };
  }

  function getPoster(media) {
    return media?.media_url_https || media?.media_url || media?.preview_image_url || "";
  }

  function getTweetIdFromMedia(media) {
    const values = [
      media?.expanded_url,
      media?.url,
      media?.display_url
    ];

    for (const value of values) {
      const id = toTweetId(String(value || "").match(/\/status(?:es)?\/(\d+)/)?.[1]);
      if (id) {
        return id;
      }
    }

    return "";
  }

  function toTweetId(value) {
    const text = String(value || "");
    return /^\d{5,}$/.test(text) ? text : "";
  }

  function normalizeMediaUrl(url) {
    return String(url || "").replace(/\\u0026/g, "&");
  }

  function contentTypeFromUrl(url) {
    if (/\.m3u8(?:\?|$)/i.test(url)) {
      return "application/x-mpegURL";
    }

    if (/\.mp4(?:\?|$)/i.test(url)) {
      return "video/mp4";
    }

    return "";
  }

  function bitrateFromUrl(url) {
    const match = String(url || "").match(/\/(\d{3,5})k\//i);
    return match ? Number(match[1]) * 1000 : 0;
  }

  function dedupeItems(items) {
    const byTweetId = new Map();

    for (const item of items) {
      if (!item.tweetId) {
        continue;
      }

      const previous = byTweetId.get(item.tweetId);
      if (!previous) {
        byTweetId.set(item.tweetId, item);
        continue;
      }

      const variants = new Map(previous.variants.map((variant) => [variant.url, variant]));
      for (const variant of item.variants) {
        variants.set(variant.url, variant);
      }

      byTweetId.set(item.tweetId, {
        ...previous,
        poster: previous.poster || item.poster,
        variants: [...variants.values()]
      });
    }

    return [...byTweetId.values()];
  }

  function emitItems(items) {
    window.postMessage({
      source: "xvdl-page",
      type: "media-items",
      items
    }, "*");
  }

  function emitMediaError(tweetId, error) {
    window.postMessage({
      source: "xvdl-page",
      type: "media-error",
      tweetId,
      error
    }, "*");
  }

  function getCookieValue(name) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`))?.[1] || "";
  }

  function noop() {}
})();
