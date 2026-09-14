import { describe, expect, it } from "vitest";
import { getLocalAlbum, getLocalFolder, getLocalTrackTitle, isLocalMp3, uniqueLocalTracks } from "../shared/library";

describe("local music library", () => {
  it("recognizes mp3 files and rejects unrelated files", () => {
    expect(isLocalMp3("show.mp3")).toBe(true);
    expect(isLocalMp3("show.MP3", "audio/mpeg")).toBe(true);
    expect(isLocalMp3("cover.png", "image/png")).toBe(false);
  });

  it("creates readable titles from filenames", () => {
    expect(getLocalTrackTitle("late-night_drive.mp3")).toBe("late night drive");
    expect(getLocalTrackTitle(".mp3")).toBe("Faixa sem título");
  });

  it("deduplicates tracks within an import batch", () => {
    expect(uniqueLocalTracks([{ id: "a" }, { id: "a" }, { id: "b" }])).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("keeps albums separate from folders when a filename carries an album tag", () => {
    expect(getLocalAlbum("[Sunset Sessions] - 01 - Intro.mp3", "Roadtrip")).toBe("Sunset Sessions");
    expect(getLocalAlbum("01 - Intro.mp3", "Roadtrip")).toBe("Álbum de Roadtrip");
  });

  it("keeps the immediate parent directory as the collection folder", () => {
    expect(getLocalFolder("Minha Música/Álbum 01/faixa.mp3")).toBe("Álbum 01");
    expect(getLocalFolder("faixa.mp3")).toBe("Minha coleção");
  });
});
