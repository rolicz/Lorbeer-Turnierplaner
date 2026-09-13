#!/usr/bin/env bash
# Source this (". scripts/node-env.sh") before running the frontend toolchain.
# Vite 7 needs Node ^20.19 || >=22.12. Interactive shells usually have nvm loaded;
# login/non-interactive shells (e.g. `bash -lc` from make) often do not — so load
# nvm here when it exists and pick the version from the repo's .nvmrc.
# No-op when nvm is absent (the system Node is used as is).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  _repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  nvm use --silent "$(cat "$_repo_root/.nvmrc")" >/dev/null 2>&1 || nvm use --silent default >/dev/null 2>&1
  unset _repo_root
fi
