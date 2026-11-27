import type { Playback } from "./types";

/** Message the extension sends the helper: the full list of tabs currently showing media. */
export interface PlaybackMessage {
  type: "playback";
  items: Playback[];
}

/** What the helper serves to the plugin at GET /playback. */
export interface HelperSnapshot {
  items: Playback[];
  updatedAt: number;
}

/** Native messaging frames are a 4-byte little-endian length followed by UTF-8 JSON. */
export function encodeFrame(message: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message));
  const out = new Uint8Array(4 + body.length);
  new DataView(out.buffer).setUint32(0, body.length, true);
  out.set(body, 4);
  return out;
}

/** Collects stdin chunks and yields complete messages. */
export class FrameDecoder {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): unknown[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    const out: unknown[] = [];
    while (this.buf.length >= 4) {
      const len = new DataView(this.buf.buffer, this.buf.byteOffset, 4).getUint32(0, true);
      if (this.buf.length < 4 + len) break;
      const body = this.buf.subarray(4, 4 + len);
      out.push(JSON.parse(new TextDecoder().decode(body)));
      this.buf = this.buf.slice(4 + len);
    }
    return out;
  }
}

export function isPlaybackMessage(m: unknown): m is PlaybackMessage {
  return !!m && typeof m === "object" && (m as PlaybackMessage).type === "playback" && Array.isArray((m as PlaybackMessage).items);
}
