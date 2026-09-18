/* tests for the calculator expression evaluator */

const calc = Require('apps/calc');
const evalExpr = calc.evalExpr;

exports.testBasicArithmetic = function (t) {
	t.eq(evalExpr('1+2'), 3);
	t.eq(evalExpr('2*3+4'), 10);
	t.eq(evalExpr('2+3*4'), 14);
	t.eq(evalExpr('10-4'), 6);
	t.eq(evalExpr('8/2'), 4);
	t.eq(evalExpr('7%3'), 1);
};

exports.testParens = function (t) {
	t.eq(evalExpr('(2+3)*4'), 20);
	t.eq(evalExpr('2*(3+4)'), 14);
	t.eq(evalExpr('((1+2)*(3+4))'), 21);
};

exports.testUnaryAndPow = function (t) {
	t.eq(evalExpr('-5'), -5);
	t.eq(evalExpr('2^3'), 8);
	t.eq(evalExpr('2^3^2'), 512, 'right assoc');
	t.eq(evalExpr('-2^2'), 4); /* unary binds tighter: (-2)^2 */
};

exports.testFloats = function (t) {
	t.approx(evalExpr('1.5+2.25'), 3.75);
	t.approx(evalExpr('1/3'), 1 / 3);
};

exports.testErrors = function (t) {
	t.throws(() => evalExpr('1+'), 'trailing op');
	t.throws(() => evalExpr('1/0'), 'div zero');
	t.throws(() => evalExpr('(1+2'), 'unclosed paren');
	t.throws(() => evalExpr('abc'), 'bad input');
	t.eq(evalExpr(''), 0, 'empty -> 0');
};

exports.testAppCreatesWindow = function (t) {
	/* boot a fresh kernel+wm headlessly and spawn calc */
	const kmod = Require('os/kernel');
	const wmod = Require('os/wm');
	const k = new kmod.Kernel();
	k.wm = new wmod.WindowManager(k);
	k.registerApp({ name: 'calc', path: 'apps/calc', title: 'Calculator' });
	const p = k.spawn('calc', []);
	t.assert(p !== null, 'calc spawned');
	t.eq(k.wm.windows.length, 1, 'one window');
	t.eq(k.wm.focused.title, 'Calculator');
	k.kill(p.pid);
	t.eq(k.wm.windows.length, 0, 'window closed on kill');
};
