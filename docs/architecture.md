# dojs-os architecture

A small desktop environment / window manager / app runtime written for
[DOjS](https://github.com/SuperIlu/DOjS) — a JavaScript engine + Allegro-style
graphics + file/network APIs that runs on MS-DOS/FreeDOS.

Everything is plain ES5.1 JavaScript (DOjS embeds MuJS 1.0.5 — `var`,
`function`, prototype inheritance only; **no** `let`/`const`/classes/arrow
functions/template literals). Modules use DOjS's `Require(name)` which
returns `module.exports`.

## Layout

```
MAIN.JS            DOjS entry point (Setup/Loop/Input)
os/
  boot.js          wiring: creates kernel + WM + shell, registers apps
  kernel.js        processes, timers, event pump, app API bundle
  wm.js            window manager / compositor / input router
  theme.js         palette + metrics shared by WM, shell and apps
shell/
  desktop.js       desktop wallpaper, taskbar, start menu, launcher
sdk/
  gfx.js           Surface: drawing API over DOjS primitives
  events.js        EventPump: raw DOjS events -> typed UI events
  fs.js            path + file helpers over DOjS File/List/Stat/...
  dos.js           external exec facade over DOjS System(): parsing,
                   quoting, exe resolution (cwd+PATH, COM/EXE/BAT),
                   launch-request construction, ExecTracker lifecycle
  window.js        Window: per-window offscreen Bitmap + geometry
  app.js           App base class; documents the `api` bundle
  ui.js            widgets: Label, Button, TextField, ListBox, WidgetSet
apps/
  term.js          terminal + a small shell (ls/cd/cat/run/exit/...)
  dosprompt.js     DOS Prompt: COMMAND.COM-style prompt that execs real
                   .EXE/.COM/.BAT via System(); ExecTracker state line
  files.js         file manager (browse, open in editor, mkdir, delete)
  editor.js        text editor (open/save/new, cursor, scroll)
  calc.js          calculator (button pad + expression evaluator)
  sysinfo.js       system information panel
host/
  shim.js          Node implementation of the DOjS API surface
  run.js           headless boot + scripted input + PPM screenshot
tests/             dependency-free host tests (node tests/run-tests.js)
tools/             build-zip.sh, get-dojs.sh, test-host.sh
dosbox/            dosbox-x.conf, RUN.BAT, instructions
```

## Runtime model

DOjS drives a single-threaded loop: `Setup()` once, `Loop()` per frame,
`Input(event)` per hardware event. dojs-os maps that onto:

- **Kernel** (`os/kernel.js`) owns the app registry, process table,
  timers (`setTimeout`/`setInterval` in API terms), and the tick. Each
  `tick()` drains the `EventPump` into the WM, fires due timers, redraws
  dirty windows, and composites the screen.
- **Processes** are cooperative: a `proc` record {pid, name, app, args}.
  `kernel.spawn(name)` loads `def.path` via `Require`, calls
  `mod.create(api)`, runs `app.onStart()`. Closing a process's last
  window kills it. `singleton` apps reuse the running process.
- **WM** (`os/wm.js`) tracks z-order, focus, window geometry zones
  (close widget / title bar / client), title-drag, and routing. Keys go
  to the focused window's app; the shell gets first refusal on events in
  its layers (taskbar strip, open menu).
- **Compositing**: DOjS has no clipping API, so each `Window` renders to
  its own offscreen `Bitmap` (`Surface` wraps it); the WM draws chrome
  (frame bevel, title bar, close box) then `bitmap.Draw()`s the client
  area. `SetRenderBitmap(bm)` retargets all drawing calls.
- **Shell** (`shell/desktop.js`) draws the desktop, taskbar (start
  button, per-window buttons, uptime clock) and the start menu, and
  launches apps via `kernel.spawn`.

## App SDK

Apps export `create(api)` returning an object with optional hooks:

```
create(api)      -> app instance (usually `new MyApp(api)` / App subclass)
onStart()        create windows via this.createWindow({title,width,height})
onDraw(win, g)   repaint client area (g is a Surface)
onEvent(win, ev) typed event: mousedown/mouseup/mousemove/click/dblclick/keydown
onClose(win)     return false to veto closing
onTick()         per-frame hook (optional)
```

`api` bundle: `{wm, kernel, gfx.Surface, ui, fs, dos,
events.{SCAN,BTN,keys}, theme, Window}` — see `sdk/app.js` for the
documented shape. `api.fs` is the file-I/O surface
(`readText/writeText/list/stat/mkdir/rename/remove`); `api.dos` is the
external-exec surface described next.

## External execution (sdk/dos.js)

DOjS's only exec primitive is `System(cmd, flags)` — libc `system()`,
which on DOS is `COMMAND.COM /c <cmd>` and returns the child's exit code.
`flags` is a bitmask of `dos.FLAGS.{MOUSE,SOUND,JOYSTICK,KEYBOARD,TIMER}`
selecting which Allegro subsystems get de-initialized before and
re-initialized after the call (default `KEYBOARD|TIMER|MOUSE`, so
text-mode children get input).

`api.dos` layers on top:

```
parseLine(line)            -> {argv, error}        quotes-aware splitter
quoteArg(arg)              -> quoted string | null (rejects <>|&% \n ")
resolve(fs, name, opts)    -> path | null          cwd, then PATH dirs,
                             trying .COM/.EXE/.BAT in COMMAND.COM order
request(fs, spec)          -> {status, command, resolved, flags}
exec(fs, spec)             -> {status:'done', code,...} | error result
ExecTracker                -> lifecycle state machine for UIs
```

Statuses: `ready` (constructed), `done`, `notfound`, `badargs`,
`unsupported` (no System backend — Linux DOjS port / host without mock),
`failed` (System threw). `ExecTracker.exec` walks
`idle -> launching -> running -> done/failed -> idle` and records history,
so the DOS Prompt app can paint a state line around the blocking call.

The DOS Prompt app's `DosShell` is graphics-free and returns output
lines ('\x0c' = clear, '\x04' = close), like term's `Shell` — host tests
drive it directly with a mocked `System()`.

Events are screen coordinates translated to client coordinates before
delivery — apps only see their own client area.

## Host shim (`host/`)

`shim.js` implements the DOjS API in Node: framebuffer (`Plot`, `Line`,
`FilledBox`, `TextXY`, `SetRenderBitmap`, `Bitmap`, `Font`…), file I/O
sandboxed under a host directory (`C:/x` → `<sandbox>/x`), `Require`
with DOjS's search paths, `MsecTime`, `Stop`, EGA palette, `KEY.Code`
scancodes, `File`/`List`/`Stat`, and a PPM screenshot dumper.
`run.js` boots the OS headlessly, injects scripted input, and writes a
screenshot — the tests use the same shim.

## DOjS constraints this design respects

- **MuJS = ES5.1**, not ES6: everything uses `var`/`function`/prototypes.
- **Screen modes**: 640x480 or 320x240, 8–32bpp. The layout is written
  against `SizeX()/SizeY()` and `theme.js` metrics, so 320x240 works
  (taskbar and windows shrink accordingly; apps should size from
  `api.theme` + `win.width/height`).
- **No clipping**: per-window offscreen bitmaps; apps never draw outside
  their client area because they only see client coordinates.
- **No multitasking**: cooperative — `Loop()` ticks the kernel; apps must
  not block. Long work should be chunked via `api.kernel.setTimeout`.
- **Text**: built-in `TextXY` bitmap font (~6px/char); `sdk/ui` widget
  metrics assume it. Optional `Font` (.fnt) files can be loaded per app.
- **File paths**: DOS-style, drive-relative (`C:/...`, cwd-relative);
  `sdk/fs` normalizes `/` separators and `.`/`..`.

## Testing

```sh
node tests/run-tests.js   # 40+ checks: kernel, WM, events, fs, gfx, apps
node host/run.js          # boots the whole OS headlessly
```

The shim is deliberately strict: unimplemented DOjS calls throw, so a
green test run means only exercised code paths were validated — real-DOS
verification still needs DOSBox + a DOjS binary (see `dosbox/README.md`).
