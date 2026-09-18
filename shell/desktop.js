/*
 * dojs-os - shell/desktop.js
 * The desktop shell: wallpaper, taskbar, start menu, launcher.
 *
 * The shell is the layer below windows (desktop icons / wallpaper) and
 * above them (taskbar + start menu). It owns the bottom taskbarH px of
 * the screen and a start-menu popup. Window buttons in the taskbar
 * raise/focus windows; the start menu spawns registered apps.
 */

var evmod = Require('sdk/events');
var BTN = evmod.BTN;
var SCAN = evmod.SCAN;

function DesktopShell(kernel) {
	this.kernel = kernel;
	this.menuOpen = false;
	this.menuItems = [];          // [{label, name}]
	this.menuX = 2;
	this.menuW = 110;
	this.itemH = 14;
	this.startBtn = { x: 2, w: 44 };
	this._clockCache = '';
	this._clockAt = 0;
}

/* recompute menu items from the kernel registry */
DesktopShell.prototype._rebuildMenu = function () {
	var apps = this.kernel.registeredApps();
	this.menuItems = [];
	for (var i = 0; i < apps.length; i++) {
		this.menuItems.push({ label: apps[i].title || apps[i].name, name: apps[i].name });
	}
	this.menuItems.push({ label: '----------------', name: null });
	this.menuItems.push({ label: 'Shut down', name: '__shutdown__' });
};

/* --- drawing ----------------------------------------------------------- */

DesktopShell.prototype.drawDesktop = function (g, t) {
	var W = SizeX();
	var H = SizeY() - t.taskbarH;
	g.clear(t.desktop);
	/* subtle dot-grid wallpaper, cheap on slow CPUs */
	for (var y = 8; y < H - 4; y += 16) {
		for (var x = 8; x < W - 4; x += 16) {
			g.pixel(x, y, t.taskbarDark);
		}
	}
	g.text(W - 116, 4, 'dojs-os', t.taskbarLight, NO_COLOR);
	g.text(W - 116, 14, 'DOjS ' + (typeof DOJS_VERSION === 'number' ? DOJS_VERSION : ''), t.taskbarLight, NO_COLOR);
};

DesktopShell.prototype._clock = function () {
	var now = MsecTime();
	if (now - this._clockAt < 500) { return this._clockCache; }
	this._clockAt = now;
	var secs = Math.floor(now / 1000) % 60;
	var mins = Math.floor(now / 60000) % 60;
	var hrs = Math.floor(now / 3600000);
	var p = function (n) { return (n < 10 ? '0' : '') + n; };
	this._clockCache = p(hrs) + ':' + p(mins) + ':' + p(secs);
	return this._clockCache;
};

DesktopShell.prototype.drawTaskbar = function (g, t) {
	var W = SizeX();
	var H = SizeY();
	var ty = H - t.taskbarH;

	g.fillRect(0, ty, W, t.taskbarH, t.taskbar);
	g.line(0, ty, W, ty, t.taskbarLight);

	/* start button */
	var sb = this.startBtn;
	var pressed = this.menuOpen;
	g.fillRect(sb.x, ty + 2, sb.w, t.taskbarH - 4, pressed ? t.buttonPressed : t.buttonFace);
	g.bevel(sb.x, ty + 2, sb.w, t.taskbarH - 4, !pressed, t.buttonHi, t.buttonLo);
	g.text(sb.x + 6, ty + 5, 'dojs', t.buttonText, NO_COLOR);

	/* window buttons */
	var bx = sb.x + sb.w + 6;
	var bw = 90;
	var bh = t.taskbarH - 4;
	var wins = this.kernel.wm.windows;
	for (var i = 0; i < wins.length && bx + bw < W - 60; i++) {
		var w = wins[i];
		var active = (w === this.kernel.wm.focused);
		g.fillRect(bx, ty + 2, bw, bh, active ? t.buttonPressed : t.buttonFace);
		g.bevel(bx, ty + 2, bw, bh, !active, t.buttonHi, t.buttonLo);
		var label = w.title;
		if (label.length > 12) { label = label.substring(0, 11) + '~'; }
		g.text(bx + 4, ty + 5, label, t.buttonText, NO_COLOR);
		bx += bw + 4;
	}

	/* clock */
	g.textRight(W - 4, ty + 5, this._clock(), t.buttonText, NO_COLOR);

	/* start menu popup */
	if (this.menuOpen) {
		this._drawMenu(g, t);
	}
};

DesktopShell.prototype._drawMenu = function (g, t) {
	var H = SizeY();
	var mh = this.menuItems.length * this.itemH + 4;
	var my = H - t.taskbarH - mh - 1;
	g.fillRect(this.menuX, my, this.menuW, mh, t.menuBg);
	g.bevel(this.menuX, my, this.menuW, mh, true, t.buttonHi, t.buttonLo);
	for (var i = 0; i < this.menuItems.length; i++) {
		var iy = my + 2 + i * this.itemH;
		var it = this.menuItems[i];
		if (it.name === null) {
			g.line(this.menuX + 4, iy + (this.itemH >> 1), this.menuX + this.menuW - 4,
				iy + (this.itemH >> 1), t.taskbarDark);
		} else {
			g.text(this.menuX + 6, iy + 3, it.label, t.menuText, NO_COLOR);
		}
	}
};

DesktopShell.prototype._menuIndexAt = function (x, y, t) {
	var H = SizeY();
	var mh = this.menuItems.length * this.itemH + 4;
	var my = H - t.taskbarH - mh - 1;
	if (x < this.menuX || x >= this.menuX + this.menuW || y < my || y >= my + mh) {
		return -1;
	}
	var idx = Math.floor((y - my - 2) / this.itemH);
	if (idx < 0 || idx >= this.menuItems.length) { return -1; }
	return idx;
};

/* --- events ------------------------------------------------------------- */

/* return true if the event was consumed by the shell layer */
DesktopShell.prototype.handleEvent = function (ev) {
	var t = this.kernel.theme;
	var W = SizeX();
	var H = SizeY();
	var ty = H - t.taskbarH;

	if (ev.type === 'mousedown' && ev.button === BTN.LEFT) {
		/* taskbar */
		if (ev.y >= ty) {
			var sb = this.startBtn;
			if (ev.x >= sb.x && ev.x < sb.x + sb.w) {
				this.menuOpen = !this.menuOpen;
				if (this.menuOpen) { this._rebuildMenu(); }
				return true;
			}
			/* window buttons */
			var bx = sb.x + sb.w + 6;
			var bw = 90;
			var wins = this.kernel.wm.windows;
			for (var i = 0; i < wins.length && bx + bw < W - 60; i++) {
				if (ev.x >= bx && ev.x < bx + bw) {
					this.kernel.wm.focusWindow(wins[i]);
					return true;
				}
				bx += bw + 4;
			}
			this.menuOpen = false;
			return true;
		}
		/* open start menu */
		if (this.menuOpen) {
			var idx = this._menuIndexAt(ev.x, ev.y, t);
			this.menuOpen = false;
			if (idx >= 0) {
				var it = this.menuItems[idx];
				if (it.name === '__shutdown__') {
					this.kernel.shutdown();
				} else if (it.name) {
					this.kernel.spawn(it.name, []);
				}
			}
			return true;
		}
		return false;
	}

	if (ev.type === 'keydown' && ev.scan === SCAN.ESC) {
		if (this.menuOpen) {
			this.menuOpen = false;
			return true;
		}
	}
	return false;
};

exports.__VERSION__ = 1;
exports.DesktopShell = DesktopShell;
