/*
 * dojs-os - os/kernel.js
 * Kernel: cooperative process manager.
 *
 * dojs-os is single-threaded (MuJS + DOjS run one script on one loop), so
 * "processes" are cooperative tasks: each registered app module has a
 * factory (exports.create) and each spawn produces a process record
 * holding the app instance and its windows.
 *
 * Responsibilities:
 *   - app registry (name -> module path + metadata)
 *   - spawn / kill lifecycle, exit hooks
 *   - event pump feeding (raw DOjS events -> normalized queue)
 *   - per-frame dispatch: input routing via WM, dirty-window redraw,
 *     timers
 *   - the `api` bundle handed to each app (the Apps SDK surface)
 */

var evmod = Require('sdk/events');
var appmod = Require('sdk/app');
var gfxmod = Require('sdk/gfx');
var uimod = Require('sdk/ui');
var fsmod = Require('sdk/fs');
var thememod = Require('os/theme');
var winmod = Require('sdk/window');

function Kernel() {
	this.pump = new evmod.EventPump();
	this.wm = null;               // installed by boot
	this.shell = null;            // installed by boot
	this.procs = [];              // process records
	this.registry = {};           // name -> {path, title, singleton}
	this.timers = [];             // {at, fn, repeat, interval}
	this._nextPid = 1;
	this.running = false;
	this.errors = [];
	this.bootTime = 0;
	this.theme = thememod.theme;
}

/* --- app registry ----------------------------------------------------- */

/* register an app. def: {name, path, title, singleton} */
Kernel.prototype.registerApp = function (def) {
	this.registry[def.name] = def;
};

Kernel.prototype.registeredApps = function () {
	var out = [];
	for (var k in this.registry) {
		if (this.registry.hasOwnProperty(k)) { out.push(this.registry[k]); }
	}
	out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
	return out;
};

/* --- the API bundle given to apps -------------------------------------- */

Kernel.prototype.makeApi = function (proc) {
	var self = this;
	return {
		wm: this.wm,
		kernel: {
			spawn: function (name, args) { return self.spawn(name, args); },
			kill: function (pid) { self.kill(pid); },
			exit: function () { self.kill(proc.pid); },
			args: proc.args,
			pid: proc.pid,
			setTimeout: function (ms, fn) { self.setTimeout(ms, fn); },
			setInterval: function (ms, fn) { self.setInterval(ms, fn); },
			time: function () { return MsecTime(); },
			processes: function () { return self.processList(); },
			quit: function () { self.shutdown(); }
		},
		gfx: { Surface: gfxmod.Surface },
		ui: uimod,
		fs: fsmod,
		events: { SCAN: evmod.SCAN, BTN: evmod.BTN, keys: evmod.keys },
		theme: thememod.theme,
		Window: winmod.Window
	};
};

/* --- processes --------------------------------------------------------- */

Kernel.prototype.spawn = function (name, args) {
	var def = this.registry[name];
	if (!def) {
		this.errors.push('spawn: unknown app "' + name + '"');
		Println('dojs-os: unknown app ' + name);
		return null;
	}
	if (def.singleton) {
		var existing = this.findByName(name);
		if (existing) {
			this.wm.focusProcess(existing.pid);
			return existing;
		}
	}
	var mod;
	try {
		mod = Require(def.path);
	} catch (e) {
		this.errors.push('spawn: load failed for ' + def.path + ': ' + e);
		Println('dojs-os: cannot load ' + def.path + ' :: ' + e);
		return null;
	}
	var proc = {
		pid: this._nextPid++,
		name: name,
		title: def.title || name,
		def: def,
		app: null,
		args: args || []
	};
	try {
		var inst = mod.create(this.makeApi(proc));
		proc.app = inst;
		inst.pid = proc.pid;
		inst.name = name;
		inst.args = proc.args;
		this.procs.push(proc);
		inst.onStart();
	} catch (e2) {
		this.errors.push('spawn: ' + name + ' crashed on start: ' + e2);
		Println('dojs-os: ' + name + ' start error: ' + e2);
		return null;
	}
	return proc;
};

Kernel.prototype.findByPid = function (pid) {
	for (var i = 0; i < this.procs.length; i++) {
		if (this.procs[i].pid === pid) { return this.procs[i]; }
	}
	return null;
};

Kernel.prototype.findByName = function (name) {
	for (var i = 0; i < this.procs.length; i++) {
		if (this.procs[i].name === name) { return this.procs[i]; }
	}
	return null;
};

/* terminate a process: ask windows to close, run onExit, reap */
Kernel.prototype.kill = function (pid) {
	var proc = this.findByPid(pid);
	if (!proc) { return false; }
	var app = proc.app;
	if (app) {
		/* close each window the app owns */
		var wins = app.windows.slice();
		for (var i = 0; i < wins.length; i++) {
			this.wm.closeWindow(wins[i]);
		}
		try { app.onExit(); } catch (e) { this.errors.push('onExit ' + proc.name + ': ' + e); }
	}
	var idx = this.procs.indexOf(proc);
	if (idx >= 0) { this.procs.splice(idx, 1); }
	return true;
};

/* called by the WM when a window wants to close. returns false if vetoed. */
Kernel.prototype.windowClosing = function (win) {
	var proc = this.findByPid(win.pid);
	if (!proc || !proc.app) { return true; }
	var ok = true;
	try {
		ok = proc.app.onClose(win) !== false;
	} catch (e) {
		this.errors.push('onClose ' + proc.name + ': ' + e);
	}
	if (!ok) { return false; }
	var a = proc.app.windows;
	var i = a.indexOf(win);
	if (i >= 0) { a.splice(i, 1); }
	if (a.length === 0) {
		this.kill(proc.pid);
	}
	return true;
};

Kernel.prototype.processList = function () {
	var out = [];
	for (var i = 0; i < this.procs.length; i++) {
		out.push({ pid: this.procs[i].pid, name: this.procs[i].name, title: this.procs[i].title });
	}
	return out;
};

/* --- timers ------------------------------------------------------------ */

Kernel.prototype.setTimeout = function (ms, fn) {
	this.timers.push({ at: MsecTime() + ms, fn: fn, repeat: false, interval: ms });
};

Kernel.prototype.setInterval = function (ms, fn) {
	var t = { at: MsecTime() + ms, fn: fn, repeat: true, interval: ms };
	this.timers.push(t);
	return t;
};

Kernel.prototype._fireTimers = function () {
	var now = MsecTime();
	for (var i = this.timers.length - 1; i >= 0; i--) {
		var t = this.timers[i];
		if (now >= t.at) {
			try { t.fn(); } catch (e) { this.errors.push('timer: ' + e); }
			if (t.repeat) {
				t.at = now + t.interval;
			} else {
				this.timers.splice(i, 1);
			}
		}
	}
};

/* --- main loop ---------------------------------------------------------- */

Kernel.prototype.boot = function () {
	this.bootTime = MsecTime();
	this.running = true;
};

Kernel.prototype.input = function (rawEvent) {
	this.pump.feed(rawEvent);
};

/* one frame: drain event queue -> WM/shell, fire timers, repaint */
Kernel.prototype.tick = function () {
	if (!this.running) { return; }

	var ev;
	var guard = 64; /* never starve the loop on a flood of events */
	while ((ev = this.pump.next()) && guard-- > 0) {
		this.wm.dispatch(ev);
	}
	this._fireTimers();

	/* redraw any dirty window client areas via their apps */
	for (var i = 0; i < this.wm.windows.length; i++) {
		var win = this.wm.windows[i];
		if (win.dirty && win.visible) {
			win.dirty = false;
			var proc = this.findByPid(win.pid);
			if (proc && proc.app) {
				try {
					proc.app.onDraw(win, win.surface);
				} catch (e2) {
					this.errors.push('onDraw ' + proc.name + ': ' + e2);
					win.surface.clear(EGA.BLACK);
					win.surface.text(4, 4, 'app error: ' + e2, EGA.WHITE, NO_COLOR);
				}
			}
		}
	}

	this.wm.render();
};

Kernel.prototype.shutdown = function () {
	/* ask every process to exit, then stop DOjS */
	var pids = [];
	for (var i = 0; i < this.procs.length; i++) { pids.push(this.procs[i].pid); }
	for (var j = 0; j < pids.length; j++) { this.kill(pids[j]); }
	this.running = false;
	Stop();
};

exports.__VERSION__ = 1;
exports.Kernel = Kernel;
