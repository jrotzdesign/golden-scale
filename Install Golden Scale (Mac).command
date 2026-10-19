#!/bin/bash
# Installs the Golden Scale panel for Adobe Illustrator (macOS).
set -e
cd "$(dirname "$0")"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/GoldenScale"

echo "→ Installing Golden Scale to:"
echo "  $DEST"
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "./GoldenScale" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

# Unsigned (home-made) panels need PlayerDebugMode on. Set it for every CEP version
# Illustrator 2019 → current might be using.
echo "→ Enabling unsigned extensions (PlayerDebugMode) for CEP 9–14"
for v in 9 10 11 12 13 14; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done
killall cfprefsd 2>/dev/null || true

echo
echo "✓ Done. Quit and reopen Illustrator, then open:"
echo "  Window → Extensions → Golden Scale"
echo
read -n 1 -s -r -p "Press any key to close…"
echo
