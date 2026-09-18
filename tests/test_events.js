/* tests for sdk/events.js EventPump normalization */

const ev = Require('sdk/events');
const EventPump = ev.EventPump;
const SCAN = ev.SCAN;
const BTN = ev.BTN;

function raw(x, y, buttons, key, ticks) {
	return { x: x, y: y, buttons: buttons, key: key === undefined ? -1 : key, ticks: ticks || 0 };
}

exports.testMouseMove = function (t) {
	const p = new EventPump();
	p.feed(raw(10, 10, 0));
	p.feed(raw(10, 10, 0));
	p.feed(raw(20, 15, 0));
	const q = p.queue;
	t.eq(q.length, 2, 'one move per change');
	t.eq(q[0].type, 'mousemove');
	t.eq(q[1].x, 20);
	t.eq(q[1].y, 15);
};

exports.testClickSequence = function (t) {
	const p = new EventPump();
	p.feed(raw(5, 5, 1, -1, 100));   // down
	p.feed(raw(5, 5, 0, -1, 120));   // up -> click
	const types = p.queue.map(e => e.type);
	t.eq(types.join(','), 'mousemove,mousedown,mouseup,click');
};

exports.testDblClick = function (t) {
	const p = new EventPump();
	p.feed(raw(5, 5, 1, -1, 0));
	p.feed(raw(5, 5, 0, -1, 50));
	p.feed(raw(5, 5, 1, -1, 100));
	p.feed(raw(5, 5, 0, -1, 150));
	const types = p.queue.map(e => e.type);
	t.eq(types.filter(x => x === 'click').length, 2);
	t.eq(types.filter(x => x === 'dblclick').length, 1);
};

exports.testNoClickOnDrag = function (t) {
	const p = new EventPump();
	p.feed(raw(5, 5, 1, -1, 0));
	p.feed(raw(50, 50, 0, -1, 50)); // moved far -> no click
	const types = p.queue.map(e => e.type);
	t.assert(types.indexOf('click') === -1, 'no click after drag');
};

exports.testKeyEvent = function (t) {
	const p = new EventPump();
	p.feed(raw(0, 0, 0, ('a'.charCodeAt(0)) | (30 << 8), 10));
	const e = p.queue[p.queue.length - 1];
	t.eq(e.type, 'keydown');
	t.eq(e.scan, 30);
	t.eq(e.char, 'a');
};

exports.testSpecialKeyNoChar = function (t) {
	const p = new EventPump();
	p.feed(raw(0, 0, 0, (SCAN.ENTER << 8) | 13, 10));
	const e = p.queue[p.queue.length - 1];
	t.eq(e.type, 'keydown');
	t.eq(e.scan, SCAN.ENTER);
};

exports.testDrain = function (t) {
	const p = new EventPump();
	p.feed(raw(1, 2, 0));
	let n = 0;
	while (p.next()) { n++; }
	t.eq(n, 1);
	t.eq(p.hasEvents(), false);
};
