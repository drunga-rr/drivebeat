export type StoredLocalTrack = {
  id: string;
  order: number;
  title: string;
  artist: string;
  album: string;
  folder: string;
  duration: string;
  accent: string;
  fileName: string;
  blob: Blob;
  coverBlob?: Blob;
};

export type StorageFailureCode = "unavailable" | "blocked" | "quota-exceeded" | "unknown";

export class LocalLibraryStorageError extends Error {
  constructor(public readonly code: StorageFailureCode, message: string) {
    super(message);
    this.name = "LocalLibraryStorageError";
  }
}

const DATABASE_NAME = "drivebeat-library";
const STORE_NAME = "tracks";
const DATABASE_VERSION = 1;

export function sortStoredTracks(tracks: StoredLocalTrack[]) {
  return [...tracks].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

export function classifyStorageError(error: unknown, fallback: StorageFailureCode) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "QuotaExceededError") return "quota-exceeded" as const;
  if (name === "NotAllowedError" || name === "SecurityError") return "blocked" as const;
  return fallback;
}

async function requestPersistentStorage() {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new LocalLibraryStorageError("unavailable", "IndexedDB não está disponível neste navegador."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(new LocalLibraryStorageError(classifyStorageError(request.error, "unavailable"), "O navegador bloqueou o armazenamento local."));
    request.onblocked = () => reject(new LocalLibraryStorageError("blocked", "O armazenamento local está bloqueado por outra sessão do navegador."));
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadStoredTracks() {
  if (typeof indexedDB === "undefined") {
    throw new LocalLibraryStorageError("unavailable", "Este navegador não oferece armazenamento persistente.");
  }
  await requestPersistentStorage();
  const database = await openDatabase();
  return new Promise<StoredLocalTrack[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onerror = () => {
      database.close();
      reject(new LocalLibraryStorageError(classifyStorageError(request.error, "unavailable"), "Não foi possível restaurar a biblioteca local."));
    };
    request.onsuccess = () => {
      database.close();
      const tracks = (request.result as StoredLocalTrack[]).map((track, index) => ({ ...track, order: track.order ?? index }));
      resolve(tracks);
    };
  });
}

export async function saveStoredTracks(tracks: StoredLocalTrack[]) {
  if (!tracks.length) return;
  if (typeof indexedDB === "undefined") throw new LocalLibraryStorageError("unavailable", "Este navegador não oferece armazenamento persistente.");
  await requestPersistentStorage();
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    tracks.forEach((track) => transaction.objectStore(STORE_NAME).put(track));
    const rejectStorageError = () => {
      database.close();
      const code = classifyStorageError(transaction.error, "unknown");
      reject(new LocalLibraryStorageError(code, code === "quota-exceeded" ? "Não há espaço suficiente para salvar esta coleção." : "O navegador bloqueou o salvamento da coleção local."));
    };
    transaction.onerror = rejectStorageError;
    transaction.onabort = rejectStorageError;
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}

export async function clearStoredTracks() {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    transaction.onerror = () => {
      database.close();
      reject(new LocalLibraryStorageError(classifyStorageError(transaction.error, "unknown"), "Não foi possível limpar a biblioteca local."));
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}
