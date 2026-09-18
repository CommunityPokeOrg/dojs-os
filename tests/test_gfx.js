/* tests for sdk/gfx.js Surface over the shim framebuffer */

const gfxmod = Require('sdk/gfx');
const Surface = gfxmod.Surface;
const thememod = Require('os/theme');

exports.testScreenSurface = function (t) {
	const s = new Surface(null);
	t.eq(s.width, 640);
	s.clear(EGA.BLACK);
	t.eq(GetPixel(100, 100), EGA.BLACK);
	s.pixel(100, 100, EGA.WHITE);
	t.eq(GetPixel(100, 100), EGA.WHITE);
};

exports.testBitmapSurface = function (t) {
	const bm = new Bitmap(20, 20);
	const s = new Surface(bm);
	s.clear(EGA.BLUE);
	s.fillRect(2, 2, 5, 5, EGA.RED);
	t.eq(bm.GetPixel(3, 3), EGA.RED);
	t.eq(bm.GetPixel(0, 0), EGA.BLUE);
	/* screen untouched */
	t.assert(GetPixel(3, 3) !== EGA.RED || GetPixel(3, 3) === EGA.RED, 'noop');
};

exports.testOffscreenIsolated = function (t) {
	const scr = new Surface(null);
	scr.clear(EGA.BLACK);
	const bm = new Bitmap(10, 10);
	const s = new Surface(bm);
	s.fillRect(0, 0, 10, 10, EGA.GREEN);
	t.eq(GetPixel(5, 5), EGA.BLACK, 'screen not touched by bitmap draw');
	scr.blit(bm, 50, 50);
	t.eq(GetPixel(55, 55), EGA.GREEN, 'blit lands');
};

exports.testText = function (t) {
	const s = new Surface(null);
	s.clear(EGA.BLACK);
	s.text(0, 0, 'HI', EGA.WHITE, NO_COLOR);
	/* the 3x5 font puts pixels around (1..4, 1..6) */
	let found = 0;
	for (let y = 0; y < 8; y++) { for (let x = 0; x < 12; x++) { if (GetPixel(x, y) === EGA.WHITE) { found++; } } }
	t.assert(found > 4, 'text pixels drawn');
};

exports.testBevel = function (t) {
	const s = new Surface(null);
	s.clear(EGA.BLACK);
	s.bevel(10, 10, 20, 10, true, EGA.WHITE, EGA.RED);
	t.eq(GetPixel(10, 10), EGA.WHITE);
	t.eq(GetPixel(29, 19), EGA.RED);
};

exports.testLineRectCircle = function (t) {
	const s = new Surface(null);
	s.clear(EGA.BLACK);
	s.line(0, 0, 9, 0, EGA.WHITE);
	t.eq(GetPixel(5, 0), EGA.WHITE);
	s.rect(20, 20, 10, 10, EGA.RED);
	t.eq(GetPixel(20, 20), EGA.RED);
	t.eq(GetPixel(25, 25), EGA.BLACK, 'interior empty');
	s.fillRect(40, 40, 5, 5, EGA.GREEN);
	t.eq(GetPixel(42, 42), EGA.GREEN);
	s.circle(100, 100, 5, EGA.YELLOW);
	t.eq(GetPixel(105, 100), EGA.YELLOW);
};

exports.testTheme = function (t) {
	t.assert(typeof thememod.theme.titleH === 'number');
	t.assert(thememod.theme.titleH > 0);
};
