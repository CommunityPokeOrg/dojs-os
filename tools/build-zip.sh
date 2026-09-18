#!/bin/sh
# build-zip.sh — package dojs-os into a ZIP that DOjS can boot.
#
# DOjS resolves scripts inside a ZIP via  name.js / JSBOOT/name.js, so the
# archive layout is just the module tree at the zip root, with MAIN.JS as
# the entry point (DOJS.EXE -r DOJSOS.ZIP, or rename DOJS.EXE -> DOJSOS.EXE
# and it auto-runs DOJSOS.ZIP=MAIN.JS).
#
# Usage: tools/build-zip.sh [out.zip]   (default dist/DOJSOS.ZIP)

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

OUT="${1:-dist/DOJSOS.ZIP}"
mkdir -p "$(dirname "$OUT")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/pkg"
cp MAIN.JS "$TMP/pkg/MAIN.JS"
cp -r os sdk shell apps "$TMP/pkg/"

( cd "$TMP/pkg" && zip -qr "$ROOT/$OUT" . )

echo "built $OUT"
zipinfo -1 "$OUT" | head -40
