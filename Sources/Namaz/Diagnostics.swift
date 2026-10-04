import Foundation
import os

/// Switches for exercising the app without waiting for a real prayer time, read from the
/// environment. Setting any of them also keeps the run away from the user's real state: settings
/// stay in memory and no permission prompts appear.
///
///     NAMAZ_FAKE_NOW=2026-10-04T16:36:50+05:00   start the clock at this instant
///     NAMAZ_MUTE=1                               play alarm sounds at zero volume
///     NAMAZ_DUMP_UI=/some/dir                    save a PNG of each window there, then quit
struct Diagnostics: Sendable {
    /// Added to the real time to get the time the app believes it is.
    var clockOffset: TimeInterval = 0
    var mutesSound = false
    var uiDumpDirectory: URL?
    /// True when any switch is set.
    var isActive = false

    static func fromEnvironment(_ environment: [String: String] = ProcessInfo.processInfo.environment) -> Diagnostics {
        var diagnostics = Diagnostics()
        if let text = environment["NAMAZ_FAKE_NOW"] {
            if let date = ISO8601DateFormatter().date(from: text) {
                diagnostics.clockOffset = date.timeIntervalSinceNow
                diagnostics.isActive = true
            } else {
                Log.info("Ignoring NAMAZ_FAKE_NOW: \(text) is not an ISO 8601 date and time")
            }
        }
        if environment["NAMAZ_MUTE"] != nil {
            diagnostics.mutesSound = true
            diagnostics.isActive = true
        }
        if let path = environment["NAMAZ_DUMP_UI"] {
            diagnostics.uiDumpDirectory = URL(fileURLWithPath: path, isDirectory: true)
            diagnostics.isActive = true
        }
        return diagnostics
    }
}

enum Log {
    private static let logger = Logger(subsystem: "com.personal.namaz", category: "app")

    /// Records a line in the unified log (visible in Console) and on stderr, for terminal runs.
    static func info(_ message: String) {
        logger.info("\(message, privacy: .public)")
        FileHandle.standardError.write(Data("namaz: \(message)\n".utf8))
    }
}
