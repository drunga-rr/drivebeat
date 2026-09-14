import { describe, expect, it } from "vitest";
import { EQUALIZER_FREQUENCIES, EQUALIZER_PRESETS, clampEqualizerGain, formatEqualizerFrequency, getEqualizerPreset, normalizeEqualizerBands } from "@shared/equalizer";

describe("equalizer helpers", () => {
  it("exposes the expected graphic bands and named presets", () => {
    expect(EQUALIZER_FREQUENCIES).toHaveLength(8);
    expect(EQUALIZER_PRESETS.map((preset) => preset.id)).toEqual(["flat", "bass", "vocal", "rock", "classical", "electronic"]);
    expect(getEqualizerPreset("vocal").gains).toEqual([-2, -1, 1, 3, 4, 3, 1, -1]);
  });

  it("clamps and normalizes persisted gain values", () => {
    expect(clampEqualizerGain(-30)).toBe(-12);
    expect(clampEqualizerGain(30)).toBe(12);
    expect(clampEqualizerGain(2.7)).toBe(3);
    expect(normalizeEqualizerBands([-20, 1.4, 14])).toEqual([-12, 1, 12, 0, 0, 0, 0, 0]);
  });

  it("formats low and high frequencies for the graphic labels", () => {
    expect(formatEqualizerFrequency(60)).toBe("60");
    expect(formatEqualizerFrequency(1000)).toBe("1k");
    expect(formatEqualizerFrequency(12000)).toBe("12k");
  });
});
