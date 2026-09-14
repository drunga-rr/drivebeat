import { EQUALIZER_FREQUENCIES, normalizeEqualizerBands } from "@shared/equalizer";

export function createEqualizerGraph(audio: HTMLMediaElement, context: AudioContext) {
  const source = context.createMediaElementSource(audio);
  let previousNode: AudioNode = source;
  const filters = EQUALIZER_FREQUENCIES.map((frequency) => {
    const filter = context.createBiquadFilter();
    filter.type = "peaking";
    filter.frequency.value = frequency;
    filter.Q.value = 1.1;
    filter.gain.value = 0;
    previousNode.connect(filter);
    previousNode = filter;
    return filter;
  });
  previousNode.connect(context.destination);
  return { source, filters };
}

export function applyEqualizerGains(filters: BiquadFilterNode[], bands: number[], enabled: boolean) {
  const normalized = normalizeEqualizerBands(bands);
  filters.forEach((filter, index) => {
    filter.gain.value = enabled ? normalized[index] ?? 0 : 0;
  });
}
