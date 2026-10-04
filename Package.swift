// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Namaz",
    platforms: [.macOS(.v14)],
    targets: [
        // Pure calculation and scheduling logic. No UI, so it can be tested on its own.
        .target(name: "NamazCore"),
        // The menu bar app and desktop widget.
        .executableTarget(name: "Namaz", dependencies: ["NamazCore"]),
        .testTarget(name: "NamazCoreTests", dependencies: ["NamazCore"]),
        .testTarget(name: "NamazTests", dependencies: ["Namaz"]),
    ]
)
