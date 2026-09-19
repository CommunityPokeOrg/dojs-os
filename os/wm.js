/*
 * dojs-os - os/wm.js
 * Window manager + compositor.
 *
 * DOjS has no clipping API, so every window's client area lives in its
 * own off-screen Bitmap. Each frame the WM:
 *   1. clears the screen, lets the shell paint the desktop
 *   2. draws each window bottom-to-top: shadow, border, title bar,
 *      close/maximize widgets, then blits the client bitmap
 *   3. lets the shell paint the taskbar + menus on top
 *
 * Input routing:
 *   - hits in the taskbar/menu layer go to the shell
 *   - hits on a title bar raise+focus the window and start a drag
 *   - hits on the close widget ask the kernel to close the window
 *   - hits inside client areas are translated to client coordinates and
 *     forwarded to the owning app
 *   - keys always go to the focused window's app
 */

var thememod = Require('os/theme');
var gfxmod = Require('sdk/gfx');
var evmod = Require('sdk/events');
var winmod = Require('sdk/window');

var SCAN = evmod.SCAN;
var BTN = evmod.BTN;

/*
 * Arrow cursor composited into the frame buffer. DOjS only offers
 * MouseShowCursor(), which makes Allegro erase and redraw a software
 * cursor on the displayed screen around every frame's Loop()+blit —
 * that erase/redraw cycle is visible as cursor flicker on DOS/VESA.
 * Painting the cursor into the back buffer each frame avoids it.
 * '#': outline, 'o': fill. Hotspot is (0,0).
 */
var CURSOR_PATTERN = [
	'#...........',
	'##..........',
	'#o#.........',
	'#oo#........',
	'#ooo#.......',
	'#oooo#......',
	'#ooooo#.....',
	'#oooooo#....',
	'#ooooooo#...',
	'#oooooooo#..',
	'#ooooooooo#.',
	'#oooooo#####',
	'#oo#oo#.....',
	'#o#.#oo#....',
	'##..#oo#....',
	'#...#oo#....',
	'....####....'
];

function WindowManager(kernel) {
	this.kernel = kernel;
	this.theme = thememod.theme;
	this.windows = [];        // bottom -> top z-order
	this.focused = null;
	this.screen = new gfxmod.Surface(null);
	this.drag = null;         // {win, dx, dy}
	this.closeHovers = null;
	this._cascade = 0;
	this.mouseX = -1;         // last reported pointer position
	this.mouseY = -1;
	this.cursorVisible = true;
}

/* --- window ops -------------------------------------------------------- */

WindowManager.prototype.createWindow = function (opts) {
	var win = new winmod.Window(opts);
	if (opts.x === undefined || opts.y === undefined) {
		var t = this.theme;
		win.x = 20 + (this._cascade % 8) * 16;
		win.y = 16 + (this._cascade % 8) * 14;
		this._cascade++;
	}
	this.windows.push(win);
	this.focusWindow(win);
	return win;
};

WindowManager.prototype.focusWindow = function (win) {
	if (!win) { return; }
	var idx = this.windows.indexOf(win);
	if (idx < 0) { return; }
	this.windows.splice(idx, 1);
	this.windows.push(win);       // top of z-order
	this.focused = win;
};

WindowManager.prototype.focusProcess = function (pid) {
	for (var i = this.windows.length - 1; i >= 0; i--) {
		if (this.windows[i].pid === pid) {
			this.focusWindow(this.windows[i]);
			return;
		}
	}
};

WindowManager.prototype.closeWindow = function (win) {
	if (!win.closable) { return false; }
	if (!this.kernel.windowClosing(win)) { return false; }
	var idx = this.windows.indexOf(win);
	if (idx >= 0) { this.windows.splice(idx, 1); }
	if (this.focused === win) {
		this.focused = this.windows.length ? this.windows[this.windows.length - 1] : null;
	}
	return true;
};

WindowManager.prototype.windowAt = function (x, y) {
	var t = this.theme;
	for (var i = this.windows.length - 1; i >= 0; i--) {
		var w = this.windows[i];
		if (w.visible && w.containsScreenPoint(x, y, t)) { return w; }
	}
	return null;
};

/* returns 'close' | 'title' | 'client' | null for a screen point in win */
WindowManager.prototype.zoneAt = function (win, x, y) {
	var t = this.theme;
	var rx = x - win.x;
	var ry = y - win.y;
	if (rx < 0 || ry < 0 || rx >= win.outerWidth(t) || ry >= win.outerHeight(t)) {
		return null;
	}
	if (ry >= t.borderW && ry < t.borderW + t.titleH &&
		rx >= t.borderW && rx < t.borderW + win.width) {
		/* inside title bar band; last ~titleH px = close button */
		var cw = t.titleH - 2;
		var closeX = t.borderW + win.width - cw - 1;
		if (win.closable && rx >= closeX && rx < closeX + cw + 1) {
			return 'close';
		}
		return 'title';
	}
	var co = win.clientOrigin(t);
	if (x >= co.x && x < co.x + win.width && y >= co.y && y < co.y + win.height) {
		return 'client';
	}
	return 'frame';
};

/* --- input dispatch ------------------------------------------------------ */

WindowManager.prototype.dispatch = function (ev) {
	var t = this.theme;
	var taskbarY = SizeY() - t.taskbarH;

	/* every DOjS input event carries x/y; remember it for the cursor */
	if (ev.x !== undefined) {
		this.mouseX = ev.x | 0;
		this.mouseY = ev.y | 0;
	}

	/* shell gets first shot at events inside its layers (taskbar, menus) */
	if (this.kernel.shell && this.kernel.shell.handleEvent(ev)) {
		this.drag = null;
		return;
	}

	if (ev.type === 'mousedown' && ev.button === BTN.LEFT) {
		var win = this.windowAt(ev.x, ev.y);
		if (!win) { return; }
		this.focusWindow(win);
		var zone = this.zoneAt(win, ev.x, ev.y);
		if (zone === 'close') {
			this.closeWindow(win);
			return;
		}
		if (zone === 'title') {
			this.drag = { win: win, dx: ev.x - win.x, dy: ev.y - win.y };
			return;
		}
		if (zone === 'client') {
			this._deliver(win, ev);
			return;
		}
		return;
	}

	if (ev.type === 'mouseup' && ev.button === BTN.LEFT) {
		if (this.drag) {
			this.drag = null;
			return;
		}
		var w2 = this.windowAt(ev.x, ev.y);
		if (w2 && w2 === this.focused && this.zoneAt(w2, ev.x, ev.y) === 'client') {
			this._deliver(w2, ev);
		}
		return;
	}

	if (ev.type === 'mousemove') {
		if (this.drag) {
			var dw = this.drag.win;
			dw.move(ev.x - this.drag.dx, ev.y - this.drag.dy);
			if (dw.x < -dw.width) { dw.x = -dw.width + 40; }
			if (dw.y < 0) { dw.y = 0; }
			if (dw.y > taskbarY - 10) { dw.y = taskbarY - 10; }
			return;
		}
		var w3 = this.windowAt(ev.x, ev.y);
		if (w3 && w3 === this.focused && this.zoneAt(w3, ev.x, ev.y) === 'client') {
			this._deliver(w3, ev);
		}
		return;
	}

	if (ev.type === 'click' || ev.type === 'dblclick') {
		var w4 = this.windowAt(ev.x, ev.y);
		if (w4 && this.zoneAt(w4, ev.x, ev.y) === 'client') {
			if (w4 !== this.focused) { this.focusWindow(w4); }
			this._deliver(w4, ev);
		}
		return;
	}

	if (ev.type === 'keydown') {
		/* global: Alt-Tab style cycling via F6, Esc clears shell menus */
		if (this.focused) {
			this._deliverKey(this.focused, ev);
		}
		return;
	}
};

WindowManager.prototype._deliver = function (win, ev) {
	var t = this.theme;
	var co = win.clientOrigin(t);
	var proc = this.kernel.findByPid(win.pid);
	if (!proc || !proc.app) { return; }
	var out = {
		type: ev.type,
		x: ev.x - co.x,
		y: ev.y - co.y,
		button: ev.button,
		buttons: ev.buttons,
		key: ev.key,
		scan: ev.scan,
		char: ev.char
	};
	try {
		proc.app.onEvent(win, out);
	} catch (e) {
		this.kernel.errors.push('onEvent ' + proc.name + ': ' + e);
	}
};

WindowManager.prototype._deliverKey = function (win, ev) {
	this._deliver(win, ev);
};

/* --- rendering ----------------------------------------------------------- */

WindowManager.prototype.render = function () {
	var t = this.theme;
	var g = this.screen;
	var W = SizeX();
	var H = SizeY();

	/* desktop background (shell paints icons/wallpaper details) */
	if (this.kernel.shell) {
		this.kernel.shell.drawDesktop(g, t);
	} else {
		g.clear(t.desktop);
	}

	for (var i = 0; i < this.windows.length; i++) {
		this._drawWindow(this.windows[i], g, t);
	}

	if (this.kernel.shell) {
		this.kernel.shell.drawTaskbar(g, t);
	}

	if (this.cursorVisible) {
		this._drawCursor(g, t);
	}
};

WindowManager.prototype._drawCursor = function (g, t) {
	if (this.mouseX < 0) {
		this.mouseX = (SizeX() / 2) | 0;
		this.mouseY = (SizeY() / 2) | 0;
	}
	for (var ry = 0; ry < CURSOR_PATTERN.length; ry++) {
		var row = CURSOR_PATTERN[ry];
		for (var rx = 0; rx < row.length; rx++) {
			var ch = row.charAt(rx);
			if (ch === '#') {
				g.pixel(this.mouseX + rx, this.mouseY + ry, t.cursorOutline);
			} else if (ch === 'o') {
				g.pixel(this.mouseX + rx, this.mouseY + ry, t.cursorFill);
			}
		}
	}
};

WindowManager.prototype._drawWindow = function (win, g, t) {
	if (!win.visible) { return; }
	var ow = win.outerWidth(t);
	var oh = win.outerHeight(t);
	var active = (win === this.focused);

	/* border + frame */
	g.fillRect(win.x, win.y, ow, oh, t.winFrame);
	g.bevel(win.x, win.y, ow, oh, true, t.winBorderLight, t.winBorderDark);

	/* title bar */
	var tbX = win.x + t.borderW;
	var tbY = win.y + t.borderW;
	var tbW = win.width;
	g.fillRect(tbX, tbY, tbW, t.titleH, active ? t.titleActive : t.titleInactive);
	g.text(tbX + 3, tbY + 3, win.title, t.titleText, NO_COLOR);

	/* close widget */
	if (win.closable) {
		var cw = t.titleH - 2;
		var cx = tbX + tbW - cw - 1;
		var cy = tbY + 1;
		g.fillRect(cx, cy, cw, cw, t.buttonFace);
		g.bevel(cx, cy, cw, cw, true, t.buttonHi, t.buttonLo);
		g.line(cx + 2, cy + 2, cx + cw - 3, cy + cw - 3, t.buttonText);
		g.line(cx + cw - 3, cy + 2, cx + 2, cy + cw - 3, t.buttonText);
	}

	/* client bitmap */
	var co = win.clientOrigin(t);
	win.bitmap.Draw(co.x, co.y);
};

exports.__VERSION__ = 1;
exports.WindowManager = WindowManager;
