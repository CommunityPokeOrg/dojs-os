/*
 * dojs-os - apps/dosprompt.js
 * DOS Prompt: a COMMAND.COM-flavored prompt in a window.
 *
 * Built-ins (dir/cd/cls/echo/type/ver/path/set/history/exit) are handled
 * in-process over the SDK fs. Everything else is treated as an external
 * program: resolved against cwd + PATH (.COM/.EXE/.BAT, COMMAND.COM
 * order) and run via sdk/dos exec -> DOjS System(), i.e. COMMAND.COM /c
 * on DOS — so batch files and shell-internal commands work too.
 *
 * Execution is blocking/foreground (DOS system() suspends the VM).
 * The ExecTracker drives visible lifecycle state: launching -> running ->
 * done/failed -> idle (return-to-prompt). On non-DOS platforms (Linux
 * DOjS build, host shim without a mock System) exec reports
 * 'unsupported' cleanly.
 *
 * DosShell is graphics-free so host tests can drive it directly.
 */

var appmod = Require('sdk/app');
var dosmod = Require('sdk/dos');

/* --- DosShell: command interpreter (graphics-free, host-testable) ------- */

function DosShell(kernel, fs, dos) {
	this.kernel = kernel;
	this.fs = fs;
	this.dos = dos;
	this.cwd = 'C:/';
	this.env = { PATH: '' };
	try {
		var p = GetEnv('PATH');
		this.env.PATH = p || '';
	} catch (e) { /* no env on host */ }
	this.tracker = new dos.ExecTracker();
	this.history = [];
	this._histIdx = 0;
	this.lastCode = null;
	this.errorLevel = 0;
}

DosShell.prototype._abs = function (p) {
	if (!p || p === '') { return this.cwd; }
	if (p.charAt(1) === ':' || p.charAt(0) === '/') { return this.fs.normalize(p); }
	return this.fs.normalize(this.fs.join(this.cwd, p));
};

/* DOS-style cwd for display: C:\FOO\BAR> */
DosShell.prototype.prompt = function () {
	return this.cwd.replace(/\//g, '\\').replace(/\\$/, '') + '>';
};

DosShell.prototype._extern = function (argv, say) {
	var spec = {
		program: argv[0],
		args: argv.slice(1),
		cwd: this.cwd,
		path: this.env.PATH
	};
	var res = this.tracker.exec(this.fs, spec);
	if (res.status === 'done') {
		this.lastCode = res.code;
		this.errorLevel = res.code === undefined ? 0 : res.code;
		say('[exit ' + (res.code === undefined ? '?' : res.code) + '] ' + res.command);
	} else if (res.status === 'notfound') {
		say('Bad command or file name');
	} else if (res.status === 'unsupported') {
		say('External execution is not available on this platform');
		say('(DOjS on DOS / DOSBox is required — see dosbox/README.md)');
	} else {
		say('exec failed: ' + (res.reason || res.status));
	}
	return res;
};

DosShell.prototype.exec = function (line) {
	var out = [];
	var self = this;
	var fs = this.fs;
	var k = this.kernel;
	function say(s) { out.push(String(s)); }

	line = line.replace(/^\s+|\s+$/g, '');
	if (!line) { return out; }

	var parsed = this.dos.parseLine(line);
	if (parsed.error) {
		say('syntax: ' + parsed.error);
		return out;
	}
	var argv = parsed.argv;
	if (!argv.length) { return out; }
	this.history.push(line);
	this._histIdx = this.history.length;
	var cmd = argv[0].toLowerCase();
	var argstr = line.substring(argv[0].length).replace(/^\s+|\s+$/g, '');

	if (cmd === 'help' || cmd === '?') {
		say('Built-ins: dir cd cls echo type ver path set history where run exec exit');
		say('Anything else resolves to a .COM/.EXE/.BAT via cwd + PATH and runs');
		say('through DOjS System() (COMMAND.COM). exec <prog> forces external.');
	} else if (cmd === 'ver') {
		say('dojs-os DOS Prompt on DOjS ' + DOJS_VERSION);
		say('External exec: ' +
			(this.dos.execAvailable() ? 'available via System()' : 'UNAVAILABLE'));
	} else if (cmd === 'cls') {
		out.push('\x0c');
	} else if (cmd === 'exit') {
		out.push('\x04');
	} else if (cmd === 'dir') {
		var p = argv[1] ? this._abs(argv[1]) : this.cwd;
		if (!fs.isDir(p)) { say('dir: ' + p + ' not a directory'); return out; }
		say(' Directory of ' + p.replace(/\//g, '\\'));
		var ents = fs.list(p);
		var files = 0, bytes = 0;
		for (var i = 0; i < ents.length; i++) {
			var e = ents[i];
			if (e.isDir) {
				say(e.name + '    <DIR>');
			} else {
				files++; bytes += e.size;
				var sz = '        ' + e.size;
				say(e.name + '    ' + sz.substring(sz.length - 9));
			}
		}
		say('  ' + files + ' file(s), ' + bytes + ' bytes');
	} else if (cmd === 'cd' || cmd === 'chdir') {
		if (argv.length < 2) { say(this.cwd); return out; }
		var np = this._abs(argv[1]);
		if (fs.isDir(np)) {
			this.cwd = np;
		} else {
			say('Invalid directory ' + argv[1]);
		}
	} else if (cmd === 'echo') {
		if (argstr.toLowerCase() === 'on' || argstr.toLowerCase() === 'off' || !argstr) {
			say('ECHO is on.');
		} else {
			say(argstr);
		}
	} else if (cmd === 'type') {
		var txt = argv[1] ? fs.readText(this._abs(argv[1])) : null;
		if (txt === null) { say('type: cannot read ' + (argv[1] || '')); }
		else {
			var lines = txt.replace(/\r\n/g, '\n').split('\n');
			for (var n = 0; n < lines.length && n < 400; n++) { say(lines[n]); }
		}
	} else if (cmd === 'path') {
		if (argv.length > 1) { this.env.PATH = argstr; }
		say('PATH=' + this.env.PATH);
	} else if (cmd === 'set') {
		if (argv.length > 1) {
			var eq = argstr.indexOf('=');
			if (eq >= 0) {
				this.env[argstr.substring(0, eq).toUpperCase()] = argstr.substring(eq + 1);
			} else {
				say(this.env[argstr.toUpperCase()] || 'Environment variable not defined');
			}
		} else {
			for (var key in this.env) {
				if (this.env.hasOwnProperty(key)) { say(key + '=' + this.env[key]); }
			}
		}
	} else if (cmd === 'history') {
		for (var h = 0; h < this.history.length; h++) { say('  ' + this.history[h]); }
	} else if (cmd === 'where' || cmd === 'which') {
		if (!argv[1]) { say('where: need a name'); }
		else {
			var hit = this.dos.resolve(fs, argv[1], { cwd: this.cwd, path: this.env.PATH });
			say(hit || (argv[1] + ': not found'));
		}
	} else if (cmd === 'exec') {
		if (!argv[1]) { say('exec: need a program'); }
		else { this._extern(argv.slice(1), say); }
	} else if (cmd === 'run' || cmd === 'start') {
		if (!argv[1]) { say('run: need app name'); }
		else if (k.spawn(argv[1], argv.slice(2))) { say('started ' + argv[1]); }
		else { say('cannot start ' + argv[1]); }
	} else {
		this._extern(argv, say);
	}
	return out;
};

/* --- windowed app -------------------------------------------------------- */

function DosPromptApp(api) {
	appmod.App.call(this, api);
	this.lines = [];
	this.input = '';
	this.shell = null;
	this.stateLine = '';
}
DosPromptApp.prototype = Object.create(appmod.App.prototype);

var LINE_H = 9;
var CHAR_W = 6;

DosPromptApp.prototype.onStart = function () {
	this.win = this.createWindow({ title: 'DOS Prompt', width: 400, height: 200 });
	this.shell = new DosShell(this.api.kernel, this.api.fs, this.api.dos);
	var self = this;
	this.shell.tracker.onState = function (st, res) {
		if (st === 'running') { self.stateLine = 'running: ' + res.command; }
		else if (st === 'done') { self.stateLine = 'exit ' + res.code + '  ' + res.command; }
		else if (st === 'failed') { self.stateLine = 'failed: ' + (res.reason || res.status); }
		else { self.stateLine = ''; }
		self.win.invalidate();
	};
	this._print('DOjS DOS Prompt  [System()' +
		(this.api.dos.execAvailable() ? ' available]' : ' NOT available on this platform]'));
	this._print('Type "help" for commands.');
	this._print('');
};

DosPromptApp.prototype._print = function (s) {
	var maxc = Math.floor((this.win.width - 8) / CHAR_W);
	while (s.length > maxc) {
		this.lines.push(s.substring(0, maxc));
		s = s.substring(maxc);
	}
	this.lines.push(s);
	while (this.lines.length > 300) { this.lines.shift(); }
	this.win.invalidate();
};

DosPromptApp.prototype._run = function () {
	var line = this.input;
	this.input = '';
	this._print(this.shell.prompt() + ' ' + line);
	var out = this.shell.exec(line);
	for (var i = 0; i < out.length; i++) {
		var s = out[i];
		if (s === '\x0c') { this.lines = []; continue; }
		if (s === '\x04') { this.exit(); return; }
		this._print(s);
	}
	this.win.invalidate();
};

DosPromptApp.prototype.onDraw = function (win, g) {
	var t = this.api.theme;
	g.clear(EGA.BLACK);
	var maxRows = Math.floor((win.height - 6 - LINE_H) / LINE_H);
	var rows = this.lines.slice(-maxRows);
	var y = 3;
	for (var i = 0; i < rows.length; i++) {
		g.text(4, y, rows[i], EGA.LIGHT_GREY, NO_COLOR);
		y += LINE_H;
	}
	var prompt = this.shell.prompt() + ' ' + this.input;
	var maxc = Math.floor((win.width - 8) / CHAR_W);
	if (prompt.length > maxc) { prompt = prompt.substring(prompt.length - maxc); }
	g.text(4, y, prompt, EGA.WHITE, NO_COLOR);
	if ((Math.floor(MsecTime() / 400) % 2) === 0) {
		g.text(4 + prompt.length * CHAR_W, y, '_', EGA.WHITE, NO_COLOR);
	}
	/* bottom status strip: lifecycle state */
	var sy = win.height - LINE_H + 1;
	g.fillRect(0, sy, win.width, LINE_H - 1, t.taskbar);
	g.text(4, sy + 1, this.stateLine || 'ready', EGA.BLACK, NO_COLOR);
};

DosPromptApp.prototype.onEvent = function (win, ev) {
	var SCAN = this.api.events.SCAN;
	if (ev.type !== 'keydown') { return; }
	var s = ev.scan;
	if (s === SCAN.ENTER || s === SCAN.ENTER_PAD) { this._run(); return; }
	if (s === SCAN.BACKSPACE) {
		this.input = this.input.substring(0, this.input.length - 1);
		this.win.invalidate();
		return;
	}
	if (s === SCAN.UP || s === SCAN.DOWN) {
		var h = this.shell.history;
		if (h.length) {
			if (s === SCAN.UP) {
				this.shell._histIdx = Math.max(0, this.shell._histIdx - 1);
			} else {
				this.shell._histIdx = Math.min(h.length, this.shell._histIdx + 1);
			}
			this.input = this.shell._histIdx < h.length ? h[this.shell._histIdx] : '';
			this.win.invalidate();
		}
		return;
	}
	if (ev.char) {
		this.input += ev.char;
		this.win.invalidate();
	}
};

exports.__VERSION__ = 1;
exports.create = function (api) { return new DosPromptApp(api); };
exports.DosShell = DosShell;
