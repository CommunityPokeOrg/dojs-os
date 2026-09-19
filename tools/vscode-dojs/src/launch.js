/*
 * dojs-os vscode extension - launch.js
 * Pure launch-spec builder: no vscode imports, so it is unit-testable
 * under plain node.
 *
 * A launch spec is { bin, args, cwd, confText|null, confPath, watch }.
 * `confText` is a generated DOSBox-X config when cfg.configPath is empty;
 * otherwise confPath points at a checked-in conf (e.g. dosbox-x-dev.conf)
 * and confText is null.
 */

'use strict';

const path = require('path');

/* default DOSBox-X machine config, mirrors dosbox/dosbox-x-dev.conf */
const BASE_SECTIONS = [
	'[sdl]',
	'output = opengl',
	'autolock = true',
	'',
	'[dosbox]',
	'machine = svga_s3',
	'memsize = 64',
	'',
	'[cpu]',
	'core = dynamic',
	'cycles = max',
	'',
	'[video]',
	'vmemsize = 8',
	'allow highres vesa modes = true',
	'allow 32bpp vesa modes = true',
	'',
	'[dos]',
	'lfn = true',
	'ver = 7.1'
];

function q(p) { return '"' + String(p).replace(/"/g, '') + '"'; }

/* autoexec lines for the given mode/target; `ws` = workspace root */
function autoexecLines(mode, target, ws) {
	const lines = [
		'mount C ' + q(path.join(ws, 'vendor', 'dojs')),
		'mount D ' + q(mode === 'packaged' ? path.join(ws, 'dist') : ws),
		'D:'
	];
	if (mode === 'packaged' || target === 'runbat') {
		/* RUN.BAT seeds JSBOOT.ZIP and launches MAIN.JS (dev) or
		 * DOJSOS.ZIP (packaged) */
		lines.push('call RUN.BAT');
	} else {
		/* mainjs: same thing RUN.BAT does, inlined */
		lines.push('if not exist JSBOOT.ZIP copy C:\\JSBOOT.ZIP .');
		lines.push('C:\\DOJS.EXE -r -w 640,480 -b 32 MAIN.JS');
	}
	lines.push('exit');
	return lines;
}

function buildConfText(mode, target, ws) {
	return BASE_SECTIONS.concat(['', '[autoexec]'], autoexecLines(mode, target, ws), ['']).join('\r\n');
}

/**
 * @param {object} cfg {dosboxXPath, mode, target, configPath, extraArgs}
 * @param {string} ws  workspace root (absolute path)
 * @param {string} confDir directory to write the generated conf into
 */
function resolveLaunch(cfg, ws, confDir) {
	const mode = cfg.mode === 'packaged' ? 'packaged' : 'dev';
	const target = cfg.target === 'mainjs' ? 'mainjs' : 'runbat';
	const bin = cfg.dosboxXPath || 'dosbox-x';
	const extra = Array.isArray(cfg.extraArgs) ? cfg.extraArgs.slice() : [];

	let confPath;
	let confText = null;
	if (cfg.configPath) {
		confPath = path.isAbsolute(cfg.configPath)
			? cfg.configPath
			: path.join(ws, cfg.configPath);
	} else {
		confPath = path.join(confDir, 'dojs-generated.conf');
		confText = buildConfText(mode, target, ws);
	}

	return {
		bin: bin,
		args: ['-conf', confPath].concat(extra),
		cwd: ws,
		confPath: confPath,
		confText: confText,
		mode: mode,
		target: target,
		/* DOjS writes JSLOG.TXT into its CWD (the D: mount) */
		watchFile: path.join(mode === 'packaged' ? path.join(ws, 'dist') : ws, 'JSLOG.TXT')
	};
}

module.exports = { resolveLaunch, buildConfText, autoexecLines, BASE_SECTIONS };
