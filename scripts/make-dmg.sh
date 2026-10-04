#!/bin/bash
# Packs build/Namaz.app into a disk image with a shortcut to Applications beside it, so
# installing is: open the image, drag Namaz onto Applications.
#
#   scripts/make-dmg.sh        writes build/Namaz-<version>.dmg

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
app="$root/build/Namaz.app"
version="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$app/Contents/Info.plist")"
dmg="$root/build/Namaz-$version.dmg"

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
cp -R "$app" "$staging/Namaz.app"
ln -s /Applications "$staging/Applications"

rm -f "$dmg"
hdiutil create -volname "Namaz" -srcfolder "$staging" -format UDZO -ov -quiet "$dmg"

echo "Made $dmg"
