/*
 * dojs-os - tests/run-tests.js
 * Dependency-free test runner for host-side tests.
 *   node tests/run-tests.js
 * Each tests/test_*.js file exports test functions; a function fails by
 * throwing. The DOjS shim is installed before any test module loads.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const shim = require('../host/shim.js');

const root = path.resolve(__dirname, '..');
const sandbox = fs.mkdtempSync(path.join(require('os').tmpdir(), 'dojs-test-'));

global.__host = shim.install({ root: root, sandbox: sandbox });

function assert(cond, msg) {
	if (!cond) { throw new Error('assert failed: ' + (msg || '')); }
}
function eq(a, b, msg) {
	if (a !== b) { throw new Error((msg || 'eq') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
}
function approx(a, b, eps, msg) {
	if (Math.abs(a - b) > (eps || 1e-6)) { throw new Error((msg || 'approx') + ': ' + a + ' !== ' + b); }
}
function throws(fn, msg) {
	try { fn(); } catch (e) { return; }
	throw new Error('expected throw: ' + (msg || ''));
}

let pass = 0;
let fail = 0;
const failures = [];

const files = fs.readdirSync(__dirname)
	.filter(f => /^test_.*\.js$/i.test(f))
	.sort();

for (const f of files) {
	const mod = require(path.join(__dirname, f));
	for (const name of Object.keys(mod)) {
		if (!name.startsWith('test')) { continue; }
		try {
			mod[name]({ assert, eq, approx, throws, host: global.__host });
			pass++;
			console.log('PASS ' + f + '::' + name);
		} catch (e) {
			fail++;
			failures.push(f + '::' + name + ' -> ' + e.message);
			console.log('FAIL ' + f + '::' + name + ' -> ' + e.message);
		}
	}
}

console.log('----');
console.log(pass + ' passed, ' + fail + ' failed');
if (failures.length) { console.log(failures.join('\n')); }
process.exit(fail ? 1 : 0);
