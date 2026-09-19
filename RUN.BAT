@echo off
rem ============================================================
rem  dojs-os unzipped / live-debug launcher
rem
rem  DOSBox-X: use dosbox\dosbox-x-dev.conf, which mounts
rem    C: = vendor\dojs   (DOJS.EXE, CWSDPMI.EXE, JSBOOT.ZIP)
rem    D: = this repo     (host-editable source tree)
rem  then calls D:\RUN.BAT (this file).
rem
rem  Edit sources on the host, re-run RUN.BAT — no zip rebuild.
rem ============================================================

rem DOjS loads its standard library (Require, Println, ...) from
rem JSBOOT.ZIP (or an unpacked JSBOOT\ dir) in the CURRENT directory
rem when running a plain .JS file. Make sure it is visible here.
if exist JSBOOT.ZIP goto havejsboot
if exist JSBOOT\FUNC.JS goto havejsboot
if not exist C:\JSBOOT.ZIP goto nojsboot
echo Fetching JSBOOT.ZIP into CWD so DOjS finds the stdlib...
copy C:\JSBOOT.ZIP JSBOOT.ZIP > nul
if exist JSBOOT.ZIP goto havejsboot
:nojsboot
echo ERROR: JSBOOT.ZIP not found here or on C: (vendor\dojs).
echo Run tools\get-dojs.sh on the host, or mount vendor\dojs as C:.
goto end
:havejsboot

rem -r: run instead of opening the DOjS editor.
rem MAIN.JS is a plain file; Require() resolves modules CWD-relative,
rem so this directory must be the current drive.
if not exist MAIN.JS goto nomain
C:\DOJS.EXE -r -w 640,480 -b 32 MAIN.JS
goto end
:nomain
echo MAIN.JS not found - RUN.BAT must run from the dojs-os root.
:end
