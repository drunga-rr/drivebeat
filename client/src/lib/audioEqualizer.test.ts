import { describe, expect, it, vi } from "vitest";
import { applyEqualizerGains, createEqualizerGraph } from "./audioEqualizer";

function createFakeContext() {
  const destination = { kind: "destination" } as unknown as AudioNode;
  const context = {
    destination,
    createMediaElementSource: () => ({ connect: vi.fn() }),
    createBiquadFilter: () => ({
      type: "",
      frequency: { value: 0 },
      Q: { value: 0 },
      gain: { value: 0 },
      connect: vi.fn(),
    }),
  } as unknown as AudioContext;
  return context;
}

describe("audio equalizer graph", () => {
  it("creates the graphic chain with one peaking filter per band", () => {
    const context = createFakeContext();
    const graph = createEqualizerGraph({} as HTMLMediaElement, context);
    expect(graph.filters).toHaveLength(8);
    expect(graph.filters.map((filter) => filter.frequency.value)).toEqual([60, 170, 310, 600, 1000, 3000, 6000, 12000]);
    expect(graph.filters.every((filter) => filter.type === "peaking")).toBe(true);
  });

  it("applies normalized gains and clears them in bypass", () => {
    const filters = Array.from({ length: 8 }, () => ({ gain: { value: 0 } })) as BiquadFilterNode[];
    applyEqualizerGains(filters, [-30, -2, 4, 15], true);
    expect(filters.map((filter) => filter.gain.value)).toEqual([-12, -2, 4, 12, 0, 0, 0, 0]);
    applyEqualizerGains(filters, [8, 8, 8, 8, 8, 8, 8, 8], false);
    expect(filters.every((filter) => filter.gain.value === 0)).toBe(true);
  });
});
