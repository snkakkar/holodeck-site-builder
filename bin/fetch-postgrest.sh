#!/usr/bin/env bash
# Download the pinned PostgREST binary at build time (heroku-postbuild).
# PostgREST is a Haskell static binary, not an npm package, so it is NOT
# committed to the repo — we fetch the linux-static release into ./bin.
set -euo pipefail

# Pin a v14.x release. Bump deliberately; do not float to "latest".
# PostgREST v14 uses MAJOR.PATCH tags (e.g. v14.0), and Linux static
# assets are published as *-linux-static-x86-64.tar.xz.
POSTGREST_VERSION="${POSTGREST_VERSION:-v14.0}"
DEST_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="${DEST_DIR}/postgrest"

# On non-Linux dev machines the linux-static binary won't run; skip so a
# local `npm install` doesn't fail. Heroku dynos are linux → it runs there.
UNAME="$(uname -s || echo unknown)"
if [ "$UNAME" != "Linux" ]; then
  echo "[fetch-postgrest] host is ${UNAME}, not Linux — skipping download."
  echo "[fetch-postgrest] install PostgREST locally via your package manager for dev."
  exit 0
fi

if [ -x "$DEST" ]; then
  echo "[fetch-postgrest] ${DEST} already present — skipping download."
  exit 0
fi

URL="https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x86-64.tar.xz"
echo "[fetch-postgrest] downloading ${URL}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$URL" -o "${TMP}/postgrest.tar.xz"
tar -xJf "${TMP}/postgrest.tar.xz" -C "$TMP"
mv "${TMP}/postgrest" "$DEST"
chmod +x "$DEST"
echo "[fetch-postgrest] installed ${POSTGREST_VERSION} at ${DEST}"
