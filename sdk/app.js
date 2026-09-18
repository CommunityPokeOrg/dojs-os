/*
 * dojs-os - sdk/app.js
 * App: base class for dojs-os applications.
 *
 * An app module exports a factory:
 *     exports.create = function (api) { return new MyApp(api); }
 *
 * `api` is the AppSDK bundle handed to every app:
 *   api.wm       window manager (createWindow, focusWindow, ...)
 *   api.kernel   process/kernel services (spawn, exit, args, timers)
 *   api.gfx      { Surface }
 *   api.ui       widget toolkit { Button, Label, TextField, ListBox, ... }
 *   api.fs       file-io facade
 *   api.events   { SCAN, BTN, keys }
 *   api.theme    look & feel
 *
 * Lifecycle hooks an app may implement:
 *   onStart()                once, after windows can be created
 *   onDraw(win, surface)     repaint client area of win (call when dirty)
 *   onEvent(win, ev)         normalized event targeted at win's client area
 *   onClose(win)             return false to veto closing this window
 *   onResize(win, w, h)      after a resize (surface was recreated)
 *   onExit()                 app is being torn down; last window closed
 */

function App(api) {
	this.api = api;
	this.windows = [];
	this.pid = 0;
	this.name = 'app';
	this.args = [];
}

App.prototype.createWindow = function (opts) {
	opts = opts || {};
	opts.app = this;
	opts.pid = this.pid;
	var win = this.api.wm.createWindow(opts);
	this.windows.push(win);
	return win;
};

App.prototype.exit = function () {
	this.api.kernel.kill(this.pid);
};

/* default no-op hooks so the WM can call unconditionally */
App.prototype.onStart = function () { };
App.prototype.onDraw = function (win, surface) { };
App.prototype.onEvent = function (win, ev) { };
App.prototype.onClose = function (win) { return true; };
App.prototype.onResize = function (win, w, h) { };
App.prototype.onExit = function () { };

exports.__VERSION__ = 1;
exports.App = App;
