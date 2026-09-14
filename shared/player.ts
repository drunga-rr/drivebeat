export function getNextTrackIndex(currentIndex: number, trackCount: number, direction: 1 | -1 = 1) {
  if (trackCount <= 0) return -1;
  return (currentIndex + direction + trackCount) % trackCount;
}

export function getRandomTrackIndex(currentIndex: number, trackCount: number, random = Math.random) {
  if (trackCount <= 1) return currentIndex >= 0 ? currentIndex : 0;
  const candidate = Math.floor(Math.min(0.999999, Math.max(0, random())) * (trackCount - 1));
  return candidate >= currentIndex ? candidate + 1 : candidate;
}

export function buildShuffleQueue(trackIds: string[], currentId: string | null, random = Math.random) {
  const remaining = trackIds.filter((id) => id !== currentId);
  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.min(0.999999, Math.max(0, random())) * (index + 1));
    [remaining[index], remaining[target]] = [remaining[target], remaining[index]];
  }
  return currentId && trackIds.includes(currentId) ? [currentId, ...remaining] : remaining;
}

export function getPreviousHistoryId(history: string[]) {
  return history.length ? history[history.length - 1] : null;
}

export function reconcileShuffleQueue(trackIds: string[], currentId: string | null, queue: string[], random = Math.random) {
  const validIds = new Set(trackIds);
  const filtered = queue.filter((id, index) => validIds.has(id) && queue.indexOf(id) === index);
  if (filtered.length !== trackIds.length || (currentId && !filtered.includes(currentId))) {
    return buildShuffleQueue(trackIds, currentId, random);
  }
  return filtered;
}

export function getNextPlaybackIndex(currentIndex: number, trackCount: number, options: { shuffle: boolean; repeat: boolean; random?: () => number }) {
  if (trackCount <= 0) return -1;
  if (options.repeat) return currentIndex;
  if (options.shuffle) return getRandomTrackIndex(currentIndex, trackCount, options.random);
  return getNextTrackIndex(currentIndex, trackCount, 1);
}

export function clampProgress(value: number) {
  return Math.min(100, Math.max(0, value));
}

export type PlaybackTarget = {
  paused: boolean;
  currentTime: number;
  duration: number;
  play: () => Promise<void> | void;
  pause: () => void;
};

export function toggleAudioPlayback(audio: PlaybackTarget) {
  if (audio.paused) {
    void audio.play();
    return "playing" as const;
  }
  audio.pause();
  return "paused" as const;
}

export function seekAudio(audio: PlaybackTarget, progress: number) {
  const safeProgress = clampProgress(progress);
  if (audio.duration > 0) audio.currentTime = (safeProgress / 100) * audio.duration;
  return safeProgress;
}
