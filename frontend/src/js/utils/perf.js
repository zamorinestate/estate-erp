// =============================================================================
// ZAMORIN CAFE ERP — CLIENT PERFORMANCE & RENDERING UTILITIES
// Features: Zero-lag Debouncing, Throttling, RAF Batching & Fast Search Indexing
// =============================================================================

/**
 * Creates a debounced function that delays invoking `fn` until after `waitMs`
 * milliseconds have elapsed since the last time the debounced function was invoked.
 * Includes a `.cancel()` method to discard pending invocations.
 */
export function debounce(fn, waitMs = 150) {
  let timerId = null;

  const debounced = function (...args) {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(this, args);
    }, waitMs);
  };

  debounced.cancel = function () {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  return debounced;
}

/**
 * Creates a throttled function that only invokes `fn` at most once per
 * every `waitMs` milliseconds.
 */
export function throttle(fn, waitMs = 150) {
  let inThrottle = false;
  let lastFn = null;
  let lastTime = 0;

  return function (...args) {
    const now = Date.now();
    if (!inThrottle) {
      fn.apply(this, args);
      lastTime = now;
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastFn) {
          lastFn();
          lastFn = null;
        }
      }, waitMs);
    } else {
      lastFn = () => fn.apply(this, args);
    }
  };
}

/**
 * Schedules a DOM manipulation or heavy computation inside requestAnimationFrame
 * to prevent layout thrashing and preserve 60fps interaction.
 */
export function rafSchedule(fn) {
  let frameId = null;

  return function (...args) {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }
    frameId = requestAnimationFrame(() => {
      frameId = null;
      fn.apply(this, args);
    });
  };
}
