# DOjS OS — DOSBox-X Runner (VS Code extension)

Launch / restart / stop **dojs-os** under [DOSBox-X](https://dosbox-x.com/)
straight from VS Code, with DOSBox-X stdout/stderr and `JSLOG.TXT` streamed
into an **Output** channel. Designed for the edit-and-rerun dev loop:
edit `.js` sources on the host, restart, see the log — no zip rebuild needed
in dev mode.

## Install

The packaged extension lives at `tools/vscode-dojs/dist/dojs-os-dosbox-<ver>.vsix`
in this repository:

```sh
code --install-extension tools/vscode-dojs/dist/dojs-os-dosbox-0.1.0.vsix
```

Requires the `dosbox-x` binary on `PATH` (or set `dojs.dosboxXPath`).

## Commands

| Command | Effect |
|---|---|
| `DOjS: Launch in DOSBox-X` | Build spec → (packaged mode: rebuild zip) → spawn DOSBox-X |
| `DOjS: Restart in DOSBox-X` | Stop any running instance, then launch |
| `DOjS: Stop DOSBox-X` | SIGTERM, SIGKILL after 2 s grace |

A status-bar item shows `▶ DOjS` / `DOjS running` and doubles as a
launch/stop button.

## How it launches

With `dojs.configPath` empty (default) the extension generates a DOSBox-X
config in its global storage dir — mounts and autoexec mirror the repo's
checked-in `dosbox/dosbox-x-dev.conf` / `dosbox-x.conf`:

- **dev** (default): `mount C <ws>/vendor/dojs`, `mount D <ws>`, `D:` then
  - `target=runbat` → `call RUN.BAT` (seeds `JSBOOT.ZIP`, launches `MAIN.JS`)
  - `target=mainjs` → copies `C:\JSBOOT.ZIP` into CWD, then runs
    `C:\DOJS.EXE -r -w 640,480 -b 32 MAIN.JS` directly
- **packaged**: mounts `dist/` as D: and calls `dist/RUN.BAT`
  (`DOJS.EXE -r DOJSOS.ZIP`); `tools/build-zip.sh` runs first when
  `dojs.autoBuildZip` is on.

Set `dojs.configPath` (e.g. `dosbox/dosbox-x-dev.conf`) to bypass conf
generation and use a checked-in conf verbatim.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `dojs.dosboxXPath` | `dosbox-x` | DOSBox-X binary |
| `dojs.mode` | `dev` | `dev` source tree / `packaged` dist zip |
| `dojs.target` | `runbat` | `runbat` or `mainjs` (dev only) |
| `dojs.configPath` | `""` | checked-in .conf override |
| `dojs.extraArgs` | `[]` | extra dosbox-x CLI args |
| `dojs.autoBuildZip` | `true` | rebuild DOJSOS.ZIP before packaged launch |

## Logs

The **Output → "DOjS OS — DOSBox-X"** channel shows the exact command line,
DOSBox-X stdout/stderr, and appended `JSLOG.TXT` lines (DOjS writes it into
the D: mount — repo root in dev, `dist/` in packaged).

## Develop / build / test

```sh
cd tools/vscode-dojs
npm test                      # unit tests for spec builder + runner
npm install --save-dev @vscode/vsce   # once
npx vsce package --out dist/  # produces dist/dojs-os-dosbox-<ver>.vsix
```

## Limitations

- Requires DOSBox-X installed on the host; the extension does not bundle it.
- Conf generation assumes this repo layout (`vendor/dojs`, `tools/build-zip.sh`).
- JSLOG.TXT tailing polls every 500 ms — fine for debug logs, not tracing.
- No debugger integration; this is a launcher + log viewer (Phase 1).
