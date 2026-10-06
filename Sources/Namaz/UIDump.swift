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

        // An end-of-time warning at each stage, at moments taken from the day's own times.
        func content(at date: Date, prayed: PrayedLog = PrayedLog()) -> CardContent? {
            guard let schedule = PrayerSchedule(
                around: date, at: settings.place.coordinates,
                timeZone: timeZone, configuration: settings.calculation)
            else { return nil }
            return CardContent.make(
                schedule: schedule, settings: settings, ringing: nil,
                prayed: prayed, now: date, timeZone: timeZone)
        }
        if let today = model.schedule?.today {
            let warnings = [
                ("warning-20", today.asr - 18 * 60), ("warning-15", today.asr - 13 * 60),
                ("warning-5", today.asr - 3 * 60), ("warning-asr", today.maghrib - 27 * 60),
                ("warning-asr-overdue", today.maghrib - 12 * 60),
                ("warning-maghrib-5", today.isha - 3 * 60), ("warning-isha-10", today.fajr - 8 * 60),
            ]
            for (name, date) in warnings {
                guard let content = content(at: date) else { continue }
                await save(PrayerCard(content: content, layout: .compact), as: "card-compact-\(name)", in: directory)
                await save(IslandContent(content: content, metrics: notch, isExpanded: false),
                           as: "island-notch-\(name)-collapsed", in: directory)
                await save(IslandContent(content: content, metrics: notch, isExpanded: true),
                           as: "island-notch-\(name)-expanded", in: directory)
            }

            var prayed = PrayedLog()
            prayed.set(true, for: PrayerEvent(prayer: .fajr, time: today.fajr), in: timeZone)
            prayed.set(true, for: PrayerEvent(prayer: .dhuhr, time: today.dhuhr), in: timeZone)
            if let content = content(at: today.asr + 30 * 60, prayed: prayed) {
                await save(PrayerCard(content: content, layout: .list), as: "card-list-prayed", in: directory)
                await save(PrayerCard(content: content, layout: .compact), as: "card-compact-prayed", in: directory)
            }
        }

        // The screen cover on the sky of several prayers, with the sun at different heights.
        let covers: [(String, Urgency, Prayer, Double, String)] = [
            ("cover-dhuhr-10", .ten, .dhuhr, 0.97, "Dhuhr ends in 9:42"),
            ("cover-dhuhr-5", .five, .dhuhr, 0.4, "Dhuhr ends in 4:00"),
            ("cover-asr-10", .ten, .asr, 0.8, "Best time for Asr ends in 8:00"),
            ("cover-asr-overdue", .five, .asr, -0.35, "Maghrib is in 13:00. Pray Asr now."),
            ("cover-maghrib-5", .five, .maghrib, 0.2, "Maghrib ends in 2:00"),
            ("cover-isha-10", .ten, .isha, 0.6, "Isha ends in 6:00"),
        ]
        for (name, urgency, period, sun, detail) in covers {
            await save(
                TakeoverContent(
                    detail: detail, urgency: urgency, period: period, sun: sun,
                    entrance: false, onPrayed: {})
                    .frame(width: 1440, height: 900),
                as: name, in: directory)
        }
        // As it is when ⌘Q could not be reserved.
        await save(
            TakeoverContent(
                detail: "Dhuhr ends in 9:42", urgency: .ten, period: .dhuhr, sun: 0.97,
                entrance: false, onPrayed: {}, onQuit: {})
                .frame(width: 1440, height: 900),
            as: "cover-quit", in: directory)

        let actions = AppActions(openSettings: {}, quit: {})
        await save(PopoverView(model: model, actions: actions), as: "popover", in: directory,
                   background: .windowBackgroundColor)
        model.pauseAlerts(.hour)
        await save(PopoverView(model: model, actions: actions), as: "popover-paused", in: directory,
                   background: .windowBackgroundColor)
        model.resumeAlerts()
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
