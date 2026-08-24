#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER_DIR="$ROOT_DIR/helper/StoryDeskVirtualDisplayHelper"
OUT_DIR="$ROOT_DIR/dist-helper"

mkdir -p "$OUT_DIR"

swiftc \
  -import-objc-header "$HELPER_DIR/CGVirtualDisplayPrivate.h" \
  "$HELPER_DIR/main.swift" \
  -framework AppKit \
  -framework CoreGraphics \
  -o "$OUT_DIR/StoryDeskVirtualDisplayHelper"

chmod +x "$OUT_DIR/StoryDeskVirtualDisplayHelper"
