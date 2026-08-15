// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "VOLTWidgetCore",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "VoltWidgetCore", targets: ["VoltWidgetCore"])
    ],
    targets: [
        .target(name: "VoltWidgetCore"),
        .testTarget(name: "VoltWidgetCoreTests", dependencies: ["VoltWidgetCore"])
    ]
)
