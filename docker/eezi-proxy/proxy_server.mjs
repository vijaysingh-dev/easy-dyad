/**
 * proxy.js – zero-dependency worker-based HTTP/WS forwarder
 */
import http from "http";
import https from "https";

import { URL, fileURLToPath } from "url";
import fs from "fs";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LISTEN_HOST = process.env.APP_HOST;
const LISTEN_PORT = Number(process.env.PROXY_PORT);
const TARGET_ORIGIN = process.env.TARGET_ORIGIN;

if (!TARGET_ORIGIN) {
  console.error("TARGET_ORIGIN env not provided");
  process.exit(1);
}

let rememberedOrigin = null; // e.g. "http://localhost:5173"
try {
  rememberedOrigin = new URL(TARGET_ORIGIN).origin;
  console.log(`[eezi-proxy] Upstream set to ${rememberedOrigin}`);
} catch (e) {
  console.error("Invalid TARGET_ORIGIN:", TARGET_ORIGIN);
  process.exit(1);
}

/* ---------- optional resources for HTML injection ---------------------- */

let stacktraceJsContent = null;
let eeziShimContent = null;
let eeziComponentSelectorClientContent = null;
try {
  const stackTraceLibPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "stacktrace-js",
    "dist",
    "stacktrace.min.js",
  );
  stacktraceJsContent = fs.readFileSync(stackTraceLibPath, "utf-8");
  console.log("[eezi-proxy] stacktrace.js loaded.");
} catch (error) {
  console.log(`[eezi-proxy] Failed to read stacktrace.js: ${error.message}`);
}

try {
  const eeziShimPath = path.join(__dirname, "eezi-shim.js");
  eeziShimContent = fs.readFileSync(eeziShimPath, "utf-8");
  console.log("[eezi-proxy] eezi-shim.js loaded.");
} catch (error) {
  console.log(`[eezi-proxy] Failed to read eezi-shim.js: ${error.message}`);
}

try {
  const eeziComponentSelectorClientPath = path.join(
    __dirname,
    "eezi-component-selector-client.js",
  );
  eeziComponentSelectorClientContent = fs.readFileSync(
    eeziComponentSelectorClientPath,
    "utf-8",
  );
  console.log("[eezi-proxy] eezi-component-selector-client.js loaded.");
} catch (error) {
  console.log(
    `[eezi-proxy] Failed to read eezi-component-selector-client.js: ${error.message}`,
  );
}

/* ---------------------- helper: need to inject? ------------------------ */
function needsInjection(pathname) {
  return pathname.endsWith("index.html") || pathname === "/";
}

function injectHTML(buf) {
  let txt = buf.toString("utf8");
  // These are strings that were used since the first version of the eezi shim.
  // If the eezi shim is used from legacy apps which came pre-baked with the shim
  // as a vite plugin, then do not inject the shim twice to avoid weird behaviors.
  const legacyAppWithShim =
    txt.includes("window-error") && txt.includes("unhandled-rejection");

  const scripts = [];

  if (!legacyAppWithShim) {
    if (stacktraceJsContent) {
      scripts.push(`<script>${stacktraceJsContent}</script>`);
    } else {
      scripts.push(
        '<script>console.warn("[eezi-proxy] stacktrace.js was not injected.");</script>',
      );
    }

    if (eeziShimContent) {
      scripts.push(`<script>${eeziShimContent}</script>`);
    } else {
      scripts.push(
        '<script>console.warn("[eezi-proxy] eezi shim was not injected.");</script>',
      );
    }
  }
  if (eeziComponentSelectorClientContent) {
    scripts.push(`<script>${eeziComponentSelectorClientContent}</script>`);
  } else {
    scripts.push(
      '<script>console.warn("[eezi-proxy] eezi component selector client was not injected.");</script>',
    );
  }
  const allScripts = scripts.join("\n");

  const headRegex = /<head[^>]*>/i;
  if (headRegex.test(txt)) {
    txt = txt.replace(headRegex, `$&\n${allScripts}`);
  } else {
    txt = allScripts + "\n" + txt;
    console.log("[eezi-proxy] Warning: <head> tag not found – scripts prepended.");
  }
  return Buffer.from(txt, "utf8");
}

/* ---------------- helper: build upstream URL from request -------------- */
function buildTargetURL(clientReq) {
  if (!rememberedOrigin) throw new Error("No upstream configured.");

  // Forward to the remembered origin keeping path & query
  return new URL(clientReq.url, rememberedOrigin);
}

/* ----------------------------------------------------------------------- */
/* 1. Plain HTTP request / response                                        */
/* ----------------------------------------------------------------------- */

const server = http.createServer((clientReq, clientRes) => {
  let target;
  try {
    target = buildTargetURL(clientReq);
  } catch (err) {
    clientRes.writeHead(400, { "content-type": "text/plain" });
    return void clientRes.end("Bad request: " + err.message);
  }

  const isTLS = target.protocol === "https:";
  const lib = isTLS ? https : http;

  /* Copy request headers but rewrite Host / Origin / Referer */
  const headers = { ...clientReq.headers, host: target.host };
  if (headers.origin) headers.origin = target.origin;
  if (headers.referer) {
    try {
      const ref = new URL(headers.referer);
      headers.referer = target.origin + ref.pathname + ref.search;
    } catch {
      delete headers.referer;
    }
  }
  if (needsInjection) {
    // Request uncompressed content from upstream
    delete headers["accept-encoding"];
  }

  if (headers["if-none-match"] && needsInjection(target.pathname))
    delete headers["if-none-match"];

  const upOpts = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (isTLS ? 443 : 80),
    path: target.pathname + target.search,
    method: clientReq.method,
    headers,
  };

  const upReq = lib.request(upOpts, (upRes) => {
    const inject = needsInjection(target.pathname);

    if (!inject) {
      clientRes.writeHead(upRes.statusCode, upRes.headers);
      return void upRes.pipe(clientRes);
    }

    const chunks = [];
    upRes.on("data", (c) => chunks.push(c));
    upRes.on("end", () => {
      try {
        const merged = Buffer.concat(chunks);
        const patched = injectHTML(merged);

        const hdrs = {
          ...upRes.headers,
          "content-length": Buffer.byteLength(patched),
        };
        // If we injected content, it's no longer encoded in the original way
        delete hdrs["content-encoding"];
        // Also, remove ETag as content has changed
        delete hdrs["etag"];

        clientRes.writeHead(upRes.statusCode, hdrs);
        clientRes.end(patched);
      } catch (e) {
        clientRes.writeHead(500, { "content-type": "text/plain" });
        clientRes.end("Injection failed: " + e.message);
      }
    });
  });

  clientReq.pipe(upReq);
  upReq.on("error", (e) => {
    clientRes.writeHead(502, { "content-type": "text/plain" });
    clientRes.end("Upstream error: " + e.message);
  });
});

/* ----------------------------------------------------------------------- */
/* 2. WebSocket / generic Upgrade tunnelling                               */
/* ----------------------------------------------------------------------- */

server.on("upgrade", (req, socket, _head) => {
  let target;
  try {
    target = buildTargetURL(req);
  } catch (err) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n" + err.message);
    return socket.destroy();
  }

  const isTLS = target.protocol === "https:";
  const headers = { ...req.headers, host: target.host };
  if (headers.origin) headers.origin = target.origin;

  const upReq = (isTLS ? https : http).request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (isTLS ? 443 : 80),
    path: target.pathname + target.search,
    method: "GET",
    headers,
  });

  upReq.on("upgrade", (upRes, upSocket, upHead) => {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        Object.entries(upRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n",
    );
    if (upHead && upHead.length) socket.write(upHead);

    upSocket.pipe(socket).pipe(upSocket);
  });

  upReq.on("error", () => socket.destroy());
  upReq.end();
});

/* ----------------------------------------------------------------------- */

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`proxy-server-start url=http://${LISTEN_HOST}:${LISTEN_PORT}`);
});

server.on("request", (req, res) => {
  if (req.url === "/__eezi_logs") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    process.stdout.pipe(res);
  }
});
