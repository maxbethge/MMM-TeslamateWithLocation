"use strict";

function createCoalescer(options) {
  const idleMs = options?.idleMs ?? 80;
  const maxMs = options?.maxMs ?? 250;
  const onFlush = options?.onFlush;
  let idleTimer = null;
  let maxTimer = null;
  let pending;
  let hasPending = false;

  function clearTimers() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
  }

  function flush() {
    if (!hasPending) {
      clearTimers();
      return false;
    }
    const item = pending;
    pending = undefined;
    hasPending = false;
    clearTimers();
    if (typeof onFlush === "function") {
      onFlush(item);
    }
    return true;
  }

  function push(item) {
    pending = item;
    hasPending = true;
    if (!maxTimer) {
      maxTimer = setTimeout(flush, maxMs);
    }
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(flush, idleMs);
  }

  function cancel() {
    pending = undefined;
    hasPending = false;
    clearTimers();
  }

  return { push, flush, cancel };
}

module.exports = { createCoalescer };
