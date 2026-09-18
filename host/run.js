/*
 * dojs-os - host/run.js
 * Headless runner: boots the OS on the Node shim, feeds scripted input,
 * runs frames, then dumps the framebuffer to a PPM image and the text
 * ops to stdout. Usage:
 *   node host/run.js [--frames N] [--shot out.ppm] [--script events.json]
 *
 * events.json: array of [x,y,buttons,key] or {type:'key',char:'a'} etc.
 * Simple positional form is enough for smoke tests.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const shim = require('./shim.js');

const root = path.resolve(__dirname, '..');
const sandbox = path.join(root, '.dojs-sandbox');

/* seed sandbox with a demo file tree */
function seedSandbox() {
	fs.mkdirSync(path.join(sandbox, 'DOJSOS'), { recursive: true });
	fs.mkdirSync(path.join(sandbox, 'DOCS'), { recursive: true });
	fs.mkdirSync(path.join(sandbox, 'BIN'), { recursive: true });
	/* fake executable for the DOS Prompt demo (never actually run — the
	 * shim's System() just records the launch) */
	fs.writeFileSync(path.join(sandbox, 'BIN', 'HELLO.EXE'), 'MZ fake exe');
	fs.writeFileSync(path.join(sandbox, 'DOCS', 'HELLO.TXT'),
		'Hello from dojs-os!\r\nThis file lives in the host sandbox.\r\n');
	fs.writeFileSync(path.join(sandbox, 'DOJSOS', 'NOTES.TXT'), 'todo: ship it\r\n');
	fs.writeFileSync(path.join(sandbox, 'README.TXT'), 'dojs-os sandbox root\r\n');
}

const host = shim.install({ root: root, sandbox: sandbox, echoLog: false });
seedSandbox();

const argv = process.argv.slice(2);
let frames = 60;
let shot = null;
for (let i = 0; i < argv.length; i++) {
	if (argv[i] === '--frames') { frames = parseInt(argv[++i], 10); }
	if (argv[i] === '--shot') { shot = argv[++i]; }
}

/* boot */
const boot = host.require('os/boot');
const kernel = boot.boot({ autostart: 'term' });
console.log('booted. procs=', JSON.stringify(kernel.processList()));

/* scripted interaction: open start menu, launch files app, type in term */
function feed(x, y, b, key) { kernel.input(host.event(x, y, b, key)); }
function type(str) {
	for (const ch of str) { kernel.input(host.keyEvent(ch, 0)); }
}
function pressEnter() { kernel.input(host.keyEvent('\r', 67)); }

for (let f = 0; f < frames; f++) {
	if (f === 2) { type('help'); pressEnter(); }
	if (f === 4) { type('ls'); pressEnter(); }
	if (f === 6) { type('run calc'); pressEnter(); }
	if (f === 7) { kernel.spawn('dosprompt', []); } /* new window takes focus */
	if (f === 9) { type('cd C:/BIN'); pressEnter(); }
	if (f === 11) { type('dir'); pressEnter(); }
	if (f === 13) { type('hello arg1'); pressEnter(); }
	if (f === 20) { /* click "1","+","2","=" on the calc — last: clicks refocus */
		const win = kernel.wm.windows.find(w => w.title === 'Calculator');
		if (win) {
			const co = { x: win.x + 2, y: win.y + 2 + 14 };
			/* pad cells: bx=4+c*31, by=24+r*18, cell 29x16 */
			feed(co.x + 10, co.y + 82, 1); feed(co.x + 10, co.y + 82, 0);   /* 1 */
			feed(co.x + 107, co.y + 82, 1); feed(co.x + 107, co.y + 82, 0); /* + */
			feed(co.x + 41, co.y + 82, 1); feed(co.x + 41, co.y + 82, 0);   /* 2 */
			feed(co.x + 107, co.y + 100, 1); feed(co.x + 107, co.y + 100, 0); /* = */
		}
	}
	kernel.tick();
}

console.log('procs after run:', JSON.stringify(kernel.processList()));
console.log('System() calls:', JSON.stringify(host.systemCalls));
console.log('errors:', kernel.errors);
const texts = host.textLog();
console.log('--- last 30 text ops on screen ---');
for (const t of texts.slice(-30)) { console.log('  ', t.x, t.y, JSON.stringify(t.str)); }

if (shot) {
	host.saveScreen(shot);
	console.log('wrote ' + shot);
}
process.exit(kernel.errors.length ? 1 : 0);
