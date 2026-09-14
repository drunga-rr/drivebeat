import { describe, expect, it } from "vitest";
import { buildShuffleQueue, clampProgress, getNextPlaybackIndex, getNextTrackIndex, getPreviousHistoryId, getRandomTrackIndex, reconcileShuffleQueue, seekAudio, toggleAudioPlayback } from "../shared/player";

describe("local player queue", () => {
  it("advances and wraps around the queue", () => {
    expect(getNextTrackIndex(0, 3, 1)).toBe(1);
    expect(getNextTrackIndex(2, 3, 1)).toBe(0);
    expect(getNextTrackIndex(0, 3, -1)).toBe(2);
  });

  it("selects a different deterministic item in shuffle mode", () => {
    expect(getRandomTrackIndex(1, 4, () => 0)).toBe(0);
    expect(getRandomTrackIndex(1, 4, () => 0.99)).toBe(3);
    expect(getNextPlaybackIndex(1, 4, { shuffle: true, repeat: false, random: () => 0 })).toBe(0);
  });

  it("builds a stable shuffled queue while keeping the current item first", () => {
    expect(buildShuffleQueue(["a", "b", "c"], "a", () => 0)).toEqual(["a", "c", "b"]);
    expect(getPreviousHistoryId(["a", "c"])).toBe("c");
    expect(getPreviousHistoryId([])).toBeNull();
  });

  it("rebuilds a stale shuffle queue after the library changes", () => {
    expect(reconcileShuffleQueue(["a", "c"], "c", ["a", "old"], () => 0)).toEqual(["c", "a"]);
    expect(reconcileShuffleQueue(["a", "b"], "a", ["a", "b"], () => 0)).toEqual(["a", "b"]);
  });

  it("keeps the current item in repeat mode", () => {
    expect(getNextPlaybackIndex(2, 4, { shuffle: true, repeat: true, random: () => 0 })).toBe(2);
    expect(getNextPlaybackIndex(2, 4, { shuffle: false, repeat: true })).toBe(2);
  });

  it("returns no index for an empty queue", () => {
    expect(getNextTrackIndex(0, 0)).toBe(-1);
  });

  it("controls play and pause on an audio target", () => {
    let playCalls = 0;
    let pauseCalls = 0;
    const audio = {
      paused: true,
      currentTime: 0,
      duration: 200,
      play: () => { playCalls += 1; },
      pause: () => { pauseCalls += 1; },
    };
    expect(toggleAudioPlayback(audio)).toBe("playing");
    audio.paused = false;
    expect(toggleAudioPlayback(audio)).toBe("paused");
    expect(playCalls).toBe(1);
    expect(pauseCalls).toBe(1);
  });

  it("seeks a real audio target and clamps the value", () => {
    const audio = { paused: false, currentTime: 0, duration: 200, play: () => {}, pause: () => {} };
    expect(seekAudio(audio, 25)).toBe(25);
    expect(audio.currentTime).toBe(50);
    expect(seekAudio(audio, 120)).toBe(100);
    expect(audio.currentTime).toBe(200);
  });

  it("keeps seek values inside the audio range", () => {
    expect(clampProgress(-20)).toBe(0);
    expect(clampProgress(45)).toBe(45);
    expect(clampProgress(120)).toBe(100);
  });
});
