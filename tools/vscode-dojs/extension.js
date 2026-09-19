/*
 * dojs-os vscode extension - extension.js
 * Commands: dojs.launch / dojs.restart / dojs.stop.
 * Streams DOSBox-X stdout/stderr (and JSLOG.TXT) into an Output channel.
 */

'use strict';

const vscode = require('vscode');
const path = require('path');
const childProcess = require('child_process');
const { resolveLaunch } = require('./src/launch');
const { DosboxRunner } = require('./src/runner');

let output = null;
let runner = null;
let statusItem = null;
let storageDir = null;

function workspaceRoot() {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || !folders.length) { return null; }
	return folders[0].uri.fsPath;
}

function readConfig() {
	const c = vscode.workspace.getConfiguration('dojs');
	return {
		dosboxXPath: c.get('dosboxXPath', 'dosbox-x'),
		mode: c.get('mode', 'dev'),
		target: c.get('target', 'runbat'),
		configPath: c.get('configPath', ''),
		extraArgs: c.get('extraArgs', []),
		autoBuildZip: c.get('autoBuildZip', true)
	};
}

function setStatus(running) {
	if (!statusItem) { return; }
	if (running) {
		statusItem.text = '$(debug-stop) DOjS running';
		statusItem.tooltip = 'DOSBox-X is running dojs-os — click to stop';
		statusItem.command = 'dojs.stop';
	} else {
		statusItem.text = '$(play) DOjS';
		statusItem.tooltip = 'Launch dojs-os in DOSBox-X';
		statusItem.command = 'dojs.launch';
	}
	statusItem.show();
}

function buildZip(ws) {
	return new Promise(function (resolve) {
		const script = path.join(ws, 'tools', 'build-zip.sh');
		output.appendLine('--- building dist/DOJSOS.ZIP: bash ' + script + ' ---');
		const p = childProcess.spawn('bash', [script], { cwd: ws });
		p.stdout.on('data', function (d) { output.append(String(d)); });
		p.stderr.on('data', function (d) { output.append(String(d)); });
		p.on('exit', function (code) { resolve(code === 0); });
		p.on('error', function (e) {
			output.appendLine('[build] ' + e.message);
			resolve(false);
		});
	});
}

async function launch() {
	const ws = workspaceRoot();
	if (!ws) {
		vscode.window.showErrorMessage('DOjS: open the dojs-os workspace folder first.');
		return;
	}
	const cfg = readConfig();
	if (cfg.mode === 'packaged' && cfg.autoBuildZip) {
		const ok = await buildZip(ws);
		if (!ok) {
			vscode.window.showErrorMessage('DOjS: tools/build-zip.sh failed — see Output.');
			return;
		}
	}
	const spec = resolveLaunch(cfg, ws, storageDir);
	const started = await runner.restart(spec);
	if (started) {
		vscode.window.showInformationMessage(
			'DOjS: DOSBox-X launched (' + spec.mode + '/' + spec.target + ')');
	}
	output.show(true);
}

async function stop() {
	if (await runner.stop()) {
		vscode.window.showInformationMessage('DOjS: DOSBox-X stopped.');
	} else {
		vscode.window.showInformationMessage('DOjS: nothing running.');
	}
}

function activate(context) {
	output = vscode.window.createOutputChannel('DOjS OS — DOSBox-X');
	storageDir = context.globalStorageUri.fsPath;

	runner = new DosboxRunner({
		output: output,
		onState: function (running) { setStatus(running); }
	});

	statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
	setStatus(false);
	context.subscriptions.push(statusItem, output);

	context.subscriptions.push(
		vscode.commands.registerCommand('dojs.launch', launch),
		vscode.commands.registerCommand('dojs.restart', launch),
		vscode.commands.registerCommand('dojs.stop', stop)
	);
}

function deactivate() {
	if (runner) { return runner.stop(); }
}

module.exports = { activate, deactivate };
