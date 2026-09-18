# Convenience targets. Node is only needed for host-side testing;
# the OS itself is plain JS interpreted by DOjS on DOS.

.PHONY: test smoke package dosbox clean

test:
	node tests/run-tests.js

smoke:
	node host/run.js --frames 60 --shot dist/dojsos.ppm

package:
	sh tools/build-zip.sh

dosbox: package
	dosbox-x -conf dosbox/dosbox-x.conf

clean:
	rm -rf dist .dojs-sandbox
