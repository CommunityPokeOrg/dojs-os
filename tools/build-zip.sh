#!/bin/sh
# build-zip.sh — package dojs-os into a ZIP that DOjS can boot.
#
# DOjS loader semantics (src/DOjS.c, jsboot/func.js in v1.14.0):
#  * `DOJS.EXE -r DOJSOS.ZIP` runs DOJSOS.ZIP=MAIN.JS *and* treats
#    DOJSOS.ZIP as the JSBOOT archive: the standard library is loaded
#    from DOJSOS.ZIP=JSBOOT/<name>.js — so this zip MUST embed the full
#    upstream jsboot/ tree or Require/Println/etc. are never defined.
#  * Require(name) then resolves, in order:
#      name / name.js                      (CWD, plain filesystem)
#      DOJSOS.ZIP=JSBOOT/name(.js)         (inside this zip)
#      JSBOOT/name(.js)                    (unpacked JSBOOT dir, CWD)
#      DOJSOS.ZIP=PACKAGE/name.js          (dpm-installed packages)
#    so all dojs-os modules live under jsboot/ inside the archive and
#    keep their Require('os/boot') / Require('sdk/...') names unchanged.
#
# Usage: tools/build-zip.sh [out.zip]   (default dist/DOJSOS.ZIP)

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

OUT="${1:-dist/DOJSOS.ZIP}"
JSBOOT="vendor/dojs/JSBOOT.ZIP"
mkdir -p "$(dirname "$OUT")"

[ -f "$JSBOOT" ] || { echo "$JSBOOT missing — see vendor/dojs/README.TXT" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/pkg"
cp MAIN.JS "$TMP/pkg/MAIN.JS"

# upstream DOjS standard library (jsboot/func.js, color.js, fonts/, ...)
unzip -qo "$JSBOOT" -d "$TMP/pkg"

# dojs-os modules under jsboot/ so Require('os/boot') etc. resolve
# inside the archive
mkdir -p "$TMP/pkg/jsboot"
cp -r os sdk shell apps "$TMP/pkg/jsboot/"

( cd "$TMP/pkg" && zip -qr "$ROOT/$OUT" . )

# DOS launcher for the packaged layout (mount/cwd must contain the zip):
#   RUN.BAT sits next to DOJSOS.ZIP in dist/ so `call RUN.BAT` on a D:
#  mounted there works.
cat > "$(dirname "$OUT")/RUN.BAT" <<'EOF'
@echo off
rem Packaged dojs-os launcher. Run with the dir containing DOJSOS.ZIP
rem as the current drive, DOJS.EXE reachable via PATH or absolute path.
rem Adjust C:\DOJS.EXE if your DOjS runtime lives elsewhere.
if not exist DOJSOS.ZIP goto nozip
C:\DOJS.EXE -r -w 640,480 -b 32 DOJSOS.ZIP
goto end
:nozip
echo DOJSOS.ZIP not found - run tools\build-zip.sh first.
:end
EOF

echo "built $OUT"
zipinfo -1 "$OUT" | head -40
