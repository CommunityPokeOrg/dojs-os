#!/bin/sh
# test-host.sh — run the host-side test suite on Node.
set -e
cd "$(dirname "$0")/.."
node tests/run-tests.js
