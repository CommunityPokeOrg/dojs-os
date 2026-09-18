/*
 * dojs-os - sdk/fs.js
 * File I/O facade for apps. Wraps the DOjS File class and directory
 * functions with friendlier semantics (exceptions -> null returns where
 * sensible, path helpers, whole-file read/write).
 *
 * Path conventions: DOjS accepts '/' separators and DOS drive letters
 * ("C:/FOO/FILE.TXT"). When LFN is unavailable (LFN_SUPPORTED == false)
 * names are truncated to 8.3 by the filesystem.
 */

/* --- path helpers (pure functions, no IO) ----------------------------- */

function join(a, b) {
	if (!a || a === '.') { return b; }
	if (a.charAt(a.length - 1) === '/') { return a + b; }
	return a + '/' + b;
}

function basename(path) {
	var i = path.lastIndexOf('/');
	return i < 0 ? path : path.substring(i + 1);
}

function dirname(path) {
	var i = path.lastIndexOf('/');
	if (i <= 0) { return path.charAt(0) === '/' ? '/' : '.'; }
	return path.substring(0, i);
}

function extname(path) {
	var base = basename(path);
	var i = base.lastIndexOf('.');
	return i < 0 ? '' : base.substring(i).toLowerCase();
}

/* normalize . and .. and duplicate slashes. Keeps a leading drive letter
 * ("C:/x") or leading slash. */
function normalize(path) {
	var out = [];
	var i, part;
	var drive = '';
	var rest = path;
	var di = path.indexOf(':');
	if (di === 1) {
		drive = path.substring(0, 2);
		rest = path.substring(2);
	}
	var absolute = rest.charAt(0) === '/';
	var parts = rest.split('/');
	for (i = 0; i < parts.length; i++) {
		part = parts[i];
		if (part === '' || part === '.') { continue; }
		if (part === '..') {
			if (out.length && out[out.length - 1] !== '..') {
				out.pop();
			} else if (!absolute) {
				out.push('..');
			}
			continue;
		}
		out.push(part);
	}
	return drive + (absolute ? '/' : '') + out.join('/') + (absolute && !out.length ? '' : '');
}

/* --- whole-file helpers ----------------------------------------------- */

function readText(path) {
	try {
		return Read(path);
	} catch (e) {
		return null;
	}
}

function writeText(path, text) {
	var f;
	try {
		f = new File(path, FILE.WRITE);
		f.WriteString(text);
		f.Close();
		return true;
	} catch (e) {
		if (f) { try { f.Close(); } catch (e2) { } }
		return false;
	}
}

function appendText(path, text) {
	var f;
	try {
		f = new File(path, FILE.APPEND);
		f.WriteString(text);
		f.Close();
		return true;
	} catch (e) {
		if (f) { try { f.Close(); } catch (e2) { } }
		return false;
	}
}

function readLines(path) {
	var txt = readText(path);
	if (txt === null) { return null; }
	if (txt === '') { return []; }
	/* tolerate DOS CRLF and unix LF */
	return txt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function writeLines(path, lines) {
	return writeText(path, lines.join('\n'));
}

/* --- directory operations --------------------------------------------- */

function exists(path) {
	return FileExists(path) || DirExists(path);
}

function isDir(path) {
	return DirExists(path);
}

/* list dir entries as objects {name, path, isDir, size}.
 * errors return an empty array. */
function list(path) {
	var names;
	try {
		names = List(path);
	} catch (e) {
		return [];
	}
	var out = [];
	for (var i = 0; i < names.length; i++) {
		var n = names[i];
		if (n === '.' || n === '..') { continue; }
		var p = join(path, n);
		var entry = { name: n, path: p, isDir: false, size: 0 };
		try {
			var st = Stat(p);
			entry.isDir = !!st.is_directory;
			entry.size = st.size | 0;
		} catch (e2) {
			entry.isDir = DirExists(p);
		}
		out.push(entry);
	}
	/* dirs first, then alpha */
	out.sort(function (a, b) {
		if (a.isDir !== b.isDir) { return a.isDir ? -1 : 1; }
		return a.name.toLowerCase() < b.name.toLowerCase() ? -1 :
			a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0;
	});
	return out;
}

function mkdir(path) {
	try { MakeDir(path); return true; } catch (e) { return false; }
}

function remove(path) {
	try {
		if (DirExists(path)) { RmDir(path); } else { RmFile(path); }
		return true;
	} catch (e) { return false; }
}

function rename(from, to) {
	try { Rename(from, to); return true; } catch (e) { return false; }
}

function stat(path) {
	try { return Stat(path); } catch (e) { return null; }
}

function freeSpace(driveNum) {
	try { return FreeSpace(driveNum); } catch (e) { return null; }
}

exports.__VERSION__ = 1;
exports.join = join;
exports.basename = basename;
exports.dirname = dirname;
exports.extname = extname;
exports.normalize = normalize;
exports.readText = readText;
exports.writeText = writeText;
exports.appendText = appendText;
exports.readLines = readLines;
exports.writeLines = writeLines;
exports.exists = exists;
exports.isDir = isDir;
exports.list = list;
exports.mkdir = mkdir;
exports.remove = remove;
exports.rename = rename;
exports.stat = stat;
exports.freeSpace = freeSpace;
