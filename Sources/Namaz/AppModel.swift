import AppKit
import Combine
import NamazCore

/// The app's state: settings, today's schedule, and the alarm that is ringing, if any.
/// It owns the one timer that wakes the app whenever something is due to change.
@MainActor
final class AppModel: ObservableObject {
    /// An alarm that comes due while the Mac is asleep is skipped once it is this stale,
    /// rather than rung late.
    private static let lateAlarmGrace: TimeInterval = 120
    /// An alarm stays on screen at least this long, even when its sound is shorter.
    private static let minimumAlarmDisplay: TimeInterval = 45
    private static let locationRefreshInterval: TimeInterval = 6 * 3600

    @Published var settings: AppSettings {
        didSet {
            guard settings != oldValue else { return }
            if !diagnostics.isActive { settings.save() }
            if settings.locationMode == .automatic, oldValue.locationMode != .automatic {
                updateLocation()
            }
            refresh()
        }
    }
    @Published private(set) var schedule: PrayerSchedule?
    /// The prayer whose alarm is sounding or still on screen.
    @Published private(set) var ringing: PrayerEvent?
    @Published private(set) var menuBarTitle = ""
    /// The prayers marked as prayed.
    @Published private(set) var prayed: PrayedLog {
        didSet {
            if prayed != oldValue, !diagnostics.isActive { prayed.save() }
        }
    }
    /// The open, unprayed prayer whose time is running out, if there is one.
    @Published private(set) var warning: PrayerWarning?

    let location = LocationService()
    let diagnostics: Diagnostics

    private let player = AlarmPlayer()
    private let notifier = Notifier()
    private var timer: DispatchSourceTimer?
    /// Alarms due at or before this instant have already been dealt with.
    private var alarmCursor: Date
    private var lastRung: AlarmOccurrence?
    private var lastChime = Date.distantPast
    private var ringStarted = Date.distantPast
    private var dismissal: Task<Void, Never>?
    private var lastLocationRequest = Date.distantPast
    private var observers = Set<AnyCancellable>()

    init(diagnostics: Diagnostics = .fromEnvironment()) {
        self.diagnostics = diagnostics
        self.settings = diagnostics.isActive ? .defaults() : .load()
        self.prayed = diagnostics.isActive ? PrayedLog() : .load()
        self.alarmCursor = Date().addingTimeInterval(diagnostics.clockOffset)
    }

    /// The time the app acts on: the real time, unless a diagnostic run has shifted it.
    var now: Date { time(for: Date()) }

    func time(for realDate: Date) -> Date {
        realDate.addingTimeInterval(diagnostics.clockOffset)
    }

    var timeZone: TimeZone { .current }

    var clockFormat: ClockFormat {
        ClockFormat(style: settings.clockStyle, timeZone: timeZone)
    }

    // MARK: - Lifecycle

    func start() {
        location.onPlace = { [weak self] place in
            Log.info("Located: \(place.name)")
            self?.settings.detectedPlace = place
        }
        notifier.onStopRequested = { [weak self] in self?.stopAlarm() }
        if !diagnostics.isActive { notifier.start() }

        // Anything that moves the wall clock under us, or a day boundary, invalidates the
        // schedule and the pending timer.
        let center = NotificationCenter.default
        Publishers.MergeMany(
            NSWorkspace.shared.notificationCenter.publisher(for: NSWorkspace.didWakeNotification),
            center.publisher(for: .NSSystemClockDidChange),
            center.publisher(for: .NSSystemTimeZoneDidChange),
            center.publisher(for: .NSCalendarDayChanged)
        )
        .map { _ in }
        .receive(on: DispatchQueue.main)
        .sink { [weak self] in self?.clockChanged() }
        .store(in: &observers)

        refresh()
        updateLocationIfStale()
    }

    private func clockChanged() {
        // If the clock was set back, alarms between the new time and the old one are ahead of
        // us again.
        alarmCursor = min(alarmCursor, now)
        refresh()
        updateLocationIfStale()
    }

    /// Recomputes the schedule, rings anything that has come due, and sets the next wake-up.
    func refresh() {
        let now = self.now
        let updated = PrayerSchedule(
            around: now, at: settings.place.coordinates,
            timeZone: timeZone, configuration: settings.calculation)
        if updated != schedule { schedule = updated }

        ringDueAlarms(at: now)
        alarmCursor = now
        updateWarning(at: now)
        updateMenuBarTitle(at: now)
        armTimer(from: now)
    }

    // MARK: - Location

    func updateLocation() {
        guard !diagnostics.isActive else { return }
        lastLocationRequest = Date()
        location.requestPlace()
    }

    private func updateLocationIfStale() {
        guard settings.locationMode == .automatic,
              Date().timeIntervalSince(lastLocationRequest) > Self.locationRefreshInterval
        else { return }
        updateLocation()
    }

    // MARK: - Timer

    private func armTimer(from now: Date) {
        timer?.cancel()

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let midnight = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now))
        var wakeTimes = [midnight ?? now.addingTimeInterval(3600)]

        if let schedule {
            if let change = schedule.nextChange(
                after: now, enabled: settings.alarmPrayers, reminderLead: settings.reminderLead) {
                wakeTimes.append(change)
            }
            if settings.menuBarStyle == .countdown || warning != nil, let next = schedule.next(after: now) {
                // The menu bar countdown reads in whole minutes; redraw each time one runs out.
                // A warning's deadline is a whole number of minutes from the next event, so the
                // same beat serves both.
                let partMinute = next.time.timeIntervalSince(now).truncatingRemainder(dividingBy: 60)
                wakeTimes.append(now.addingTimeInterval(partMinute > 0 ? partMinute : 60))
            }
            if settings.endOfTimeAlerts, let window = schedule.window(at: now),
               !prayed.contains(window.event, in: timeZone),
               let escalation = window.nextEscalation(after: now) {
                wakeTimes.append(escalation)
            }
        }
        if let resume = settings.alertsPausedUntil, resume > now {
            wakeTimes.append(resume)
        }

        // A wall-clock deadline, so the timer tracks clock changes and fires on wake if it came
        // due during sleep. The small margin guarantees the target time has passed when it fires.
        let delay = max(wakeTimes.min()!.timeIntervalSince(now), 0) + 0.05
        let timer = DispatchSource.makeTimerSource(flags: .strict, queue: .main)
        timer.schedule(wallDeadline: .now() + delay, leeway: .milliseconds(20))
        timer.setEventHandler { [weak self] in
            MainActor.assumeIsolated { self?.refresh() }
        }
        timer.resume()
        self.timer = timer
    }

    // MARK: - Alarms

    private func ringDueAlarms(at now: Date) {
        guard let schedule else { return }
        let due = schedule.dueAlarms(
            after: alarmCursor, upTo: now, enabled: settings.alarmPrayers,
            reminderLead: settings.reminderLead, grace: Self.lateAlarmGrace)
        // More than one can only be due together after a pause such as sleep; the latest wins.
        guard let occurrence = due.last, occurrence != lastRung else { return }
        lastRung = occurrence

        switch occurrence.kind {
        case .reminder: remind(of: occurrence.event)
        case .prayerTime: ring(for: occurrence.event)
        }
    }

    private func remind(of event: PrayerEvent) {
        let title = event.title(in: timeZone)
        Log.info("Reminder: \(title) in \(settings.reminderMinutes) minutes")
        notifier.postReminder(
            title: "\(title) in \(settings.reminderMinutes) minutes",
            body: event.prayer.isPrayer
                ? "\(title) is at \(clockFormat.time(event.time))."
                : "Fajr ends at \(clockFormat.time(event.time)).")

        playChime()
    }

    /// A short sound for something that is not an alarm. At most one a second, so a reminder
    /// and a warning that fall on the same instant are heard as one.
    private func playChime() {
        guard Date().timeIntervalSince(lastChime) > 1 else { return }
        lastChime = Date()
        if settings.alarmSound != .silent, !diagnostics.mutesSound, let chime = NSSound(named: "Ping") {
            chime.volume = Float(settings.alarmVolume)
            chime.play()
        }
    }

    private func ring(for event: PrayerEvent) {
        stopAlarm()
        ringing = event
        ringStarted = Date()

        let volume = diagnostics.mutesSound ? 0 : settings.alarmVolume
        let isPlaying = player.play(settings.alarmSound, volume: volume) { [weak self] in
            self?.alarmSoundEnded(for: event)
        }
        Log.info("Alarm: \(event.title(in: timeZone)) at \(clockFormat.time(event.time)), "
            + "sound \(isPlaying ? "playing" : "not playing")")
        if !isPlaying { alarmSoundEnded(for: event) }

        let text = alarmText(for: event)
        notifier.postAlarm(title: text.title, body: text.detail)
        updateMenuBarTitle(at: now)
    }

    /// The wording shown for a ringing alarm, in the notification and on screen.
    func alarmText(for event: PrayerEvent) -> (title: String, detail: String) {
        let time = clockFormat.time(event.time)
        return event.prayer.isPrayer
            ? ("\(event.title(in: timeZone)) · \(time)", "It's time to pray in \(settings.place.name).")
            : ("Sunrise · \(time)", "The time for Fajr has ended.")
    }

    private func alarmSoundEnded(for event: PrayerEvent) {
        let remaining = max(0, Self.minimumAlarmDisplay - Date().timeIntervalSince(ringStarted))
        dismissal = Task { [weak self] in
            try? await Task.sleep(for: .seconds(remaining))
            guard !Task.isCancelled, let self, self.ringing == event else { return }
            self.stopAlarm()
        }
    }

    func stopAlarm() {
        dismissal?.cancel()
        dismissal = nil
        player.stop()
        guard ringing != nil else { return }
        ringing = nil
        notifier.clearAlarm()
        updateMenuBarTitle(at: now)
    }

    /// Rings the alarm now, exactly as it will at a prayer time, so the user can hear it.
    func testAlarm() {
        let prayer = schedule?.events.first { $0.time > now && $0.prayer.isPrayer }?.prayer ?? .dhuhr
        ring(for: PrayerEvent(prayer: prayer, time: now))
    }

    func toggleAlarm(for prayer: Prayer) {
        settings.alarmPrayers.formSymmetricDifference([prayer])
    }

    // MARK: - End of time

    private func updateWarning(at now: Date) {
        let updated = PrayerWarning.current(
            schedule: schedule, settings: settings, prayed: prayed, now: now, timeZone: timeZone)
        guard updated != warning else { return }

        // A step up is worth a sound; easing off is not. Another prayer's warning starts again
        // from calm, so its first stage sounds too.
        let previous = warning?.window == updated?.window ? warning?.urgency ?? .calm : .calm
        if let updated, updated.urgency > previous {
            Log.info("Warning: \(updated.title(in: timeZone)), stage \(updated.urgency)")
            playChime()
        }
        warning = updated
    }

    func setPrayed(_ isPrayed: Bool, for event: PrayerEvent) {
        var log = prayed
        log.set(isPrayed, for: event, in: timeZone)
        log.prune(before: CalendarDay(containing: now, in: timeZone).adding(days: -2))
        prayed = log
        refresh()
    }

    enum PauseLength {
        case hour
        /// Until the next Fajr, when a new day of prayers begins.
        case restOfToday
        case days(Int)
    }

    /// Keeps the end-of-time alerts quiet for a while. They come back by themselves.
    func pauseAlerts(_ length: PauseLength) {
        let now = self.now
        // Rounded up to the minute, because the end is shown to the minute.
        func wholeMinute(_ date: Date) -> Date {
            Date(timeIntervalSinceReferenceDate: (date.timeIntervalSinceReferenceDate / 60).rounded(.up) * 60)
        }
        switch length {
        case .hour:
            settings.alertsPausedUntil = wholeMinute(now + 3600)
        case .restOfToday:
            let nextFajr = schedule?.events.first { $0.prayer == .fajr && $0.time > now }?.time
            settings.alertsPausedUntil = wholeMinute(nextFajr ?? now + 86_400)
        case .days(let days):
            settings.alertsPausedUntil = wholeMinute(now + Double(days) * 86_400)
        }
    }

    func resumeAlerts() {
        settings.alertsPausedUntil = nil
    }

    // MARK: - Menu bar

    private func updateMenuBarTitle(at now: Date) {
        let title: String
        if let ringing {
            title = "\(ringing.title(in: timeZone)) now"
        } else if let warning {
            title = warning.menuBarTitle(at: now, in: timeZone)
        } else if let next = schedule?.next(after: now) {
            let name = next.title(in: timeZone)
            switch settings.menuBarStyle {
            case .nextPrayer: title = "\(name) \(clockFormat.time(next.time))"
            case .countdown: title = "\(name) in \(Countdown.coarse(next.time.timeIntervalSince(now)))"
            case .iconOnly: title = ""
            }
        } else {
            title = ""
        }
        if title != menuBarTitle { menuBarTitle = title }
    }
}
