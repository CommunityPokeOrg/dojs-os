@echo off
rem ============================================================
rem  dojs-os launcher — unzipped, straight from the source tree.
rem
rem  Layout-agnostic: everything is resolved relative to the repo
rem  root (VENDOR\DOJS\...), NOT relative to a drive letter, so both
rem  mount styles work:
rem    a) repo mounted as C:           -> cd C:\DOJS-OS  then  RUN.BAT
rem    b) vendor/dojs as C:, repo
rem       as D: (dosbox-x-dev.conf)  -> D:\RUN.BAT (autoexec)
rem
rem  CWD may be the repo root, its parent (if the dir is named
rem  DOJS-OS), or a direct child dir.
rem
rem  Edit .js on the host, exit DOjS, run RUN.BAT again — no zip.
rem ============================================================

rem ---- locate repo root: the dir containing MAIN.JS ----
if exist MAIN.JS goto root_ok
if exist DOJS-OS\MAIN.JS goto cd_repo
if exist ..\MAIN.JS goto cd_up
echo ERROR: cannot locate the dojs-os root (MAIN.JS not found).
echo   RUN.BAT must run from inside the dojs-os directory, its parent
echo   (dir named DOJS-OS), or a direct subdirectory.
goto end
:cd_repo
cd DOJS-OS
goto root_ok
:cd_up
cd ..
goto root_ok
:root_ok

rem ---- DOjS stdlib must be visible in the CURRENT directory ----
rem DOjS defines Require()/Println()/etc. from JSBOOT.ZIP (or an
rem unpacked JSBOOT\ dir) in CWD when running a plain .JS file.
rem If it is missing you get "ReferenceError: 'Require' is not defined".
if exist JSBOOT.ZIP goto boot_ok
if exist JSBOOT\FUNC.JS goto boot_ok
if exist VENDOR\DOJS\JSBOOT.ZIP goto copy_vend
if exist C:\JSBOOT.ZIP goto copy_c
echo ERROR: no JSBOOT.ZIP found to place in the current directory.
echo   Expected the vendored runtime at VENDOR\DOJS\JSBOOT.ZIP (it is
echo   committed to this repo). If it is really absent, run
echo   tools\get-dojs.sh on the host to restore it.
goto end
:copy_vend
copy VENDOR\DOJS\JSBOOT.ZIP JSBOOT.ZIP > nul
goto chk_boot
:copy_c
copy C:\JSBOOT.ZIP JSBOOT.ZIP > nul
goto chk_boot
:chk_boot
if exist JSBOOT.ZIP goto boot_ok
echo ERROR: copy of JSBOOT.ZIP into the current directory failed.
goto end
:boot_ok

rem ---- launch: prefer vendored DOJS.EXE, fall back to C:\DOJS.EXE ----
rem -r: run (without it DOjS opens its editor instead of the script).
if exist VENDOR\DOJS\DOJS.EXE goto run_vend
if exist C:\DOJS.EXE goto run_c
echo ERROR: DOJS.EXE not found at VENDOR\DOJS\DOJS.EXE or C:\DOJS.EXE.
echo   Restore the vendored runtime (tools\get-dojs.sh) or mount it.
goto end
:run_vend
VENDOR\DOJS\DOJS.EXE -r -w 640,480 -b 32 MAIN.JS
goto end
:run_c
C:\DOJS.EXE -r -w 640,480 -b 32 MAIN.JS
goto end
:end
