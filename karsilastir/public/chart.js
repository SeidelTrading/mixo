/* Fiyat geçmişi grafiği: çizgi grafiği, satır içi SVG; kütüphane yok. Veri: data-points='[["2026-11-01", 12.3], ...]' */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, text) {
    const n = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) {
      n.setAttribute(k, attrs[k]);
    });
    if (text !== undefined) n.textContent = text;
    return n;
  }
  document.querySelectorAll('.chart[data-points]').forEach(function (box) {
    let pts;
    try {
      pts = JSON.parse(box.getAttribute('data-points'));
    } catch {
      return;
    }
    if (!pts || pts.length < 2) return;
    let fmt;
    try {
      fmt = new Intl.NumberFormat(box.getAttribute('data-locale') || undefined, {
        style: 'currency',
        currency: box.getAttribute('data-currency') || 'EUR',
      });
    } catch {
      fmt = { format: String };
    }
    const W = 640,
      H = 240,
      L = 64,
      R = 12,
      T = 16,
      B = 28;
    const ys = pts.map(function (p) {
      return p[1];
    });
    let min = Math.min.apply(null, ys),
      max = Math.max.apply(null, ys);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const t0 = Date.parse(pts[0][0]),
      t1 = Date.parse(pts[pts.length - 1][0]);
    const span = Math.max(t1 - t0, 1);
    const x = function (p) {
      return L + ((Date.parse(p[0]) - t0) / span) * (W - L - R);
    };
    const y = function (p) {
      return T + (1 - (p[1] - min) / (max - min)) * (H - T - B);
    };
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' });
    svg.appendChild(
      el('line', { x1: L, y1: H - B, x2: W - R, y2: H - B, stroke: 'currentColor', 'stroke-opacity': '.25' }),
    );
    svg.appendChild(el('text', { x: L - 6, y: T + 4, 'text-anchor': 'end' }, fmt.format(max)));
    svg.appendChild(el('text', { x: L - 6, y: H - B, 'text-anchor': 'end' }, fmt.format(min)));
    svg.appendChild(el('text', { x: L, y: H - 8 }, pts[0][0]));
    svg.appendChild(el('text', { x: W - R, y: H - 8, 'text-anchor': 'end' }, pts[pts.length - 1][0]));
    const d = pts
      .map(function (p, i) {
        return (i ? 'L' : 'M') + x(p).toFixed(1) + ' ' + y(p).toFixed(1);
      })
      .join(' ');
    svg.appendChild(
      el('path', { d: d, fill: 'none', class: 'line', 'stroke-width': '2.5', 'stroke-linejoin': 'round' }),
    );
    const last = pts[pts.length - 1];
    svg.appendChild(el('circle', { cx: x(last).toFixed(1), cy: y(last).toFixed(1), r: 4, class: 'dot' }));
    box.appendChild(svg);
    box.setAttribute(
      'aria-label',
      (box.getAttribute('aria-label') || '') +
        ': ' +
        box.getAttribute('data-low') +
        ' ' +
        fmt.format(Math.min.apply(null, ys)) +
        ', ' +
        box.getAttribute('data-high') +
        ' ' +
        fmt.format(Math.max.apply(null, ys)),
    );
  });
})();
