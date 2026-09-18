#!/bin/sh
# get-dojs.sh — fetch a DOjS release (DOJS.EXE + support files) for DOS/DOSBox.
#
# DOjS releases ship as dojs-vX.Y.Z-dos.zip on GitHub. This script downloads
# the latest (or a pinned) release and unpacks it into vendor/dojs/.
#
# Usage: tools/get-dojs.sh [version]     e.g. tools/get-dojs.sh v1.12.0

set -e
cd "$(dirname "$0")/.."

VER="${1:-}"
DEST="vendor/dojs"
mkdir -p "$DEST"

if [ -z "$VER" ]; then
	echo "Resolving latest DOjS release..."
	VER=$(curl -fsSL https://api.github.com/repos/SuperIlu/DOjS/releases/latest \
		| sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)
fi
[ -n "$VER" ] || { echo "could not resolve release tag" >&2; exit 1; }
echo "DOjS release: $VER"

# asset names look like dojs-v1.12.0.zip — pick the first .zip asset
ASSET=$(curl -fsSL "https://api.github.com/repos/SuperIlu/DOjS/releases/tags/$VER" \
	| sed -n 's/.*"browser_download_url": *"\([^"]*\.zip\)".*/\1/p' | head -1)
[ -n "$ASSET" ] || { echo "no zip asset found for $VER" >&2; exit 1; }
echo "downloading $ASSET"
curl -fSL "$ASSET" -o /tmp/dojs-release.zip

unzip -qo /tmp/dojs-release.zip -d "$DEST"
rm -f /tmp/dojs-release.zip
echo "DOjS unpacked to $DEST"
find "$DEST" -name '*.EXE' -o -name '*.exe' | head
