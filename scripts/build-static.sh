#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-${ROOT}/dist}"

# Release contains only public static assets. Never package database migrations,
# private storage, uploaded employee records, environment files or credentials.
if [[ -e "$OUTPUT" && ! -d "$OUTPUT" ]]; then
  echo "Refusing to overwrite a non-directory: $OUTPUT" >&2
  exit 1
fi
mkdir -p "$OUTPUT/icons"
for file in index.html app.js styles.css pwa-install.js sw.js manifest.webmanifest; do
  test -s "$ROOT/$file"
  cp "$ROOT/$file" "$OUTPUT/$file"
done
for size in 192 512; do
  test -s "$ROOT/icons/icon-$size.png"
  cp "$ROOT/icons/icon-$size.png" "$OUTPUT/icons/icon-$size.png"
done
cp "$ROOT/deploy/_headers" "$OUTPUT/_headers"

for file in "$OUTPUT/.env" "$OUTPUT/service-role.key" "$OUTPUT/supabase/schema.sql"; do
  if [[ -e "$file" ]]; then
    echo "Refusing public build containing private file: $file" >&2
    exit 1
  fi
done
echo "Public Phatsema app bundle assembled in $OUTPUT"
