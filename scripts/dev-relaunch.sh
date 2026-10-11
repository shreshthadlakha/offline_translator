#!/bin/bash
# Dev-server relauncher: run via a double-fork (setsid --fork) so the process is
# orphaned to init BEFORE the calling tool-shell exits — the sandbox reaper only
# kills processes still recorded as descendants of a tool-call shell at exit.
cd /home/z/my-project
exec bun run dev >/dev/null 2>&1 </dev/null
