'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { DosboxRunner } = require('../src/runner');

function fakeSpawn() {
	const calls = [];
	const emitter = new EventEmitter();
	const proc = Object.assign(emitter, {
		stdout: new EventEmitter(),
		stderr: new EventEmitter(),
		kill: (sig) => { proc.killed = sig; setImmediate(() => proc.emit('exit', 0, sig)); }
	});
	const spawn = (bin, args, opts) => {
		calls.push({ bin, args, opts });
		return proc;
	};
	return { spawn, calls, proc };
}

function fakeOut() {
	const lines = [];
	return { lines, appendLine: (l) => lines.push(l), append: (l) => lines.push(l) };
}

const SPEC = {
	bin: 'dosbox-x',
	args: ['-conf', '/tmp/x.conf'],
	cwd: '/ws',
	confPath: null, confText: null,
	mode: 'dev', target: 'runbat',
	watchFile: '/nonexistent/JSLOG.TXT'
};

test('start spawns with spec and streams stdout/stderr', async () => {
	const f = fakeSpawn(); const out = fakeOut();
	const r = new DosboxRunner({ spawn: f.spawn, output: out });
	await r.start(SPEC);
	assert.equal(r.isRunning(), true);
	assert.equal(f.calls[0].bin, 'dosbox-x');
	assert.deepEqual(f.calls[0].opts, { cwd: '/ws' });
	f.proc.stdout.emit('data', 'DOSBox-X ready\nmore\n');
	f.proc.stderr.emit('data', 'warn\n');
	assert.ok(out.lines.some(l => l.includes('[stdout] DOSBox-X ready')));
	assert.ok(out.lines.some(l => l.includes('[stderr] warn')));
});

test('stop sends SIGTERM and clears running state', async () => {
	const f = fakeSpawn(); const out = fakeOut();
	const r = new DosboxRunner({ spawn: f.spawn, output: out });
	await r.start(SPEC);
	const ok = await r.stop();
	assert.equal(ok, true);
	assert.equal(r.isRunning(), false);
});

test('restart stops then starts again', async () => {
	const f = fakeSpawn(); const out = fakeOut();
	const r = new DosboxRunner({ spawn: f.spawn, output: out });
	await r.start(SPEC);
	await r.restart(SPEC);
	assert.equal(f.calls.length, 2);
	assert.equal(r.isRunning(), true);
});

test('start writes generated conf file when confText set', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dojs-conf-'));
	const conf = path.join(dir, 'gen.conf');
	const f = fakeSpawn(); const out = fakeOut();
	const r = new DosboxRunner({ spawn: f.spawn, output: out });
	await r.start(Object.assign({}, SPEC, { confPath: conf, confText: 'X\r\n' }));
	assert.equal(fs.readFileSync(conf, 'utf8'), 'X\r\n');
});

test('exit clears running flag and reports state', async () => {
	const f = fakeSpawn(); const out = fakeOut();
	const states = [];
	const r = new DosboxRunner({ spawn: f.spawn, output: out, onState: (s) => states.push(s) });
	await r.start(SPEC);
	f.proc.emit('exit', 1, null);
	assert.equal(r.isRunning(), false);
	assert.deepEqual(states, [true, false]);
});

test('tail streams appended JSLOG.TXT lines', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dojs-log-'));
	const logf = path.join(dir, 'JSLOG.TXT');
	fs.writeFileSync(logf, 'boot\n');
	const f = fakeSpawn(); const out = fakeOut();
	const r = new DosboxRunner({ spawn: f.spawn, output: out });
	await r.start(Object.assign({}, SPEC, { watchFile: logf }));
	fs.appendFileSync(logf, 'frame1\nframe2\n');
	await new Promise(r2 => setTimeout(r2, 900));
	await r.stop();
	assert.ok(out.lines.some(l => l.includes('frame1')), JSON.stringify(out.lines.slice(-5)));
});
