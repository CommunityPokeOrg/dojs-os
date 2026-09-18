/* tests for sdk/dos.js + apps/dosprompt.js
 * System() is mocked by the shim: host.systemCalls records invocations,
 * host.systemReturn controls the fake exit code. */

const dos = Require('sdk/dos');
const fsmod = Require('sdk/fs');
const dpmod = Require('apps/dosprompt');
const kmod = Require('os/kernel');
const wmod = Require('os/wm');

function seedExecs() {
	fsmod.mkdir('C:/BIN');
	fsmod.mkdir('C:/PROG');
	fsmod.writeText('C:/BIN/PROG.EXE', 'MZ fake');
	fsmod.writeText('C:/BIN/TOOL.COM', 'fake com');
	fsmod.writeText('C:/BIN/GO.BAT', '@echo hi\r\n');
	fsmod.writeText('C:/PROG/BOTH.EXE', 'exe');
	fsmod.writeText('C:/PROG/BOTH.COM', 'com');
	fsmod.writeText('C:/PROG/ONLYBAT.BAT', 'rem bat');
}

function makeShell(t) {
	const k = new kmod.Kernel();
	k.wm = new wmod.WindowManager(k);
	return new dpmod.DosShell(k, fsmod, dos);
}

/* --- parsing ----------------------------------------------------------- */

exports.testParseLine = function (t) {
	let p = dos.parseLine('dir /w');
	t.eq(p.argv.join(','), 'dir,/w');
	p = dos.parseLine('  prog  "a b" c  ');
	t.eq(p.argv.join(','), 'prog,a b,c');
	p = dos.parseLine('prog "" x');
	t.eq(p.argv.join(','), 'prog,,x');
	p = dos.parseLine('prog "unclosed');
	t.eq(p.argv, null);
	t.assert(p.error.indexOf('quote') >= 0);
	t.eq(dos.parseLine('').argv.length, 0);
};

exports.testQuoteArg = function (t) {
	t.eq(dos.quoteArg('FOO.EXE'), 'FOO.EXE');
	t.eq(dos.quoteArg('a b'), '"a b"');
	t.eq(dos.quoteArg('a"b'), null, 'embedded quote refused');
	t.eq(dos.quoteArg('a|b'), null, 'pipe refused');
	t.eq(dos.quoteArg('a>b'), null, 'redirect refused');
	t.eq(dos.quoteArg('a%b'), null, 'env expansion refused');
	t.eq(dos.quoteArg('-w'), '-w');
};

/* --- resolution --------------------------------------------------------- */

exports.testResolveCwd = function (t) {
	seedExecs();
	const hit = dos.resolve(fsmod, 'prog', { cwd: 'C:/BIN', path: [] });
	t.eq(hit, 'C:/BIN/PROG.EXE');
};

exports.testResolveExtOrder = function (t) {
	seedExecs();
	/* .COM wins over .EXE like COMMAND.COM */
	t.eq(dos.resolve(fsmod, 'both', { cwd: 'C:/PROG', path: [] }), 'C:/PROG/BOTH.COM');
	t.eq(dos.resolve(fsmod, 'onlybat', { cwd: 'C:/PROG', path: [] }), 'C:/PROG/ONLYBAT.BAT');
};

exports.testResolvePathDirs = function (t) {
	seedExecs();
	const hit = dos.resolve(fsmod, 'prog', { cwd: 'C:/', path: ['C:/BIN'] });
	t.eq(hit, 'C:/BIN/PROG.EXE');
	/* cwd wins over PATH */
	fsmod.writeText('C:/PROG.EXE', 'cwd first');
	t.eq(dos.resolve(fsmod, 'prog', { cwd: 'C:/', path: ['C:/BIN'] }), 'C:/PROG.EXE');
};

exports.testResolveExplicitPath = function (t) {
	seedExecs();
	t.eq(dos.resolve(fsmod, 'BIN/PROG.EXE', { cwd: 'C:/', path: [] }), 'C:/BIN/PROG.EXE');
	t.eq(dos.resolve(fsmod, './both', { cwd: 'C:/PROG', path: [] }), 'C:/PROG/BOTH.COM');
	t.eq(dos.resolve(fsmod, 'nope/nothing', { cwd: 'C:/', path: [] }), null);
	t.eq(dos.resolve(fsmod, 'missing', { cwd: 'C:/', path: [] }), null);
};

/* --- request construction ------------------------------------------------ */

exports.testRequestReady = function (t) {
	seedExecs();
	const r = dos.request(fsmod, { program: 'prog', args: ['a', 'b c'], cwd: 'C:/BIN', path: [] });
	t.eq(r.status, 'ready');
	t.eq(r.resolved, 'C:/BIN/PROG.EXE');
	t.eq(r.command, 'C:/BIN/PROG.EXE a "b c"');
	t.assert(typeof r.flags === 'number');
};

exports.testRequestNotFound = function (t) {
	const r = dos.request(fsmod, { program: 'ghost', cwd: 'C:/', path: [] });
	t.eq(r.status, 'notfound');
};

exports.testRequestBadArgs = function (t) {
	seedExecs();
	const r = dos.request(fsmod, { program: 'prog', args: ['x|y'], cwd: 'C:/BIN', path: [] });
	t.eq(r.status, 'badargs');
};

exports.testRequestUnsupported = function (t) {
	const old = global.System;
	global.System = undefined;
	try {
		const r = dos.request(fsmod, { program: 'prog', cwd: 'C:/BIN' });
		t.eq(r.status, 'unsupported');
		t.eq(dos.execAvailable(), false);
	} finally {
		global.System = old;
	}
};

/* --- exec + lifecycle ------------------------------------------------------ */

exports.testExecDone = function (t) {
	seedExecs();
	const host = t.host;
	host.systemCalls.length = 0;
	host.systemReturn.code = 3;
	const r = dos.exec(fsmod, { program: 'prog', args: ['x'], cwd: 'C:/BIN', path: [] });
	t.eq(r.status, 'done');
	t.eq(r.code, 3);
	t.eq(host.systemCalls.length, 1);
	t.eq(host.systemCalls[0].cmd, 'C:/BIN/PROG.EXE x');
	host.systemReturn.code = 0;
};

exports.testExecThrow = function (t) {
	seedExecs();
	const host = t.host;
	host.systemReturn.throw = 'vm boom';
	const r = dos.exec(fsmod, { program: 'prog', cwd: 'C:/BIN', path: [] });
	t.eq(r.status, 'failed');
	t.assert(r.reason.indexOf('vm boom') >= 0);
	host.systemReturn.throw = null;
};

exports.testTrackerLifecycle = function (t) {
	seedExecs();
	const host = t.host;
	host.systemReturn.code = 7;
	const tr = new dos.ExecTracker();
	const seen = [];
	tr.onState = function (s) { seen.push(s); };
	const r = tr.exec(fsmod, { program: 'tool', cwd: 'C:/BIN', path: [] });
	t.eq(r.status, 'done');
	t.eq(r.code, 7);
	/* observable order: launching, running, done, then back to idle */
	t.eq(seen.join(','), 'launching,running,done,idle');
	t.eq(tr.state, 'idle', 'returns to prompt state');
	t.eq(tr.history.length, 1);
	t.eq(tr.history[0].code, 7);
	host.systemReturn.code = 0;
};

exports.testTrackerNotFoundLifecycle = function (t) {
	const tr = new dos.ExecTracker();
	const seen = [];
	tr.onState = function (s) { seen.push(s); };
	const r = tr.exec(fsmod, { program: 'ghost', cwd: 'C:/', path: [] });
	t.eq(r.status, 'notfound');
	t.eq(tr.state, 'idle', 'back to idle after failure');
	t.assert(seen.join(',').indexOf('failed') >= 0);
};

/* --- DosShell ------------------------------------------------------------- */

exports.testShellBuiltins = function (t) {
	fsmod.writeText('C:/F.TXT', 'content');
	const sh = makeShell(t);
	let out = sh.exec('ver');
	t.assert(out.join(' ').indexOf('DOS Prompt') >= 0);
	out = sh.exec('dir');
	t.assert(out.join('\n').indexOf('Directory of') >= 0);
	out = sh.exec('cd BIN');
	t.assert(out.length === 0 || out.join('').indexOf('Invalid') < 0);
	t.eq(sh.cwd, 'C:/BIN');
	out = sh.exec('cd ..');
	out = sh.exec('type F.TXT');
	t.eq(out[0], 'content');
	out = sh.exec('echo hello world');
	t.eq(out[0], 'hello world');
	out = sh.exec('path C:/BIN;D:/X');
	t.eq(sh.env.PATH, 'C:/BIN;D:/X');
};

exports.testShellExternal = function (t) {
	seedExecs();
	const host = t.host;
	host.systemCalls.length = 0;
	host.systemReturn.code = 5;
	const sh = makeShell(t);
	sh.cwd = 'C:/BIN';
	const out = sh.exec('prog /q');
	t.eq(host.systemCalls.length, 1);
	t.eq(host.systemCalls[0].cmd, 'C:/BIN/PROG.EXE /q');
	t.eq(sh.errorLevel, 5, 'errorlevel tracked');
	t.assert(out.join(' ').indexOf('exit 5') >= 0);
	t.eq(sh.tracker.state, 'idle', 'returned to prompt');
	host.systemReturn.code = 0;
};

exports.testShellExecForced = function (t) {
	seedExecs();
	const host = t.host;
	host.systemCalls.length = 0;
	const sh = makeShell(t);
	sh.cwd = 'C:/BIN';
	sh.exec('exec tool');
	t.eq(host.systemCalls[0].cmd, 'C:/BIN/TOOL.COM');
};

exports.testShellNotFound = function (t) {
	const sh = makeShell(t);
	const out = sh.exec('ghostxyz arg');
	t.eq(out[0], 'Bad command or file name');
	t.eq(sh.tracker.state, 'idle');
};

exports.testShellUnsupported = function (t) {
	const old = global.System;
	global.System = undefined;
	try {
		const sh = makeShell(t);
		const out = sh.exec('whatever.exe');
		t.assert(out.join(' ').indexOf('not available') >= 0);
		t.eq(sh.tracker.state, 'idle');
	} finally {
		global.System = old;
	}
};

exports.testShellExitAndCls = function (t) {
	const sh = makeShell(t);
	t.eq(sh.exec('exit')[0], '\x04');
	t.eq(sh.exec('cls')[0], '\x0c');
};

exports.testShellHistory = function (t) {
	const sh = makeShell(t);
	sh.exec('ver');
	sh.exec('echo hi');
	t.eq(sh.history.length, 2);
	t.eq(sh.history[1], 'echo hi');
};

exports.testPromptString = function (t) {
	const sh = makeShell(t);
	t.eq(sh.prompt(), 'C:>');
	sh.cwd = 'C:/BIN/UTIL';
	t.eq(sh.prompt(), 'C:\\BIN\\UTIL>');
};

/* --- OS integration -------------------------------------------------------- */

exports.testAppSpawns = function (t) {
	const k = new kmod.Kernel();
	k.wm = new wmod.WindowManager(k);
	k.registerApp({ name: 'dosprompt', path: 'apps/dosprompt', title: 'DOS Prompt' });
	const p = k.spawn('dosprompt', []);
	t.assert(p !== null);
	t.eq(k.wm.focused.title, 'DOS Prompt');
	t.assert(p.app.shell !== null, 'shell bound to api.dos');
	k.kill(p.pid);
};

exports.testAppExecEndToEnd = function (t) {
	seedExecs();
	const k = new kmod.Kernel();
	k.wm = new wmod.WindowManager(k);
	k.registerApp({ name: 'dosprompt', path: 'apps/dosprompt', title: 'DOS Prompt' });
	const p = k.spawn('dosprompt', []);
	const app = p.app;
	app.shell.cwd = 'C:/BIN';
	app.input = 'go.bat';
	app._run();
	const host = t.host;
	const last = host.systemCalls[host.systemCalls.length - 1];
	t.eq(last.cmd, 'C:/BIN/GO.BAT', 'bat launched via System()');
	k.kill(p.pid);
};
