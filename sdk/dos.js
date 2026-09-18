/*
 * dojs-os - sdk/dos.js
 * DOS execution facade. Wraps DOjS `System(cmd, flags)` — which on DOS
 * runs through COMMAND.COM — with safe argument quoting, executable
 * resolution (cwd + PATH, .COM/.EXE/.BAT order), and an explicit
 * lifecycle so callers can report state.
 *
 * Execution is ALWAYS foreground and blocking: DOjS's system() call
 * suspends the VM until the child exits. Flags let the caller shut down
 * DOjS subsystems (mouse/keyboard/timer/sound/joystick) around the run.
 *
 * Lifecycle states: 'idle' -> 'launching' -> 'running' -> 'done'
 *                                      \-> 'failed' (resolution/unavailable)
 *
 * Portability: on the Linux DOjS port (LINUX == true) and on the host
 * test shim, exec() reports {status:'unsupported'} unless a shim/mock
 * System() is installed — callers must handle that.
 */

var EXEC_EXTS = ['.com', '.exe', '.bat'];

var FLAGS = {
	MOUSE: 0x01,
	SOUND: 0x02,
	JOYSTICK: 0x04,
	KEYBOARD: 0x08,
	TIMER: 0x10
};
/* default: hand keyboard + timer + mouse to the child so text-mode
 * programs get the console; sound stays on (DOjS keeps ownership). */
var DEFAULT_FLAGS = FLAGS.KEYBOARD | FLAGS.TIMER | FLAGS.MOUSE;

/* --- command line parsing --------------------------------------------- */

/* Split a command line into argv. Double quotes group; backslash is
 * literal (DOS has no escape conventions); a lone pair "" is an empty
 * arg. Returns {argv, error}. */
function parseLine(line) {
	var argv = [];
	var cur = '';
	var inQ = false;
	var started = false;
	for (var i = 0; i < line.length; i++) {
		var ch = line.charAt(i);
		if (inQ) {
			if (ch === '"') { inQ = false; } else { cur += ch; }
		} else if (ch === '"') {
			inQ = true;
			started = true;
		} else if (ch === ' ' || ch === '\t') {
			if (started || cur.length) { argv.push(cur); cur = ''; started = false; }
		} else {
			cur += ch;
			started = true;
		}
	}
	if (inQ) { return { argv: null, error: 'unterminated quote' }; }
	if (started || cur.length) { argv.push(cur); }
	return { argv: argv, error: null };
}

/* --- argument quoting --------------------------------------------------- */

/* DOS has no universal escaping; COMMAND.COM passes the raw tail to
 * children. We quote args containing spaces/quotes and refuse control
 * characters. Returns null when the arg can't be represented safely. */
function quoteArg(arg) {
	arg = String(arg);
	if (/[<>|&%\r\n]/.test(arg)) { return null; }
	if (arg.length && arg.indexOf(' ') < 0 && arg.indexOf('\t') < 0 &&
		arg.indexOf('"') < 0) {
		return arg;
	}
	if (arg.indexOf('"') >= 0) { return null; }
	return '"' + arg + '"';
}

/* --- executable resolution --------------------------------------------- */

function _looksLikePath(name) {
	return name.indexOf('/') >= 0 || name.indexOf('\\') >= 0 ||
		name.indexOf(':') >= 0;
}

function _hasExecExt(name) {
	var low = name.toLowerCase();
	for (var i = 0; i < EXEC_EXTS.length; i++) {
		if (low.length > EXEC_EXTS[i].length &&
			low.substring(low.length - EXEC_EXTS[i].length) === EXEC_EXTS[i]) {
			return true;
		}
	}
	return false;
}

/* canonicalize to the on-disk case (DOS fs is case-insensitive; the name
 * as stored is what COMMAND.COM would report) */
function _canonical(fs, p) {
	var d = fs.dirname(p);
	var want = fs.basename(p).toLowerCase();
	var ents = fs.list(d);
	for (var i = 0; i < ents.length; i++) {
		if (ents[i].name.toLowerCase() === want) {
			return fs.join(d, ents[i].name);
		}
	}
	return p;
}

function _tryBase(fs, base) {
	/* explicit extension -> check directly */
	if (_hasExecExt(base)) {
		return fs.exists(base) && !fs.isDir(base) ? _canonical(fs, base) : null;
	}
	/* COMMAND.COM search order: .COM, .EXE, .BAT */
	for (var i = 0; i < EXEC_EXTS.length; i++) {
		var p = base + EXEC_EXTS[i];
		if (fs.exists(p) && !fs.isDir(p)) { return _canonical(fs, p); }
	}
	return null;
}

/* Resolve `name` against cwd and PATH. Returns the concrete path or null.
 * `opts`: {path: 'C:/BIN;D:/TOOLS'|['C:/BIN'], cwd: 'C:/'} — path defaults
 * to GetEnv('PATH') split on ';' when unset; pass path:[] to disable. */
function resolve(fs, name, opts) {
	opts = opts || {};
	var cwd = opts.cwd || '.';
	if (_looksLikePath(name)) {
		/* explicit path: make relative ones cwd-absolute first */
		var full = (/^[A-Za-z]:/.test(name) || name.charAt(0) === '/')
			? name
			: fs.join(cwd, name);
		return _tryBase(fs, fs.normalize(full));
	}
	var rel = _tryBase(fs, fs.normalize(fs.join(cwd, name)));
	if (rel) { return rel; }
	var path = opts.path;
	if (path === undefined) {
		var env = null;
		try { env = GetEnv('PATH'); } catch (e) { env = null; }
		path = env || '';
	}
	var dirs = (typeof path === 'string') ? path.split(';') : path;
	for (var i = 0; i < dirs.length; i++) {
		var d = dirs[i];
		if (!d) { continue; }
		var hit = _tryBase(fs, fs.normalize(fs.join(d, name)));
		if (hit) { return hit; }
	}
	return null;
}

/* --- launch request ------------------------------------------------------ */

/* Build (but do not run) a launch request.
 * spec: {program:'name-or-path', args:[..], cwd:'C:/', flags:..,
 *        path: PATH override, shell:'command.com'}
 * Returns {status, command, resolved, reason}:
 *   'ready'      — resolved; `command` is the System() line
 *   'notfound'   — program did not resolve
 *   'badargs'    — an argument could not be quoted safely
 *   'unsupported'— no System() backend on this platform
 *   'invalid'    — bad spec
 */
function request(fs, spec) {
	if (!spec || typeof spec.program !== 'string' || !spec.program.length) {
		return { status: 'invalid', reason: 'missing program' };
	}
	if (!execAvailable()) {
		return { status: 'unsupported', reason: 'no System() backend on this platform' };
	}
	var args = spec.args || [];
	var parts = [];
	var prog = spec.program;
	/* .bat and shell-internal lines run through COMMAND.COM already —
	 * System() is libc system(), which is COMMAND.COM /c on DOS. */
	var resolved = resolve(fs, prog, { cwd: spec.cwd, path: spec.path });
	if (!resolved) {
		return { status: 'notfound', reason: prog + ': not found (cwd/PATH)' };
	}
	var q = quoteArg(resolved);
	if (q === null) { return { status: 'badargs', reason: 'unquotable program path' }; }
	parts.push(q);
	for (var i = 0; i < args.length; i++) {
		var qa = quoteArg(args[i]);
		if (qa === null) {
			return { status: 'badargs', reason: 'unsafe argument: ' + args[i] };
		}
		parts.push(qa);
	}
	return {
		status: 'ready',
		resolved: resolved,
		command: parts.join(' '),
		flags: (spec.flags === undefined) ? DEFAULT_FLAGS : spec.flags
	};
}

/* --- execution ------------------------------------------------------------ */

function execAvailable() {
	return typeof System === 'function';
}

/* Execute a spec synchronously (the only mode DOS has). Returns:
 *   {status:'done', code, command, resolved}
 *   {status:'failed', reason, ...} — could not even launch
 *   plus the request-status results from request() verbatim.
 */
function exec(fs, spec) {
	var req = request(fs, spec);
	if (req.status !== 'ready') { return req; }
	var code;
	try {
		code = System(req.command, req.flags);
	} catch (e) {
		return {
			status: 'failed',
			reason: 'System() threw: ' + e,
			command: req.command,
			resolved: req.resolved
		};
	}
	return {
		status: 'done',
		code: code,
		command: req.command,
		resolved: req.resolved
	};
}

/* ExecTracker: explicit lifecycle object for UIs that want to show
 * launching/running/done state around the blocking System() call.
 * The 'running' state is only observable in logs (System blocks), but
 * callbacks fire in order so callers get a consistent story. */
function ExecTracker() {
	this.state = 'idle';
	this.lastResult = null;
	this.history = [];         // [{command, code|reason, status}]
	this.onState = null;       // optional (state, result) callback
}

ExecTracker.prototype._set = function (st, res) {
	this.state = st;
	if (this.onState) { this.onState(st, res); }
};

ExecTracker.prototype.exec = function (fs, spec) {
	var req = request(fs, spec);
	if (req.status !== 'ready') {
		this.lastResult = req;
		this._set('failed', req);
		this.history.push(req);
		this._set('idle', req);
		return req;
	}
	this._set('launching', req);
	this._set('running', req);
	var code;
	try {
		code = System(req.command, req.flags);
	} catch (e) {
		var r = { status: 'failed', reason: 'System() threw: ' + e, command: req.command };
		this.lastResult = r;
		this.history.push(r);
		this._set('failed', r);
		this._set('idle', r);
		return r;
	}
	var done = { status: 'done', code: code, command: req.command, resolved: req.resolved };
	this.lastResult = done;
	this.history.push(done);
	this._set('done', done);
	this._set('idle', done);
	return done;
};

exports.__VERSION__ = 1;
exports.EXEC_EXTS = EXEC_EXTS;
exports.FLAGS = FLAGS;
exports.DEFAULT_FLAGS = DEFAULT_FLAGS;
exports.parseLine = parseLine;
exports.quoteArg = quoteArg;
exports.resolve = resolve;
exports.request = request;
exports.exec = exec;
exports.execAvailable = execAvailable;
exports.ExecTracker = ExecTracker;
