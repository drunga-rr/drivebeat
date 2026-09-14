import { describe, expect, it } from "vitest";
import { readMp3Metadata } from "../shared/mp3Metadata";

function synchsafe(value: number) {
  return new Uint8Array([(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f]);
}

function frame(id: string, payload: Uint8Array) {
  const header = new Uint8Array(10);
  header.set(new TextEncoder().encode(id), 0);
  header.set(new Uint8Array([(payload.length >> 24) & 0xff, (payload.length >> 16) & 0xff, (payload.length >> 8) & 0xff, payload.length & 0xff]), 4);
  return new Uint8Array([...header, ...payload]);
}

function textFrame(id: string, value: string) {
  return frame(id, new Uint8Array([3, ...new TextEncoder().encode(value)]));
}

function taggedMp3() {
  const cover = new Uint8Array([3, ...new TextEncoder().encode("image/jpeg"), 0, 3, 0, 0, 0, 0xff, 0xd8, 0xff, 0xd9]);
  const frames = [textFrame("TIT2", "Noite Azul"), textFrame("TPE1", "Banda Local"), textFrame("TALB", "Horizonte"), frame("APIC", cover)];
  const body = new Uint8Array(frames.reduce((size, item) => size + item.length, 0));
  let offset = 0;
  frames.forEach((item) => { body.set(item, offset); offset += item.length; });
  const header = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, ...synchsafe(body.length)]);
  return new Blob([new Uint8Array([...header, ...body])], { type: "audio/mpeg" });
}

describe("mp3 metadata", () => {
  it("reads common ID3 text tags and the embedded cover", async () => {
    const metadata = await readMp3Metadata(taggedMp3());
    expect(metadata.title).toBe("Noite Azul");
    expect(metadata.artist).toBe("Banda Local");
    expect(metadata.album).toBe("Horizonte");
    expect(metadata.coverUrl).toMatch(/^blob:/);
  });

  it("returns an empty metadata object for an untagged file", async () => {
    expect(await readMp3Metadata(new Blob(["plain audio bytes"], { type: "audio/mpeg" }))).toEqual({});
  });
});
