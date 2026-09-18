/*
 * dojs-os - apps/editor.js
 * Text editor. Line-array document model, cursor, insert/delete,
 * load/save. Toolbar: Open, Save, New, plus a path TextField and a
 * status line. Args: optional file path to open.
 */

var appmod = Require('sdk/app');

function EditorApp(api) {
	appmod.App.call(this, api);
	this.lines = [''];
	this.cx = 0;
	this.cy = 0;
	this.scrollX = 0;
	this.scrollY = 0;
	this.path = null;
	this.modified = false;
	this.status = 'New file';
}
EditorApp.prototype = Object.create(appmod.App.prototype);

var PAD = 3;
var LINE_H = 9;
var CHAR_W = 6;

/* --- document model (pure, host-testable) ------------------------------- */

function docInsertChar(lines, cx, cy, ch) {
	var line = lines[cy];
	lines[cy] = line.substring(0, cx) + ch + line.substring(cx);
	return cx + 1;
}

function docBackspace(lines, cx, cy) {
	if (cx > 0) {
		var line = lines[cy];
		lines[cy] = line.substring(0, cx - 1) + line.substring(cx);
		return { cx: cx - 1, cy: cy };
	}
	if (cy > 0) {
		var prev = lines[cy - 1];
		var cur = lines[cy];
		lines[cy - 1] = prev + cur;
		lines.splice(cy, 1);
		return { cx: prev.length, cy: cy - 1 };
	}
	return { cx: cx, cy: cy };
}

function docDelete(lines, cx, cy) {
	var line = lines[cy];
	if (cx < line.length) {
		lines[cy] = line.substring(0, cx) + line.substring(cx + 1);
	} else if (cy < lines.length - 1) {
		lines[cy] = line + lines[cy + 1];
		lines.splice(cy + 1, 1);
	}
	return { cx: cx, cy: cy };
}

function docEnter(lines, cx, cy) {
	var line = lines[cy];
	lines[cy] = line.substring(0, cx);
	lines.splice(cy + 1, 0, line.substring(cx));
	return { cx: 0, cy: cy + 1 };
}

function docText(lines) {
	return lines.join('\n');
}

/* --- app ------------------------------------------------------------------ */

EditorApp.prototype.onStart = function () {
	var fs = this.api.fs;
	this.win = this.createWindow({ title: 'Editor', width: 320, height: 200 });
	this.path = this.args.length ? this.args[0] : null;
	if (this.path) { this._load(this.path); }
};

EditorApp.prototype._load = function (path) {
	var txt = this.api.fs.readText(path);
	if (txt === null) {
		this.status = 'Cannot open ' + path;
		return;
	}
	this.lines = txt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
	this.cx = 0; this.cy = 0; this.scrollX = 0; this.scrollY = 0;
	this.path = path;
	this.modified = false;
	this.status = 'Opened ' + path;
	this.win.setTitle('Editor - ' + this.api.fs.basename(path));
	this.win.invalidate();
};

EditorApp.prototype._save = function () {
	if (!this.path) {
		this.path = 'C:/DOJSOS/Untitled.TXT';
	}
	if (this.api.fs.writeText(this.path, docText(this.lines))) {
		this.modified = false;
		this.status = 'Saved ' + this.path;
		this.win.setTitle('Editor - ' + this.api.fs.basename(this.path));
	} else {
		this.status = 'Save failed: ' + this.path;
	}
	this.win.invalidate();
};

EditorApp.prototype._clampCursor = function () {
	if (this.cy < 0) { this.cy = 0; }
	if (this.cy >= this.lines.length) { this.cy = this.lines.length - 1; }
	var len = this.lines[this.cy].length;
	if (this.cx < 0) { this.cx = 0; }
	if (this.cx > len) { this.cx = len; }
};

EditorApp.prototype._ensureVisible = function () {
	var cw = Math.floor((this.win.width - 2 * PAD) / CHAR_W);
	var ch = Math.floor((this.win.height - 16 - 2 * PAD) / LINE_H);
	if (this.cx < this.scrollX) { this.scrollX = this.cx; }
	if (this.cx >= this.scrollX + cw) { this.scrollX = this.cx - cw + 1; }
	if (this.cy < this.scrollY) { this.scrollY = this.cy; }
	if (this.cy >= this.scrollY + ch) { this.scrollY = this.cy - ch + 1; }
};

EditorApp.prototype.onDraw = function (win, g) {
	var t = this.api.theme;
	var w = win.width;
	var h = win.height;
	g.clear(t.winClient);

	/* toolbar */
	var y0 = 2;
	this._btn(g, t, 2, y0, 38, 'Open');
	this._btn(g, t, 44, y0, 38, 'Save');
	this._btn(g, t, 86, y0, 38, 'New');
	g.text(130, y0 + 3, this.path || '(no file)', t.taskbarDark, NO_COLOR);

	/* text area */
	var tx = PAD;
	var ty = 16 + PAD;
	var ch = Math.floor((h - 16 - 14 - 2 * PAD) / LINE_H);
	var cw = Math.floor((w - 2 * PAD) / CHAR_W);
	this._clampCursor();
	this._ensureVisible();
	for (var i = 0; i < ch; i++) {
		var li = this.scrollY + i;
		if (li >= this.lines.length) { break; }
		var vis = this.lines[li].substring(this.scrollX, this.scrollX + cw);
		g.text(tx, ty + i * LINE_H, vis, t.inputText, NO_COLOR);
	}
	/* cursor */
	var cxx = tx + (this.cx - this.scrollX) * CHAR_W;
	var cyy = ty + (this.cy - this.scrollY) * LINE_H;
	g.line(cxx, cyy, cxx, cyy + LINE_H - 1, t.inputText);
	g.line(cxx + 1, cyy, cxx + 1, cyy + LINE_H - 1, t.inputText);

	/* status bar */
	var sy = h - 13;
	g.line(0, sy - 1, w, sy - 1, t.winBorderDark);
	g.text(4, sy + 1, (this.modified ? '*' : '') + this.status + '  Ln ' + (this.cy + 1) + ', Col ' + (this.cx + 1), t.taskbarDark, NO_COLOR);
};

EditorApp.prototype._btn = function (g, t, x, y, w, label) {
	var b = this.api.ui.Button;
	g.fillRect(x, y, w, 12, t.buttonFace);
	g.bevel(x, y, w, 12, true, t.buttonHi, t.buttonLo);
	g.textCenter(x + (w >> 1), y + 2, label, t.buttonText, NO_COLOR);
};

EditorApp.prototype._hitBtn = function (x, y, bx, w) {
	return x >= bx && x < bx + w && y >= 2 && y < 14;
};

EditorApp.prototype.onEvent = function (win, ev) {
	var SCAN = this.api.events.SCAN;
	var BTN = this.api.events.BTN;
	if (ev.type === 'mousedown' && ev.button === BTN.LEFT) {
		if (this._hitBtn(ev.x, ev.y, 2, 38)) {
			/* open: use path arg or prompt file via files app convention —
			 * pragmatic: open path from argv[0] or default doc */
			this._load(this.path || 'C:/DOJSOS/Untitled.TXT');
		} else if (this._hitBtn(ev.x, ev.y, 44, 38)) {
			this._save();
		} else if (this._hitBtn(ev.x, ev.y, 86, 38)) {
			this.lines = ['']; this.cx = 0; this.cy = 0;
			this.path = null; this.modified = false;
			this.status = 'New file';
			this.win.setTitle('Editor');
		} else if (ev.y >= 16) {
			this.cx = this.scrollX + Math.floor((ev.x - PAD) / CHAR_W);
			this.cy = this.scrollY + Math.floor((ev.y - 16 - PAD) / LINE_H);
			this._clampCursor();
		}
		this.win.invalidate();
		return;
	}
	if (ev.type !== 'keydown') { return; }
	var s = ev.scan;
	var dirty = true;
	if (s === SCAN.LEFT) { if (this.cx > 0) { this.cx--; } else if (this.cy > 0) { this.cy--; this.cx = this.lines[this.cy].length; } }
	else if (s === SCAN.RIGHT) { if (this.cx < this.lines[this.cy].length) { this.cx++; } else if (this.cy < this.lines.length - 1) { this.cy++; this.cx = 0; } }
	else if (s === SCAN.UP) { this.cy--; this._clampCursor(); }
	else if (s === SCAN.DOWN) { this.cy++; this._clampCursor(); }
	else if (s === SCAN.HOME) { this.cx = 0; }
	else if (s === SCAN.END) { this.cx = this.lines[this.cy].length; }
	else if (s === SCAN.PGUP) { this.cy -= 15; this._clampCursor(); }
	else if (s === SCAN.PGDN) { this.cy += 15; this._clampCursor(); }
	else if (s === SCAN.BACKSPACE) {
		var p = docBackspace(this.lines, this.cx, this.cy);
		this.cx = p.cx; this.cy = p.cy; this.modified = true;
	}
	else if (s === SCAN.DEL) { docDelete(this.lines, this.cx, this.cy); this.modified = true; }
	else if (s === SCAN.ENTER || s === SCAN.ENTER_PAD) {
		var p2 = docEnter(this.lines, this.cx, this.cy);
		this.cx = p2.cx; this.cy = p2.cy; this.modified = true;
	}
	else if (s === SCAN.TAB) {
		this.cx = docInsertChar(this.lines, this.cx, this.cy, '\t'); this.modified = true;
	}
	else if (ev.char) {
		this.cx = docInsertChar(this.lines, this.cx, this.cy, ev.char); this.modified = true;
	}
	else { dirty = false; }
	if (dirty) { this.win.invalidate(); }
};

EditorApp.prototype.onClose = function (win) {
	/* lose-unsaved confirmation is not available in this UI toolkit yet;
	 * always allow close but note it in the status for the log */
	if (this.modified) { Println('editor: closing with unsaved changes'); }
	return true;
};

exports.__VERSION__ = 1;
exports.create = function (api) { return new EditorApp(api); };
exports.doc = {
	insertChar: docInsertChar,
	backspace: docBackspace,
	del: docDelete,
	enter: docEnter,
	text: docText
};
