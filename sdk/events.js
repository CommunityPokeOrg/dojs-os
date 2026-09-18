/*
 * dojs-os - sdk/events.js
 * Normalizes DOjS Input() callbacks into a queue of discrete events.
 *
 * DOjS calls Input(event) once per frame with a *merged* snapshot:
 *   { x, y, buttons, key, ticks }
 *   - key == -1 when no key was pressed this frame
 *   - key & 0xFF is the ASCII code, key >> 8 is the KEY.Code scancode id
 *   - buttons is a bitmask of MOUSE.Buttons.*
 *
 * EventPump turns those snapshots into typed events the WM/apps can queue:
 *   { type: 'keydown',  key, scan, char }
 *   { type: 'mousemove', x, y, buttons }
 *   { type: 'mousedown', x, y, button, buttons }
 *   { type: 'mouseup',   x, y, button, buttons }
 *   { type: 'click',     x, y, button }            (press+release, same pos)
 *   { type: 'dblclick',  x, y, button }            (two clicks < 400ms)
 */

var DBLCLICK_MS = 400;
var CLICK_SLOP = 4;

function EventPump() {
	this.queue = [];
	this._lastButtons = 0;
	this._lastX = -1;
	this._lastY = -1;
	this._downX = 0;
	this._downY = 0;
	this._downT = 0;
	this._lastClickT = -1000;
	this._downButton = 0;
}

EventPump.prototype.push = function (ev) {
	this.queue.push(ev);
};

/* feed one raw DOjS event; appends zero or more normalized events */
EventPump.prototype.feed = function (raw) {
	var buttons = raw.buttons | 0;
	var key = raw.key;
	var x = raw.x | 0;
	var y = raw.y | 0;
	var t = raw.ticks | 0;
	var i;

	if (x !== this._lastX || y !== this._lastY) {
		this.push({ type: 'mousemove', x: x, y: y, buttons: buttons });
		this._lastX = x;
		this._lastY = y;
	}

	/* edge-detect each button bit */
	for (i = 0; i < 3; i++) {
		var bit = 1 << i;
		var was = (this._lastButtons & bit) !== 0;
		var is = (buttons & bit) !== 0;
		if (is && !was) {
			this._downX = x;
			this._downY = y;
			this._downT = t;
			this._downButton = bit;
			this.push({ type: 'mousedown', x: x, y: y, button: bit, buttons: buttons });
		} else if (!is && was) {
			this.push({ type: 'mouseup', x: x, y: y, button: bit, buttons: buttons });
			if (Math.abs(x - this._downX) <= CLICK_SLOP &&
				Math.abs(y - this._downY) <= CLICK_SLOP) {
				var dbl = (t - this._lastClickT) < DBLCLICK_MS && this._downButton === bit;
				this.push({ type: 'click', x: x, y: y, button: bit });
				if (dbl) {
					this.push({ type: 'dblclick', x: x, y: y, button: bit });
				}
				this._lastClickT = t;
			}
		}
	}
	this._lastButtons = buttons;

	if (key !== undefined && key !== null && key !== -1) {
		var ascii = key & 0xFF;
		var scan = key >> 8;
		this.push({
			type: 'keydown',
			key: key,
			scan: scan,
			char: ascii >= 32 && ascii <= 126 ? String.fromCharCode(ascii) : ''
		});
	}
};

EventPump.prototype.next = function () {
	return this.queue.length ? this.queue.shift() : null;
};

EventPump.prototype.hasEvents = function () {
	return this.queue.length > 0;
};

EventPump.prototype.clear = function () {
	this.queue.length = 0;
};

/* helpers for key handling ------------------------------------------- */

var keys = {
	isScan: function (ev, scanCode) {
		return ev.type === 'keydown' && ev.scan === scanCode;
	},
	isChar: function (ev, ch) {
		return ev.type === 'keydown' && ev.char === ch;
	}
};

/* name the common scancodes once so apps don't hardcode numbers.
 * These mirror KEY.Code in DOjS but we don't depend on it existing
 * in host tests. */
var SCAN = {
	ESC: 59, BACKSPACE: 63, TAB: 64, ENTER: 67, ENTER_PAD: 91,
	SPACE: 75, INSERT: 76, DEL: 77, HOME: 78, END: 79,
	PGUP: 80, PGDN: 81, LEFT: 82, RIGHT: 83, UP: 84, DOWN: 85,
	F1: 47, F2: 48, F3: 49, F4: 50, F5: 51, F6: 52,
	F7: 53, F8: 54, F9: 55, F10: 56, F11: 57, F12: 58,
	LSHIFT: 115, RSHIFT: 116, LCTRL: 117, RCTRL: 118, ALT: 119
};

var BTN = { LEFT: 1, RIGHT: 2, MIDDLE: 4 };

exports.__VERSION__ = 1;
exports.EventPump = EventPump;
exports.keys = keys;
exports.SCAN = SCAN;
exports.BTN = BTN;
