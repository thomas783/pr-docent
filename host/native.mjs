// Pieces of the local generator that don't touch the process or the file system.

import { createHash } from "node:crypto";

export const HOST_NAME = "dev.prdocent.host";
// Extensions the host accepts by default: the unpacked install, whose ID manifest.json's key fixes,
// and the Chrome Web Store release.
export const EXTENSION_IDS = ["hleefogoiedjahnmjgmmgonckaeicppc", "deejphpcfjilekklajdhdhfepjbenjii"];

/** Chrome native messaging frames each message as a 32-bit little-endian length plus UTF-8 JSON. */
export function encodeMessage(value) {
  const json = Buffer.from(JSON.stringify(value), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

/** Returns a stdin "data" handler that calls [onMessage] for every complete frame. */
export function createDecoder(onMessage) {
  let pending = Buffer.alloc(0);
  return (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const length = pending.readUInt32LE(0);
      if (pending.length < 4 + length) break;
      onMessage(JSON.parse(pending.subarray(4, 4 + length).toString("utf8")));
      pending = pending.subarray(4 + length);
    }
  };
}

/** The ID Chrome gives an extension whose manifest carries this public [key]. */
export function extensionIdFromKey(key) {
  const hex = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}
