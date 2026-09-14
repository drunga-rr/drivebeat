// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createLibraryBackup, restoreLibraryBackup } from "../client/src/lib/libraryBackup";

it("round-trips local audio, cover and metadata through a JSON backup", async () => {
  const raw = await createLibraryBackup([{
    id: "track-1",
    order: 4,
    title: "Noite Azul",
    artist: "Banda Local",
    album: "Horizonte",
    folder: "Coleção",
    duration: "3:20",
    accent: "from-violet-500 to-indigo-950",
    fileName: "noite.mp3",
    blob: new Blob(["audio-bytes"], { type: "audio/mpeg" }),
    coverBlob: new Blob(["cover-bytes"], { type: "image/jpeg" }),
  }]);

  const [restored] = restoreLibraryBackup(raw);
  expect(restored).toMatchObject({ id: "track-1", order: 4, title: "Noite Azul", album: "Horizonte", folder: "Coleção" });
  expect(await restored.blob.text()).toBe("audio-bytes");
  expect(await restored.coverBlob?.text()).toBe("cover-bytes");
});
