# dojs-os

A window manager, desktop environment, and app runtime for
[DOjS](https://github.com/SuperIlu/DOjS) — the JavaScript runtime for
MS-DOS / FreeDOS — plus an **Apps SDK** so third-party JS apps can run
windowed on top of it.

Full design notes: [docs/architecture.md](docs/architecture.md)

## What you get

- **Kernel**: app registry, cooperative processes, timers, event pump,
  app lifecycle (`spawn`/`kill`/last-window-closed reaping).
- **Window manager**: draggable windows with title bars and close
  widgets, focus/z-order, offscreen per-window rendering (DOjS has no
  clip region, so clients draw to their own `Bitmap` and the WM blits).
- **Shell**: wallpaper, taskbar with per-window buttons + clock, and a
  start menu that launches registered apps and can shut down the OS.
- **Apps SDK** (`sdk/`): `Surface` drawing API, typed input events,
  path/file helpers, `Window`, an `App` base class, and basic widgets
  (Label/Button/TextField/ListBox).
- **Sample apps**: `term` (terminal + shell), `dosprompt` (DOS prompt
  with real .EXE/.COM/.BAT execution), `files` (file manager),
  `editor` (text editor), `calc` (calculator), `sysinfo` (system info).

## Quick start — headless (no DOS required)

```sh
node tests/run-tests.js     # unit + integration tests on a Node shim
node host/run.js            # boots the whole OS, scripted input
node host/run.js --shot out.ppm   # ...and dumps a framebuffer screenshot
```

## Quick start — DOSBox-X / real DOS

The minimal DOjS runtime (`DOJS.EXE` v1.14.0 + `CWSDPMI.EXE` +
`JSBOOT.ZIP`, from the official upstream release) is vendored in
`vendor/dojs/` — no download needed:

```sh
tools/build-zip.sh          # package dojs-os -> dist/DOJSOS.ZIP
dosbox-x -conf dosbox/dosbox-x.conf
```

That's it: DOSBox-X mounts `vendor/dojs` as `C:` and `dist` as `D:`,
then `RUN.BAT` launches `C:\DOJS.EXE -w 640,480 -b 32 -r D:\DOJSOS.ZIP`.
Try the **DOS Prompt** app from the start menu for a COMMAND.COM-style
prompt that can `run` real `.EXE`/`.COM`/`.BAT` programs.

To upgrade/replace the vendored runtime or fetch the full upstream
release (optional `*.DXE` modules, examples, docs):

```sh
tools/get-dojs.sh           # refresh vendored set, checksum-verified
tools/get-dojs.sh --full    # everything (stays untracked)
```

Provenance + checksums: `vendor/dojs/README.TXT` and
`vendor/dojs/SHA256SUMS`. Details and manual DOS instructions:
[dosbox/README.md](dosbox/README.md).

## Writing an app

```js
var appmod = Require('sdk/app');

function MyApp(api) { appmod.App.call(this, api); }
MyApp.prototype = Object.create(appmod.App.prototype);
MyApp.prototype.constructor = MyApp;

MyApp.prototype.onStart = function () {
	this.win = this.createWindow({ title: 'Mine', width: 200, height: 120 });
};
MyApp.prototype.onDraw = function (win, g) {
	g.clear(this.api.theme.winClient);
	g.text(8, 8, 'hello dos', EGA.WHITE, NO_COLOR);
};
MyApp.prototype.onEvent = function (win, ev) {
	if (ev.type === 'keydown' && ev.scan === this.api.events.SCAN.ESC) {
		this.api.kernel.exit();
	}
};

exports.create = function (api) { return new MyApp(api); };
```

Register it in `os/boot.js` `BUILTIN_APPS` (or drop a module anywhere and
`kernel.spawn` it / `run name` from the terminal). The `api` bundle covers
windowing, events, rendering, lifecycle, file I/O, and external program
execution (`api.dos` — see [sdk/dos.js](sdk/dos.js)) — see
[sdk/app.js](sdk/app.js) for the full reference.

## DOS Prompt: running real DOS programs

The **DOS Prompt** app (`dosprompt`) is a COMMAND.COM-flavored windowed
prompt. Built-ins (`dir`, `cd`, `cls`, `echo`, `type`, `ver`, `path`,
`set`, `history`, `where`, `run`, `exec`, `exit`) run in-process;
anything else resolves to a `.COM`/`.EXE`/`.BAT` via cwd + `PATH`
(COMMAND.COM extension order) and launches through DOjS's
`System(cmd, flags)` — libc `system()`, i.e. `COMMAND.COM /c` on DOS.

```js
var res = api.dos.exec(api.fs, {
	program: 'edit', args: ['readme.txt'], cwd: 'C:/'
});
// res: {status:'done', code:0, command:'C:/DOS/EDIT.EXE readme.txt', resolved:...}
// or {status:'notfound'|'badargs'|'unsupported'|'failed', reason:...}
```

Details and the lifecycle state machine (`idle → launching → running →
done/failed → idle`, surfaced via `ExecTracker`) are in
[docs/architecture.md](docs/architecture.md).

### Exec limitations & security notes

- **Blocking/foreground only**: `system()` suspends the whole VM until
  the child exits; the desktop freezes while a program runs. That's the
  DOS model — there is no background exec.
- **Graphics mode stays set**: DOjS has no text-mode switch; text-mode
  programs write to the VGA text buffer while the card is in graphics
  mode, so their output is **not visible** on screen during the run.
  External exec is most useful for non-interactive tools / batch files.
  The subsystem flags (`dos.FLAGS.{MOUSE,SOUND,JOYSTICK,KEYBOARD,TIMER}`,
  default `KEYBOARD|TIMER|MOUSE`) de/re-init drivers around the call.
- **No sandbox**: a launched program is a real DOS process — it can do
  anything DOS allows (format disks, TSRs, reboot). This is a DOS shell,
  not a jail. The shim host sandbox only applies to *host-side tests*.
- **Argument safety**: `dos.quoteArg` rejects `<>|&%`, newlines, and
  embedded quotes rather than trying to escape them (DOS/COMMAND.COM has
  no reliable escaping). Resolution and quoting happen before any string
  reaches `System()`.
- **Platform gate**: on the Linux DOjS port or without `System()`,
  `dos.execAvailable()` is false and exec returns
  `{status:'unsupported'}`; the prompt reports it instead of crashing.
- **Verifying on DOS**: build `DOJSOS.ZIP`, run under DOSBox-X
  (`dosbox/README.md`), open DOS Prompt, and try e.g. `C:\DOJS.EXE`-side
  tools or a small .BAT you place on the mounted drive. `system()` needs
  `COMMAND.COM` reachable (`COMSPEC`); DOSBox provides it.

## Constraints & limitations

- **Language**: DOjS embeds **MuJS 1.0.5 — ES5.1**, not ES6. Write
  `var`/`function`/prototypes; no `let`/`const`, classes, arrow
  functions, or template literals. (The original request asked for ES6;
  the upstream engine doesn't have it.)
- **Video**: DOjS only supports **640x480 or 320x240**, 8–32bpp; alpha
  needs ≥24bpp. Everything is sized from `SizeX()/SizeY()` + `theme.js`.
- **No clipping** in DOjS graphics → each window owns an offscreen
  `Bitmap`; the WM composits. This is the main design consequence.
- **Cooperative, single-threaded**: apps get `onTick`/`onEvent`/`onDraw`
  callbacks; no preemption, no worker threads.
- **Text**: the built-in bitmap font is ~6px/char; widget metrics assume
  it. Bitmap `Font` files can be used per app.
- **Host shim is a harness, not an emulator**: it implements just the
  DOjS surface this repo uses, with DOS paths sandboxed to a host dir and
  a PPM screenshot output. Behavioral fidelity beyond that (real VESA
  timing, real File semantics, sound, IPX) is untested — verify on DOSBox
  or real DOS for anything sensitive.
- Terminal file commands operate on the DOjS filesystem view (drives,
  cwd), not a virtual FS.

## Repo map

See [docs/architecture.md](docs/architecture.md) for the full breakdown.

```
MAIN.JS      entry point        host/    Node shim + headless runner
os/          kernel, wm, theme  tests/   host test suite
shell/       desktop shell      tools/   packaging + DOjS fetch + test
sdk/         apps SDK           dosbox/  DOSBox-X config + RUN.BAT
apps/        sample apps        docs/    architecture
```
