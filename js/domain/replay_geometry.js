// Index each action boundary once. Straight moves need endpoints, not thousands
// of identical-direction samples. Keep both sides of attachment/turn boundaries.
export function createReplayGeometry(frames) {
  const boundaries = [];
  const pauses = [];
  const seenPauses = new Set();
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    if (index === 0 || index === frames.length - 1 ||
        frame.actionIndex !== frames[index - 1]?.actionIndex ||
        frame.actionIndex !== frames[index + 1]?.actionIndex ||
        !Number.isInteger(frame.actionIndex)) boundaries.push(index);
    if (Number.isInteger(frame.pauseActionIndex) && !seenPauses.has(frame.pauseActionIndex)) {
      seenPauses.add(frame.pauseActionIndex);
      pauses.push({ index, pose: frame });
    }
  }
  return {
    boundaries,
    pauses,
    prefix(index) {
      const selected = [];
      for (const boundary of boundaries) {
        if (boundary >= index) break;
        selected.push(frames[boundary]);
      }
      if (frames[index]) selected.push(frames[index]);
      return selected;
    }
  };
}
