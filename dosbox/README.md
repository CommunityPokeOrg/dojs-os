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
tools/build-zip.sh           # writes dist/DOJSOS.ZIP
```

The zip contains `MAIN.JS` at the root plus the `os/`, `sdk/`, `shell/`
and `apps/` module trees — DOjS resolves `Require('os/boot')` inside the
zip automatically.

## 3. Run in DOSBox-X

```sh
dosbox-x -conf dosbox/dosbox-x.conf
```

The config mounts `vendor/dojs` as `C:` and `dist` as `D:`, then runs
`RUN.BAT`, which executes:

```bat
C:\DOJS.EXE -w 640,480 -b 32 -r D:\DOJSOS.ZIP
```

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
