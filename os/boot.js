/*
 * dojs-os - os/boot.js
 * Boot: wires kernel + WM + shell together, registers built-in apps and
 * starts the desktop. Called from MAIN.JS (or the host runner).
 */

var kmod = Require('os/kernel');
var wmod = Require('os/wm');
var shmod = Require('shell/desktop');

var kernel = null;

var BUILTIN_APPS = [
	{ name: 'term',     path: 'apps/term',     title: 'Terminal',     singleton: false },
	{ name: 'files',    path: 'apps/files',    title: 'File Manager', singleton: false },
	{ name: 'editor',   path: 'apps/editor',   title: 'Text Editor',  singleton: false },
	{ name: 'calc',     path: 'apps/calc',     title: 'Calculator',   singleton: true },
	{ name: 'sysinfo',  path: 'apps/sysinfo',  title: 'System Info',  singleton: true }
];

function boot(opts) {
	opts = opts || {};
	kernel = new kmod.Kernel();
	kernel.wm = new wmod.WindowManager(kernel);
	kernel.shell = new shmod.DesktopShell(kernel);

	for (var i = 0; i < BUILTIN_APPS.length; i++) {
		kernel.registerApp(BUILTIN_APPS[i]);
	}
	for (var j = 0; j < (opts.extraApps || []).length; j++) {
		kernel.registerApp(opts.extraApps[j]);
	}

	/* hardware/env tweaks */
	SetFramerate(opts.framerate || 20);
	SetExitKey(0);                    /* disable ESC-quit; the shell owns exit */
	MouseShowCursor(true);

	kernel.boot();

	if (opts.autostart !== false) {
		var start = opts.autostart || 'term';
		kernel.spawn(start, opts.args || []);
	}
	return kernel;
}

function input(ev) {
	if (kernel) { kernel.input(ev); }
}

function tick() {
	if (kernel) { kernel.tick(); }
}

exports.__VERSION__ = 1;
exports.boot = boot;
exports.input = input;
exports.tick = tick;
exports.kernel = function () { return kernel; };
