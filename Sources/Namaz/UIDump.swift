import AppKit
import NamazCore
import SwiftUI

/// Saves a picture of each part of the interface, so the design can be checked without anyone
/// having to click through it. Run with `NAMAZ_DUMP_UI=<directory>`.
@MainActor
enum UIDump {
    static func run(model: AppModel, into directory: URL) async {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let settings = model.settings
        let timeZone = model.timeZone
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone

        func content(atHour hour: Int, minute: Int, ringing: Prayer? = nil) -> CardContent? {
            guard let date = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: model.now),
                  let schedule = PrayerSchedule(
                    around: date, at: settings.place.coordinates,
                    timeZone: timeZone, configuration: settings.calculation)
            else { return nil }
            return CardContent.make(
                schedule: schedule, settings: settings,
                ringing: ringing.map { PrayerEvent(prayer: $0, time: schedule.today[$0]) },
                now: date, timeZone: timeZone)
        }

        // The card at a moment inside each part of the day, in both layouts.
        let moments = [
            ("1-dawn", 5, 40), ("2-morning", 9, 0), ("3-midday", 13, 30),
            ("4-afternoon", 17, 10), ("5-dusk", 18, 45), ("6-night", 22, 30),
        ]
        for (name, hour, minute) in moments {
            guard let content = content(atHour: hour, minute: minute) else { continue }
            for layout in [AppSettings.WidgetLayout.compact, .list] {
                await save(PrayerCard(content: content, layout: layout),
                           as: "card-\(layout.rawValue)-\(name)", in: directory)
            }
        }

        if let ringing = content(atHour: 16, minute: 38, ringing: .asr) {
            await save(PrayerCard(content: ringing, layout: .compact), as: "card-compact-ringing", in: directory)
        }
        if let schedule = model.schedule {
            let text = model.alarmText(for: PrayerEvent(prayer: .asr, time: schedule.today.asr))
            await save(AlarmBanner(title: text.title, detail: text.detail, period: .asr, onStop: {}),
                       as: "alarm-banner", in: directory)
        }

        let notch = IslandMetrics(notchWidth: 185, barHeight: 32)
        let pill = IslandMetrics(notchWidth: 0, barHeight: 30)
        if let afternoon = content(atHour: 17, minute: 10), let ringing = content(atHour: 16, minute: 38, ringing: .asr) {
            for (name, metrics) in [("notch", notch), ("pill", pill)] {
                await save(IslandContent(content: afternoon, metrics: metrics, isExpanded: false),
                           as: "island-\(name)-collapsed", in: directory)
                await save(IslandContent(content: afternoon, metrics: metrics, isExpanded: true),
                           as: "island-\(name)-expanded", in: directory)
                await save(IslandContent(content: ringing, metrics: metrics, isExpanded: true),
                           as: "island-\(name)-ringing", in: directory)
            }
        }

        let actions = AppActions(openSettings: {}, quit: {})
        await save(PopoverView(model: model, actions: actions), as: "popover", in: directory,
                   background: .windowBackgroundColor)
        // Show one adjusted prayer, so the picture covers that row's extra controls.
        model.settings.calculation.adjustments[.dhuhr] = 69
        for tab in SettingsView.Tab.allCases {
            await save(SettingsView(model: model, tab: tab), as: "settings-\(tab.rawValue)", in: directory,
                       background: .windowBackgroundColor)
        }
        Log.info("Saved interface pictures to \(directory.path)")
    }

    private static func save<V: View>(
        _ view: V, as name: String, in directory: URL, background: NSColor = .clear
    ) async {
        let hosting = NSHostingView(rootView: view.background(Color(nsColor: background)))
        let frame = CGRect(origin: .zero, size: hosting.fittingSize)
        hosting.sizingOptions = []

        // An off-screen window gives the view a real environment to lay out and draw in.
        let window = NSWindow(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.backgroundColor = background
        window.contentView = hosting
        hosting.frame = frame
        hosting.layoutSubtreeIfNeeded()
        try? await Task.sleep(for: .milliseconds(200))

        if let png = hosting.pngSnapshot() {
            try? png.write(to: directory.appendingPathComponent("\(name).png"))
        } else {
            Log.info("Could not draw \(name) at \(Int(frame.width))x\(Int(frame.height))")
        }
        window.close()
    }
}
