/*
 * dojs-os - sdk/window.js
 * Window: an app-visible window handle.
 *
 * A window has a title bar (managed by the WM) and a client area backed
 * by an off-screen Bitmap. Apps draw into `window.surface` (a Surface)
 * in client-relative coordinates; the WM blits the bitmap to screen.
 *
 * Do not construct directly — use wm.createWindow() / app.createWindow().
 */

var gfxmod = Require('sdk/gfx');
var Surface = gfxmod.Surface;

var _nextWinId = 1;

function Window(opts) {
	opts = opts || {};
	this.id = _nextWinId++;
	this.title = opts.title || 'Untitled';
	this.x = opts.x === undefined ? 40 : opts.x;
	this.y = opts.y === undefined ? 30 : opts.y;
	this.width = opts.width || 240;
	this.height = opts.height || 160;
	this.app = opts.app || null;      // owner app instance
	this.pid = opts.pid || 0;         // owning process id
	this.visible = true;
	this.resizable = opts.resizable !== false;
	this.closable = opts.closable !== false;
	this.dirty = true;                // client area needs redraw
	this.flags = opts.flags || 0;
	this.bitmap = new Bitmap(this.width, this.height);
	this.surface = new Surface(this.bitmap);
	this.surface.clear(opts.bg);
}

/* client-area coordinate helpers -------------------------------------- */

Window.prototype.clientOrigin = function (t) {
	/* screen position of client (0,0): frame border + title bar */
	return { x: this.x + t.borderW, y: this.y + t.borderW + t.titleH };
};

Window.prototype.outerWidth = function (t) { return this.width + 2 * t.borderW; };
Window.prototype.outerHeight = function (t) { return this.height + t.titleH + 2 * t.borderW; };

Window.prototype.containsScreenPoint = function (px, py, t) {
	return px >= this.x && px < this.x + this.outerWidth(t) &&
		py >= this.y && py < this.y + this.outerHeight(t);
};

/* public window ops ----------------------------------------------------- */

Window.prototype.setTitle = function (title) {
	this.title = title;
};

Window.prototype.move = function (x, y) {
	this.x = x;
	this.y = y;
};

Window.prototype.resize = function (w, h) {
	if (!this.resizable) { return; }
	this.width = Math.max(32, w);
	this.height = Math.max(24, h);
	this.bitmap = new Bitmap(this.width, this.height);
	this.surface = new Surface(this.bitmap);
	this.dirty = true;
	if (this.app && this.app.onResize) {
		this.app.onResize(this, this.width, this.height);
	}
};

Window.prototype.invalidate = function () {
	this.dirty = true;
};

Window.prototype.center = function () {
	this.x = Math.max(0, ((SizeX() - this.outerWidth({ borderW: 2 })) >> 1));
	this.y = Math.max(0, ((SizeY() - this.height) >> 1) - 8);
};

exports.__VERSION__ = 1;
exports.Window = Window;
