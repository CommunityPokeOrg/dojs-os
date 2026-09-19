Vendored DOjS runtime (minimal set) for dojs-os
================================================

Source   : https://github.com/SuperIlu/DOjS
Release  : v1.140 (Version 1.14.0, "Up the grade")
Asset    : dojs-1.14.0.zip
AssetSHA256: 0a61ec4f843d7ac0aa21364610999acea49a8ee500e7d9e16849f1175ab41e49
Download : https://github.com/SuperIlu/DOjS/releases/download/v1.140/dojs-1.14.0.zip

Only the files needed to run scripts are committed here:

  dojs.exe      DOjS interpreter (DJGPP COFF DOS-extended, needs 80386+)
  CWSDPMI.EXE   DPMI host, required on real DOS/FreeDOS (DOSBox provides
                its own DPMI, but real hardware does not)
  JSBOOT.ZIP    DOjS standard library (Require(), File, System(), etc.)
  dojs.ini      optional startup config (all settings commented out)
  LICENSE       full upstream license text
  SHA256SUMS    per-file checksums of the vendored files
  README.TXT    this file

NOT vendored (fetch the full release if you want them):
  *.DXE         optional loadable modules (png/jpeg/ogl/sqlite/curl/...)
  examples/     upstream demo scripts
  doc/html/     API documentation
  WATTCP.CFG    TCP/IP stack config (dojs-os does not use networking)

To get the full release or a different version:

  tools/get-dojs.sh           # refresh the vendored minimal set
  tools/get-dojs.sh --full    # full release incl. DXEs/examples/docs
  tools/get-dojs.sh v1.9.0    # pick a specific tag

Licenses (see LICENSE for details): DOjS code MIT, MuJS ISC, Allegro 4
giftware, CWSDPMI GPL (binary redistribution explicitly permitted by
upstream docs). Reproduced unmodified from the official release zip.
