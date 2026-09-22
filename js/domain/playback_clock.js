// Accumulate elapsed simulation time; a speed change never rescales the past.
export function createPlaybackClock(now, position = 0, speed = 1) {
  let lastTime = now;
  let seconds = position;
  let rate = speed;
  return {
    read(time) {
      seconds += Math.max(0, time - lastTime) / 1000 * rate;
      lastTime = time;
      return seconds;
    },
    setSpeed(time, nextSpeed) {
      this.read(time);
      rate = nextSpeed;
    }
  };
}
