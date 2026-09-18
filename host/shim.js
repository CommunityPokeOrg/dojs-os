/*
 * dojs-os - host/shim.js
 * DOjS runtime shim for Node.js. Installs the DOjS global API surface
 * (graphics, bitmap, file IO, modules, input constants) on globalThis so
 * the OS modules run unmodified on a host machine.
 *
 * - Graphics draw into an in-memory framebuffer (Color = packed ARGB).
 * - Text is rasterized with a tiny embedded 3x5-ish block font, so
 *   screen captures still show where text landed (not pretty, legible).
 * - File IO is sandboxed to a host directory; DOS paths like "C:/X"
 *   map onto <sandbox>/X.
 * - Require() mirrors DOjS resolution: "os/kernel" -> <root>/os/kernel.js.
 *
 * Not a DOjS emulator — only the API surface dojs-os uses. Anything
 * unimplemented throws loudly so gaps are obvious.
 */

'use strict';

const nodeFs = require('fs');
const nodePath = require('path');

/* set by install(): returns the Framebuffer draw ops currently target */
let currentTarget = function () { throw new Error('shim not installed'); };

/* ---------------- small font (3x5, upper/digits/punct) ----------------- */
/* Each glyph is 5 rows x 3 bits, packed LSB-left. Unknown -> '?'. */
const FONT3X5 = {
	'A': [2, 5, 7, 5, 5], 'B': [6, 5, 6, 5, 6], 'C': [3, 4, 4, 4, 3],
	'D': [6, 5, 5, 5, 6], 'E': [7, 4, 6, 4, 7], 'F': [7, 4, 6, 4, 4],
	'G': [3, 4, 5, 5, 3], 'H': [5, 5, 7, 5, 5], 'I': [7, 2, 2, 2, 7],
	'J': [1, 1, 1, 5, 2], 'K': [5, 5, 6, 5, 5], 'L': [4, 4, 4, 4, 7],
	'M': [5, 7, 5, 5, 5], 'N': [6, 5, 5, 5, 5], 'O': [2, 5, 5, 5, 2],
	'P': [6, 5, 6, 4, 4], 'Q': [2, 5, 5, 6, 3], 'R': [6, 5, 6, 5, 5],
	'S': [3, 4, 2, 1, 6], 'T': [7, 2, 2, 2, 2], 'U': [5, 5, 5, 5, 7],
	'V': [5, 5, 5, 5, 2], 'W': [5, 5, 5, 7, 5], 'X': [5, 5, 2, 5, 5],
	'Y': [5, 5, 2, 2, 2], 'Z': [7, 1, 2, 4, 7],
	'0': [2, 5, 5, 5, 2], '1': [2, 6, 2, 2, 7], '2': [6, 1, 2, 4, 7],
	'3': [6, 1, 2, 1, 6], '4': [1, 5, 7, 1, 1], '5': [7, 4, 6, 1, 6],
	'6': [3, 4, 6, 5, 2], '7': [7, 1, 1, 2, 2], '8': [2, 5, 2, 5, 2],
	'9': [2, 5, 3, 1, 6],
	'.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], ':': [0, 2, 0, 2, 0],
	'-': [0, 0, 7, 0, 0], '+': [0, 2, 7, 2, 0], '=': [0, 7, 0, 7, 0],
	'/': [1, 1, 2, 4, 4], '\\': [4, 4, 2, 1, 1], '_': [0, 0, 0, 0, 7],
	'(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], '[': [3, 2, 2, 2, 3],
	']': [6, 2, 2, 2, 6], '<': [1, 2, 4, 2, 1], '>': [4, 2, 1, 2, 4],
	'*': [5, 2, 5, 0, 0], '%': [5, 1, 2, 4, 5], '^': [2, 5, 0, 0, 0],
	'!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2], '"': [5, 5, 0, 0, 0],
	"'": [2, 2, 0, 0, 0], ';': [0, 2, 0, 2, 4], '#': [5, 7, 5, 7, 5],
	'|': [2, 2, 2, 2, 2], ' ': [0, 0, 0, 0, 0]
};

function glyphFor(ch) {
	var g = FONT3X5[ch];
	if (!g) { g = FONT3X5[ch.toUpperCase()]; }
	if (!g) { g = FONT3X5['?']; }
	return g;
}

/* ---------------- framebuffer ----------------------------------------- */

function Framebuffer(w, h) {
	this.width = w;
	this.height = h;
	this.px = new Uint32Array(w * h);
	this.textLog = []; /* [{x,y,str,fg,bg}] for debugging/tests */
}

Framebuffer.prototype.clear = function (c) {
	this.px.fill(c >>> 0);
	this.textLog.length = 0;
};

Framebuffer.prototype.plot = function (x, y, c) {
	x |= 0; y |= 0;
	if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
		this.px[y * this.width + x] = c >>> 0;
	}
};

Framebuffer.prototype.get = function (x, y) {
	x |= 0; y |= 0;
	if (x < 0 || y < 0 || x >= this.width || y >= this.height) { return 0; }
	return this.px[y * this.width + x];
};

Framebuffer.prototype.line = function (x1, y1, x2, y2, c) {
	x1 |= 0; y1 |= 0; x2 |= 0; y2 |= 0;
	var dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1);
	var sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
	var err = dx + dy;
	for (;;) {
		this.plot(x1, y1, c);
		if (x1 === x2 && y1 === y2) { break; }
		var e2 = 2 * err;
		if (e2 >= dy) { err += dy; x1 += sx; }
		if (e2 <= dx) { err += dx; y1 += sy; }
	}
};

Framebuffer.prototype.rect = function (x1, y1, x2, y2, c) {
	this.line(x1, y1, x2, y1, c);
	this.line(x1, y2, x2, y2, c);
	this.line(x1, y1, x1, y2, c);
	this.line(x2, y1, x2, y2, c);
};

Framebuffer.prototype.fillRect = function (x1, y1, x2, y2, c) {
	if (x1 > x2) { var t = x1; x1 = x2; x2 = t; }
	if (y1 > y2) { var t2 = y1; y1 = y2; y2 = t2; }
	for (var y = y1; y <= y2; y++) {
		for (var x = x1; x <= x2; x++) { this.plot(x, y, c); }
	}
};

Framebuffer.prototype.circle = function (cx, cy, r, c, fill) {
	var x = -r, y = 0, err = 2 - 2 * r;
	do {
		if (fill) {
			this.line(cx + x, cy - y, cx - x, cy - y, c);
			this.line(cx + x, cy + y, cx - x, cy + y, c);
		} else {
			this.plot(cx - x, cy + y, c); this.plot(cx + x, cy + y, c);
			this.plot(cx - x, cy - y, c); this.plot(cx + x, cy - y, c);
		}
		r = err;
		if (r <= y) { err += ++y * 2 + 1; }
		if (r > x || err > y) { err += ++x * 2 + 1; }
	} while (x < 0);
};

Framebuffer.prototype.ellipse = function (cx, cy, rx, ry, c, fill) {
	for (var y = -ry; y <= ry; y++) {
		var xr = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry || 1))));
		if (fill) {
			this.line(cx - xr, cy + y, cx + xr, cy + y, c);
		} else {
			this.plot(cx - xr, cy + y, c);
			this.plot(cx + xr, cy + y, c);
		}
	}
};

/* scanline fill of polygon given as flat [x0,y0,x1,y1,...] */
Framebuffer.prototype.fillPolygon = function (v, c) {
	var n = Math.floor(v.length / 2);
	if (n < 3) { return; }
	var minY = Infinity, maxY = -Infinity;
	for (var i = 0; i < n; i++) {
		var y = v[i * 2 + 1];
		if (y < minY) { minY = y; }
		if (y > maxY) { maxY = y; }
	}
	for (var yy = Math.ceil(minY); yy <= Math.floor(maxY); yy++) {
		var nodes = [];
		var j = n - 1;
		for (i = 0; i < n; i++) {
			var yi = v[i * 2 + 1], yj = v[j * 2 + 1];
			if ((yi < yy && yj >= yy) || (yj < yy && yi >= yy)) {
				var xi = v[i * 2], xj = v[j * 2];
				nodes.push(Math.round(xi + (yy - yi) / (yj - yi) * (xj - xi)));
			}
			j = i;
		}
		nodes.sort(function (a, b) { return a - b; });
		for (var k = 0; k + 1 < nodes.length; k += 2) {
			this.line(nodes[k], yy, nodes[k + 1], yy, c);
		}
	}
};

Framebuffer.prototype.floodFill = function (x, y, border, c) {
	var target = this.get(x, y);
	if (target === c || target === border) { return; }
	var stack = [[x, y]];
	var guard = this.width * this.height;
	while (stack.length && guard-- > 0) {
		var p = stack.pop();
		var px = p[0], py = p[1];
		if (this.get(px, py) !== target) { continue; }
		this.plot(px, py, c);
		stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
	}
};

/* draw text with the embedded font (no-op pixels for space) */
Framebuffer.prototype.text = function (x, y, str, fg, bg) {
	this.textLog.push({ x: x | 0, y: y | 0, str: String(str), fg: fg, bg: bg });
	var cx = x | 0;
	for (var i = 0; i < String(str).length; i++) {
		var ch = String(str).charAt(i);
		var g = glyphFor(ch);
		if (bg !== undefined && bg !== null && bg !== -1) {
			this.fillRect(cx, y, 5, 7, bg);
		}
		for (var r = 0; r < 5; r++) {
			for (var b = 0; b < 3; b++) {
				/* glyph rows are MSB-left: bit 2 is the leftmost pixel */
				if (g[r] & (4 >> b)) { this.plot(cx + b + 1, (y | 0) + r + 1, fg); }
			}
		}
		cx += 6;
	}
};

/* blit another framebuffer/bitmap onto this one */
Framebuffer.prototype.blit = function (src, sx, sy, sw, sh, dx, dy, dw, dh) {
	sw = sw === undefined ? src.width : sw;
	sh = sh === undefined ? src.height : sh;
	dw = dw === undefined ? sw : dw;
	dh = dh === undefined ? sh : dh;
	for (var y = 0; y < dh; y++) {
		for (var x = 0; x < dw; x++) {
			var sxp = sx + Math.floor(x * sw / dw);
			var syp = sy + Math.floor(y * sh / dh);
			var p = src.get(sxp, syp);
			if (p !== undefined) { this.plot(dx + x, dy + y, p); }
		}
	}
};

Framebuffer.prototype.toPPM = function (file) {
	var out = Buffer.alloc(this.width * this.height * 3);
	for (var i = 0; i < this.px.length; i++) {
		var c = this.px[i];
		out[i * 3] = (c >> 16) & 0xFF;
		out[i * 3 + 1] = (c >> 8) & 0xFF;
		out[i * 3 + 2] = c & 0xFF;
	}
	var header = Buffer.from('P6\n' + this.width + ' ' + this.height + '\n255\n');
	nodeFs.writeFileSync(file, Buffer.concat([header, out]));
};

/* ---------------- Bitmap / Font shims ------------------------------------ */

function ShimBitmap(a, b, c) {
	if (typeof a === 'number') {
		this.width = a; this.height = b;
		this.filename = null;
		this._fb = new Framebuffer(a, b);
		if (typeof c === 'number') { this._fb.px.fill(c >>> 0); }
	} else {
		throw new Error('shim: Bitmap(filename) not supported on host');
	}
}
ShimBitmap.prototype.Draw = function (x, y) {
	currentTarget().blit(this._fb, 0, 0, this.width, this.height, x, y);
};
ShimBitmap.prototype.DrawAdvanced = function (sx, sy, sw, sh, dx, dy, dw, dh) {
	currentTarget().blit(this._fb, sx, sy, sw, sh, dx, dy, dw, dh);
};
ShimBitmap.prototype.DrawTrans = function (x, y) { this.Draw(x, y); };
ShimBitmap.prototype.GetPixel = function (x, y) { return this._fb.get(x, y); };
ShimBitmap.prototype.Clear = function () { this._fb.px.fill(0); };
ShimBitmap.prototype.SaveBmpImage = function (f) { this._fb.toPPM(mapFile(f) + '.ppm'); };
ShimBitmap.prototype.SavePcxImage = function (f) { this._fb.toPPM(mapFile(f) + '.ppm'); };
ShimBitmap.prototype.SaveTgaImage = function (f) { this._fb.toPPM(mapFile(f) + '.ppm'); };

function ShimFont(name) {
	this.filename = name;
	this.height = 7;
	this.ranges = [[32, 126]];
}
ShimFont.prototype.DrawStringLeft = function (x, y, t, fg, bg) {
	currentTarget().text(x, y, t, fg, bg);
};
ShimFont.prototype.DrawStringCenter = function (x, y, t, fg, bg) {
	currentTarget().text(x - this.StringWidth(t) / 2, y, t, fg, bg);
};
ShimFont.prototype.DrawStringRight = function (x, y, t, fg, bg) {
	currentTarget().text(x - this.StringWidth(t), y, t, fg, bg);
};
ShimFont.prototype.StringWidth = function (s) { return String(s).length * 6; };
ShimFont.prototype.StringHeight = function () { return 7; };

/* ---------------- sandboxed file io -------------------------------------- */

var _sandbox = process.cwd();
var _root = process.cwd();

function mapFile(p) {
	/* map DOS-style path onto the sandbox dir.
	 * "C:/a/b" -> <sandbox>/a/b ; "a/b" -> <sandbox>/a/b ; "./x" similar */
	p = String(p).replace(/\\/g, '/');
	if (/^[A-Za-z]:/.test(p)) { p = p.substring(2); }
	if (p.charAt(0) === '/') { p = p.substring(1); }
	if (p.substring(0, 2) === './') { p = p.substring(2); }
	var abs = nodePath.resolve(_sandbox, p);
	if (abs !== _sandbox && !abs.startsWith(_sandbox + nodePath.sep)) {
		throw new Error('shim: path escapes sandbox: ' + p);
	}
	/* DOS filesystems are case-insensitive: resolve each component against
	 * the real directory when the literal case misses. */
	var rel = nodePath.relative(_sandbox, abs);
	if (!rel) { return abs; }
	var cur = _sandbox;
	var segs = rel.split(nodePath.sep);
	for (var i = 0; i < segs.length; i++) {
		var next = nodePath.join(cur, segs[i]);
		if (!nodeFs.existsSync(next) && nodeFs.existsSync(cur)) {
			var want = segs[i].toLowerCase();
			var ents = nodeFs.readdirSync(cur);
			for (var e = 0; e < ents.length; e++) {
				if (ents[e].toLowerCase() === want) { next = nodePath.join(cur, ents[e]); break; }
			}
		}
		cur = next;
	}
	return cur;
}

function ShimFile(name, mode) {
	this.filename = name;
	this.mode = mode;
	this._pos = 0;
	this._data = null;
	this._out = null;
	this._closed = false;
	var real = mapFile(name);
	if (mode === 'rb') {
		this._data = nodeFs.readFileSync(real);
	} else if (mode === 'wb') {
		this._out = [];
	} else if (mode === 'ab') {
		this._out = [];
		if (nodeFs.existsSync(real)) {
			this._out.push(nodeFs.readFileSync(real));
		}
	} else {
		throw new Error('shim: unsupported File mode ' + mode);
	}
}
ShimFile.prototype._need = function () { if (this._closed) { throw new Error('file closed'); } };
ShimFile.prototype.Close = function () {
	this._need();
	if (this._out !== null) {
		nodeFs.mkdirSync(nodePath.dirname(mapFile(this.filename)), { recursive: true });
		nodeFs.writeFileSync(mapFile(this.filename), Buffer.concat(this._out));
	}
	this._closed = true;
};
ShimFile.prototype.GetSize = function () {
	this._need();
	return this._data ? this._data.length : nodeFs.statSync(mapFile(this.filename)).size;
};
ShimFile.prototype.WriteString = function (txt) { this._need(); this._out.push(Buffer.from(String(txt), 'utf8')); };
ShimFile.prototype.ReadLine = function () {
	this._need();
	if (this._pos >= this._data.length) { return null; }
	var idx = this._data.indexOf(10, this._pos);
	var end = idx < 0 ? this._data.length : idx + 1;
	var line = this._data.slice(this._pos, end).toString('utf8');
	this._pos = end;
	return line;
};
ShimFile.prototype.WriteLine = function (txt) { this.WriteString(String(txt) + '\n'); };
ShimFile.prototype.ReadByte = function () {
	this._need();
	if (this._pos >= this._data.length) { return null; }
	return this._data[this._pos++];
};
ShimFile.prototype.WriteByte = function (ch) { this._need(); this._out.push(Buffer.from([ch & 0xFF])); };
ShimFile.prototype.ReadBytes = function (num) {
	this._need();
	var end = num === undefined ? this._data.length : Math.min(this._data.length, this._pos + num);
	var arr = [];
	for (var i = this._pos; i < end; i++) { arr.push(this._data[i]); }
	this._pos = end;
	return arr;
};
ShimFile.prototype.WriteBytes = function (data, num) {
	this._need();
	var n = num === undefined ? data.length : num;
	this._out.push(Buffer.from(data.slice(0, n)));
};
ShimFile.prototype.ReadInts = function (num) { return this.ReadBytes(num); };
ShimFile.prototype.WriteInts = function (d, n) { this.WriteBytes(d, n); };

/* ---------------- Require() ---------------------------------------------- */

var _requireCache = {};

function shimRequire(name) {
	if (name in _requireCache) { return _requireCache[name]; }
	var candidates = [
		nodePath.join(_root, name),
		nodePath.join(_root, name + '.js'),
		nodePath.join(_root, 'jsboot', name + '.js')
	];
	var file = null;
	for (var i = 0; i < candidates.length; i++) {
		if (nodeFs.existsSync(candidates[i]) && nodeFs.statSync(candidates[i]).isFile()) {
			file = candidates[i];
			break;
		}
	}
	if (!file) { throw new Error('Could not load "' + name + '"'); }
	var code = nodeFs.readFileSync(file, 'utf8');
	var ex = {};
	var mod = { id: name, path: nodePath.dirname(file), exports: ex, filename: file, loaded: false, children: [], paths: [_root] };
	_requireCache[name] = ex;
	var fn = new Function('exports', 'module', 'Require', 'require', code +
		'\n//# sourceURL=' + file);
	fn(ex, mod, shimRequire, shimRequire);
	return ex;
}
shimRequire._cache = _requireCache;

/* ---------------- install ------------------------------------------------ */

function install(opts) {
	opts = opts || {};
	_root = nodePath.resolve(opts.root || process.cwd());
	_sandbox = nodePath.resolve(opts.sandbox || nodePath.join(_root, '.dojs-sandbox'));
	nodeFs.mkdirSync(_sandbox, { recursive: true });

	var screenW = opts.width || 640;
	var screenH = opts.height || 480;
	var screen = new Framebuffer(screenW, screenH);
	var target = screen;
	var logLines = [];
	var stopped = false;
	var framerate = 30;
	var exitKey = 59;

	function currentTargetImpl() { return target; }
	currentTarget = currentTargetImpl;

	var G = globalThis;
	G.global = G;
	G.DOJS_VERSION = 1.12;
	G.JSBOOT_ZIP = 'JSBOOT.ZIP';
	G.LFN_SUPPORTED = true;
	G.LINUX = true;
	G.MOUSE_AVAILABLE = true;
	G.SOUND_AVAILABLE = false;
	G.IPX_AVAILABLE = false;
	G.JOYSTICK_AVAILABLE = false;
	G.NUM_JOYSTICKS = 0;
	G.ARGS = ['MAIN.JS'].concat(opts.args || []);
	G.NO_COLOR = -1;
	G.DEBUG = false;
	G.REMOTE_DEBUG = false;
	G.ZIP_DELIM = '=';
	G.JSBOOT_DIR = 'JSBOOT/';
	G.PACKAGE_DIR = 'PACKAGE/';
	G.RAW_HDD_FLAG = 0x80;
	G.RAW_BLOCKSIZE = 512;
	G.FX_WIDTH = 640;
	G.FX_HEIGHT = 480;
	G.Width = screenW;
	G.Height = screenH;
	try { G.navigator = { appName: 'DOjS' }; }
	catch (e) { /* node defines a read-only global navigator */ }

	G.EGA = {
		BLACK: Color(0, 0, 0), BLUE: Color(0, 0, 170), GREEN: Color(0, 170, 0),
		CYAN: Color(0, 170, 170), RED: Color(170, 0, 0), MAGENTA: Color(170, 0, 170),
		BROWN: Color(170, 85, 0), LIGHT_GRAY: Color(170, 170, 170),
		LIGHT_GREY: Color(170, 170, 170), DARK_GRAY: Color(85, 85, 85),
		DARK_GREY: Color(85, 85, 85), LIGHT_BLUE: Color(85, 85, 255),
		LIGHT_GREEN: Color(85, 255, 85), LIGHT_CYAN: Color(85, 255, 255),
		LIGHT_RED: Color(255, 85, 85), LIGHT_MAGENTA: Color(255, 85, 255),
		YELLOW: Color(255, 255, 85), WHITE: Color(255, 255, 255)
	};
	G.FILE = { READ: 'rb', WRITE: 'wb', APPEND: 'ab' };
	G.SEEK = { SET: 0, CUR: 1, END: 2 };
	G.MOUSE = {
		Mode: { NONE: 0, ARROW: 2, BUSY: 3, QUESTION: 4, CURSOR_EDIT: 5 },
		Buttons: { LEFT: 1, RIGHT: 2, MIDDLE: 4 }
	};
	G.KEY = { Code: { NoKey: -1 } };
	(function () {
		var names = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		for (var i = 0; i < names.length; i++) { G.KEY.Code['KEY_' + names[i]] = i + 1; }
		for (var d = 0; d <= 9; d++) { G.KEY.Code['KEY_' + d] = 27 + d; G.KEY.Code['KEY_' + d + '_PAD'] = 37 + d; }
		G.KEY.Code.KEY_F1 = 47; G.KEY.Code.KEY_F2 = 48; G.KEY.Code.KEY_F3 = 49;
		G.KEY.Code.KEY_F4 = 50; G.KEY.Code.KEY_F5 = 51; G.KEY.Code.KEY_F6 = 52;
		G.KEY.Code.KEY_F7 = 53; G.KEY.Code.KEY_F8 = 54; G.KEY.Code.KEY_F9 = 55;
		G.KEY.Code.KEY_F10 = 56; G.KEY.Code.KEY_F11 = 57; G.KEY.Code.KEY_F12 = 58;
		G.KEY.Code.KEY_ESC = 59; G.KEY.Code.KEY_TILDE = 60; G.KEY.Code.KEY_MINUS = 61;
		G.KEY.Code.KEY_EQUALS = 62; G.KEY.Code.KEY_BACKSPACE = 63; G.KEY.Code.KEY_TAB = 64;
		G.KEY.Code.KEY_OPENBRACE = 65; G.KEY.Code.KEY_CLOSEBRACE = 66;
		G.KEY.Code.KEY_ENTER = 67; G.KEY.Code.KEY_COLON = 68; G.KEY.Code.KEY_QUOTE = 69;
		G.KEY.Code.KEY_BACKSLASH = 70; G.KEY.Code.KEY_BACKSLASH2 = 71;
		G.KEY.Code.KEY_COMMA = 72; G.KEY.Code.KEY_STOP = 73; G.KEY.Code.KEY_SLASH = 74;
		G.KEY.Code.KEY_SPACE = 75; G.KEY.Code.KEY_INSERT = 76; G.KEY.Code.KEY_DEL = 77;
		G.KEY.Code.KEY_HOME = 78; G.KEY.Code.KEY_END = 79; G.KEY.Code.KEY_PGUP = 80;
		G.KEY.Code.KEY_PGDN = 81; G.KEY.Code.KEY_LEFT = 82; G.KEY.Code.KEY_RIGHT = 83;
		G.KEY.Code.KEY_UP = 84; G.KEY.Code.KEY_DOWN = 85;
		G.KEY.Code.KEY_ENTER_PAD = 91;
		G.KEY.Code.KEY_LSHIFT = 115; G.KEY.Code.KEY_RSHIFT = 116;
		G.KEY.Code.KEY_LCONTROL = 117; G.KEY.Code.KEY_RCONTROL = 118;
		G.KEY.Code.KEY_ALT = 119; G.KEY.Code.KEY_ALTGR = 120;
	})();

	function Color(r, g, b, a) {
		return (((a === undefined ? 255 : a) & 0xFF) << 24 |
			(r & 0xFF) << 16 | (g & 0xFF) << 8 | (b & 0xFF)) >>> 0;
	}
	G.Color = Color;
	G.GetRed = function (c) { return (c >> 16) & 0xFF; };
	G.GetGreen = function (c) { return (c >> 8) & 0xFF; };
	G.GetBlue = function (c) { return c & 0xFF; };
	G.GetAlpha = function (c) { return (c >>> 24) & 0xFF; };

	/* graphics */
	G.SizeX = function () { return screenW; };
	G.SizeY = function () { return screenH; };
	G.GetScreenMode = function () { return 32; };
	G.ClearScreen = function (c) { screen.clear(c >>> 0); };
	G.SetRenderBitmap = function (bm) {
		target = (bm === null || bm === undefined) ? screen : bm._fb;
	};
	G.Plot = function (x, y, c) { currentTargetImpl().plot(x, y, c); };
	G.Line = function (x1, y1, x2, y2, c) { currentTargetImpl().line(x1, y1, x2, y2, c); };
	G.Box = function (x1, y1, x2, y2, c) { currentTargetImpl().rect(x1, y1, x2, y2, c); };
	G.FilledBox = function (x1, y1, x2, y2, c) { currentTargetImpl().fillRect(x1, y1, x2, y2, c); };
	G.Circle = function (x, y, r, c) { currentTargetImpl().circle(x, y, r, c, false); };
	G.FilledCircle = function (x, y, r, c) { currentTargetImpl().circle(x, y, r, c, true); };
	G.Ellipse = function (x, y, rx, ry, c) { currentTargetImpl().ellipse(x, y, rx, ry, c, false); };
	G.FilledEllipse = function (x, y, rx, ry, c) { currentTargetImpl().ellipse(x, y, rx, ry, c, true); };
	G.FilledPolygon = function (v, c) { currentTargetImpl().fillPolygon(v, c); };
	G.FloodFill = function (x, y, b, c) { currentTargetImpl().floodFill(x, y, b, c); };
	G.GetPixel = function (x, y) { return currentTargetImpl().get(x, y); };
	G.TextXY = function (x, y, str, fg, bg) { currentTargetImpl().text(x, y, str, fg, bg); };
	G.CustomLine = G.Line;
	G.CustomCircle = function (x, y, r, c) { currentTargetImpl().circle(x, y, r, c, false); };
	G.CustomEllipse = function (x, y, rx, ry, c) { currentTargetImpl().ellipse(x, y, rx, ry, c, false); };
	G.CustomCircleArc = function () { };
	G.CircleArc = function () { };
	G.DrawArray = function () { };
	G.SaveBmpImage = function (f) { screen.toPPM(mapFile(f) + '.ppm'); };
	G.SavePcxImage = G.SaveBmpImage;
	G.SaveTgaImage = G.SaveBmpImage;
	G.TransparencyEnabled = function () { };
	G.SetMissingCharacter = function () { };

	G.Bitmap = ShimBitmap;
	G.Font = ShimFont;

	/* io */
	G.File = ShimFile;
	G.Read = function (f) {
		var real = mapFile(f);
		if (!nodeFs.existsSync(real)) { throw new Error('cannot read ' + f); }
		return nodeFs.readFileSync(real, 'utf8');
	};
	G.ReadZIP = function () { throw new Error('shim: no ZIP support'); };
	G.List = function (d) {
		var real = mapFile(d || '.');
		if (!nodeFs.existsSync(real)) { throw new Error('cannot list ' + d); }
		return nodeFs.readdirSync(real);
	};
	G.Stat = function (p) {
		var st = nodeFs.statSync(mapFile(p));
		return {
			atime: st.atime.toISOString(), ctime: st.ctime.toISOString(),
			mtime: st.mtime.toISOString(), blksize: st.blksize || 4096,
			size: st.size, nlink: st.nlink,
			drive: 'C', is_blockdev: false, is_chardev: false,
			is_directory: st.isDirectory(), is_regular: st.isFile()
		};
	};
	G.FileExists = function (f) {
		try { return nodeFs.existsSync(mapFile(f)) && nodeFs.statSync(mapFile(f)).isFile(); }
		catch (e) { return false; }
	};
	G.DirExists = function (d) {
		try { return nodeFs.existsSync(mapFile(d)) && nodeFs.statSync(mapFile(d)).isDirectory(); }
		catch (e) { return false; }
	};
	G.MakeDir = function (d) { nodeFs.mkdirSync(mapFile(d), { recursive: true }); };
	G.RmDir = function (d) { nodeFs.rmdirSync(mapFile(d)); };
	G.RmFile = function (f) { nodeFs.unlinkSync(mapFile(f)); };
	G.Rename = function (a, b) { nodeFs.renameSync(mapFile(a), mapFile(b)); };
	G.RealPath = function (p) { return p; };
	G.GetDrive = function () { return 3; };
	G.SetDrive = function () { return 26; };
	G.FreeSpace = function () { return { availClusters: 1024, totalClusters: 2048, bytesPerSector: 512, bytesPerCluster: 4096 }; };
	G.IsFixed = function (d) { return d === 3; };
	G.IsCDROM = function () { return false; };
	G.IsFAT32 = function () { return true; };
	G.IsRAMDisk = function () { return false; };
	G.GetFSType = function () { return 'FAT32'; };
	G.GetEnv = function (v) { return process.env[v] || null; };
	G.StringToBytes = function (s) {
		var out = [];
		for (var i = 0; i < s.length; i++) { out.push(s.charCodeAt(i) & 0xFF); }
		return out;
	};
	G.BytesToString = function (a) {
		var s = '';
		for (var i = 0; i < a.length && a[i]; i++) { s += String.fromCharCode(a[i]); }
		return s;
	};
	G.NamedFunction = function (p, s, f) {
		return new Function(p, s + '\n//# sourceURL=' + (f || 'inline'));
	};

	/* system/misc */
	G.Print = function (s) { logLines.push(String(s)); };
	G.Println = function () {
		var parts = [];
		for (var i = 0; i < arguments.length; i++) { parts.push(String(arguments[i])); }
		logLines.push(parts.join(' '));
		if (opts.echoLog) { console.log('[dojs]', parts.join(' ')); }
	};
	G.Debug = function (s) { if (G.DEBUG) { G.Println('-=>', s); } };
	G.Info = function (s) { G.Println('>>>', s); };
	G.Dump = function (o) { G.Println(JSON.stringify(o)); };
	G.Sleep = function () { };
	G.MsecTime = function () { return Date.now(); };
	G.Stop = function () { stopped = true; };
	G.SetFramerate = function (r) { framerate = r; };
	G.GetFramerate = function () { return framerate; };
	G.SetExitKey = function (k) { exitKey = k; };
	G.KeyIsPressed = function () { return false; };
	G.SetExitMessage = function () { };
	G.MemoryInfo = function () { return { total: 64 * 1024 * 1024, remaining: 48 * 1024 * 1024 }; };
	G.Gc = function () { };
	G.LoadLibrary = function (n) { throw new Error('shim: no native lib ' + n); };
	G.GetLoadedLibraries = function () { return []; };
	G.LoadModule = function (n) { G.LoadLibrary(n); };
	G.FlushLog = function () { };
	/* System(): record calls so tests can assert them; host.systemReturn
	 * controls the faked exit code. Set global.System = undefined to
	 * simulate a platform without exec support. */
	var systemCalls = [];
	var systemReturn = { code: 0 };
	G.System = function (cmd, flags) {
		systemCalls.push({ cmd: cmd, flags: flags });
		if (systemReturn.throw) { throw new Error(systemReturn.throw); }
		return systemReturn.code;
	};
	G.SYSTEM = { MOUSE: 0x01, SOUND: 0x02, JOYSTICK: 0x04, KEYBOARD: 0x08, TIMER: 0x10 };
	G.MouseSetSpeed = function () { };
	G.MouseSetLimits = function () { };
	G.MouseWarp = function () { };
	G.MouseShowCursor = function () { };
	G.MouseSetCursorMode = function () { };
	G.ToUTF8 = function (s) { return s; };
	G.FromUTF8 = function (s) { return s; };
	G.CharCode = function (s) { return s.charCodeAt(0); };
	G.CompareKey = function (k, s) { return (k & 0xFF) === s.charCodeAt(0); };
	G.RandomInt = function (min, max) {
		if (max === undefined) { max = min; min = 0; }
		return Math.floor(Math.random() * (max - min) + min);
	};
	G.ZipPrefix = function (f) { return f; };
	G.Include = function (name) {
		var e = shimRequire(name);
		for (var k in e) { G[k] = e[k]; }
	};
	G.Require = shimRequire;
	G.require = shimRequire;
	G.Trace = function (m) { G.Println('Trace: ' + (m || '')); };
	G.POST = function () { };
	G.GetParallelPorts = function () { return []; };
	G.GetSerialPorts = function () { return []; };
	G.GetNumberOfFDD = function () { return 0; };
	G.GetNumberOfHDD = function () { return 1; };
	G.GetLocalIpAddress = function () { return [127, 0, 0, 1]; };
	G.GetHostname = function () { return 'dojs-host'; };

	/* host handle returned to the caller */
	return {
		screen: screen,
		log: logLines,
		sandbox: _sandbox,
		require: shimRequire,
		isStopped: function () { return stopped; },
		/* build a DOjS-style raw input event */
		event: function (x, y, buttons, key) {
			return { x: x, y: y, buttons: buttons, key: key === undefined ? -1 : key, ticks: Date.now() };
		},
		keyEvent: function (ch, scan) {
			var code = ch ? ch.charCodeAt(0) : 0;
			return { x: 0, y: 0, buttons: 0, key: ((scan || 0) << 8) | code, ticks: Date.now() };
		},
		saveScreen: function (file) { screen.toPPM(file); },
		textLog: function () { return screen.textLog.slice(); },
		/* test hooks for DOjS System() (DOS external exec) */
		systemCalls: systemCalls,
		systemReturn: systemReturn
	};
}

exports.install = install;
