# Running dojs-os in DOSBox-X / DOSBox / real DOS

`dojs-os` runs on top of [DOjS](https://github.com/SuperIlu/DOjS), a
JavaScript runtime for MS-DOS/FreeDOS. You need a DOjS binary (`DOJS.EXE`)
and a packaged `DOJSOS.ZIP`.

## 1. Get DOjS — already done

The minimal runtime (DOJS.EXE v1.14.0, CWSDPMI.EXE, JSBOOT.ZIP, dojs.ini)
is committed under `vendor/dojs/` — skip this step.

Optional: `tools/get-dojs.sh` refreshes it (checksum-verified),
`tools/get-dojs.sh --full` fetches the complete upstream release
(optional `*.DXE` modules like png/jpeg/sqlite, examples, docs), and
`tools/get-dojs.sh vX.Y.Z` pins a different version. Verify integrity
with `cd vendor/dojs && sha256sum -c SHA256SUMS`; provenance is in
`vendor/dojs/README.TXT`.

## 2. Package dojs-os

```sh
tools/build-zip.sh           # writes dist/DOJSOS.ZIP + dist/RUN.BAT
```

DOjS loader semantics (verified against DOjS v1.14.0 `src/DOjS.c` and
`jsboot/func.js`) drive the zip layout:

- `DOJS.EXE -r FOO.ZIP` runs `FOO.ZIP=MAIN.JS` **and** makes `FOO.ZIP`
  the jsboot archive: the standard library is loaded from
  `FOO.ZIP=JSBOOT/<name>.js`. A zip without `jsboot/` boots with no
  `Require`, no `Println`, nothing — `ReferenceError: 'Require' is not
  defined`. So `DOJSOS.ZIP` embeds the full vendored `JSBOOT.ZIP`
  contents plus our modules under `jsboot/`:
  `MAIN.JS`, `jsboot/func.js`, ..., `jsboot/os/boot.js`,
  `jsboot/sdk/*.js`, `jsboot/shell/*.js`, `jsboot/apps/*.js`.
- `Require(name)` then tries, in order: `name`/`name.js` in the current
  directory on disk, `<script zip>=JSBOOT/name(.js)`, an unpacked
  `JSBOOT/` dir in the current directory, then
  `<script zip>=PACKAGE/name.js`. Zip entry lookup is case-insensitive.

## 3. Run in DOSBox-X

```sh
dosbox-x -conf dosbox/dosbox-x.conf
```

The config mounts `vendor/dojs` as `C:` and `dist` as `D:`, then runs
`RUN.BAT`, which executes:

```bat
C:\DOJS.EXE -r -w 640,480 -b 32 DOJSOS.ZIP
```

## 3a. Live debugging — unzipped source mount

```sh
dosbox-x -conf dosbox/dosbox-x-dev.conf
```

Mounts `vendor/dojs` as `C:` and **the repo root as `D:`**, then calls
`D:\RUN.BAT`. Running a plain `MAIN.JS` does NOT go through the script
zip path, so DOjS looks for its stdlib as `JSBOOT.ZIP` (or an unpacked
`JSBOOT\` dir) **in the current directory** — `RUN.BAT` copies
`C:\JSBOOT.ZIP` into the repo root on first run (untracked, gitignored).
`Require('os/boot')` then resolves `D:\OS\BOOT.JS` off the host source
tree.

Iterate: edit any `.js` on the host → inside DOSBox-X exit DOjS
(Start → Shut down, or `exit` in DOS Prompt) → run `RUN.BAT` again.
No zip rebuild; files are re-read from the mounted tree each launch.

If you ever see `ReferenceError: 'Require' is not defined`, the current
directory lacks `JSBOOT.ZIP`/`JSBOOT\` — that is the jsboot-load
failure, not a code error.

Plain DOSBox works too — adjust `machine`/`vmemsize` as needed, DOjS needs
VESA for >8bpp modes. On real hardware / FreeDOS, copy the zip next to
`DOJS.EXE` and run `DOJS.EXE -r DOJSOS.ZIP` (or rename `DOJS.EXE` to
`DOJSOS.EXE` and it auto-runs the same-named zip).

## 4. Verifying the DOS Prompt app

The DOS Prompt window launches real DOS executables via DOjS
`System()` (= `COMMAND.COM /c`). To exercise it under DOSBox-X:

1. Put something runnable on the mounted drives, e.g. create
   `dist\BIN\HELLO.BAT` containing `@ECHO HELLO FROM DOS`.
2. Boot dojs-os, open the **DOS Prompt** app (start menu or
   `run dosprompt` in the Terminal).
3. `cd D:\BIN` then `hello` — the batch runs through COMMAND.COM and the
   prompt prints `[exit 0] D:\BIN\HELLO.BAT`.
4. `path C:\;D:\BIN` adds dirs to the search path; `where hello` shows
   resolution; `set`/`echo %` etc. behave like COMMAND.COM built-ins.

Caveats on real DOS: `System()` blocks the whole VM while the child runs
(foreground only, no multitasking), the graphics mode is NOT switched so
interactive text-mode programs can't display — best for batch files and
non-interactive tools — and there is no sandbox: launched programs run
with full DOS privileges. `System()` needs `COMMAND.COM` on `COMSPEC`
(DOSBox-X provides this automatically).

## 5. Controls

- Mouse: move windows, click widgets, taskbar, start menu ("dojs" button).
- ESC: close the start menu. (DOjS's default ESC-quits-app is disabled by
  dojs-os; use Start → "Shut down" to exit, or `exit`/`shutdown` in the
  terminal.)
- Window X button closes an app; Alt keys etc. pass to the focused app.

## Headless alternative (no DOS)

`node host/run.js --frames 60 --shot out.ppm` boots the whole OS on a Node
shim and writes a PPM screenshot — handy for CI smoke tests.
