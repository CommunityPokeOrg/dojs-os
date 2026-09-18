/*
 * dojs-os - apps/sysinfo.js
 * System information: DOjS/runtime info, memory, drives, processes.
 */

var appmod = Require('sdk/app');

function SysInfoApp(api) {
	appmod.App.call(this, api);
	this.rows = [];
}
SysInfoApp.prototype = Object.create(appmod.App.prototype);

var LINE_H = 10;

SysInfoApp.prototype.onStart = function () {
	this.win = this.createWindow({ title: 'System Information', width: 290, height: 210 });
	this._collect();
};

SysInfoApp.prototype._collect = function () {
	var r = [];
	var k = this.api.kernel;
	var fs = this.api.fs;

	function kv(k2, v) { r.push([k2, v]); }

	kv('Runtime', 'dojs-os on DOjS ' + DOJS_VERSION);
	kv('Engine', 'MuJS (ES5)');
	kv('Screen', SizeX() + 'x' + SizeY() + ' bpp=' + GetScreenMode());
	kv('LFN', LFN_SUPPORTED ? 'yes' : 'no');
	kv('Mouse', MOUSE_AVAILABLE ? 'yes' : 'no');
	kv('Sound', SOUND_AVAILABLE ? 'yes' : 'no');
	try {
		var mi = MemoryInfo();
		kv('Memory', 'total=' + mi.total + ' free=' + mi.remaining);
	} catch (e) { kv('Memory', 'n/a'); }
	kv('FPS', String(GetFramerate()));
	kv('Uptime', Math.floor((MsecTime() - k.bootTime) / 1000) + 's');
	kv('Args', JSON.stringify(ARGS));

	var drv = GetDrive ? GetDrive() : 0;
	kv('CurDrive', String.fromCharCode(64 + drv) + ':');
	for (var d = 1; d <= 6; d++) {
		try {
			if (IsFixed(d)) {
				var fi = fs.freeSpace(d);
				var label = String.fromCharCode(64 + d) + ': ' + GetFSType(d);
				if (fi) {
					label += ' free=' + Math.floor(fi.availClusters * fi.bytesPerCluster * fi.bytesPerSector / 1024) + 'k';
				}
				kv('Drive', label);
			}
		} catch (e2) { }
	}

	var procs = k.processes();
	kv('Processes', String(procs.length));
	for (var i = 0; i < procs.length; i++) {
		kv('  pid ' + procs[i].pid, procs[i].name + ' (' + procs[i].title + ')');
	}
	if (k.errors.length) {
		kv('Errors', String(k.errors.length));
		kv('  last', k.errors[k.errors.length - 1]);
	}
	this.rows = r;
};

SysInfoApp.prototype.onDraw = function (win, g) {
	var t = this.api.theme;
	g.clear(t.winClient);
	var y = 4;
	for (var i = 0; i < this.rows.length; i++) {
		g.text(4, y, this.rows[i][0], t.taskbarDark, NO_COLOR);
		g.text(80, y, this.rows[i][1], t.inputText, NO_COLOR);
		y += LINE_H;
		if (y > win.height - 20) { break; }
	}
	var sy = win.height - 13;
	g.line(0, sy - 1, win.width, sy - 1, t.winBorderDark);
	g.text(4, sy + 1, 'F5 refresh', t.taskbarDark, NO_COLOR);
};

SysInfoApp.prototype.onEvent = function (win, ev) {
	if (ev.type === 'keydown' && ev.scan === this.api.events.SCAN.F5) {
		this._collect();
		this.win.invalidate();
	}
	/* cheap auto-refresh each second */
	if (ev.type === 'mousemove') {
		if ((MsecTime() - (this._lastRefresh || 0)) > 1000) {
			this._lastRefresh = MsecTime();
			this._collect();
			this.win.invalidate();
		}
	}
};

exports.__VERSION__ = 1;
exports.create = function (api) { return new SysInfoApp(api); };
