/*
 * dojs-os vscode extension - runner.js
 * DOSBox-X process lifecycle + log streaming. Injectable spawn/fs hooks
 * keep it unit-testable without vscode.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

function DosboxRunner(deps) {
	this._spawn = (deps && deps.spawn) || childProcess.spawn;
	this._out = (deps && deps.output) || { appendLine: function (m) { console.log(m); } };
	this._onState = (deps && deps.onState) || function () { };
	this._child = null;
	this._tail = null;   /* {path, offset, timer} */
	this._spec = null;
}

DosboxRunner.prototype.isRunning = function () {
	return !!this._child;
};

DosboxRunner.prototype.spec = function () { return this._spec; };

DosboxRunner.prototype._line = function (prefix, chunk) {
	const lines = String(chunk).split(/\r?\n/);
	for (var i = 0; i < lines.length; i++) {
		if (lines[i]) { this._out.appendLine(prefix + lines[i]); }
	}
};

/* stream appended bytes of a file (e.g. JSLOG.TXT) into the output */
DosboxRunner.prototype._watchFile = function (file) {
	const self = this;
	const tail = { path: file, offset: 0, timer: null };
	try { tail.offset = fs.statSync(file).size; } catch (e) { tail.offset = 0; }
	tail.timer = setInterval(function () {
		let st;
		try { st = fs.statSync(tail.path); } catch (e) { return; }
		if (st.size < tail.offset) { tail.offset = 0; }
		if (st.size === tail.offset) { return; }
		const fdr = fs.openSync(tail.path, 'r');
		try {
			const buf = Buffer.alloc(st.size - tail.offset);
			fs.readSync(fdr, buf, 0, buf.length, tail.offset);
			tail.offset = st.size;
			self._line('[jslog] ', buf.toString('utf8'));
		} finally { fs.closeSync(fdr); }
	}, 500);
	if (tail.timer.unref) { tail.timer.unref(); }
	this._tail = tail;
};

DosboxRunner.prototype._unwatch = function () {
	if (this._tail) { clearInterval(this._tail.timer); this._tail = null; }
};

DosboxRunner.prototype.start = function (spec) {
	const self = this;
	if (this._child) { return Promise.resolve(false); }
	if (spec.confText !== null && spec.confText !== undefined) {
		fs.mkdirSync(path.dirname(spec.confPath), { recursive: true });
		fs.writeFileSync(spec.confPath, spec.confText);
	}
	this._out.appendLine('--- dosbox-x: ' + spec.bin + ' ' + spec.args.join(' ') + ' ---');
	this._out.appendLine('--- cwd: ' + spec.cwd + ' mode=' + spec.mode + ' target=' + spec.target + ' ---');
	this._spec = spec;
	this._child = this._spawn(spec.bin, spec.args, { cwd: spec.cwd });
	if (this._child.stdout) { this._child.stdout.on('data', function (d) { self._line('[stdout] ', d); }); }
	if (this._child.stderr) { this._child.stderr.on('data', function (d) { self._line('[stderr] ', d); }); }
	this._child.on('error', function (err) {
		self._out.appendLine('[runner] failed to start ' + spec.bin + ': ' + err.message);
		self._child = null;
		self._onState(false, err);
	});
	this._child.on('exit', function (code, sig) {
		self._out.appendLine('--- dosbox-x exited (code=' + code + ' signal=' + sig + ') ---');
		self._child = null;
		self._unwatch();
		self._onState(false, null, code);
	});
	if (spec.watchFile) { this._watchFile(spec.watchFile); }
	this._onState(true, null);
	return Promise.resolve(true);
};

DosboxRunner.prototype.stop = function () {
	const self = this;
	if (!this._child) { return Promise.resolve(false); }
	const child = this._child;
	return new Promise(function (resolve) {
		let done = false;
		function finish() { if (!done) { done = true; resolve(true); } }
		child.once('exit', finish);
		try { child.kill('SIGTERM'); } catch (e) { finish(); }
		setTimeout(function () {
			if (!done) { try { child.kill('SIGKILL'); } catch (e) { } finish(); }
		}, 2000);
	}).then(function (r) { self._unwatch(); return r; });
};

DosboxRunner.prototype.restart = function (spec) {
	const self = this;
	return this.stop().then(function () { return self.start(spec); });
};

module.exports = { DosboxRunner };
