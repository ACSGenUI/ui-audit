function clamp255(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function parseCssColorToRgb(input) {
  if (input == null || typeof input !== "string") return null;
  var s = input.trim();
  var m = /^#([a-f\d]{3})$/i.exec(s);
  if (m) {
    var h = m[1];
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(s);
  if (m) {
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
  if (m) {
    return { r: clamp255(+m[1]), g: clamp255(+m[2]), b: clamp255(+m[3]) };
  }
  return null;
}

function relativeLuminanceRgb(rgb) {
  function lin(c) {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

export function tooltipStyleForBackground(cssColor) {
  var rgb = parseCssColorToRgb(cssColor);
  if (!rgb) {
    return { color: "#0f172a", textShadow: "none" };
  }
  var Lbg = relativeLuminanceRgb(rgb);
  var contrastWhite = (1 + 0.05) / (Lbg + 0.05);
  var contrastBlack = (Lbg + 0.05) / 0.05;
  if (contrastWhite >= contrastBlack) {
    return { color: "#ffffff", textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)" };
  }
  return { color: "#0f172a", textShadow: "none" };
}
