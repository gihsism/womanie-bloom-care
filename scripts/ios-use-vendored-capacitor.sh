#!/usr/bin/env bash
# Re-point the iOS app at the local Capacitor package (ios/vendor/capacitor-swift-pm).
# `npx cap sync ios` regenerates ios/App/CapApp-SPM/Package.swift with the remote
# URL; Xcode's downloader hangs on its binary zips on this Mac, so run this after
# every `cap sync`.
set -euo pipefail
# Fetch the two official 8.5.3 frameworks with curl if missing, verifying the
# checksums published in capacitor-swift-pm's own Package.swift.
v="$(dirname "$0")/../ios/vendor/capacitor-swift-pm"
fetch() { # name sha256
  [ -d "$v/$1.xcframework" ] && return
  curl -sL -o "$v/$1.xcframework.zip" "https://github.com/ionic-team/capacitor-swift-pm/releases/download/8.5.3/$1.xcframework.zip"
  echo "$2  $v/$1.xcframework.zip" | shasum -a 256 -c - >/dev/null
  (cd "$v" && unzip -q -o "$1.xcframework.zip" && rm "$1.xcframework.zip")
}
fetch Capacitor 9316f568444411d362dcb4d1946e7572d4aef5d690c122ff6f1cb8a44a920c9f
fetch Cordova bdcd8eab2d62a077efd76c3c8b9629e65ae7043c1462289a1e55de9be19bbf1f
f="$(dirname "$0")/../ios/App/CapApp-SPM/Package.swift"
sed -i '' 's#\.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "[0-9.]*")#.package(name: "capacitor-swift-pm", path: "../../vendor/capacitor-swift-pm")#' "$f"
grep -q 'vendor/capacitor-swift-pm' "$f" && echo "CapApp-SPM now uses the vendored Capacitor package"
