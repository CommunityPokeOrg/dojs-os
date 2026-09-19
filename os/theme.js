/*
 * dojs-os - os/theme.js
 * Central look & feel constants for the desktop environment.
 * All colors are created with the DOjS Color() function (packed RGBA int).
 * Style is deliberately inspired by classic DOS-era shells (Win3.x/95).
 */

var theme = {
	/* chrome */
	desktop: Color(0, 90, 90, 255),          // teal desktop
	taskbar: Color(192, 192, 192, 255),      // win95 gray
	taskbarDark: Color(128, 128, 128, 255),
	taskbarLight: Color(255, 255, 255, 255),
	titleActive: Color(0, 0, 128, 255),      // navy
	titleInactive: Color(128, 128, 128, 255),
	titleText: Color(255, 255, 255, 255),
	winFrame: Color(192, 192, 192, 255),
	winClient: Color(255, 255, 255, 255),
	winBorderDark: Color(64, 64, 64, 255),
	winBorderLight: Color(255, 255, 255, 255),
	shadow: Color(0, 0, 0, 128),

	/* widgets */
	buttonFace: Color(192, 192, 192, 255),
	buttonHi: Color(255, 255, 255, 255),
	buttonLo: Color(64, 64, 64, 255),
	buttonText: Color(0, 0, 0, 255),
	buttonPressed: Color(160, 160, 160, 255),
	inputBg: Color(255, 255, 255, 255),
	inputText: Color(0, 0, 0, 255),
	selectBg: Color(0, 0, 128, 255),
	selectText: Color(255, 255, 255, 255),
	listText: Color(0, 0, 0, 255),
	menuBg: Color(240, 240, 240, 255),
	menuHover: Color(0, 0, 128, 255),
	menuText: Color(0, 0, 0, 255),

	/* pointer (composited by the WM, see os/wm.js) */
	cursorOutline: Color(0, 0, 0, 255),
	cursorFill: Color(255, 255, 255, 255),

	/* metrics (px) */
	titleH: 14,
	borderW: 2,
	taskbarH: 20,
	pad: 4,
	fontW: 6,     // approximate width of the default font glyph
	fontH: 10,    // line height used by the default font + TextXY
	statusH: 12
};

exports.__VERSION__ = 1;
exports.theme = theme;
