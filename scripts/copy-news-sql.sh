#!/bin/sh
# Salin BAGIAN 11 (NEWS) dari supabase_upgrade.sql ke clipboard, supaya
# tinggal paste (Cmd+V / Ctrl+V) ke Supabase SQL Editor lalu Run.
#
#   ./scripts/copy-news-sql.sh              # salin ke clipboard
#   ./scripts/copy-news-sql.sh --print      # tampilkan saja, tanpa clipboard
#
# Sumbernya file yang sudah di-push (origin/main) agar tidak pernah basi;
# bila git tidak tersedia, dipakai file di working tree. Isi bagian 11 tidak
# memuat kredensial, jadi aman disalin/disimpan di clipboard.

set -e

SQL_FILE="supabase_upgrade.sql"
SECTION_MARKER='^-- 11\. NEWS'
PRINT_ONLY="no"
[ "$1" = "--print" ] && PRINT_ONLY="yes"

cd "$(dirname "$0")/.."

# Ambil versi terbaru dari origin bila memungkinkan (ref-nya sudah ada lokal).
if git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
    git fetch --quiet origin 2>/dev/null || true
    SQL=$(git show "origin/main:$SQL_FILE")
else
    SQL=$(cat "$SQL_FILE")
fi

PATCH=$(printf '%s\n' "$SQL" | awk -v marker="$SECTION_MARKER" '
    $0 ~ marker { if (!started) { print border; started = 1 } }
    !started    { border = $0 }
    started     { print }
')

if [ -z "$PATCH" ]; then
    echo "GAGAL: bagian 11 tidak ditemukan di $SQL_FILE" >&2
    exit 1
fi

LINES=$(printf '%s\n' "$PATCH" | wc -l | tr -d ' ')

if [ "$PRINT_ONLY" = "yes" ]; then
    printf '%s\n' "$PATCH"
    exit 0
fi

if command -v pbcopy >/dev/null 2>&1; then
    printf '%s\n' "$PATCH" | pbcopy
elif command -v clip >/dev/null 2>&1; then
    printf '%s\n' "$PATCH" | clip
else
    echo "Clipboard tidak tersedia di sistem ini. Pakai --print lalu salin manual:" >&2
    printf '%s\n' "$PATCH"
    exit 1
fi

echo "OK: bagian 11 (NEWS) sudah ada di clipboard — $LINES baris."
echo "Buka Supabase -> SQL Editor -> paste (Cmd+V) -> Run."
