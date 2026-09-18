/*
 * dojs-os - sdk/ui.js
 * Minimal retained-mode widget toolkit for apps.
 *
 * All widgets work in window client coordinates and draw through a
 * Surface. A WidgetSet owns hit-testing, focus and event routing so an
 * app can do:
 *     this.widgets = new ui.WidgetSet();
 *     this.widgets.add(new ui.Button({...}));
 *     // in onDraw: this.widgets.draw(g)
 *     // in onEvent: this.widgets.handleEvent(ev)
 */

var eventsMod = Require('sdk/events');
var SCAN = eventsMod.SCAN;
var BTN = eventsMod.BTN;

/* ------------------------------------------------------------------ */
/* Widget base                                                          */
/* ------------------------------------------------------------------ */

function Widget(o) {
	o = o || {};
	this.x = o.x || 0;
	this.y = o.y || 0;
	this.w = o.w || 0;
	this.h = o.h || 0;
	this.visible = o.visible !== false;
	this.enabled = o.enabled !== false;
	this.focusable = false;
	this.focused = false;
	this.dirty = true;
}

Widget.prototype.hit = function (px, py) {
	return this.visible && px >= this.x && px < this.x + this.w &&
		py >= this.y && py < this.y + this.h;
};
Widget.prototype.draw = function (g, t) { };
Widget.prototype.onEvent = function (ev) { return false; };
Widget.prototype.invalidate = function () { this.dirty = true; };

/* ------------------------------------------------------------------ */
/* Label                                                                */
/* ------------------------------------------------------------------ */

function Label(o) {
	Widget.call(this, o);
	this.text = o.text || '';
	this.fg = o.fg;
	this.bg = o.bg;
	this.align = o.align || 'left';
	this.w = o.w || 100;
	this.h = o.h || 10;
}
Label.prototype = new Widget();
Label.prototype.constructor = Label;

Label.prototype.draw = function (g, t) {
	var fg = this.fg || t.inputText;
	var bg = this.bg || t.winClient;
	if (bg !== NO_COLOR) { g.fillRect(this.x, this.y, this.w, this.h, bg); }
	if (this.align === 'center') {
		g.textCenter(this.x + (this.w >> 1), this.y + ((this.h - 8) >> 1), this.text, fg, NO_COLOR);
	} else if (this.align === 'right') {
		g.textRight(this.x + this.w - 2, this.y + ((this.h - 8) >> 1), this.text, fg, NO_COLOR);
	} else {
		g.text(this.x + 2, this.y + ((this.h - 8) >> 1), this.text, fg, NO_COLOR);
	}
};

Label.prototype.setText = function (txt) {
	this.text = txt;
	this.invalidate();
};

/* ------------------------------------------------------------------ */
/* Button                                                               */
/* ------------------------------------------------------------------ */

function Button(o) {
	Widget.call(this, o);
	this.text = o.text || '';
	this.w = o.w || 60;
	this.h = o.h || 16;
	this.onClick = o.onClick || null;
	this.pressed = false;
	this.focusable = true;
}
Button.prototype = new Widget();
Button.prototype.constructor = Button;

Button.prototype.draw = function (g, t) {
	var face = this.pressed ? t.buttonPressed : t.buttonFace;
	g.fillRect(this.x, this.y, this.w, this.h, face);
	g.bevel(this.x, this.y, this.w, this.h, !this.pressed, t.buttonHi, t.buttonLo);
	var tx = this.x + (this.w >> 1);
	var ty = this.y + ((this.h - 8) >> 1) + (this.pressed ? 1 : 0);
	g.textCenter(tx, ty, this.text, this.enabled ? t.buttonText : t.taskbarDark, NO_COLOR);
	if (this.focused) {
		g.rect(this.x + 2, this.y + 2, this.w - 4, this.h - 4, t.buttonText);
	}
};

Button.prototype.onEvent = function (ev) {
	if (!this.enabled) { return false; }
	if (ev.type === 'mousedown' && ev.button === BTN.LEFT && this.hit(ev.x, ev.y)) {
		this.pressed = true;
		this.invalidate();
		return true;
	}
	if (ev.type === 'mouseup' && ev.button === BTN.LEFT) {
		var was = this.pressed;
		this.pressed = false;
		if (was) {
			this.invalidate();
			if (this.hit(ev.x, ev.y) && this.onClick) { this.onClick(this); }
			return true;
		}
	}
	if (ev.type === 'keydown' && this.focused &&
		(ev.scan === SCAN.ENTER || ev.scan === SCAN.SPACE)) {
		if (this.onClick) { this.onClick(this); }
		return true;
	}
	return false;
};

/* ------------------------------------------------------------------ */
/* TextField - single line edit control                                 */
/* ------------------------------------------------------------------ */

function TextField(o) {
	Widget.call(this, o);
	this.text = o.text || '';
	this.w = o.w || 120;
	this.h = o.h || 14;
	this.maxLen = o.maxLen || 256;
	this.onChange = o.onChange || null;
	this.onEnter = o.onEnter || null;
	this.cursor = this.text.length;
	this.focusable = true;
	this._scroll = 0;
}
TextField.prototype = new Widget();
TextField.prototype.constructor = TextField;

TextField.prototype._charW = 6;

TextField.prototype.draw = function (g, t) {
	g.fillRect(this.x, this.y, this.w, this.h, this.enabled ? t.inputBg : t.buttonFace);
	g.bevel(this.x, this.y, this.w, this.h, false, t.buttonHi, t.buttonLo);
	var visible = Math.floor((this.w - 4) / this._charW);
	if (this.cursor < this._scroll) { this._scroll = this.cursor; }
	if (this.cursor > this._scroll + visible) { this._scroll = this.cursor - visible; }
	var shown = this.text.substring(this._scroll, this._scroll + visible);
	g.text(this.x + 2, this.y + 3, shown, t.inputText, NO_COLOR);
	if (this.focused) {
		var cx = this.x + 2 + (this.cursor - this._scroll) * this._charW;
		g.line(cx, this.y + 2, cx, this.y + this.h - 3, t.inputText);
	}
};

TextField.prototype.setText = function (txt) {
	this.text = txt;
	this.cursor = txt.length;
	this.invalidate();
};

TextField.prototype._notify = function () {
	this.invalidate();
	if (this.onChange) { this.onChange(this); }
};

TextField.prototype.onEvent = function (ev) {
	if (!this.enabled || !this.focused) { return false; }
	if (ev.type !== 'keydown') { return false; }
	var s = ev.scan;
	if (s === SCAN.BACKSPACE) {
		if (this.cursor > 0) {
			this.text = this.text.substring(0, this.cursor - 1) + this.text.substring(this.cursor);
			this.cursor--;
			this._notify();
		}
		return true;
	}
	if (s === SCAN.DEL) {
		if (this.cursor < this.text.length) {
			this.text = this.text.substring(0, this.cursor) + this.text.substring(this.cursor + 1);
			this._notify();
		}
		return true;
	}
	if (s === SCAN.LEFT) { if (this.cursor > 0) { this.cursor--; this.invalidate(); } return true; }
	if (s === SCAN.RIGHT) { if (this.cursor < this.text.length) { this.cursor++; this.invalidate(); } return true; }
	if (s === SCAN.HOME) { this.cursor = 0; this.invalidate(); return true; }
	if (s === SCAN.END) { this.cursor = this.text.length; this.invalidate(); return true; }
	if (s === SCAN.ENTER || s === SCAN.ENTER_PAD) {
		if (this.onEnter) { this.onEnter(this); }
		return true;
	}
	if (ev.char && this.text.length < this.maxLen) {
		this.text = this.text.substring(0, this.cursor) + ev.char + this.text.substring(this.cursor);
		this.cursor++;
		this._notify();
		return true;
	}
	return false;
};

/* ------------------------------------------------------------------ */
/* ListBox - scrollable single-select list                              */
/* ------------------------------------------------------------------ */

function ListBox(o) {
	Widget.call(this, o);
	this.items = [];              // [{label, data}] or strings
	this.selected = -1;
	this.top = 0;                 // first visible row
	this.rowH = o.rowH || 11;
	this.onSelect = o.onSelect || null;
	this.onActivate = o.onActivate || null; // dblclick / enter
	this.focusable = true;
}
ListBox.prototype = new Widget();
ListBox.prototype.constructor = ListBox;

ListBox.prototype.setItems = function (items) {
	this.items = items || [];
	this.selected = -1;
	this.top = 0;
	this.invalidate();
};

ListBox.prototype.itemLabel = function (i) {
	var it = this.items[i];
	return (typeof it === 'string') ? it : it.label;
};

ListBox.prototype.itemData = function (i) {
	var it = this.items[i];
	return (typeof it === 'string') ? it : it.data;
};

ListBox.prototype._rowsVisible = function () {
	return Math.max(1, Math.floor(this.h / this.rowH));
};

ListBox.prototype._clampScroll = function () {
	var maxTop = Math.max(0, this.items.length - this._rowsVisible());
	if (this.top > maxTop) { this.top = maxTop; }
	if (this.top < 0) { this.top = 0; }
};

ListBox.prototype.draw = function (g, t) {
	this._clampScroll();
	g.fillRect(this.x, this.y, this.w, this.h, t.inputBg);
	g.bevel(this.x, this.y, this.w, this.h, false, t.buttonHi, t.buttonLo);
	var rows = this._rowsVisible();
	for (var i = 0; i < rows; i++) {
		var idx = this.top + i;
		if (idx >= this.items.length) { break; }
		var ry = this.y + 1 + i * this.rowH;
		if (idx === this.selected) {
			g.fillRect(this.x + 1, ry, this.w - 2, this.rowH, t.selectBg);
			g.text(this.x + 3, ry + 1, this.itemLabel(idx), t.selectText, NO_COLOR);
		} else {
			g.text(this.x + 3, ry + 1, this.itemLabel(idx), t.listText, NO_COLOR);
		}
	}
	/* scrollbar gutter */
	if (this.items.length > rows) {
		var sbw = 8;
		var trackH = this.h - 2;
		var thumbH = Math.max(8, Math.floor(trackH * rows / this.items.length));
		var maxTop = this.items.length - rows;
		var ty = this.y + 1 + Math.floor((trackH - thumbH) * (this.top / Math.max(1, maxTop)));
		g.fillRect(this.x + this.w - sbw - 1, this.y + 1, sbw, trackH, t.buttonFace);
		g.fillRect(this.x + this.w - sbw - 1, ty, sbw, thumbH, t.taskbarDark);
	}
};

ListBox.prototype._select = function (idx) {
	if (idx === this.selected) { return; }
	this.selected = idx;
	this.invalidate();
	if (this.onSelect) { this.onSelect(this); }
};

ListBox.prototype.onEvent = function (ev) {
	if (!this.enabled) { return false; }
	var rows = this._rowsVisible();
	if (ev.type === 'mousedown' && ev.button === BTN.LEFT && this.hit(ev.x, ev.y)) {
		var idx = this.top + Math.floor((ev.y - this.y - 1) / this.rowH);
		if (idx >= 0 && idx < this.items.length) {
			this._select(idx);
		}
		return true;
	}
	if (ev.type === 'dblclick' && this.hit(ev.x, ev.y)) {
		if (this.selected >= 0 && this.onActivate) { this.onActivate(this); }
		return true;
	}
	if (ev.type === 'keydown' && this.focused) {
		var s = ev.scan;
		if (s === SCAN.UP) {
			if (this.selected > 0) { this._select(this.selected - 1); }
			if (this.selected >= 0 && this.selected < this.top) { this.top = this.selected; }
			return true;
		}
		if (s === SCAN.DOWN) {
			if (this.selected < this.items.length - 1) { this._select(this.selected + 1); }
			if (this.selected >= this.top + rows) { this.top = this.selected - rows + 1; }
			return true;
		}
		if (s === SCAN.PGUP) { this.top = Math.max(0, this.top - rows); this.invalidate(); return true; }
		if (s === SCAN.PGDN) {
			this.top = Math.min(Math.max(0, this.items.length - rows), this.top + rows);
			this.invalidate();
			return true;
		}
		if (s === SCAN.ENTER || s === SCAN.ENTER_PAD) {
			if (this.selected >= 0 && this.onActivate) { this.onActivate(this); }
			return true;
		}
	}
	return false;
};

/* ------------------------------------------------------------------ */
/* WidgetSet - owns focus + event routing                                */
/* ------------------------------------------------------------------ */

function WidgetSet() {
	this.widgets = [];
	this.focusIdx = -1;
}

WidgetSet.prototype.add = function (w) {
	this.widgets.push(w);
	return w;
};

WidgetSet.prototype.clear = function () {
	this.widgets.length = 0;
	this.focusIdx = -1;
};

WidgetSet.prototype._setFocus = function (idx) {
	if (this.focusIdx >= 0 && this.focusIdx < this.widgets.length) {
		this.widgets[this.focusIdx].focused = false;
		this.widgets[this.focusIdx].invalidate();
	}
	this.focusIdx = idx;
	if (idx >= 0) {
		this.widgets[idx].focused = true;
		this.widgets[idx].invalidate();
	}
};

WidgetSet.prototype.focusNext = function () {
	if (!this.widgets.length) { return; }
	var n = this.widgets.length;
	var start = this.focusIdx;
	for (var i = 1; i <= n; i++) {
		var idx = (start + i + n) % n;
		var w = this.widgets[idx];
		if (w.visible && w.enabled && w.focusable) {
			this._setFocus(idx);
			return;
		}
	}
};

WidgetSet.prototype.handleEvent = function (ev) {
	/* focused widget gets keys first */
	if (ev.type === 'keydown') {
		if (ev.scan === SCAN.TAB) {
			this.focusNext();
			return true;
		}
		if (this.focusIdx >= 0 && this.focusIdx < this.widgets.length) {
			if (this.widgets[this.focusIdx].onEvent(ev)) { return true; }
		}
		return false;
	}
	/* mouse: deliver to top-most hit widget, and (re)focus it */
	for (var i = this.widgets.length - 1; i >= 0; i--) {
		var w = this.widgets[i];
		if (w.visible && w.hit(ev.x, ev.y)) {
			if (ev.type === 'mousedown' && w.focusable) {
				this._setFocus(i);
			}
			return w.onEvent(ev);
		}
	}
	/* click outside: allow pressed buttons to release */
	for (var j = 0; j < this.widgets.length; j++) {
		if (this.widgets[j].onEvent(ev)) { return true; }
	}
	return false;
};

WidgetSet.prototype.draw = function (g, t) {
	for (var i = 0; i < this.widgets.length; i++) {
		var w = this.widgets[i];
		if (w.visible) { w.draw(g, t); w.dirty = false; }
	}
};

exports.__VERSION__ = 1;
exports.Widget = Widget;
exports.Label = Label;
exports.Button = Button;
exports.TextField = TextField;
exports.ListBox = ListBox;
exports.WidgetSet = WidgetSet;
