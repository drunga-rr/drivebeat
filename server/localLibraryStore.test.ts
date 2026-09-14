import { beforeEach, describe, expect, it } from "vitest";
import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import { classifyStorageError, clearStoredTracks, loadStoredTracks, saveStoredTracks, sortStoredTracks, StoredLocalTrack } from "../client/src/lib/localLibraryStore";

Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fakeIndexedDB });

const track: StoredLocalTrack = {
  id: "persisted-track",
  order: 1,
  title: "Noite Azul",
  artist: "Banda Local",
  album: "Horizonte",
  folder: "Coleção",
  duration: "—",
  accent: "from-violet-500 to-indigo-950",
  fileName: "noite.mp3",
  blob: new Blob(["audio"], { type: "audio/mpeg" }),
};

beforeEach(async () => {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("drivebeat-library");
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
});

describe("local library persistence", () => {
  it("classifies mobile storage failures", () => {
    expect(classifyStorageError(new DOMException("full", "QuotaExceededError"), "unknown")).toBe("quota-exceeded");
    expect(classifyStorageError(new DOMException("blocked", "SecurityError"), "unknown")).toBe("blocked");
    expect(classifyStorageError(new Error("other"), "unavailable")).toBe("unavailable");
  });
  it("sorts restored tracks by their persisted order", () => {
    expect(sortStoredTracks([{ ...track, id: "late", order: 20 }, { ...track, id: "early", order: 10 }]).map((item) => item.id)).toEqual(["early", "late"]);
  });
  it("saves and restores tracks with their original Blob", async () => {
    await saveStoredTracks([track]);
    const restored = await loadStoredTracks();
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ id: track.id, title: track.title, folder: track.folder });
    expect(await restored[0].blob.text()).toBe("audio");
  });

  it("returns an empty library when IndexedDB is unavailable", async () => {
    const originalIndexedDb = globalThis.indexedDB;
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    await expect(loadStoredTracks()).rejects.toMatchObject({ code: "unavailable" });
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: originalIndexedDb });
  });

  it("clears the persisted collection", async () => {
    await saveStoredTracks([track]);
    await clearStoredTracks();
    expect(await loadStoredTracks()).toEqual([]);
  });
});
