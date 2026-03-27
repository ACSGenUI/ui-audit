/**
 * Repeatedly JSON.parse while the value is a non-empty string (double-/triple-encoded JSON from MCP hosts and clients).
 * @param {unknown} value
 * @param {number} [maxDepth=12]
 * @returns {unknown}
 */
export function parseJsonLayers(value, maxDepth = 12) {
  let v = value;
  let depth = 0;
  while (depth < maxDepth && typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    try {
      v = JSON.parse(t);
      depth += 1;
    } catch {
      return null;
    }
  }
  return v;
}
