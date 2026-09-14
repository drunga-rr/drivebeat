export const EQUALIZER_FREQUENCIES = [60, 170, 310, 600, 1000, 3000, 6000, 12000] as const;

export type EqualizerPresetId = "flat" | "bass" | "vocal" | "rock" | "classical" | "electronic" | "custom";

export type EqualizerPreset = {
  id: Exclude<EqualizerPresetId, "custom">;
  label: string;
  gains: number[];
};

export const EQUALIZER_PRESETS: EqualizerPreset[] = [
  { id: "flat", label: "Neutro", gains: [0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "bass", label: "Graves", gains: [7, 5, 3, 1, 0, 0, 0, 0] },
  { id: "vocal", label: "Voz", gains: [-2, -1, 1, 3, 4, 3, 1, -1] },
  { id: "rock", label: "Rock", gains: [4, 3, 1, -1, -2, 2, 4, 5] },
  { id: "classical", label: "Clássico", gains: [3, 2, 1, 0, 0, 1, 3, 4] },
  { id: "electronic", label: "Eletrônico", gains: [5, 3, 0, -2, 1, 3, 5, 6] },
];

export function getEqualizerPreset(id: EqualizerPresetId) {
  return id === "custom" ? EQUALIZER_PRESETS[0] : EQUALIZER_PRESETS.find((preset) => preset.id === id) ?? EQUALIZER_PRESETS[0];
}

export function clampEqualizerGain(value: number) {
  return Math.min(12, Math.max(-12, Math.round(value)));
}

export function normalizeEqualizerBands(values: number[]) {
  return EQUALIZER_FREQUENCIES.map((_, index) => clampEqualizerGain(values[index] ?? 0));
}

export function formatEqualizerFrequency(frequency: number) {
  if (frequency >= 1000) return `${frequency / 1000}k`;
  return `${frequency}`;
}
