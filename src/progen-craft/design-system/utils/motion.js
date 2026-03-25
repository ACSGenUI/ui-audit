export function prefersReducedMotion() {
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function runRafDouble(fn) {
  if (prefersReducedMotion()) {
    fn();
    return;
  }
  globalThis.requestAnimationFrame(function () {
    globalThis.requestAnimationFrame(fn);
  });
}

export function expandElementsBySelector(root, selector, className) {
  if (!root) return;
  var list = root.querySelectorAll(selector);
  if (!list.length) return;
  if (prefersReducedMotion()) {
    for (var i = 0; i < list.length; i++) list[i].classList.add(className);
    return;
  }
  runRafDouble(function () {
    for (var j = 0; j < list.length; j++) list[j].classList.add(className);
  });
}
