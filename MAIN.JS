/*
 * dojs-os - MAIN.JS
 * DOjS entry point. Run unzipped from the repo root:
 *     DOJS.EXE -r MAIN.JS
 * or packaged (tools/build-zip.sh produces DOJSOS.ZIP):
 *     DOJS.EXE -r DOJSOS.ZIP        (runs DOJSOS.ZIP=MAIN.JS)
 *
 * You may also rename DOJS.EXE to DOJSOS.EXE — DOjS will then
 * auto-run DOJSOS.ZIP=MAIN.JS with no arguments.
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
