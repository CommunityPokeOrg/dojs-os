# Running dojs-os in DOSBox-X / DOSBox / real DOS

`dojs-os` runs on top of [DOjS](https://github.com/SuperIlu/DOjS), a
JavaScript runtime for MS-DOS/FreeDOS. You need a DOjS binary (`DOJS.EXE`)
and a packaged `DOJSOS.ZIP`.

## 1. Get DOjS

```sh
tools/get-dojs.sh            # downloads latest release into vendor/dojs/
tools/get-dojs.sh v1.12.0    # or pin a version
```

Or download a release zip manually from
https://github.com/SuperIlu/DOjS/releases and unpack it into `vendor/dojs/`
so that `vendor/dojs/DOJS.EXE` exists.

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

## 4. Controls

- Mouse: move windows, click widgets, taskbar, start menu ("dojs" button).
- ESC: close the start menu. (DOjS's default ESC-quits-app is disabled by
  dojs-os; use Start → "Shut down" to exit, or `exit`/`shutdown` in the
  terminal.)
- Window X button closes an app; Alt keys etc. pass to the focused app.

## Headless alternative (no DOS)

`node host/run.js --frames 60 --shot out.ppm` boots the whole OS on a Node
shim and writes a PPM screenshot — handy for CI smoke tests.
