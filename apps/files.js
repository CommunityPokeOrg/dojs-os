/*
 * dojs-os - apps/files.js
 * File manager. Directory list (dirs first), navigate with double-click
 * or Enter, Up/New folder/Delete/Refresh buttons, status bar. Opening a
 * text file launches the text editor with that file.
 */

var appmod = Require('sdk/app');

function FilesApp(api) {
	appmod.App.call(this, api);
	this.cwd = 'C:/';
	this.entries = [];
	this.status = '';
	this.selected = -1;
	this.top = 0;
}
FilesApp.prototype = Object.create(appmod.App.prototype);

var LINE_H = 11;
var TOOL_H = 16;

FilesApp.prototype._rows = function () {
	return Math.floor((this.win.height - TOOL_H - 16) / LINE_H);
};

FilesApp.prototype.onStart = function () {
	this.win = this.createWindow({ title: 'Files', width: 300, height: 190 });
	var fs = this.api.fs;
	if (fs.isDir('C:/DOJSOS')) { this.cwd = 'C:/DOJSOS'; }
	else if (fs.isDir('C:/')) { this.cwd = 'C:/'; }
	else { this.cwd = '.'; }
	this._refresh();
};

FilesApp.prototype._refresh = function () {
	this.entries = this.api.fs.list(this.cwd);
	this.selected = -1;
	this.top = 0;
	this.status = this.cwd + '  (' + this.entries.length + ' entries)';
	this.win.invalidate();
};

FilesApp.prototype._clamp = function () {
	var rows = this._rows();
	var maxTop = Math.max(0, this.entries.length - rows);
	if (this.top > maxTop) { this.top = maxTop; }
	if (this.top < 0) { this.top = 0; }
	if (this.selected >= 0 && this.selected < this.top) { this.top = this.selected; }
	if (this.selected >= this.top + rows) { this.top = this.selected - rows + 1; }
};

FilesApp.prototype._selPath = function () {
	if (this.selected < 0 || this.selected >= this.entries.length) { return null; }
	return this.entries[this.selected];
};

FilesApp.prototype._openEntry = function (e) {
	if (!e) { return; }
	if (e.isDir) {
		this.cwd = e.path;
		this._refresh();
	} else {
		var ext = this.api.fs.extname(e.name);
		if (ext === '.txt' || ext === '.js' || ext === '.ini' || ext === '.md' || ext === '.log') {
			this.api.kernel.spawn('editor', [e.path]);
		} else {
			this.status = 'No handler for ' + e.name;
			this.win.invalidate();
		}
	}
};

FilesApp.prototype._up = function () {
	if (this.cwd === 'C:/' || this.cwd === '/' || this.cwd === '.') { return; }
	this.cwd = this.api.fs.dirname(this.cwd);
	this._refresh();
};

FilesApp.prototype._newDir = function () {
	var fs = this.api.fs;
	var base = fs.join(this.cwd, 'NEWDIR');
	var p = base;
	var i = 1;
	while (fs.exists(p)) { p = base + i++; }
	this.status = fs.mkdir(p) ? 'Created ' + p : 'mkdir failed: ' + p;
	this._refresh();
};

FilesApp.prototype._del = function () {
	var e = this._selPath();
	if (!e) { this.status = 'Nothing selected'; this.win.invalidate(); return; }
	this.status = this.api.fs.remove(e.path) ? 'Deleted ' + e.name : 'Delete failed: ' + e.name;
	this._refresh();
};

FilesApp.prototype._btns = function () {
	return [
		{ x: 2, w: 30, label: 'Up', fn: '_up' },
		{ x: 36, w: 38, label: 'New', fn: '_newDir' },
		{ x: 78, w: 34, label: 'Del', fn: '_del' },
		{ x: 116, w: 46, label: 'Refresh', fn: '_refresh' },
		{ x: 166, w: 34, label: 'Open', fn: '_openSel' }
	];
};

FilesApp.prototype._openSel = function () { this._openEntry(this._selPath()); };

FilesApp.prototype.onDraw = function (win, g) {
	var t = this.api.theme;
	var w = win.width;
	var h = win.height;
	g.clear(t.winClient);

	var btns = this._btns();
	for (var i = 0; i < btns.length; i++) {
		var b = btns[i];
		g.fillRect(b.x, 2, b.w, 12, t.buttonFace);
		g.bevel(b.x, 2, b.w, 12, true, t.buttonHi, t.buttonLo);
		g.textCenter(b.x + (b.w >> 1), 4, b.label, t.buttonText, NO_COLOR);
	}

	var ly = TOOL_H + 2;
	var lh = h - ly - 14;
	this._clamp();
	var rows = this._rows();
	g.fillRect(1, ly, w - 2, lh, t.inputBg);
	g.bevel(1, ly, w - 2, lh, false, t.buttonHi, t.buttonLo);
	for (var r = 0; r < rows; r++) {
		var idx = this.top + r;
		if (idx >= this.entries.length) { break; }
		var e = this.entries[idx];
		var ry = ly + 1 + r * LINE_H;
		var label = (e.isDir ? '[' + e.name + ']' : ' ' + e.name);
		if (!e.isDir && e.size) { label += '  ' + e.size + 'b'; }
		if (idx === this.selected) {
			g.fillRect(2, ry, w - 4, LINE_H, t.selectBg);
			g.text(4, ry + 1, label, t.selectText, NO_COLOR);
		} else {
			g.text(4, ry + 1, label, e.isDir ? EGA.BLUE : t.listText, NO_COLOR);
		}
	}

	var sy = h - 13;
	g.line(0, sy - 1, w, sy - 1, t.winBorderDark);
	g.text(4, sy + 1, this.status, t.taskbarDark, NO_COLOR);
};

FilesApp.prototype.onEvent = function (win, ev) {
	var SCAN = this.api.events.SCAN;
	var BTN = this.api.events.BTN;
	var ly = TOOL_H + 2;
	var rows = this._rows();

	if (ev.type === 'mousedown' && ev.button === BTN.LEFT) {
		if (ev.y < TOOL_H) {
			var btns = this._btns();
			for (var i = 0; i < btns.length; i++) {
				var b = btns[i];
				if (ev.x >= b.x && ev.x < b.x + b.w) { this[b.fn](); return; }
			}
		}
		if (ev.y >= ly) {
			var idx = this.top + Math.floor((ev.y - ly - 1) / LINE_H);
			if (idx >= 0 && idx < this.entries.length) {
				this.selected = idx;
				this.status = this.entries[idx].path;
				this.win.invalidate();
			}
		}
		return;
	}
	if (ev.type === 'dblclick') {
		if (this.selected >= 0) { this._openEntry(this.entries[this.selected]); }
		return;
	}
	if (ev.type === 'keydown') {
		var s = ev.scan;
		if (s === SCAN.UP) { if (this.selected > 0) { this.selected--; } }
		else if (s === SCAN.DOWN) { if (this.selected < this.entries.length - 1) { this.selected++; } }
		else if (s === SCAN.ENTER || s === SCAN.ENTER_PAD) { this._openSel(); }
		else if (s === SCAN.BACKSPACE) { this._up(); }
		else if (s === SCAN.DEL) { this._del(); }
		else if (s === SCAN.F5) { this._refresh(); }
		this._clamp();
		this.win.invalidate();
	}
};

exports.__VERSION__ = 1;
exports.create = function (api) { return new FilesApp(api); };
