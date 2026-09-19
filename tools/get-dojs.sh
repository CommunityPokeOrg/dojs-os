#!/bin/sh
# get-dojs.sh — fetch a DOjS release into vendor/dojs/.
#
# The repo already vendors the minimal runtime set needed to run scripts
# (DOJS.EXE + CWSDPMI.EXE + JSBOOT.ZIP + dojs.ini), so you normally do NOT
# need this script. Use it to upgrade the vendored runtime, to pull the
# full release (optional *.DXE modules, examples, docs), or to fetch a
# different upstream version.
#
# Usage:
#   tools/get-dojs.sh                 refresh vendored minimal set (PINNED_VER)
#   tools/get-dojs.sh --full          full release, all files (untracked)
#   tools/get-dojs.sh v1.9.0          specific release tag, minimal set
#   tools/get-dojs.sh v1.9.0 --full   specific tag, full set
#
# After refreshing, `sha256sum -c vendor/dojs/SHA256SUMS` verifies the
# minimal set. A full set cannot be checksum-verified against the repo's
# SHA256SUMS (it only lists the vendored files) but verifies the files
# that are present.

set -e
cd "$(dirname "$0")/.."

PINNED_VER="v1.140"
PINNED_ZIP_SHA256="0a61ec4f843d7ac0aa21364610999acea49a8ee500e7d9e16849f1175ab41e49"
MINIMAL_FILES="dojs.exe CWSDPMI.EXE JSBOOT.ZIP dojs.ini LICENSE"

FULL=0
VER=""
for arg in "$@"; do
	case "$arg" in
		--full) FULL=1 ;;
		*) VER="$arg" ;;
	esac
done
[ -n "$VER" ] || VER="$PINNED_VER"

DEST="vendor/dojs"
mkdir -p "$DEST"

echo "DOjS release: $VER"

# GITHUB_TOKEN/GH_TOKEN is used for the releases API if present (avoids
# the strict anonymous rate limit); the zip download itself is public.
AUTH=""
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
[ -n "$TOKEN" ] && AUTH="Authorization: Bearer $TOKEN"

ASSET=$(curl -fsSL ${AUTH:+-H "$AUTH"} "https://api.github.com/repos/SuperIlu/DOjS/releases/tags/$VER" \
	| sed -n 's/.*"browser_download_url": *"\([^"]*\.zip\)".*/\1/p' | head -1)
[ -n "$ASSET" ] || { echo "no zip asset found for $VER" >&2; exit 1; }
case "$ASSET" in
	*FreeDOS*|*Win32*|*win32*)
		echo "warning: picked '$ASSET' - expected the plain DOS zip" >&2 ;;
esac
echo "downloading $ASSET"
curl -fSL "$ASSET" -o /tmp/dojs-release.zip

if [ "$VER" = "$PINNED_VER" ]; then
	echo "verifying release zip sha256..."
	echo "$PINNED_ZIP_SHA256  /tmp/dojs-release.zip" | sha256sum -c -
fi

if [ "$FULL" = 1 ]; then
	unzip -qo /tmp/dojs-release.zip -d "$DEST"
	echo "full DOjS release unpacked to $DEST"
else
	for f in $MINIMAL_FILES; do
		unzip -qo /tmp/dojs-release.zip -d "$DEST" "$f"
	done
	echo "minimal DOjS runtime unpacked to $DEST"
fi
rm -f /tmp/dojs-release.zip

if [ -f "$DEST/SHA256SUMS" ] && [ "$VER" = "$PINNED_VER" ]; then
	(cd "$DEST" && sha256sum -c SHA256SUMS)
fi

echo "done. DOJS.EXE: $DEST/dojs.exe"
