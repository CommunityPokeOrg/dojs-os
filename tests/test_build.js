/*
 * tests/test_build.js — packaging & loader-layout checks.
 *
 * Mirrors real DOjS v1.14.0 loader semantics (src/DOjS.c + jsboot/func.js):
 *  - `DOJS.EXE -r DOJSOS.ZIP` makes DOJSOS.ZIP the jsboot archive, so the
 *    stdlib (jsboot/func.js ...) AND our modules must be inside the zip
 *    under jsboot/.
 *  - Unzipped: Require('x') resolves x / x.js relative to the process
 *    CWD — every Require() string in our sources must map to a real file.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function buildZip(t) {
	const out = path.join(ROOT, 'dist', 'DOJSOS.ZIP');
	cp.execSync('sh tools/build-zip.sh dist/DOJSOS.ZIP', { cwd: ROOT, stdio: 'pipe' });
	t.assert(fs.existsSync(out), 'dist/DOJSOS.ZIP not created');
	return out;
}

function zipList(z) {
	return cp.execSync('zipinfo -1 "' + z + '"', { encoding: 'utf8' })
		.split('\n').map(s => s.trim()).filter(Boolean);
}

function testZipHasEntryPoint(t) {
	const z = buildZip(t);
	const list = zipList(z);
	t.assert(list.some(e => e.toLowerCase() === 'main.js'),
		'zip must contain MAIN.JS at root (DOJSOS.ZIP=MAIN.JS entry)');
}

function testZipEmbedsJsboot(t) {
	const z = buildZip(t);
	const list = zipList(z).map(e => e.toLowerCase());
	// without these, DOjS loads no stdlib inside a -r zip:
	// ReferenceError: 'Require' is not defined
	for (const e of ['jsboot/func.js', 'jsboot/color.js', 'jsboot/file.js']) {
		t.assert(list.includes(e), 'zip missing ' + e + ' (stdlib must be embedded)');
	}
}

function testZipEmbedsModulesUnderJsboot(t) {
	const z = buildZip(t);
	const list = new Set(zipList(z).map(e => e.toLowerCase()));
	// inside the zip Require('os/boot') hits DOJSOS.ZIP=JSBOOT/os/boot.js
	const need = [
		'jsboot/os/boot.js', 'jsboot/os/kernel.js', 'jsboot/os/wm.js',
		'jsboot/os/theme.js', 'jsboot/shell/desktop.js',
		'jsboot/sdk/app.js', 'jsboot/sdk/dos.js', 'jsboot/sdk/fs.js',
		'jsboot/sdk/gfx.js', 'jsboot/sdk/ui.js', 'jsboot/sdk/window.js',
		'jsboot/sdk/events.js',
		'jsboot/apps/term.js', 'jsboot/apps/dosprompt.js',
		'jsboot/apps/files.js', 'jsboot/apps/editor.js',
		'jsboot/apps/calc.js', 'jsboot/apps/sysinfo.js',
	];
	for (const e of need) {
		t.assert(list.has(e), 'zip missing ' + e);
	}
}

function testDistRunBat(t) {
	buildZip(t);
	const bat = path.join(ROOT, 'dist', 'RUN.BAT');
	t.assert(fs.existsSync(bat), 'dist/RUN.BAT not emitted');
	const c = fs.readFileSync(bat, 'utf8');
	t.assert(/DOJS\.EXE/i.test(c) && /DOJSOS\.ZIP/i.test(c),
		'dist/RUN.BAT must launch DOJS.EXE with DOJSOS.ZIP');
}

function testRequireTargetsExistOnDisk(t) {
	// Unzipped runs resolve Require('x') -> CWD/x(.js); scan all runtime
	// sources for literal Require('...') and check the file exists.
	const dirs = ['.', 'os', 'sdk', 'shell', 'apps'];
	const seen = [];
	for (const d of dirs) {
		for (const f of fs.readdirSync(path.join(ROOT, d))) {
			if (!/\.js$/i.test(f)) { continue; }
			const src = fs.readFileSync(path.join(ROOT, d, f), 'utf8');
			for (const m of src.matchAll(/Require\(\s*'([^']+)'/g)) {
				seen.push({ mod: m[1], from: path.join(d, f) });
			}
		}
	}
	t.assert(seen.length > 5, 'expected to find Require() calls');
	for (const r of seen) {
		const ok = fs.existsSync(path.join(ROOT, r.mod)) ||
			fs.existsSync(path.join(ROOT, r.mod + '.js'));
		t.assert(ok, r.from + ': Require(\'' + r.mod +
			'\') does not resolve on disk (unzipped CWD=repo root)');
	}
}

function testDevLauncherFiles(t) {
	// Wolfy flow: mount repo root as D:, run RUN.BAT -> unzipped boot.
	const runbat = fs.readFileSync(path.join(ROOT, 'RUN.BAT'), 'utf8');
	t.assert(/JSBOOT\.ZIP/i.test(runbat), 'RUN.BAT must ensure JSBOOT.ZIP in CWD');
	t.assert(/DOJS\.EXE/i.test(runbat) && /MAIN\.JS/i.test(runbat),
		'RUN.BAT must invoke DOJS.EXE MAIN.JS');
	t.assert(/-r/i.test(runbat), 'RUN.BAT must pass -r (else DOjS opens the editor)');

	const conf = fs.readFileSync(path.join(ROOT, 'dosbox', 'dosbox-x-dev.conf'), 'utf8');
	t.assert(/mount C vendor\/dojs/i.test(conf), 'dev conf must mount vendor/dojs as C:');
	t.assert(/mount D \./i.test(conf), 'dev conf must mount repo root as D:');
	t.assert(/call RUN\.BAT/i.test(conf), 'dev conf must call RUN.BAT');
	t.assert(/lfn = true/i.test(conf),
		'dev conf needs lfn=true (apps/dosprompt.js > 8.3 chars)');
}

module.exports = {
	testZipHasEntryPoint,
	testZipEmbedsJsboot,
	testZipEmbedsModulesUnderJsboot,
	testDistRunBat,
	testRequireTargetsExistOnDisk,
	testDevLauncherFiles,
};
