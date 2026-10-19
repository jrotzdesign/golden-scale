/*
 * Golden Scale — Illustrator host script (ExtendScript, ES3)
 * Called from the CEP panel through CSInterface.evalScript().
 *
 * Everything here works in points (Illustrator's internal unit).
 * The panel converts to/from the unit the user picked.
 *
 * Coordinate note: Illustrator bounds are [left, top, right, bottom]
 * with Y increasing UPWARDS (top > bottom).
 */

var GS = (function () {

  var PHI = 1.6180339887498949;

  /* ---------- tiny JSON encoder (ExtendScript has no JSON) ---------- */

  function esc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "");
  }
  function num(n) {
    if (typeof n !== "number" || isNaN(n) || !isFinite(n)) return "null";
    return String(Math.round(n * 10000) / 10000);
  }
  function toJSON(o) {
    var k, parts = [], i;
    if (o === null || o === undefined) return "null";
    if (typeof o === "number") return num(o);
    if (typeof o === "boolean") return o ? "true" : "false";
    if (typeof o === "string") return '"' + esc(o) + '"';
    if (o instanceof Array) {
      for (i = 0; i < o.length; i++) parts.push(toJSON(o[i]));
      return "[" + parts.join(",") + "]";
    }
    for (k in o) if (o.hasOwnProperty(k)) parts.push('"' + esc(k) + '":' + toJSON(o[k]));
    return "{" + parts.join(",") + "}";
  }
  function fail(msg) { return toJSON({ ok: false, error: String(msg) }); }

  /* ---------- selection + bounds helpers ---------- */

  function getDoc() {
    if (app.documents.length === 0) return null;
    return app.activeDocument;
  }

  function flattenSelection(sel) {
    // Illustrator returns text ranges when text is being edited; keep PageItems only.
    var out = [], i;
    if (!sel) return out;
    for (i = 0; i < sel.length; i++) {
      var it = sel[i];
      if (it && it.typename && it.typename !== "TextRange") out.push(it);
    }
    return out;
  }

  function boundsOf(item, useVisible) {
    var b = useVisible ? item.visibleBounds : item.geometricBounds;
    return [b[0], b[1], b[2], b[3]];
  }

  function unionBounds(items, useVisible) {
    var u = null, i, b;
    for (i = 0; i < items.length; i++) {
      b = boundsOf(items[i], useVisible);
      if (!u) { u = b; continue; }
      if (b[0] < u[0]) u[0] = b[0];
      if (b[1] > u[1]) u[1] = b[1];
      if (b[2] > u[2]) u[2] = b[2];
      if (b[3] < u[3]) u[3] = b[3];
    }
    return u;
  }

  // ref: 0..8, reading order of the 3x3 proxy
  //  0 1 2
  //  3 4 5
  //  6 7 8
  function anchorOf(b, ref) {
    var col = ref % 3, row = Math.floor(ref / 3);
    var w = b[2] - b[0], h = b[1] - b[3];
    return { x: b[0] + (w * col) / 2, y: b[1] - (h * row) / 2 };
  }

  /* ---------- core: scale a set of items about an absolute anchor ---------- */

  function scaleItemsAbout(items, sx, sy, anchor, scaleStrokes) {
    // Scale each item about its own center (robust for any coordinate system),
    // then move it so the overall selection scales about `anchor`.
    // Desired: every point P -> A + (P - A) * s.
    var i, item, before, after, dl, dt, strokePct;
    strokePct = scaleStrokes ? ((Math.abs(sx) + Math.abs(sy)) / 2) * 100 : 100;

    for (i = 0; i < items.length; i++) {
      item = items[i];
      before = item.geometricBounds; // exact, stroke-independent

      item.resize(
        sx * 100, sy * 100,
        true,                 // changePositions
        true,                 // changeFillPatterns
        true,                 // changeFillGradients
        true,                 // changeStrokePattern
        strokePct,            // changeLineWidths (percentage)
        Transformation.CENTER
      );

      after = item.geometricBounds;
      // where the old top-left corner should have landed:
      dl = (anchor.x + (before[0] - anchor.x) * sx) - after[0];
      dt = (anchor.y + (before[1] - anchor.y) * sy) - after[1];
      if (Math.abs(dl) > 1e-6 || Math.abs(dt) > 1e-6) {
        item.translate(dl, dt, true, true, true, true);
      }
    }
  }

  function duplicateAll(items) {
    var out = [], i;
    for (i = 0; i < items.length; i++) out.push(items[i].duplicate());
    return out;
  }

  function select(doc, items) {
    var i;
    try {
      doc.selection = null;
      for (i = 0; i < items.length; i++) items[i].selected = true;
    } catch (e) {}
  }

  /* ---------- public API ---------- */

  var api = {};

  // Current selection readout
  api.info = function (useVisible) {
    try {
      var doc = getDoc();
      if (!doc) return toJSON({ ok: true, hasDoc: false, count: 0 });
      var items = flattenSelection(doc.selection);
      if (items.length === 0) return toJSON({ ok: true, hasDoc: true, count: 0 });
      var b = unionBounds(items, !!useVisible);
      return toJSON({
        ok: true, hasDoc: true, count: items.length,
        w: b[2] - b[0], h: b[1] - b[3],
        left: b[0], top: b[1]
      });
    } catch (e) { return fail(e); }
  };

  /*
   * opts = {
   *   mode: "factor" | "size",
   *   sx, sy            (mode factor)  — plain multipliers
   *   target, axis      (mode size)    — target length in pt; axis "w" | "h" | "long" | "short"
   *   constrain: bool   (size mode: scale other axis proportionally; if false only that axis changes)
   *   ref: 0..8
   *   useVisible: bool  (measure visible bounds — stroke included)
   *   scaleStrokes: bool
   *   duplicate: bool
   * }
   */
  api.scale = function (opts) {
    try {
      var doc = getDoc();
      if (!doc) return fail("No document open.");
      var items = flattenSelection(doc.selection);
      if (items.length === 0) return fail("Nothing selected.");

      var useVisible = !!opts.useVisible;
      var b = unionBounds(items, useVisible);
      var w = b[2] - b[0], h = b[1] - b[3];
      var sx, sy;

      if (opts.mode === "size") {
        var axis = opts.axis || "w";
        var cur;
        if (axis === "w") cur = w;
        else if (axis === "h") cur = h;
        else if (axis === "long") cur = Math.max(w, h);
        else cur = Math.min(w, h);
        if (cur <= 0) return fail("Selection has zero size on that axis.");
        var s = opts.target / cur;
        if (opts.constrain === false && (axis === "w" || axis === "h")) {
          sx = axis === "w" ? s : 1;
          sy = axis === "h" ? s : 1;
        } else {
          sx = s; sy = s;
        }
      } else {
        sx = Number(opts.sx); sy = Number(opts.sy);
      }

      if (!(sx > 0) || !(sy > 0)) return fail("Invalid scale factor.");
      if (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9) {
        return toJSON({ ok: true, noop: true, w: w, h: h });
      }

      var anchor = anchorOf(b, opts.ref || 0);
      var targets = opts.duplicate ? duplicateAll(items) : items;

      scaleItemsAbout(targets, sx, sy, anchor, !!opts.scaleStrokes);
      if (opts.duplicate) select(doc, targets);

      var nb = unionBounds(targets, useVisible);
      app.redraw();
      return toJSON({ ok: true, w: nb[2] - nb[0], h: nb[1] - nb[3], sx: sx, sy: sy });
    } catch (e) { return fail(e); }
  };

  /*
   * Build a Fibonacci sequence of copies from the selection.
   * opts = {
   *   sizes: [pt, pt, ...]   — absolute target lengths for each copy (panel computes them)
   *   axis: "w" | "h" | "long" | "short"
   *   layout: "concentric" | "row" | "column"
   *   gap: pt                — spacing between copies for row/column
   *   ref: 0..8              — anchor for concentric; also alignment edge for row/column
   *   useVisible, scaleStrokes: bool
   *   keepOriginal: bool
   * }
   */
  api.sequence = function (opts) {
    try {
      var doc = getDoc();
      if (!doc) return fail("No document open.");
      var items = flattenSelection(doc.selection);
      if (items.length === 0) return fail("Nothing selected.");
      if (!opts.sizes || opts.sizes.length === 0) return fail("No sizes given.");

      var useVisible = !!opts.useVisible;
      var b = unionBounds(items, useVisible);
      var w = b[2] - b[0], h = b[1] - b[3];
      var axis = opts.axis || "w";
      var cur = axis === "w" ? w : axis === "h" ? h : axis === "long" ? Math.max(w, h) : Math.min(w, h);
      if (cur <= 0) return fail("Selection has zero size.");

      var anchor = anchorOf(b, opts.ref || 0);
      var col = (opts.ref || 0) % 3, row = Math.floor((opts.ref || 0) / 3);
      var made = [], i, copy, s, nb, cursorX = b[0], cursorY = b[1];
      var gap = Number(opts.gap) || 0;
      var layout = opts.layout || "concentric";
      var allNew = [];

      // row/column start: lay the first copy where the original is, then march on.
      for (i = 0; i < opts.sizes.length; i++) {
        s = opts.sizes[i] / cur;
        copy = duplicateAll(items);
        scaleItemsAbout(copy, s, s, anchor, !!opts.scaleStrokes);
        nb = unionBounds(copy, useVisible);

        if (layout === "row" || layout === "column") {
          var dx = 0, dy = 0, cw = nb[2] - nb[0], ch = nb[1] - nb[3];
          if (layout === "row") {
            dx = cursorX - nb[0];
            // vertical alignment follows the proxy row: top / middle / bottom
            if (row === 0) dy = b[1] - nb[1];
            else if (row === 1) dy = (b[1] - h / 2) - (nb[1] - ch / 2);
            else dy = b[3] - nb[3];
            cursorX += cw + gap;
          } else {
            dy = cursorY - nb[1];
            if (col === 0) dx = b[0] - nb[0];
            else if (col === 1) dx = (b[0] + w / 2) - (nb[0] + cw / 2);
            else dx = b[2] - nb[2];
            cursorY -= ch + gap;
          }
          var j;
          for (j = 0; j < copy.length; j++) copy[j].translate(dx, dy, true, true, true, true);
        }
        for (var k = 0; k < copy.length; k++) allNew.push(copy[k]);
        made.push(opts.sizes[i]);
      }

      if (!opts.keepOriginal) {
        for (i = 0; i < items.length; i++) { try { items[i].remove(); } catch (e) {} }
      }
      select(doc, allNew);
      app.redraw();
      return toJSON({ ok: true, made: made.length });
    } catch (e) { return fail(e); }
  };

  // Document unit, so the panel can default to it. Returns one of px|pt|mm|cm|in.
  api.docUnit = function () {
    try {
      var doc = getDoc();
      if (!doc) return toJSON({ ok: true, unit: null });
      var u = String(doc.rulerUnits);
      var map = {
        "RulerUnits.Pixels": "px", "RulerUnits.Points": "pt", "RulerUnits.Millimeters": "mm",
        "RulerUnits.Centimeters": "cm", "RulerUnits.Inches": "in"
      };
      return toJSON({ ok: true, unit: map[u] || "px" });
    } catch (e) { return fail(e); }
  };

  api.phi = PHI;
  return api;
})();
