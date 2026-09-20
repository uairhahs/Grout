// A virtual clock: timers fire only when a test advances time, so nothing here waits in real time.
export function makeTimers() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();

  return {
    setTimeout(fn, ms = 0) {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms, every: null });
      return id;
    },
    setInterval(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms, every: ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    clearInterval(id) {
      timers.delete(id);
    },
    /** Moves time forward, running every timer that comes due, in order. */
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        now = timer.at;
        if (timer.every === null) timers.delete(id);
        else timer.at += timer.every;
        await timer.fn();
      }
      now = end;
    },
    get pending() {
      return timers.size;
    },
  };
}
