@echo off
rem Launch dojs-os inside DOjS.
rem  -w sets the framebuffer width/height: only 640x480 or 320x240 are valid.
rem  -b sets bpp (8/16/24/32; alpha needs >=24bpp).
rem  -r runs a zip; without it DOJS runs a script file directly.
rem
rem Prefer the packaged zip:
if exist D:\DOJSOS.ZIP goto zip
rem Fallback: run unzipped tree if dist\main.js was copied (rare)
echo DOJSOS.ZIP not found on D: -- run tools\build-zip.sh first.
goto end
:zip
C:\DOJS.EXE -w 640,480 -b 32 -r D:\DOJSOS.ZIP
:end
