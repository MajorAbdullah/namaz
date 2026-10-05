import NamazCore
import SwiftUI

/// The island's dimensions on a particular screen.
struct IslandMetrics: Equatable {
    /// Width of the camera housing the island wraps around; zero on a screen without one.
    var notchWidth: CGFloat
    /// Height of the part that is always visible: the notch's height, or a pill's.
    var barHeight: CGFloat

    /// How far the island reaches either side of the notch when at rest.
    private static let wing: CGFloat = 92

    var hasNotch: Bool { notchWidth > 0 }

    var collapsedSize: CGSize {
        CGSize(width: hasNotch ? notchWidth + 2 * Self.wing : 224, height: barHeight)
    }

    func expandedSize(ringing: Bool) -> CGSize {
        CGSize(width: max(collapsedSize.width, 400), height: barHeight + (ringing ? 148 : 134))
    }
}

/// What the island's window tells its view.
@MainActor
final class IslandState: ObservableObject {
    @Published var isExpanded = false
    @Published var metrics = IslandMetrics(notchWidth: 0, barHeight: 30)
}

/// A black island at the top of the screen, in the manner of the iPhone's Dynamic Island: at
/// rest it shows the next prayer and a countdown either side of the notch, and it opens into
/// the day's timetable when pointed at, or when an alarm rings.
struct IslandView: View {
    @ObservedObject var model: AppModel
    @ObservedObject var state: IslandState

    var body: some View {
        // Start on a whole second so the countdown ticks in step with the clock.
        let start = Date(timeIntervalSinceReferenceDate: Date().timeIntervalSinceReferenceDate.rounded(.down))
        TimelineView(.periodic(from: start, by: 1)) { timeline in
            IslandContent(
                content: CardContent.make(
                    schedule: model.schedule, settings: model.settings, ringing: model.ringing,
                    prayed: model.prayed, now: model.time(for: timeline.date), timeZone: model.timeZone),
                metrics: state.metrics,
                isExpanded: state.isExpanded,
                onPrayed: { model.setPrayed(true, for: $0) },
                onStop: { model.stopAlarm() })
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

struct IslandContent: View {
    let content: CardContent
    let metrics: IslandMetrics
    let isExpanded: Bool
    var onPrayed: (PrayerEvent) -> Void = { _ in }
    var onStop: () -> Void = {}

    private var isRinging: Bool {
        if case .ringing = content.headline { return true }
        return false
    }

    private var size: CGSize {
        isExpanded ? metrics.expandedSize(ringing: isRinging) : metrics.collapsedSize
    }

    /// Flush with the top edge when it continues the notch; a free-floating pill otherwise.
    private var shape: UnevenRoundedRectangle {
        let bottom: CGFloat = isExpanded ? 26 : (metrics.hasNotch ? 12 : metrics.barHeight / 2)
        let top: CGFloat = metrics.hasNotch ? 0 : bottom
        return UnevenRoundedRectangle(
            topLeadingRadius: top, bottomLeadingRadius: bottom,
            bottomTrailingRadius: bottom, topTrailingRadius: top, style: .continuous)
    }

    /// The colour of the part of the day, or of the warning while there is one.
    private var accent: Color { content.urgency.color ?? SkyTheme(period: content.period).glow }

    var body: some View {
        VStack(spacing: 0) {
            bar
                .frame(height: metrics.barHeight)
            if isExpanded {
                details
                    .frame(width: metrics.expandedSize(ringing: isRinging).width)
                    .transition(.opacity)
            }
        }
        .frame(width: size.width, height: size.height, alignment: .top)
        .foregroundStyle(.white)
        .background(.black)
        .overlay(alignment: .bottom) {
            // Light spilling from under the island, in the colour of the time left.
            if let color = content.urgency.color {
                LinearGradient(colors: [color.opacity(0), color.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                    .frame(height: 12)
                    .modifier(Breathe(urgency: content.urgency))
                    .allowsHitTesting(false)
            }
        }
        .clipShape(shape)
        .environment(\.colorScheme, .dark)
    }

    /// The always-visible strip: what is next on the left, how long until it on the right, with
    /// the notch (if any) between them.
    @ViewBuilder
    private var bar: some View {
        HStack(spacing: 0) {
            HStack(spacing: 6) {
                switch content.headline {
                case .upcoming(let title, _):
                    Image(systemName: content.warning != nil
                        ? content.urgency.symbolName
                        : content.rows.first { $0.state == .next }?.prayer.symbolName ?? "moon.stars.fill")
                        .foregroundStyle(accent)
                        .contentTransition(.symbolEffect(.replace))
                        .symbolEffect(.bounce, value: content.urgency)
                    Text(title)
                case .ringing(let title, _):
                    Image(systemName: "bell.and.waves.left.and.right.fill")
                        .foregroundStyle(accent)
                        .symbolEffect(.variableColor.iterative, options: .repeating)
                    Text(title)
                case .unavailable:
                    Image(systemName: "moon.stars.fill")
                        .foregroundStyle(accent)
                }
            }
            .padding(.leading, 14)
            Spacer(minLength: 8)
            Group {
                switch content.headline {
                case .upcoming:
                    Text(Countdown.precise(content.remaining))
                        .monospacedDigit()
                        .foregroundStyle(content.urgency.color ?? .white)
                        .contentTransition(.numericText(countsDown: true))
                        .animation(.snappy, value: Int(content.remaining.rounded(.up)))
                case .ringing: Text("now")
                case .unavailable: Text("No times")
                }
            }
            .padding(.trailing, 14)
        }
        .font(.system(size: 12.5, weight: .semibold, design: .rounded))
        .lineLimit(1)
        .minimumScaleFactor(0.85)
    }

    @ViewBuilder
    private var details: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch content.headline {
            case .upcoming(_, let caption):
                HStack {
                    Text(caption)
                        .opacity(0.65)
                        .layoutPriority(1)
                    Spacer(minLength: 8)
                    // The button needs the room the place name would take.
                    Text(content.open == nil ? "\(content.placeName) · \(content.hijriDate)" : content.hijriDate)
                        .opacity(0.65)
                    if let open = content.open {
                        PrayedButton(prayer: open.prayer.name, isUrgent: content.warning != nil) { onPrayed(open) }
                            .layoutPriority(1)
                    }
                }
                .font(.system(size: 11.5, weight: .medium))
                .lineLimit(1)
                ProgressBar(value: content.progress, tint: accent)
                    .padding(.top, 8)
            case .ringing(let title, let caption):
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title)
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                        Text(caption)
                            .font(.system(size: 11.5, weight: .medium))
                            .opacity(0.65)
                    }
                    .lineLimit(1)
                    Spacer(minLength: 8)
                    StopButton(action: onStop)
                }
            case .unavailable:
                Text("Prayer times can't be worked out here today.")
                    .font(.system(size: 11.5, weight: .medium))
                    .opacity(0.65)
            }
            if !content.rows.isEmpty {
                TimesStrip(rows: content.rows)
                    .padding(4)
                    .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                    .padding(.top, 10)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 14)
    }
}
