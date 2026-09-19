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
	const runbat = fs.readFileSync(path.join(ROOT, 'RUN.BAT'), 'utf8');
	t.assert(/JSBOOT\.ZIP/i.test(runbat), 'RUN.BAT must ensure JSBOOT.ZIP in CWD');
	t.assert(/DOJS\.EXE/i.test(runbat) && /MAIN\.JS/i.test(runbat),
		'RUN.BAT must invoke DOJS.EXE MAIN.JS');
	t.assert(/-r/i.test(runbat), 'RUN.BAT must pass -r (else DOjS opens the editor)');
	// layout-agnostic: resolve vendored runtime relative to repo root,
	// not via a drive-letter assumption (C: may be the repo itself)
	t.assert(/VENDOR\\DOJS\\DOJS\.EXE/i.test(runbat),
		'RUN.BAT must use VENDOR\\DOJS\\DOJS.EXE (repo-relative)');
	t.assert(/VENDOR\\DOJS\\JSBOOT\.ZIP/i.test(runbat),
		'RUN.BAT must seed JSBOOT.ZIP from VENDOR\\DOJS\\JSBOOT.ZIP');
	// root discovery: MAIN.JS in CWD, <cwd>\DOJS-OS, or parent dir
	t.assert(/if exist MAIN\.JS/i.test(runbat), 'RUN.BAT must probe MAIN.JS in CWD');
	t.assert(/if exist DOJS-OS\\MAIN\.JS/i.test(runbat),
		'RUN.BAT must probe DOJS-OS\\MAIN.JS (invoked from parent dir)');
	t.assert(/if exist \.\.\\MAIN\.JS/i.test(runbat),
		'RUN.BAT must probe ..\\MAIN.JS (invoked from a subdirectory)');

	const conf = fs.readFileSync(path.join(ROOT, 'dosbox', 'dosbox-x-dev.conf'), 'utf8');
	t.assert(/mount C vendor\/dojs/i.test(conf), 'dev conf must mount vendor/dojs as C:');
	t.assert(/mount D \./i.test(conf), 'dev conf must mount repo root as D:');
	t.assert(/call RUN\.BAT/i.test(conf), 'dev conf must call RUN.BAT');
	t.assert(/lfn = true/i.test(conf),
		'dev conf needs lfn=true (apps/dosprompt.js > 8.3 chars)');
}

function testVendoredRuntimeIsTracked(t) {
	// Wolfy's earlier failure was PATH layout, not a missing file:
	// vendor/dojs/{dojs.exe,JSBOOT.ZIP,CWSDPMI.EXE} must be committed.
	for (const f of ['dojs.exe', 'JSBOOT.ZIP', 'CWSDPMI.EXE']) {
		const p = path.join(ROOT, 'vendor', 'dojs', f);
		t.assert(fs.existsSync(p), 'missing vendored file ' + f);
		const tracked = cp.execSync('git ls-files "vendor/dojs/' + f + '"',
			{ cwd: ROOT, encoding: 'utf8' }).trim();
		t.assert(tracked.length > 0, f + ' exists but is NOT git-tracked');
		const ignored = cp.execSync('git check-ignore -v "vendor/dojs/' + f +
			'" >/dev/null 2>&1; echo $?', { cwd: ROOT, encoding: 'utf8', shell: '/bin/sh' }).trim();
		t.assert(ignored !== '0', f + ' is gitignored — RUN.BAT cannot rely on it');
	}
}

function testLauncherRootResolution(t) {
	// Mirror RUN.BAT's root discovery order: '.', 'DOJS-OS', '..'.
	function repoRoot(cwdEntries, cwdParentEntries) {
		const has = (rel) =>
			rel === '.' ? cwdEntries.has('MAIN.JS')
				: rel === 'DOJS-OS' ? cwdEntries.has('DOJS-OS/MAIN.JS')
				: cwdParentEntries.has('MAIN.JS');
		for (const c of ['.', 'DOJS-OS', '..']) { if (has(c)) return c; }
		return null;
	}
	// layout a: repo is C:\DOJS-OS, invoked from C:\
	const parent = new Set(['DOJS-OS/MAIN.JS']);
	t.eq(repoRoot(parent, new Set()), 'DOJS-OS', 'parent-dir invocation');
	// invoked from inside the repo (C:\DOJS-OS or D:\)
	t.eq(repoRoot(new Set(['MAIN.JS']), new Set()), '.', 'in-root invocation');
	// invoked from a subdirectory like C:\DOJS-OS\DOSBOX
	t.eq(repoRoot(new Set(), new Set(['MAIN.JS'])), '..', 'subdir invocation');
	t.eq(repoRoot(new Set(), new Set()), null, 'unrelated dir must fail cleanly');
}

module.exports = {
	testZipHasEntryPoint,
	testZipEmbedsJsboot,
	testZipEmbedsModulesUnderJsboot,
	testDistRunBat,
	testRequireTargetsExistOnDisk,
	testDevLauncherFiles,
	testVendoredRuntimeIsTracked,
	testLauncherRootResolution,
};
