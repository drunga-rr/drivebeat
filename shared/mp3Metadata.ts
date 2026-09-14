type Mp3Metadata = {
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  coverBlob?: Blob;
};

function readSynchsafe(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 21) | (bytes[offset + 1] << 14) | (bytes[offset + 2] << 7) | bytes[offset + 3];
}

function readBigEndian(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function findDescriptionEnd(bytes: Uint8Array, start: number, encoding: number) {
  if (encoding === 1 || encoding === 2) {
    for (let index = start; index + 1 < bytes.length; index += 2) {
      if (bytes[index] === 0 && bytes[index + 1] === 0) return index + 2;
    }
    return bytes.length;
  }
  const end = bytes.indexOf(0, start);
  return end === -1 ? bytes.length : end + 1;
}

function decodeText(bytes: Uint8Array) {
  if (!bytes.length) return "";
  const encoding = bytes[0];
  const payload = bytes.slice(1);
  const decoder = encoding === 1 || encoding === 2 ? new TextDecoder("utf-16") : new TextDecoder(encoding === 3 ? "utf-8" : "iso-8859-1");
  return decoder.decode(payload).replace(/\0/g, "").trim();
}

export async function readMp3Metadata(file: Blob): Promise<Mp3Metadata> {
  try {
    const bytes = new Uint8Array(await file.slice(0, 2 * 1024 * 1024).arrayBuffer());
    if (bytes.length < 10 || String.fromCharCode(bytes[0], bytes[1], bytes[2]) !== "ID3") return {};
    const version = bytes[3];
    const tagEnd = Math.min(bytes.length, 10 + readSynchsafe(bytes, 6));
    const metadata: Mp3Metadata = {};
    let offset = 10;
    while (offset + 10 <= tagEnd) {
      const frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;
      const frameSize = version >= 4 ? readSynchsafe(bytes, offset + 4) : readBigEndian(bytes, offset + 4);
      if (frameSize <= 0 || offset + 10 + frameSize > tagEnd) break;
      const payload = bytes.slice(offset + 10, offset + 10 + frameSize);
      if (frameId === "TIT2") metadata.title = decodeText(payload);
      if (frameId === "TPE1") metadata.artist = decodeText(payload);
      if (frameId === "TALB") metadata.album = decodeText(payload);
      if (frameId === "APIC" && typeof URL !== "undefined" && typeof Blob !== "undefined") {
        const encoding = payload[0] ?? 0;
        const mimeEnd = payload.indexOf(0, 1);
        if (mimeEnd > 1 && mimeEnd + 2 < payload.length) {
          const mime = new TextDecoder().decode(payload.slice(1, mimeEnd)) || "image/jpeg";
          const descriptionStart = mimeEnd + 2;
          const imageStart = findDescriptionEnd(payload, descriptionStart, encoding);
          const imageBytes = payload.slice(imageStart);
          if (imageBytes.length > 0) {
            metadata.coverBlob = new Blob([imageBytes], { type: mime });
            metadata.coverUrl = URL.createObjectURL(metadata.coverBlob);
          }
        }
      }
      offset += 10 + frameSize;
    }
    return metadata;
  } catch {
    return {};
  }
}
