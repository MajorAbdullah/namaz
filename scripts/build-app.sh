#!/bin/bash
# Builds Namaz.app from the Swift package, without needing Xcode.
#
#   scripts/build-app.sh            release build into build/Namaz.app
#   scripts/build-app.sh debug      debug build

set -euo pipefail

configuration="${1:-release}"
root="$(cd "$(dirname "$0")/.." && pwd)"
app="$root/build/Namaz.app"

# Release builds run on both Apple Silicon and Intel Macs; debug builds only on this one.
arch_flags=""
if [[ "$configuration" == "release" ]]; then
    arch_flags="--arch arm64 --arch x86_64"
fi

cd "$root"
# shellcheck disable=SC2086
swift build --configuration "$configuration" --product Namaz $arch_flags
# shellcheck disable=SC2086
binary="$(swift build --configuration "$configuration" $arch_flags --show-bin-path)/Namaz"

# The icon is generated from code; rebuild it only when the drawing changes.
icon="$root/Resources/AppIcon.icns"
if [[ ! -f "$icon" || "$root/scripts/make-icon.swift" -nt "$icon" ]]; then
    iconset="$root/build/AppIcon.iconset"
    rm -rf "$iconset"
    swift "$root/scripts/make-icon.swift" "$iconset"
    iconutil --convert icns "$iconset" --output "$icon"
fi

rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$binary" "$app/Contents/MacOS/Namaz"
cp "$root/Resources/Info.plist" "$app/Contents/Info.plist"
cp "$icon" "$app/Contents/Resources/AppIcon.icns"
cp "$root/Resources/Adhan.m4a" "$app/Contents/Resources/Adhan.m4a"

# An ad-hoc signature gives the bundle a stable identity, which macOS needs before it will let
# the app post notifications or ask for location access.
codesign --force --sign - --identifier com.personal.namaz "$app"

echo "Built $app"
