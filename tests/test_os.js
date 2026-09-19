/* integration tests: kernel spawn/kill, WM focus/drag/close, shell menu,
 * term shell commands — all driven headless through the shim. */

const kmod = Require('os/kernel');
const wmod = Require('os/wm');
const shmod = Require('shell/desktop');
const evmod = Require('sdk/events');
const termmod = Require('apps/term');

const SCAN = evmod.SCAN;
const BTN = evmod.BTN;

function makeOs() {
	const k = new kmod.Kernel();
	k.wm = new wmod.WindowManager(k);
	k.shell = new shmod.DesktopShell(k);
	k.registerApp({ name: 'term', path: 'apps/term', title: 'Terminal' });
	k.registerApp({ name: 'calc', path: 'apps/calc', title: 'Calculator', singleton: true });
	k.registerApp({ name: 'sysinfo', path: 'apps/sysinfo', title: 'System Info', singleton: true });
	k.bootTime = MsecTime();
	k.running = true;
	return k;
}

function feed(k, ev) { k.pump.feed(ev); }
function pump(k) { while (k.pump.hasEvents()) { k.wm.dispatch(k.pump.next()); } }
function mraw(x, y, b) { return { x: x, y: y, buttons: b, key: -1, ticks: MsecTime() }; }
function kraw(scan, ch) {
	return { x: 0, y: 0, buttons: 0, key: (scan << 8) | (ch ? ch.charCodeAt(0) : 0), ticks: MsecTime() };
}

exports.testSpawnCreatesProcessAndWindow = function (t) {
	const k = makeOs();
	const p = k.spawn('term', []);
	t.assert(p !== null);
	t.eq(k.procs.length, 1);
	t.eq(k.wm.windows.length, 1);
	t.eq(k.wm.focused.pid, p.pid);
};

exports.testUnknownApp = function (t) {
	const k = makeOs();
	t.eq(k.spawn('nope', []), null);
	t.assert(k.errors.length > 0);
};

exports.testSingleton = function (t) {
	const k = makeOs();
	k.spawn('calc', []);
	const again = k.spawn('calc', []);
	t.eq(k.procs.length, 1, 'singleton reuse');
};

exports.testFocusRaiseOnClick = function (t) {
	const k = makeOs();
	k.spawn('term', []);
	k.spawn('sysinfo', []);
	const w0 = k.wm.windows[0];
	const w1 = k.wm.windows[1];
	t.eq(k.wm.focused, w1);
	/* click inside w0's client area */
	const co = w0.clientOrigin(k.wm.theme);
	feed(k, mraw(co.x + 10, co.y + 10, BTN.LEFT));
	pump(k);
	feed(k, mraw(co.x + 10, co.y + 10, 0));
	pump(k);
	t.eq(k.wm.focused, w0, 'click raises window');
};

exports.testTitleDrag = function (t) {
	const k = makeOs();
	k.spawn('term', []);
	const w = k.wm.windows[0];
	const ox = w.x, oy = w.y;
	/* grab title bar center, drag, release (positions fixed up front) */
	feed(k, mraw(ox + 30, oy + 5, BTN.LEFT));
	pump(k);
	feed(k, mraw(ox + 80, oy + 25, BTN.LEFT));
	pump(k);
	feed(k, mraw(ox + 80, oy + 25, 0));
	pump(k);
	t.eq(w.x, ox + 50);
	t.eq(w.y, oy + 20);
};

exports.testCloseButton = function (t) {
	const k = makeOs();
	k.spawn('term', []);
	const w = k.wm.windows[0];
	const tt = k.wm.theme;
	/* close widget: last ~titleH px of the title band */
	const cw = tt.titleH - 2;
	const cx = w.x + tt.borderW + w.width - cw - 1 + (cw >> 1);
	const cy = w.y + tt.borderW + (tt.titleH >> 1);
	feed(k, mraw(cx, cy, BTN.LEFT));
	pump(k);
	t.eq(k.wm.windows.length, 0, 'window closed');
	t.eq(k.procs.length, 0, 'process reaped');
};

exports.testTaskbarSwallows = function (t) {
	const k = makeOs();
	k.spawn('term', []);
	const H = SizeY();
	feed(k, mraw(10, H - 5, BTN.LEFT));
	pump(k);
	t.eq(k.shell.menuOpen, true, 'start menu opened');
};

exports.testStartMenuLaunches = function (t) {
	const k = makeOs();
	const H = SizeY();
	const tt = k.wm.theme;
	/* open menu (press + release) */
	feed(k, mraw(10, H - 5, BTN.LEFT));
	pump(k);
	feed(k, mraw(10, H - 5, 0));
	pump(k);
	k.shell._rebuildMenu();
	const mh = k.shell.menuItems.length * k.shell.itemH + 4;
	const my = H - tt.taskbarH - mh - 1;
	/* click first item — registry sorts by name, so index 0 is 'calc' */
	feed(k, mraw(k.shell.menuX + 10, my + 5, BTN.LEFT));
	pump(k);
	feed(k, mraw(k.shell.menuX + 10, my + 5, 0));
	pump(k);
	t.eq(k.procs.length, 1);
	t.eq(k.procs[0].name, 'calc');
};

exports.testTermShell = function (t) {
	const k = makeOs();
	const fs = Require('sdk/fs');
	fs.writeText('C:/A.TXT', 'content-a');
	const sh = new termmod.Shell(k, fs);
	let out = sh.exec('pwd');
	t.eq(out[0], 'C:/');
	out = sh.exec('mkdir SUB');
	t.eq(out[0], 'ok');
	out = sh.exec('cd SUB');
	t.eq(sh.cwd, 'C:/SUB');
	out = sh.exec('cat ../A.TXT');
	t.eq(out[0], 'content-a');
	out = sh.exec('apps');
	t.assert(out.join(' ').indexOf('term') >= 0);
	out = sh.exec('bogus');
	t.assert(out[0].indexOf('unknown') >= 0);
};

exports.testWindowCloseVeto = function (t) {
	const k = makeOs();
	const p = k.spawn('term', []);
	p.app.onClose = function () { return false; };
	t.eq(k.wm.closeWindow(k.wm.windows[0]), false, 'vetoed');
	t.eq(k.wm.windows.length, 1);
};

exports.testRenderNoThrow = function (t) {
	const k = makeOs();
	k.spawn('term', []);
	k.spawn('calc', []);
	k.tick(); /* full frame: desktop + windows + taskbar */
	t.assert(true, 'rendered');
};

exports.testCalcButtonClick = function (t) {
	const k = makeOs();
	k.spawn('calc', []);
	const w = k.wm.windows[0];
	const co = w.clientOrigin(k.wm.theme);
	/* press '1' (row3 col0 -> client ~ x=10,y=82) then '=' */
	function click(cx, cy) {
		feed(k, mraw(co.x + cx, co.y + cy, BTN.LEFT)); pump(k);
		feed(k, mraw(co.x + cx, co.y + cy, 0)); pump(k);
	}
	click(10, 82);   /* '1' (row 3, col 0) */
	click(107, 82);  /* '+' (row 3, col 3) */
	click(41, 82);   /* '2' (row 3, col 1) */
	click(107, 100); /* '=' (row 4, col 3) */
	const app = k.procs[0].app;
	t.eq(app.expr, '3', '1+2=3');
};

/* MouseShowCursor() only toggles DOjS's per-frame Allegro cursor
 * erase/redraw (visible flicker); the WM composites its own cursor into
 * the back buffer instead. Verify boot hides the Allegro cursor and the
 * composited cursor tracks the pointer on the framebuffer. */

exports.testBootHidesAllegroCursor = function (t) {
	const bootmod = Require('os/boot');
	bootmod.boot({ autostart: false });
	t.eq(global.__host.mouseCursorShown(), false, 'Allegro cursor must be off');
};

exports.testCursorCompositedAtPointer = function (t) {
	const thememod = Require('os/theme');
	const k = makeOs();
	feed(k, mraw(120, 90, 0)); pump(k);
	k.tick();
	const scr = global.__host.screen;
	/* cursor pattern row0col0 = '#', row3col1 = 'o' */
	t.eq(scr.get(120, 90), thememod.theme.cursorOutline, 'hotspot outline');
	t.eq(scr.get(121, 93), thememod.theme.cursorFill, 'fill pixel');
};

exports.testCursorTracksPointer = function (t) {
	const thememod = Require('os/theme');
	const k = makeOs();
	feed(k, mraw(120, 90, 0)); pump(k); k.tick();
	feed(k, mraw(200, 150, 0)); pump(k); k.tick();
	const scr = global.__host.screen;
	t.eq(scr.get(200, 150), thememod.theme.cursorOutline, 'cursor moved');
	t.assert(scr.get(120, 90) !== thememod.theme.cursorOutline,
		'old position repainted');
};
