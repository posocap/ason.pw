import ogImage from "./og-image.js";
import { handleStory } from "./story.js";

const CANONICAL_HOST = "www.ason.pw";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";

    // One permanent redirect to https://www.ason.pw for http:// and bare-domain requests,
    // so search engines only ever see a single version of each URL.
    if (!local && (url.hostname !== CANONICAL_HOST || url.protocol !== "https:")) {
      url.protocol = "https:";
      url.hostname = CANONICAL_HOST;
      url.port = "";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/story" || url.pathname.startsWith("/story/") || url.pathname.startsWith("/api/story/")) {
      return handleStory(request, env, url);
    }

    if (url.pathname === "/og.png") {
      const bytes = Uint8Array.from(atob(ogImage), (c) => c.charCodeAt(0));
      return new Response(request.method === "HEAD" ? null : bytes, {
        headers: {
          "Content-Type": "image/png",
          "Content-Length": String(bytes.length),
          "Cache-Control": "public, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
