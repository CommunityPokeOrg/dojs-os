/* tests for sdk/fs.js path helpers and sandboxed file io */

const fs = Require('sdk/fs');

exports.testJoin = function (t) {
	t.eq(fs.join('C:/', 'a'), 'C:/a');
	t.eq(fs.join('C:/x', 'a'), 'C:/x/a');
	t.eq(fs.join('.', 'a'), 'a');
};

exports.testBasenameDirname = function (t) {
	t.eq(fs.basename('C:/a/b.txt'), 'b.txt');
	t.eq(fs.basename('b.txt'), 'b.txt');
	t.eq(fs.dirname('C:/a/b.txt'), 'C:/a');
	t.eq(fs.dirname('/b.txt'), '/');
};

exports.testExtname = function (t) {
	t.eq(fs.extname('a.TXT'), '.txt');
	t.eq(fs.extname('noext'), '');
};

exports.testNormalize = function (t) {
	t.eq(fs.normalize('C:/a/../b'), 'C:/b');
	t.eq(fs.normalize('C:/a/./b'), 'C:/a/b');
	t.eq(fs.normalize('a//b'), 'a/b');
	t.eq(fs.normalize('C:/'), 'C:/');
};

exports.testWriteRead = function (t) {
	t.assert(fs.writeText('C:/T1.TXT', 'hello\ndojs'), 'write');
	t.eq(fs.readText('C:/T1.TXT'), 'hello\ndojs');
	t.eq(FileExists('C:/T1.TXT'), true);
};

exports.testReadMissing = function (t) {
	t.eq(fs.readText('C:/NOPE.TXT'), null);
};

exports.testListAndStat = function (t) {
	fs.mkdir('C:/LDIR');
	fs.writeText('C:/LDIR/A.TXT', 'x');
	fs.writeText('C:/LDIR/B.TXT', 'yy');
	const ents = fs.list('C:/LDIR');
	t.eq(ents.length, 2);
	t.eq(ents[0].name, 'A.TXT');
	t.eq(ents[0].isDir, false);
	t.eq(ents[1].size, 2);
	const st = fs.stat('C:/LDIR/A.TXT');
	t.eq(st.is_regular, true);
};

exports.testDirsFirst = function (t) {
	fs.mkdir('C:/SORT');
	fs.mkdir('C:/SORT/ZDIR');
	fs.writeText('C:/SORT/a.txt', 'a');
	const ents = fs.list('C:/SORT');
	t.eq(ents[0].isDir, true, 'dirs sort first');
};

exports.testRenameRemove = function (t) {
	fs.writeText('C:/R.TXT', 'x');
	t.assert(fs.rename('C:/R.TXT', 'C:/R2.TXT'));
	t.eq(fs.exists('C:/R2.TXT'), true);
	t.assert(fs.remove('C:/R2.TXT'));
	t.eq(fs.exists('C:/R2.TXT'), false);
};

exports.testAppend = function (t) {
	fs.writeText('C:/AP.TXT', 'a');
	fs.appendText('C:/AP.TXT', 'b');
	t.eq(fs.readText('C:/AP.TXT'), 'ab');
};
