// The local helper. Waterfox starts it (native messaging) when the extension loads; it reads
// playback lists from stdin and serves the latest one to the BetterDiscord plugin over localhost.
// stdout belongs to native messaging, so all logging goes to stderr.

import { createServer } from "node:http";
import { FrameDecoder, isPlaybackMessage, type HelperSnapshot } from "../core/nativeMessaging";
import { DEFAULT_HELPER_PORT } from "../core/settings";

const port = Number(process.env.CUSTOM_PRESENCE_PORT) || DEFAULT_HELPER_PORT;
const log = (...args: unknown[]) => console.error("[custom-presence-helper]", ...args);

let snapshot: HelperSnapshot = { items: [], updatedAt: Date.now() };

const decoder = new FrameDecoder();
process.stdin.on("data", (chunk: Buffer) => {
  try {
    for (const message of decoder.push(new Uint8Array(chunk))) {
      if (isPlaybackMessage(message)) snapshot = { items: message.items, updatedAt: Date.now() };
    }
  } catch (e) {
    log("bad message", e);
  }
});
// Waterfox closes stdin when it quits or the extension unloads.
process.stdin.on("end", () => process.exit(0));
process.stdin.on("error", () => process.exit(0));

const server = createServer((req, res) => {
  const host = req.headers.host ?? "";
  // Only answer requests addressed to localhost (guards against DNS rebinding from web pages).
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
    res.writeHead(403).end();
    return;
  }
  if (req.method === "GET" && req.url === "/playback") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(snapshot));
    return;
  }
  res.writeHead(404).end();
});

server.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EADDRINUSE") log(`port ${port} is already in use; is another helper running?`);
  else log("server error", e);
});
server.listen(port, "127.0.0.1", () => log(`serving http://127.0.0.1:${port}/playback`));
