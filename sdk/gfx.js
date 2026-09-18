/*
 * dojs-os - sdk/gfx.js
 * Surface: a thin, canvas-style drawing API over the DOjS primitives.
 *
 * A Surface wraps a render target. Pass a Bitmap to draw off-screen
 * (window contents) or null to draw to the DOjS back buffer (the
 * composited screen). DOjS has no clipping API; rendering into an
 * off-screen Bitmap per window is the recommended way to clip.
 *
 * Coordinates are always relative to the surface origin.
 */

function Surface(bitmap) {
	this.bitmap = bitmap || null; // null -> screen back buffer
	this.width = bitmap ? bitmap.width : SizeX();
	this.height = bitmap ? bitmap.height : SizeY();
	this._font = null;
}

/* --- render-target switching ---------------------------------------- */

Surface.prototype._withTarget = function (fn) {
	if (this.bitmap) {
		SetRenderBitmap(this.bitmap);
		try {
			return fn();
		} finally {
			SetRenderBitmap(null); // restore screen back buffer
		}
	} else {
		return fn();
	}
};

/* --- primitives ------------------------------------------------------ */

Surface.prototype.clear = function (color) {
	var self = this;
	this._withTarget(function () {
		if (self.bitmap) {
			self.bitmap.Clear();
			if (color !== undefined && color !== NO_COLOR) {
				FilledBox(0, 0, self.width - 1, self.height - 1, color);
			}
		} else {
			ClearScreen(color === undefined ? EGA.BLACK : color);
		}
	});
};

Surface.prototype.pixel = function (x, y, c) {
	this._withTarget(function () { Plot(x, y, c); });
};

Surface.prototype.line = function (x1, y1, x2, y2, c) {
	this._withTarget(function () { Line(x1, y1, x2, y2, c); });
};

/* outlined rectangle; w/h are sizes (not end coords) */
Surface.prototype.rect = function (x, y, w, h, c) {
	this._withTarget(function () { Box(x, y, x + w - 1, y + h - 1, c); });
};

Surface.prototype.fillRect = function (x, y, w, h, c) {
	this._withTarget(function () { FilledBox(x, y, x + w - 1, y + h - 1, c); });
};

Surface.prototype.circle = function (x, y, r, c) {
	this._withTarget(function () { Circle(x, y, r, c); });
};

Surface.prototype.fillCircle = function (x, y, r, c) {
	this._withTarget(function () { FilledCircle(x, y, r, c); });
};

Surface.prototype.ellipse = function (x, y, rx, ry, c) {
	this._withTarget(function () { Ellipse(x, y, rx, ry, c); });
};

Surface.prototype.fillEllipse = function (x, y, rx, ry, c) {
	this._withTarget(function () { FilledEllipse(x, y, rx, ry, c); });
};

/* vertices: flat array [x0,y0,x1,y1,...] */
Surface.prototype.fillPolygon = function (vertices, c) {
	this._withTarget(function () { FilledPolygon(vertices, c); });
};

Surface.prototype.floodFill = function (x, y, border, c) {
	this._withTarget(function () { FloodFill(x, y, border, c); });
};

Surface.prototype.getPixel = function (x, y) {
	return this._withTarget(function () { return GetPixel(x, y); });
};

/* --- text ------------------------------------------------------------ */

/* set a GRX Font for this surface's text calls; pass null for the
 * built-in 8x8 Allegro font (fastest) */
Surface.prototype.setFont = function (font) {
	this._font = font;
};

Surface.prototype.text = function (x, y, str, fg, bg) {
	var f = this._font;
	this._withTarget(function () {
		if (f) {
			f.DrawStringLeft(x, y, str, fg, bg === undefined ? NO_COLOR : bg);
		} else {
			TextXY(x, y, str, fg, bg === undefined ? NO_COLOR : bg);
		}
	});
};

Surface.prototype.textRight = function (x, y, str, fg, bg) {
	var f = this._font;
	this._withTarget(function () {
		if (f) {
			f.DrawStringRight(x, y, str, fg, bg === undefined ? NO_COLOR : bg);
		} else {
			TextXY(x - Surface._measure(str, f), y, str, fg, bg === undefined ? NO_COLOR : bg);
		}
	});
};

Surface.prototype.textCenter = function (x, y, str, fg, bg) {
	var f = this._font;
	this._withTarget(function () {
		if (f) {
			f.DrawStringCenter(x, y, str, fg, bg === undefined ? NO_COLOR : bg);
		} else {
			TextXY(x - (Surface._measure(str, f) >> 1), y, str, fg, bg === undefined ? NO_COLOR : bg);
		}
	});
};

Surface._measure = function (str, font) {
	if (font) {
		return font.StringWidth(str);
	}
	return str.length * 6; /* default Allegro font spacing for TextXY */
};

Surface.prototype.textWidth = function (str) {
	return Surface._measure(str, this._font);
};

Surface.prototype.textHeight = function () {
	return this._font ? this._font.height : 8;
};

/* --- bitmaps --------------------------------------------------------- */

/* draw a bitmap (or sub-region) into this surface */
Surface.prototype.blit = function (bmp, x, y) {
	this._withTarget(function () { bmp.Draw(x, y); });
};

Surface.prototype.blitRegion = function (bmp, sx, sy, sw, sh, dx, dy, dw, dh) {
	this._withTarget(function () {
		bmp.DrawAdvanced(sx, sy, sw, sh, dx, dy, dw === undefined ? sw : dw, dh === undefined ? sh : dh);
	});
};

/* --- effects --------------------------------------------------------- */

/* 3d sunken/raised bevel used by all chrome */
Surface.prototype.bevel = function (x, y, w, h, raised, hi, lo) {
	this.line(x, y, x + w - 1, y, raised ? hi : lo);
	this.line(x, y, x, y + h - 1, raised ? hi : lo);
	this.line(x, y + h - 1, x + w - 1, y + h - 1, raised ? lo : hi);
	this.line(x + w - 1, y, x + w - 1, y + h - 1, raised ? lo : hi);
};

Surface.prototype.invert = function (x, y, w, h) {
	/* cheap "selected"/"pressed" effect without alpha */
	for (var j = 0; j < h; j++) {
		for (var i = 0; i < w; i++) {
			var p = this.getPixel(x + i, y + j);
			this.pixel(x + i, y + j, p ^ 0xFFFFFF);
		}
	}
};

exports.__VERSION__ = 1;
exports.Surface = Surface;
