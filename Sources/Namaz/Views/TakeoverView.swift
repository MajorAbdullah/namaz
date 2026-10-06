import AppKit
import NamazCore
import SwiftUI

/// What covers the screen for the last minutes of a prayer that has not been marked as prayed.
struct TakeoverView: View {
    @ObservedObject var model: AppModel

    var body: some View {
        // The timeline lives only while there is a warning, so the hidden panel does no work
        // between covers, and each cover starts its entrance afresh.
        if model.warning != nil {
            // Start on a whole second so the countdown ticks in step with the clock.
            let start = Date(timeIntervalSinceReferenceDate: Date().timeIntervalSinceReferenceDate.rounded(.down))
            TimelineView(.periodic(from: start, by: 1)) { timeline in
                if let warning = model.warning {
                    let now = model.time(for: timeline.date)
                    TakeoverContent(
                        detail: warning.detail(at: now, in: model.timeZone),
                        urgency: warning.urgency,
                        period: warning.window.event.prayer,
                        sun: warning.sunHeight(at: now),
                        onPrayed: { model.setPrayed(true, for: warning.window.event) })
                }
            }
        }
    }
}

/// The cover itself: the sky of the open prayer with the light going out of it, and a sun that
/// comes down to the horizon as the time runs out. How high the sun stands is the time left,
/// readable from across the room.
struct TakeoverContent: View {
    static let headline = "Prayer is better than work."

    /// How long the Prayed button has to be held. Long enough that it is never pressed out of
    /// habit, which matters because, short of the time running out or quitting Namaz, it is the
    /// only way to get the screen back.
    static let holdDuration = 3.0

    private static let sunRadius: CGFloat = 42
    private static let buttonSize: CGFloat = 116

    let detail: String
    let urgency: Urgency
    /// The open prayer, whose sky the cover shows.
    let period: Prayer?
    /// From 1 at the top of the sun's path to 0 on the horizon, and below zero as it sets.
    /// See `PrayerWarning.sunHeight(at:)`.
    let sun: Double
    /// Whether the parts arrive one after another. Off for still pictures.
    var entrance = true
    var holdDuration = Self.holdDuration
    let onPrayed: () -> Void

    @ViewState private var hasArrived = false

    /// The colour of the time left, which the horizon and its glow take.
    private var light: Color { urgency.color ?? Palette.sunCream }

    private var isArranged: Bool {
        hasArrived || !entrance || NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    }

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let horizon = size.height * 0.62
            let columnWidth = min(size.width - 96, 960)
            let left = (size.width - columnWidth) / 2
            let path = min(horizon * 0.5, 300)

            ZStack(alignment: .topLeading) {
                sky
                sunDisc
                    .position(x: left + columnWidth - 64, y: sunCentre(horizon: horizon, path: path))
                    .animation(.linear(duration: 1), value: sun)
                    .frame(width: size.width, height: horizon, alignment: .topLeading)
                    .clipped()
                ground(horizon: horizon, height: size.height - horizon)
                horizonLine
                    .offset(y: horizon)

                words
                    .frame(width: columnWidth - 150, alignment: .leading)
                    .frame(width: columnWidth, height: horizon - 30, alignment: .bottomLeading)
                    .offset(x: left)

                HoldToConfirmButton(title: "Prayed", duration: holdDuration, action: onPrayed)
                    .opacity(isArranged ? 1 : 0)
                    .animation(.easeOut(duration: 0.5).delay(0.8), value: isArranged)
                    .offset(x: left, y: horizon + 44)
            }
        }
        .ignoresSafeArea()
        .foregroundStyle(.white)
        .environment(\.colorScheme, .dark)
        .onAppear { hasArrived = true }
    }

    // MARK: - Parts

    /// The period's own sky under a veil of night that deepens as the sun comes down.
    private var sky: some View {
        ZStack {
            SkyBackground(theme: SkyTheme(period: period))
            Palette.nightInk.opacity(0.55 + 0.25 * (1 - max(sun, 0)))
                .animation(.linear(duration: 1), value: sun)
        }
    }

    private var sunDisc: some View {
        Circle()
            .fill(Palette.sunCream)
            .frame(width: Self.sunRadius * 2, height: Self.sunRadius * 2)
            .shadow(color: Palette.sunGlow.opacity(0.75), radius: 34)
            .shadow(color: light.opacity(0.55), radius: 80)
            // It comes down into place when the cover opens.
            .offset(y: isArranged ? 0 : -90)
            .opacity(isArranged ? 1 : 0)
            .animation(.spring(response: 0.7, dampingFraction: 0.75).delay(0.55), value: isArranged)
    }

    /// The sun rests on the horizon at the deadline, and from there sinks behind it.
    private func sunCentre(horizon: CGFloat, path: CGFloat) -> CGFloat {
        let reach = sun >= 0 ? path : Self.sunRadius * 2
        return horizon - Self.sunRadius - reach * sun
    }

    /// Darker below the horizon, with the last light rising from it in the final stages.
    private func ground(horizon: CGFloat, height: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            Palette.nightInk.opacity(0.45)
                .frame(height: height)
                .offset(y: horizon)
            if urgency >= .ten {
                LinearGradient(
                    colors: [light.opacity(0), light.opacity(urgency >= .five ? 0.5 : 0.22)],
                    startPoint: .top, endPoint: .bottom)
                    .frame(height: horizon * 0.5)
                    .offset(y: horizon * 0.5)
                    .modifier(Breathe(urgency: urgency))
            }
        }
        .animation(.easeInOut(duration: 0.8), value: urgency)
        .allowsHitTesting(false)
    }

    private var horizonLine: some View {
        Rectangle()
            .fill(light.opacity(0.85))
            .frame(height: 1.5)
            .shadow(color: light.opacity(0.8), radius: 6)
            // Drawn across from the left when the cover opens.
            .scaleEffect(x: isArranged ? 1 : 0, anchor: .leading)
            .animation(.easeOut(duration: 0.8).delay(0.1), value: isArranged)
            .animation(.easeInOut(duration: 0.8), value: urgency)
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(Self.headline)
                .font(.system(size: 64, weight: .semibold, design: .serif))
                .tracking(-0.6)
                .lineLimit(2)
                .minimumScaleFactor(0.5)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .opacity(isArranged ? 1 : 0)
                .offset(y: isArranged ? 0 : 12)
                .animation(.easeOut(duration: 0.6).delay(0.35), value: isArranged)
            Text(detail)
                .font(.system(size: 24, weight: .semibold, design: .rounded))
                .monospacedDigit()
                // Not the stage's colour: red words would sink into the red light behind them.
                .foregroundStyle(Palette.sunCream)
                .contentTransition(.numericText(countsDown: true))
                .animation(.snappy, value: detail)
                .opacity(isArranged ? 1 : 0)
                .animation(.easeOut(duration: 0.5).delay(0.55), value: isArranged)
        }
    }
}

/// A button that acts only after it has been held down for a while, with a ring that fills as
/// it is held. Letting go early does nothing. Once it is done it says so for a moment before
/// acting, so that the person sees their press was taken.
struct HoldToConfirmButton: View {
    private static let size: CGFloat = 116

    let title: String
    let duration: Double
    /// How long the finished button stays before `action` runs.
    var confirmationDelay = 0.6
    let action: () -> Void

    @ViewState private var isPressing = false
    @ViewState private var isDone = false

    private var caption: String {
        isDone ? "Prayed" : isPressing ? "Keep holding" : "Press and hold"
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(Palette.nightInk.opacity(0.55))
            Circle()
                .fill(Palette.sunCream.opacity(isDone ? 0.3 : isPressing ? 0.12 : 0.04))
            Circle()
                .strokeBorder(Palette.sunCream.opacity(0.28), lineWidth: 5)
            Circle()
                .inset(by: 2.5)
                .trim(from: 0, to: isPressing || isDone ? 1 : 0)
                .stroke(Palette.sunCream, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(
                    isDone ? .easeOut(duration: 0.15)
                        : isPressing ? .linear(duration: duration)
                        : .spring(response: 0.35, dampingFraction: 0.8),
                    value: isPressing || isDone)
            VStack(spacing: 4) {
                Image(systemName: "checkmark")
                    .font(.system(size: 26, weight: .bold))
                    // The value never changes under Reduce Motion, so the tick does not bounce.
                    .symbolEffect(.bounce, value: isDone && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion)
                Text(title)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
            }
            .foregroundStyle(Palette.sunCream)
        }
        .frame(width: Self.size, height: Self.size)
        .scaleEffect(isPressing && !isDone ? 0.96 : 1)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isPressing)
        .animation(.easeOut(duration: 0.2), value: isDone)
        .contentShape(Circle())
        .onLongPressGesture(minimumDuration: duration, maximumDistance: 80) {
            confirm()
        } onPressingChanged: { pressing in
            if !isDone { isPressing = pressing }
        }
        // Beside the button, outside its own bounds, so the button stays a plain circle to
        // whatever lays it out.
        .overlay(alignment: .leading) {
            Text(caption)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.white.opacity(0.7))
                .fixedSize()
                .offset(x: Self.size + 20)
                .animation(.easeInOut(duration: 0.2), value: caption)
                .accessibilityHidden(true)
        }
        .accessibilityElement()
        .accessibilityLabel("Mark as prayed")
        .accessibilityHint("Press and hold")
        .accessibilityAddTraits(.isButton)
        // Holding is not possible through VoiceOver, so its own press counts.
        .accessibilityAction { confirm() }
    }

    private func confirm() {
        guard !isDone else { return }
        isDone = true
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(confirmationDelay))
            action()
        }
    }
}
