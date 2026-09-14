import type { StoredLocalTrack } from "./localLibraryStore";

type BackupTrack = Omit<StoredLocalTrack, "blob" | "coverBlob"> & { audioData: string; coverData?: string };

type LibraryBackup = {
  version: 1;
  createdAt: string;
  tracks: BackupTrack[];
};

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Não foi possível ler o arquivo para o backup."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string) {
  const [header, payload] = dataUrl.split(",", 2);
  if (!header || !payload || !header.startsWith("data:")) throw new Error("Backup inválido.");
  const mime = header.match(/data:([^;]+)/)?.[1] || "audio/mpeg";
  const binary = atob(payload);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

export async function createLibraryBackup(tracks: StoredLocalTrack[]) {
  const backupTracks = await Promise.all(tracks.map(async ({ blob, coverBlob, ...track }) => ({
    ...track,
    audioData: await readAsDataUrl(blob),
    coverData: coverBlob ? await readAsDataUrl(coverBlob) : undefined,
  })));
  return JSON.stringify({ version: 1, createdAt: new Date().toISOString(), tracks: backupTracks } satisfies LibraryBackup);
}

export function restoreLibraryBackup(raw: string): StoredLocalTrack[] {
  const backup = JSON.parse(raw) as LibraryBackup;
  if (backup.version !== 1 || !Array.isArray(backup.tracks)) throw new Error("Formato de backup não reconhecido.");
  return backup.tracks.map(({ audioData, coverData, ...track }) => ({
    ...track,
    blob: dataUrlToBlob(audioData),
    coverBlob: coverData ? dataUrlToBlob(coverData) : undefined,
  }));
}
