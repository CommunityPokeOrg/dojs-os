/* tests for the editor document model */

const ed = Require('apps/editor');
const doc = ed.doc;

exports.testInsert = function (t) {
	const lines = [''];
	let cx = 0;
	cx = doc.insertChar(lines, cx, 0, 'h');
	cx = doc.insertChar(lines, cx, 0, 'i');
	t.eq(doc.text(lines), 'hi');
};

exports.testEnterSplits = function (t) {
	const lines = ['hello'];
	const p = doc.enter(lines, 2, 0);
	t.eq(lines.length, 2);
	t.eq(lines[0], 'he');
	t.eq(lines[1], 'llo');
	t.eq(p.cx, 0);
	t.eq(p.cy, 1);
};

exports.testBackspaceJoins = function (t) {
	const lines = ['ab', 'cd'];
	const p = doc.backspace(lines, 0, 1);
	t.eq(lines.length, 1);
	t.eq(lines[0], 'abcd');
	t.eq(p.cx, 2);
	t.eq(p.cy, 0);
};

exports.testDelete = function (t) {
	const lines = ['abc'];
	doc.del(lines, 1, 0);
	t.eq(lines[0], 'ac');
	doc.del(lines, 1, 0); /* delete at end joins next line */
	const lines2 = ['a', 'b'];
	doc.del(lines2, 1, 0);
	t.eq(lines2[0], 'ab');
	t.eq(lines2.length, 1);
};

exports.testRoundtrip = function (t) {
	const lines = ['one', 'two', ''];
	t.eq(doc.text(lines), 'one\ntwo\n');
};
