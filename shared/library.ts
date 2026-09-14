export function isLocalMp3(fileName: string, mimeType = "") {
  return fileName.toLowerCase().endsWith(".mp3") || mimeType.toLowerCase() === "audio/mpeg";
}

export function getLocalTrackTitle(fileName: string) {
  const withoutExtension = fileName.replace(/\.mp3$/i, "");
  const taggedTitle = withoutExtension.match(/^\[[^\]]+\]\s*-\s*(.+)$/)?.[1] ?? withoutExtension;
  return taggedTitle.replace(/[_-]+/g, " ").trim() || "Faixa sem título";
}

export function getLocalAlbum(fileName: string, folder: string) {
  const withoutExtension = fileName.replace(/\.mp3$/i, "");
  const taggedAlbum = withoutExtension.match(/^\[([^\]]+)\]\s*-/)?.[1];
  return taggedAlbum?.trim() || `Álbum de ${folder}`;
}

export function getLocalFolder(relativePath: string) {
  const segments = relativePath.split("/").filter(Boolean);
  return segments.length > 1 ? segments[segments.length - 2] : "Minha coleção";
}

export function uniqueLocalTracks<T extends { id: string }>(tracks: T[]) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}
