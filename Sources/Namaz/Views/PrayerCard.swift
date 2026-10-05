import NamazCore
import SwiftUI

/// Everything the card shows at one instant, already formatted.
struct CardContent {
    enum Headline {
        case upcoming(title: String, caption: String)
        case ringing(title: String, caption: String)
        /// No times exist for this place today (polar regions).
        case unavailable
    }

    struct Row: Identifiable {
        enum State { case past, current, next, upcoming }

        let prayer: Prayer
        let event: PrayerEvent
        let title: String
        let time: String
        let shortTime: String
        let state: State
        let alarmOn: Bool
        let isPrayed: Bool
        /// True once a prayer has begun, when it can be marked as prayed or unmarked.
        let canMarkPrayed: Bool

        var id: Prayer { prayer }
    }

    var placeName: String
    var hijriDate: String
    /// The part of the day we are in, which picks the backdrop.
    var period: Prayer?
    var headline: Headline
    /// Seconds on the countdown: to the next event, or to the deadline while a warning shows.
    var remaining: TimeInterval
    /// How far we are from the previous event to the next, 0 to 1.
    var progress: Double
    var rows: [Row]
    /// The prayer whose time is open and which has not been marked as prayed.
    var open: PrayerEvent?
    /// That prayer's name as the user knows it, so Friday's Dhuhr is Jumu'ah. Short enough for
    /// the island's narrow wings, where a warning's full title would run under the notch.
    var openTitle: String?
    /// Set while that prayer is close to its deadline.
    var warning: PrayerWarning?

    var urgency: Urgency { warning?.urgency ?? .calm }

    @MainActor
    static func make(
        schedule: PrayerSchedule?,
        settings: AppSettings,
        ringing: PrayerEvent?,
        prayed: PrayedLog = PrayedLog(),
        now: Date,
        timeZone: TimeZone
    ) -> CardContent {
        let format = ClockFormat(style: settings.clockStyle, timeZone: timeZone)
        var content = CardContent(
            placeName: settings.place.name,
            hijriDate: HijriDate.string(
                for: now, timeZone: timeZone,
                afterMaghrib: schedule.map { now >= $0.today.maghrib } ?? false,
                dayOffset: settings.hijriDayOffset),
            period: nil, headline: .unavailable, remaining: 0, progress: 0, rows: [])

        guard let schedule, let next = schedule.next(after: now) else { return content }
        let current = schedule.current(at: now)

        content.period = current?.prayer
        content.remaining = next.time.timeIntervalSince(now)
        content.progress = schedule.progress(at: now)
        content.rows = schedule.displayDay(at: now).events.map { event in
            let state: Row.State
            if event == next {
                state = .next
            } else if event == current, event.prayer.isPrayer {
                state = .current
            } else {
                state = event.time <= now ? .past : .upcoming
            }
            return Row(
                prayer: event.prayer,
                event: event,
                title: event.title(in: timeZone),
                time: format.time(event.time),
                shortTime: format.shortTime(event.time),
                state: state,
                alarmOn: settings.alarmPrayers.contains(event.prayer),
                isPrayed: prayed.contains(event, in: timeZone),
                canMarkPrayed: event.prayer.isPrayer && event.time <= now)
        }
        if let window = schedule.window(at: now), !prayed.contains(window.event, in: timeZone) {
            content.open = window.event
            content.openTitle = window.event.title(in: timeZone)
        }
        content.warning = PrayerWarning.current(
            schedule: schedule, settings: settings, prayed: prayed, now: now, timeZone: timeZone)

        if let ringing {
            content.headline = .ringing(
                title: ringing.title(in: timeZone),
                caption: ringing.prayer.isPrayer
                    ? "It's time to pray · \(format.time(ringing.time))"
                    : "Fajr has ended · \(format.time(ringing.time))")
        } else if let warning = content.warning {
            // The countdown now runs to the deadline, and the words say what is at stake.
            content.remaining = warning.countdownTarget.timeIntervalSince(now)
            let nextUp = "\(next.title(in: timeZone)) · \(format.time(next.time))"
            content.headline = .upcoming(
                title: warning.title(in: timeZone),
                caption: warning.isOverdue
                    ? nextUp
                    : warning.hasEarlyDeadline
                        ? "Best time ends \(format.time(warning.window.deadline))"
                        : "Then \(nextUp)")
        } else {
            content.headline = .upcoming(
                title: next.title(in: timeZone),
                caption: next.prayer.isPrayer
                    ? "Next prayer · \(format.time(next.time))"
                    : "Fajr ends · \(format.time(next.time))")
        }
        return content
    }
}

/// The prayer-times card, used by both the desktop widget and the menu bar popover.
struct PrayerCard: View {
    let content: CardContent
    let layout: AppSettings.WidgetLayout
    var onToggleAlarm: (Prayer) -> Void = { _ in }
    var onSetPrayed: (PrayerEvent, Bool) -> Void = { _, _ in }
    var onStop: () -> Void = {}

    static let cornerRadius: CGFloat = 24

    static func width(for layout: AppSettings.WidgetLayout) -> CGFloat {
        layout == .list ? 296 : 364
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            headline
                .padding(.top, 10)
            ProgressBar(value: content.progress, tint: content.urgency.color ?? .white)
                .animation(.easeInOut(duration: 0.6), value: content.urgency)
                .padding(.top, 10)
            if !content.rows.isEmpty {
                timetable
                    .padding(.top, 12)
            }
        }
        .padding(16)
        .frame(width: Self.width(for: layout), alignment: .leading)
        .foregroundStyle(.white)
        .background(SkyBackground(theme: SkyTheme(period: content.period)))
        .clipShape(shape)
        .overlay(shape.strokeBorder(.white.opacity(0.16), lineWidth: 1))
        .environment(\.colorScheme, .dark)
    }

    private var header: some View {
        HStack(spacing: 4) {
            Image(systemName: "location.fill")
                .font(.system(size: 9, weight: .semibold))
            Text(content.placeName)
                .font(.system(size: 12, weight: .semibold))
            Spacer(minLength: 8)
            Text(content.hijriDate)
                .font(.system(size: 12, weight: .medium))
                .layoutPriority(1)
        }
        .lineLimit(1)
        .opacity(0.85)
    }

    @ViewBuilder
    private var headline: some View {
        let titleFont = Font.system(size: layout == .compact ? 32 : 27, weight: .bold, design: .rounded)

        switch content.headline {
        case .upcoming(let title, let caption):
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(title)
                        .font(titleFont)
                    Spacer(minLength: 0)
                    countdown(font: titleFont)
                }
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                HStack {
                    Text(caption)
                        .opacity(0.8)
                    Spacer(minLength: 8)
                    if let open = content.open {
                        PrayedButton(prayer: content.openTitle ?? open.prayer.name, isUrgent: content.warning != nil) {
                            onSetPrayed(open, true)
                        }
                    } else {
                        Text("remaining")
                            .opacity(0.8)
                    }
                }
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
            }
        case .ringing(let title, let caption):
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(title)
                            .font(titleFont)
                        Image(systemName: "bell.and.waves.left.and.right.fill")
                            .font(.system(size: 17, weight: .semibold))
                            .symbolEffect(.variableColor.iterative, options: .repeating)
                    }
                    Text(caption)
                        .font(.system(size: 12, weight: .medium))
                        .opacity(0.8)
                }
                .lineLimit(1)
                Spacer(minLength: 0)
                StopButton(action: onStop)
            }
        case .unavailable:
            Text("Prayer times can't be worked out here today. The sun doesn't rise or set at this latitude.")
                .font(.system(size: 13, weight: .medium))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// The countdown, which sits in a smoked chip with an hourglass while time runs short. The
    /// chip is what lets the warning's colour read on every sky: laid straight on the sky, gold
    /// over midday blue turns olive.
    @ViewBuilder
    private func countdown(font: Font) -> some View {
        let digits = Text(Countdown.precise(content.remaining))
            .font(font.weight(.semibold))
            .monospacedDigit()
            .contentTransition(.numericText(countsDown: true))
            .animation(.snappy, value: Int(content.remaining.rounded(.up)))
        if let color = content.urgency.color {
            HStack(spacing: 6) {
                Image(systemName: content.urgency.symbolName)
                    .font(.system(size: 17, weight: .semibold))
                    .contentTransition(.symbolEffect(.replace))
                    .symbolEffect(.bounce, value: content.urgency)
                    .modifier(Breathe(urgency: content.urgency))
                digits
            }
            .foregroundStyle(color)
            .padding(.horizontal, 12)
            .padding(.vertical, 1)
            .background(Palette.nightInk.opacity(0.5), in: Capsule())
        } else {
            digits
        }
    }

    @ViewBuilder
    private var timetable: some View {
        Group {
            switch layout {
            case .compact, .island:
                TimesStrip(rows: content.rows)
            case .list:
                VStack(spacing: 2) {
                    ForEach(content.rows) { row in
                        line(row)
                    }
                }
            }
        }
        .padding(4)
        .background(.black.opacity(0.2), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
    }

    private func line(_ row: CardContent.Row) -> some View {
        HStack(spacing: 10) {
            Image(systemName: row.prayer.symbolName)
                .font(.system(size: 13, weight: .semibold))
                .frame(width: 20)
            Text(row.title)
                .font(.system(size: 14, weight: .medium))
            if row.state == .current {
                Text("NOW")
                    .font(.system(size: 9, weight: .bold))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(.white.opacity(0.22), in: Capsule())
            }
            Spacer(minLength: 0)
            Text(row.time)
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .monospacedDigit()
            if row.canMarkPrayed {
                Button {
                    onSetPrayed(row.event, !row.isPrayed)
                } label: {
                    Image(systemName: row.isPrayed ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 14, weight: .medium))
                        .contentTransition(.symbolEffect(.replace))
                        .symbolEffect(.bounce, value: row.isPrayed)
                        .frame(width: 24, height: 24)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .opacity(row.isPrayed ? 1 : 0.6)
                .help(row.isPrayed ? "Prayed. Click to unmark." : "Click to mark as prayed.")
                .accessibilityLabel(row.isPrayed ? "\(row.title) prayed. Unmark." : "Mark \(row.title) as prayed")
            }
            Button {
                onToggleAlarm(row.prayer)
            } label: {
                Image(systemName: row.alarmOn ? "bell.fill" : "bell.slash")
                    .font(.system(size: 12, weight: .medium))
                    .frame(width: 24, height: 24)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .opacity(row.alarmOn ? 1 : 0.5)
            .help(row.alarmOn ? "Alarm on. Click to turn off." : "Alarm off. Click to turn on.")
        }
        .lineLimit(1)
        .padding(.leading, 10)
        .padding(.trailing, 4)
        .frame(height: 34)
        .modifier(RowHighlight(state: row.state))
    }
}

/// The day's six times side by side.
struct TimesStrip: View {
    let rows: [CardContent.Row]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(rows) { row in
                column(row)
            }
        }
    }

    private func column(_ row: CardContent.Row) -> some View {
        VStack(spacing: 4) {
            Image(systemName: row.prayer.symbolName)
                .font(.system(size: 13, weight: .semibold))
                .frame(height: 16)
            Text(row.title)
                .font(.system(size: 10.5, weight: .medium))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(row.shortTime)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        // There is no room for a bell on every column, so mark only the ones that will not ring.
        .overlay(alignment: .topTrailing) {
            if !row.alarmOn {
                Image(systemName: "bell.slash.fill")
                    .font(.system(size: 8, weight: .semibold))
                    .opacity(0.75)
                    .padding(5)
            }
        }
        // The other top corner, so a prayer that is prayed and has its alarm off shows both.
        .overlay(alignment: .topLeading) {
            if row.isPrayed {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 9, weight: .bold))
                    .padding(4)
                    .transition(.scale.combined(with: .opacity))
                    .accessibilityLabel("Prayed")
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.6), value: row.isPrayed)
        .modifier(RowHighlight(state: row.state))
        .help(row.alarmOn ? "\(row.title) at \(row.time)" : "\(row.title) at \(row.time), alarm off")
    }
}

/// Fills the next prayer, outlines the one in progress, and dims those that have passed.
private struct RowHighlight: ViewModifier {
    let state: CardContent.Row.State

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: 11, style: .continuous)
        content
            .background(shape.fill(.white.opacity(state == .next ? 0.22 : 0)))
            .overlay(shape.strokeBorder(.white.opacity(state == .current ? 0.3 : 0), lineWidth: 1))
            .opacity(state == .past ? 0.55 : 1)
    }
}

struct ProgressBar: View {
    let value: Double
    var tint = Color.white

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.2))
                Capsule().fill(tint.opacity(0.9))
                    .frame(width: max(4, proxy.size.width * value))
            }
        }
        .frame(height: 4)
    }
}

struct StopButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text("Stop")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color(hex: 0x16184A))
                .padding(.horizontal, 16)
                .padding(.vertical, 7)
                .background(.white, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// A card that keeps itself current, redrawing every second for the countdown.
struct LiveCard: View {
    @ObservedObject var model: AppModel
    let layout: AppSettings.WidgetLayout

    var body: some View {
        // Start on a whole second so the countdown ticks in step with the clock.
        let start = Date(timeIntervalSinceReferenceDate: Date().timeIntervalSinceReferenceDate.rounded(.down))
        TimelineView(.periodic(from: start, by: 1)) { timeline in
            PrayerCard(
                content: CardContent.make(
                    schedule: model.schedule, settings: model.settings, ringing: model.ringing,
                    prayed: model.prayed, now: model.time(for: timeline.date), timeZone: model.timeZone),
                layout: layout,
                onToggleAlarm: { model.toggleAlarm(for: $0) },
                onSetPrayed: { model.setPrayed($1, for: $0) },
                onStop: { model.stopAlarm() })
        }
    }
}

/// The alarm itself: a banner at the top of the screen that stays until stopped.
struct AlarmBanner: View {
    let title: String
    let detail: String
    let period: Prayer?
    let onStop: () -> Void

    static let width: CGFloat = 430

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
        HStack(spacing: 14) {
            Image(systemName: "bell.and.waves.left.and.right.fill")
                .font(.system(size: 24, weight: .semibold))
                .symbolEffect(.variableColor.iterative, options: .repeating)
                .frame(width: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                Text(detail)
                    .font(.system(size: 13, weight: .medium))
                    .opacity(0.85)
            }
            .lineLimit(1)
            Spacer(minLength: 12)
            StopButton(action: onStop)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .frame(width: Self.width)
        .foregroundStyle(.white)
        .background(SkyBackground(theme: SkyTheme(period: period)))
        .clipShape(shape)
        .overlay(shape.strokeBorder(.white.opacity(0.18), lineWidth: 1))
        .environment(\.colorScheme, .dark)
    }
}
