// swift-tools-version:5.3
// Local copy of capacitor-swift-pm 8.5.3 with the two binary frameworks on
// disk. Xcode's package downloader hangs fetching the release zips on this
// Mac (curl fetches them fine), so the app points here instead. Checksums of
// the zips match the official manifest (verified when vendored, 2026-11-15).
import PackageDescription

let package = Package(
    name: "capacitor-swift-pm",
    products: [
        .library(name: "Capacitor", targets: ["Capacitor"]),
        .library(name: "Cordova", targets: ["Cordova"])
    ],
    dependencies: [],
    targets: [
        .binaryTarget(name: "Capacitor", path: "Capacitor.xcframework"),
        .binaryTarget(name: "Cordova", path: "Cordova.xcframework")
    ]
)
