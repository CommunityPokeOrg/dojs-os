'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { resolveLaunch, buildConfText, autoexecLines } = require('../src/launch');

const WS = '/home/dev/dojs-os';
const CONF_DIR = '/tmp/extstore';

test('dev+runbat: mounts vendor as C, ws as D, calls RUN.BAT', () => {
	const spec = resolveLaunch({ mode: 'dev', target: 'runbat' }, WS, CONF_DIR);
	assert.equal(spec.args[0], '-conf');
	assert.equal(spec.confPath, path.join(CONF_DIR, 'dojs-generated.conf'));
	assert.ok(spec.confText.includes('mount C "' + path.join(WS, 'vendor', 'dojs') + '"'));
	assert.ok(spec.confText.includes('mount D "' + WS + '"'));
	assert.ok(spec.confText.includes('call RUN.BAT'));
	assert.ok(!spec.confText.includes('DOJS.EXE'));
	assert.equal(spec.watchFile, path.join(WS, 'JSLOG.TXT'));
});

test('dev+mainjs: seeds JSBOOT.ZIP then launches MAIN.JS', () => {
	const spec = resolveLaunch({ mode: 'dev', target: 'mainjs' }, WS, CONF_DIR);
	assert.ok(spec.confText.includes('copy C:\\JSBOOT.ZIP'));
	assert.ok(spec.confText.includes('C:\\DOJS.EXE -r -w 640,480 -b 32 MAIN.JS'));
	assert.ok(!spec.confText.includes('call RUN.BAT'));
});

test('packaged: mounts dist, always RUN.BAT, watches dist JSLOG', () => {
	const spec = resolveLaunch({ mode: 'packaged', target: 'mainjs' }, WS, CONF_DIR);
	assert.ok(spec.confText.includes('mount D "' + path.join(WS, 'dist') + '"'));
	assert.ok(spec.confText.includes('call RUN.BAT'));
	assert.equal(spec.watchFile, path.join(WS, 'dist', 'JSLOG.TXT'));
});

test('configPath override: uses checked-in conf verbatim', () => {
	const spec = resolveLaunch(
		{ mode: 'dev', target: 'runbat', configPath: 'dosbox/dosbox-x-dev.conf' },
		WS, CONF_DIR);
	assert.equal(spec.confPath, path.join(WS, 'dosbox', 'dosbox-x-dev.conf'));
	assert.equal(spec.confText, null);
});

test('extraArgs appended after -conf', () => {
	const spec = resolveLaunch(
		{ extraArgs: ['-set', 'fullscreen=true'] }, WS, CONF_DIR);
	assert.deepEqual(spec.args.slice(-2), ['-set', 'fullscreen=true']);
});

test('dosboxXPath default and override', () => {
	assert.equal(resolveLaunch({}, WS, CONF_DIR).bin, 'dosbox-x');
	assert.equal(
		resolveLaunch({ dosboxXPath: '/opt/db/dosbox-x' }, WS, CONF_DIR).bin,
		'/opt/db/dosbox-x');
});

test('conf text has CRLF line endings and core sections', () => {
	const t = buildConfText('dev', 'runbat', WS);
	for (const s of ['[autoexec]', '[sdl]', '[cpu]', 'lfn = true']) {
		assert.ok(t.includes(s), s);
	}
	assert.ok(t.includes('\r\n'));
});

test('autoexec lines end with exit', () => {
	const lines = autoexecLines('dev', 'runbat', WS);
	assert.equal(lines[lines.length - 1], 'exit');
});
