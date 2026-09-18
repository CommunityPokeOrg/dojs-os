/*
 * dojs-os - apps/term.js
 * Terminal / shell. A small command interpreter over the SDK fs +
 * kernel: help, ver, mem, ps, apps, run <app>, ls/dir, cd, pwd, cat,
 * echo, mkdir, rm, clear, exit. Commands are pure functions on a Shell
 * object so host tests can drive them without graphics.
 */

var appmod = Require('sdk/app');

/* --- Shell: command interpreter (graphics-free, host-testable) ---------- */

function Shell(kernel, fs) {
	this.kernel = kernel;
	this.fs = fs;
	this.cwd = 'C:/';
}

Shell.prototype._abs = function (p) {
	if (!p || p === '') { return this.cwd; }
	if (p.charAt(1) === ':' || p.charAt(0) === '/') { return this.fs.normalize(p); }
	return this.fs.normalize(this.fs.join(this.cwd, p));
};

Shell.prototype.exec = function (line) {
	var out = [];
	line = line.replace(/^\s+|\s+$/g, '');
	if (!line) { return out; }
	var sp = line.indexOf(' ');
	var cmd = (sp < 0 ? line : line.substring(0, sp)).toLowerCase();
	var arg = sp < 0 ? '' : line.substring(sp + 1).replace(/^\s+|\s+$/g, '');
	var fs = this.fs;
	var k = this.kernel;
	var self = this;

	function say(s) { out.push(String(s)); }

	if (cmd === 'help' || cmd === '?') {
		say('commands: help ver mem ps apps run ls cd pwd cat echo mkdir rm clear exit');
	} else if (cmd === 'ver') {
		say('dojs-os 0.1 on DOjS ' + DOJS_VERSION + ' (MuJS ES5)');
	} else if (cmd === 'mem') {
		try {
			var mi = MemoryInfo();
			say('memory total=' + mi.total + ' free=' + mi.remaining);
		} catch (e) { say('mem: n/a'); }
	} else if (cmd === 'ps') {
		var ps = k.processes();
		for (var i = 0; i < ps.length; i++) { say(ps[i].pid + '  ' + ps[i].name); }
	} else if (cmd === 'apps') {
		var apps = k.registeredApps();
		for (var j = 0; j < apps.length; j++) { say(apps[j].name + ' - ' + (apps[j].title || '')); }
	} else if (cmd === 'run' || cmd === 'start') {
		if (!arg) { say('run: need app name'); }
		else if (k.spawn(arg, arg.indexOf(' ') >= 0 ? arg.split(' ').slice(1) : [])) {
			say('started ' + arg);
		} else { say('cannot start ' + arg); }
	} else if (cmd === 'ls' || cmd === 'dir') {
		var p = arg ? this._abs(arg) : this.cwd;
		var ents = fs.list(p);
		for (var m = 0; m < ents.length; m++) {
			var e = ents[m];
			say((e.isDir ? '<DIR> ' : '      ') + e.name + (e.isDir ? '' : ' ' + e.size));
		}
		say(ents.length + ' entries');
	} else if (cmd === 'cd') {
		var np = this._abs(arg || 'C:/');
		if (fs.isDir(np)) { this.cwd = np; } else { say('cd: no such dir ' + np); }
		say(this.cwd);
	} else if (cmd === 'pwd') {
		say(this.cwd);
	} else if (cmd === 'cat' || cmd === 'type') {
		var txt = fs.readText(this._abs(arg));
		if (txt === null) { say('cat: cannot read ' + arg); }
		else {
			var lines = txt.replace(/\r\n/g, '\n').split('\n');
			for (var n = 0; n < lines.length && n < 200; n++) { say(lines[n]); }
		}
	} else if (cmd === 'echo') {
		say(arg);
	} else if (cmd === 'mkdir' || cmd === 'md') {
		say(fs.mkdir(this._abs(arg)) ? 'ok' : 'mkdir failed');
	} else if (cmd === 'rm' || cmd === 'del') {
		say(fs.remove(this._abs(arg)) ? 'ok' : 'rm failed');
	} else if (cmd === 'clear' || cmd === 'cls') {
		out.push('\x0c'); /* formfeed = clear screen marker */
	} else if (cmd === 'exit' || cmd === 'quit') {
		out.push('\x04'); /* EOT marker = close shell */
	} else if (cmd === 'shutdown' || cmd === 'poweroff') {
		k.shutdown();
	} else {
		say(cmd + ': unknown command (help)');
	}
	return out;
};

/* --- Terminal app --------------------------------------------------------- */

function TermApp(api) {
	appmod.App.call(this, api);
	this.lines = [];
	this.input = '';
	this.shell = null;
	this.scroll = 0;
}
TermApp.prototype = Object.create(appmod.App.prototype);

var LINE_H = 9;
var CHAR_W = 6;

TermApp.prototype.onStart = function () {
	this.win = this.createWindow({ title: 'Terminal', width: 360, height: 190 });
	this.shell = new Shell(this.api.kernel, this.api.fs);
	this.shell.cwd = this.api.fs.isDir('C:/DOJSOS') ? 'C:/DOJSOS' : 'C:/';
	this._print('dojs-os terminal — type "help"');
	this._print('');
};

TermApp.prototype._print = function (s) {
	/* wrap long lines to window width */
	var maxc = Math.floor((this.win.width - 8) / CHAR_W);
	while (s.length > maxc) {
		this.lines.push(s.substring(0, maxc));
		s = s.substring(maxc);
	}
	this.lines.push(s);
	while (this.lines.length > 200) { this.lines.shift(); }
	this.win.invalidate();
};

TermApp.prototype._run = function () {
	var line = this.input;
	this.input = '';
	this._print(this.shell.cwd + '> ' + line);
	var out = this.shell.exec(line);
	for (var i = 0; i < out.length; i++) {
		var s = out[i];
		if (s === '\x0c') { this.lines = []; continue; }
		if (s === '\x04') { this.exit(); return; }
		this._print(s);
	}
	this.win.invalidate();
};

TermApp.prototype.onDraw = function (win, g) {
	var t = this.api.theme;
	g.clear(EGA.BLACK);
	var maxRows = Math.floor((win.height - 6) / LINE_H);
	var rows = this.lines.slice(-maxRows + 1);
	var y = 3;
	for (var i = 0; i < rows.length; i++) {
		g.text(4, y, rows[i], EGA.LIGHT_GREEN, NO_COLOR);
		y += LINE_H;
	}
	/* input line with cursor */
	var prompt = this.shell.cwd + '> ' + this.input;
	var maxc = Math.floor((win.width - 8) / CHAR_W);
	if (prompt.length > maxc) { prompt = prompt.substring(prompt.length - maxc); }
	g.text(4, y, prompt, EGA.YELLOW, NO_COLOR);
	if ((Math.floor(MsecTime() / 400) % 2) === 0) {
		g.text(4 + prompt.length * CHAR_W, y, '_', EGA.YELLOW, NO_COLOR);
	}
};

TermApp.prototype.onEvent = function (win, ev) {
	var SCAN = this.api.events.SCAN;
	if (ev.type !== 'keydown') {
		/* blink cursor */
		if (ev.type === 'mousemove') { this.win.invalidate(); }
		return;
	}
	var s = ev.scan;
	if (s === SCAN.ENTER || s === SCAN.ENTER_PAD) { this._run(); return; }
	if (s === SCAN.BACKSPACE) {
		this.input = this.input.substring(0, this.input.length - 1);
		this.win.invalidate();
		return;
	}
	if (ev.char) {
		this.input += ev.char;
		this.win.invalidate();
	}
};

exports.__VERSION__ = 1;
exports.create = function (api) { return new TermApp(api); };
exports.Shell = Shell;
