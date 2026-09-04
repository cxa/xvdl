import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const injectedSource = await readFile(new URL("../extension/injected.js", import.meta.url), "utf8");
const outerTweetId = "2095691052720255179";
const quotedTweetId = "2095318278654804133";
const videoUrl = "https://video.twimg.com/ext_tw_video/example/10368k/example.mp4";

test("resolves video attached directly to the requested tweet", async () => {
  const tweet = makeVideoTweet(quotedTweetId);
  const probe = createProbe(new Map([[quotedTweetId, tweetResult(tweet)]]));

  const message = await probe(quotedTweetId);

  assert.equal(message.type, "media-items");
  assert.equal(message.items[0].tweetId, quotedTweetId);
  assert.equal(message.items[0].variants[0].url, videoUrl);
});

test("resolves the video when the requested tweet quotes a video tweet", async () => {
  const quotedTweet = makeVideoTweet(quotedTweetId);
  const outerTweet = {
    rest_id: outerTweetId,
    legacy: {
      id_str: outerTweetId,
      full_text: "Quote post"
    },
    quoted_status_result: {
      result: quotedTweet
    }
  };
  const probe = createProbe(new Map([[outerTweetId, tweetResult(outerTweet)]]));

  const message = await probe(outerTweetId);

  assert.equal(message.type, "media-items");
  assert.ok(message.items.some((item) => item.tweetId === outerTweetId));
  assert.ok(message.items.some((item) => item.variants[0].url === videoUrl));
});

function makeVideoTweet(tweetId) {
  return {
    rest_id: tweetId,
    legacy: {
      id_str: tweetId,
      full_text: "Video post",
      extended_entities: {
        media: [
          {
            expanded_url: `https://x.com/example/status/${tweetId}/video/1`,
            video_info: {
              variants: [
                {
                  bitrate: 10_368_000,
                  content_type: "video/mp4",
                  url: videoUrl
                }
              ]
            }
          }
        ]
      }
    }
  };
}

function tweetResult(result) {
  return {
    data: {
      tweetResult: {
        result
      }
    }
  };
}

function createProbe(responses) {
  const listeners = new Map();
  let receiveMessage;
  const window = {
    fetch: async (url) => {
      const variables = JSON.parse(new URL(url, "https://x.com").searchParams.get("variables"));
      return new Response(JSON.stringify(responses.get(variables.tweetId)), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    },
    addEventListener: (type, listener) => listeners.set(type, listener),
    postMessage: (message) => receiveMessage?.(message)
  };

  class MockXmlHttpRequest {
    addEventListener() {}
    open() {}
    send() {}
  }

  vm.runInNewContext(injectedSource, {
    document: {
      cookie: "ct0=test",
      documentElement: { lang: "en" },
      scripts: []
    },
    PerformanceObserver: undefined,
    Response,
    URL,
    URLSearchParams,
    window,
    XMLHttpRequest: MockXmlHttpRequest
  });

  return (tweetId) => new Promise((resolve) => {
    receiveMessage = resolve;
    listeners.get("message")({
      data: {
        source: "xvdl-content",
        tweetId,
        type: "resolve-tweet-media"
      },
      source: window
    });
  });
}
