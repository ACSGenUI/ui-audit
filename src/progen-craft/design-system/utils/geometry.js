/** SVG arc / annular sector path for donut charts. */
export function sectorPath(cx, cy, r0, r1, a0, a1) {
  var xo0 = cx + r1 * Math.cos(a0);
  var yo0 = cy + r1 * Math.sin(a0);
  var xo1 = cx + r1 * Math.cos(a1);
  var yo1 = cy + r1 * Math.sin(a1);
  var xi0 = cx + r0 * Math.cos(a0);
  var yi0 = cy + r0 * Math.sin(a0);
  var xi1 = cx + r0 * Math.cos(a1);
  var yi1 = cy + r0 * Math.sin(a1);
  var sweep = 1;
  var large = a1 - a0 > Math.PI ? 1 : 0;
  return (
    "M " +
    xo0 +
    " " +
    yo0 +
    " A " +
    r1 +
    " " +
    r1 +
    " 0 " +
    large +
    " " +
    sweep +
    " " +
    xo1 +
    " " +
    yo1 +
    " L " +
    xi1 +
    " " +
    yi1 +
    " A " +
    r0 +
    " " +
    r0 +
    " 0 " +
    large +
    " 0 " +
    xi0 +
    " " +
    yi0 +
    " Z"
  );
}
