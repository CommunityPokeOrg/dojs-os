/*
 * dojs-os - MAIN.JS
 * DOjS entry point.
 *
 * Unzipped (live editing/debug), from the repo root as CWD — JSBOOT.ZIP
 * or a JSBOOT\ dir must be visible in CWD for DOjS to define Require():
 *     DOJS.EXE -r MAIN.JS                      (see RUN.BAT / dosbox-x-dev.conf)
 * Packaged (tools/build-zip.sh produces DOJSOS.ZIP, embeds jsboot/):
 *     DOJS.EXE -r DOJSOS.ZIP                   (runs DOJSOS.ZIP=MAIN.JS)
 * or rename DOJS.EXE to DOJSOS.EXE and it auto-runs DOJSOS.ZIP=MAIN.JS.
 */

var os = Require('os/boot');

function Setup() {
	os.boot();
}

function Loop() {
	os.tick();
}

function Input(event) {
	os.input(event);
}
