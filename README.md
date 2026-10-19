# Golden Scale — Fibonacci / φ scaling panel for Adobe Illustrator

A dockable panel that works like the Transform panel, but every control snaps to the
Fibonacci sequence (1, 2, 3, 5, 8, 13, 21, 34, 55, 89…) or to the golden ratio φ (1.618…).
Pick a reference point, click a number, done — no more typing digits.

Works in Illustrator CC 2019 and newer on macOS and Windows.

---

## Install

### macOS
1. Unzip.
2. Double-click **Install Golden Scale (Mac).command**.
   If macOS says it can't open it: right-click → **Open** → **Open** (first time only).
   See **What the installer changes** below before you run it.
3. Quit and reopen Illustrator.
4. **Window → Extensions → Golden Scale**. Dock it wherever you keep Transform.

### Windows
1. Unzip.
2. Double-click **Install Golden Scale (Windows).bat**.
3. Restart Illustrator → **Window → Extensions → Golden Scale**.

### Manual install (if you prefer)
Copy the `GoldenScale` folder to:
- macOS: `~/Library/Application Support/Adobe/CEP/extensions/GoldenScale`
- Windows: `%APPDATA%\Adobe\CEP\extensions\GoldenScale`

Then allow unsigned panels:
- macOS (Terminal): `for v in 9 10 11 12 13 14; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done`
- Windows: in `HKEY_CURRENT_USER\Software\Adobe\CSXS.12` (and .11, .13…) add a String value `PlayerDebugMode` = `1`

### What the installer changes
Golden Scale is a free, home-made panel, so it isn't signed through Adobe. To make Illustrator load it, the installer:

- copies the `GoldenScale` folder into your user's Adobe CEP extensions folder (no admin password);
- turns on Adobe's **PlayerDebugMode** setting (CSXS 9–14), which lets Illustrator load unsigned panels. It's a per-user preference and applies to every unsigned panel, not only this one;
- on macOS, removes the download-quarantine flag from the copied folder so Gatekeeper doesn't block it.

It doesn't connect to the internet, collect data, or need admin rights.

### Uninstall
Run **Uninstall Golden Scale (Mac).command** or **Uninstall Golden Scale (Windows).bat**, or delete the `GoldenScale` folder from the path above. The uninstallers leave PlayerDebugMode on because other panels may need it; to turn it off on macOS, run `for v in 9 10 11 12 13 14; do defaults delete com.adobe.CSXS.$v PlayerDebugMode; done`.

---

## Using it

**Readout (top)** — live W × H of your selection in your chosen unit, how many objects are selected,
whether the current size *is* a Fibonacci number (✓) or which one is nearest, and a φ ✓ when the
selection already is a golden rectangle.

**Reference point** — the 3×3 proxy, same as the Transform panel. Scaling happens from that point
(for multiple selected objects it's the point on their combined bounding box, and their relative
positions are preserved).

**Apply to** — which measurement the numbers refer to: Width, Height, the Longer side, or the
Shorter side. The lock toggle constrains proportions (on) or scales only that axis (off).

**1 unit = …** — a base multiplier and unit. With `1 unit = 10 px`, the chips become 10, 20, 30,
50, 80, 130… (the real value is printed under each chip). Units: px, pt, mm, cm, in. The unit
defaults to your document's ruler unit the first time it opens.

**Fibonacci chips** — click a number to set the chosen side to exactly that many units.
**⌥ / Alt-click** any chip (or any button) to duplicate first, then scale the copy.

**Step**
- `◀ Fib` / `Fib ▶` — snap to the previous / next Fibonacci size (the hint shows where you'll land).
- `÷ φ` / `× φ` — scale by 0.618 / 1.618.
- `÷ φ²` / `× φ²` — scale by 0.382 / 2.618 (two golden steps at once).

**Golden rectangle** — turn the selection into a true φ rectangle. Choose landscape ▭ or
portrait ▯ and which side to keep; the other side is recalculated, anchored at your reference point.

**Sequence builder** — from one object, build the next N sizes of the sequence as copies:
- *Grow* or *Shrink* from the object's current (nearest-Fib) size; the hint lists the sizes.
- *Concentric* stacks them on the reference point (great for Fibonacci circles / nested marks).
- *Row* / *Column* lays them out side by side with a gap; the reference point sets the alignment
  edge (top / middle / bottom for rows, left / center / right for columns).
- *Keep original* leaves your source object in place.

**Options**
- *Duplicate instead of transform* — every action leaves the original and works on a copy.
- *Scale strokes & effects* — same as Illustrator's preference, but per panel.
- *Measure with stroke* — use visible bounds (stroke included) instead of path geometry.
- *Live readout* — polls the selection ~every 0.7 s; turn off if you want zero background work.

Every action is a normal Illustrator transform, so **⌘Z undoes it**.

---

## Troubleshooting

- **Panel isn't in Window → Extensions** — PlayerDebugMode didn't take. Re-run the installer,
  make sure Illustrator was fully quit, and check the folder actually exists at the path above.
- **Panel opens blank/white** — the folder was copied without the `CSXS/manifest.xml` inside, or
  the extension was installed into `Adobe/CEP/extensions` of a different user.
- **"Illustrator could not run the script"** — usually no document is open or the selection is in
  text-editing mode. Press Esc and select the objects with the Selection tool.

## Files

```
LICENSE             — MIT license
GoldenScale/
  CSXS/manifest.xml   — panel definition (ILST, CEP 9+)
  index.html          — the panel
  css/panel.css
  js/panel.js         — UI + unit math + Fibonacci logic
  js/CSInterface.js   — Adobe's bridge library (unmodified)
  jsx/host.jsx        — the Illustrator-side ExtendScript that does the transforms
  icons/              — panel tab icons
```

## License

MIT © 2026 Jose R. Ortiz / JRO Design. Free to use, change and share. See `LICENSE`.

`GoldenScale/js/CSInterface.js` is Adobe's CEP library, included unmodified under Adobe's own terms. It isn't covered by the MIT license.
