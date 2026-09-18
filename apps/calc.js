/*
 * dojs-os - apps/calc.js
 * Calculator. Button grid + keyboard entry. A tiny recursive-descent
 * evaluator handles + - * / % ^ parentheses unary minus and decimals.
 * evalExpr is exported so host tests can exercise it directly.
 */

var appmod = Require('sdk/app');

function CalcApp(api) {
	appmod.App.call(this, api);
	this.expr = '';
	this.result = null;
	this.error = null;
}
CalcApp.prototype = Object.create(appmod.App.prototype);

/* --- expression evaluator (pure, host-testable) ------------------------ */

function _tokenize(s) {
	var toks = [];
	var i = 0;
	while (i < s.length) {
		var ch = s.charAt(i);
		if (ch === ' ') { i++; continue; }
		if ((ch >= '0' && ch <= '9') || ch === '.') {
			var j = i;
			var dots = 0;
			while (j < s.length && ((s.charAt(j) >= '0' && s.charAt(j) <= '9') || s.charAt(j) === '.')) {
				if (s.charAt(j) === '.') { dots++; }
				j++;
			}
			if (dots > 1) { throw new Error('bad number'); }
			toks.push({ t: 'num', v: parseFloat(s.substring(i, j)) });
			i = j;
			continue;
		}
		if ('+-*/%^()'.indexOf(ch) >= 0) {
			toks.push({ t: ch });
			i++;
			continue;
		}
		throw new Error('bad char: ' + ch);
	}
	return toks;
}

function _parseExpr(toks, pos) {
	var left = _parseTerm(toks, pos);
	pos = left.pos;
	while (pos.p < toks.length && (toks[pos.p].t === '+' || toks[pos.p].t === '-')) {
		var op = toks[pos.p++].t;
		var right = _parseTerm(toks, pos);
		pos = right.pos;
		left = { v: op === '+' ? left.v + right.v : left.v - right.v, pos: pos };
	}
	return { v: left.v, pos: pos };
}

function _parseTerm(toks, pos) {
	var left = _parseFactor(toks, pos);
	pos = left.pos;
	while (pos.p < toks.length && (toks[pos.p].t === '*' || toks[pos.p].t === '/' || toks[pos.p].t === '%')) {
		var op = toks[pos.p++].t;
		var right = _parseFactor(toks, pos);
		pos = right.pos;
		var v;
		if (op === '*') { v = left.v * right.v; }
		else if (op === '/') {
			if (right.v === 0) { throw new Error('div by zero'); }
			v = left.v / right.v;
		} else {
			if (right.v === 0) { throw new Error('div by zero'); }
			v = left.v % right.v;
		}
		left = { v: v, pos: pos };
	}
	return { v: left.v, pos: pos };
}

function _parseFactor(toks, pos) {
	var base = _parseAtom(toks, pos);
	pos = base.pos;
	if (pos.p < toks.length && toks[pos.p].t === '^') {
		pos.p++;
		var ex = _parseFactor(toks, pos); /* right assoc */
		return { v: Math.pow(base.v, ex.v), pos: ex.pos };
	}
	return { v: base.v, pos: pos };
}

function _parseAtom(toks, pos) {
	if (pos.p >= toks.length) { throw new Error('unexpected end'); }
	var tk = toks[pos.p];
	if (tk.t === 'num') { pos.p++; return { v: tk.v, pos: pos }; }
	if (tk.t === '-') { pos.p++; var a = _parseAtom(toks, pos); return { v: -a.v, pos: a.pos }; }
	if (tk.t === '+') { pos.p++; return _parseAtom(toks, pos); }
	if (tk.t === '(') {
		pos.p++;
		var e = _parseExpr(toks, pos);
		if (e.pos.p >= toks.length || toks[e.pos.p].t !== ')') { throw new Error('missing )'); }
		e.pos.p++;
		return { v: e.v, pos: e.pos };
	}
	throw new Error('unexpected token');
}

function evalExpr(s) {
	var toks = _tokenize(s);
	if (!toks.length) { return 0; }
	var r = _parseExpr(toks, { p: 0 });
	if (r.pos.p !== toks.length) { throw new Error('trailing input'); }
	return r.v;
}

/* --- app UI -------------------------------------------------------------- */

var KEYS = [
	['C', '(', ')', '/'],
	['7', '8', '9', '*'],
	['4', '5', '6', '-'],
	['1', '2', '3', '+'],
	['0', '.', '^', '=']
];

CalcApp.prototype.onStart = function () {
	this.win = this.createWindow({ title: 'Calculator', width: 132, height: 118, resizable: false });
};

CalcApp.prototype._press = function (k) {
	if (k === 'C') {
		this.expr = '';
		this.result = null;
		this.error = null;
	} else if (k === '=') {
		try {
			this.result = evalExpr(this.expr === '' ? '0' : this.expr);
			this.expr = String(this.result);
			this.error = null;
		} catch (e) {
			this.error = String(e);
			this.result = null;
		}
	} else {
		this.expr += k;
		this.error = null;
	}
	this.win.invalidate();
};

CalcApp.prototype.onDraw = function (win, g) {
	var t = this.api.theme;
	g.clear(t.winClient);
	/* display */
	g.fillRect(4, 4, 124, 16, t.inputBg);
	g.bevel(4, 4, 124, 16, false, t.buttonHi, t.buttonLo);
	var shown = this.error ? 'Err' : (this.expr === '' ? '0' : this.expr);
	if (shown.length > 20) { shown = shown.substring(shown.length - 20); }
	g.textRight(124, 8, shown, this.error ? EGA.RED : t.inputText, NO_COLOR);
	/* pad */
	for (var r = 0; r < KEYS.length; r++) {
		for (var c = 0; c < KEYS[r].length; c++) {
			var bx = 4 + c * 31;
			var by = 24 + r * 18;
			g.fillRect(bx, by, 29, 16, t.buttonFace);
			g.bevel(bx, by, 29, 16, true, t.buttonHi, t.buttonLo);
			g.textCenter(bx + 14, by + 4, KEYS[r][c], t.buttonText, NO_COLOR);
		}
	}
};

CalcApp.prototype.onEvent = function (win, ev) {
	if (ev.type === 'mousedown' && ev.button === this.api.events.BTN.LEFT) {
		var r, c;
		if (ev.y >= 24) {
			c = Math.floor((ev.x - 4) / 31);
			r = Math.floor((ev.y - 24) / 18);
			if (r >= 0 && r < KEYS.length && c >= 0 && c < 4) {
				var lx = 4 + c * 31;
				var ly = 24 + r * 18;
				if (ev.x >= lx && ev.x < lx + 29 && ev.y >= ly && ev.y < ly + 16) {
					this._press(KEYS[r][c]);
				}
			}
		}
		return;
	}
	if (ev.type === 'keydown') {
		var ch = ev.char;
		if (ch && '0123456789.+-*/%^()'.indexOf(ch) >= 0) {
			this._press(ch);
		} else if (ch === '=' || ev.scan === this.api.events.SCAN.ENTER ||
			ev.scan === this.api.events.SCAN.ENTER_PAD) {
			this._press('=');
		} else if (ev.scan === this.api.events.SCAN.BACKSPACE) {
			this.expr = this.expr.substring(0, this.expr.length - 1);
			win.invalidate();
		} else if (ev.scan === this.api.events.SCAN.DEL || ch === 'c' || ch === 'C') {
			this._press('C');
		}
	}
};

exports.__VERSION__ = 1;
exports.create = function (api) { return new CalcApp(api); };
exports.evalExpr = evalExpr;
