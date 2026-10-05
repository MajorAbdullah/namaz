import AppKit
import NamazCore
import SwiftUI

/// The colours of the end-of-time alerts. They come from the app icon: its night, its sun, and
/// the light of a sky going from late afternoon to the last red at the horizon.
enum Palette {
    static let nightInk = Color(hex: 0x12143F)
    static let sunCream = Color(hex: 0xFFF6DC)
    static let sunGlow = Color(hex: 0xFFE9B0)
    static let lateSun = Color(hex: 0xF4C152)
    static let amber = Color(hex: 0xF2913D)
    static let ember = Color(hex: 0xE8613C)
    static let lastLight = Color(hex: 0xDE3A4C)
}

extension Urgency {
    /// The light left in the sky: gold, then amber, ember, and red. Nil while calm.
    var color: Color? {
        switch self {
        case .calm: nil
        case .twenty: Palette.lateSun
        case .fifteen: Palette.amber
        case .ten: Palette.ember
        case .five: Palette.lastLight
        }
    }

    /// An hourglass that empties as the stages pass.
    var symbolName: String {
        switch self {
        case .calm, .fifteen: "hourglass"
        case .twenty: "hourglass.tophalf.filled"
        case .ten, .five: "hourglass.bottomhalf.filled"
        }
    }
}

/// Lets a glow breathe: slowly at first, quicker at each stage, and as a heartbeat in the last
/// five minutes. Holds still while calm, and when the user has asked macOS to reduce motion.
struct Breathe: ViewModifier {
    let urgency: Urgency

    private enum Heartbeat: CaseIterable {
        case rest, beat, dip, secondBeat

        var opacity: Double {
            switch self {
            case .rest: 0.4
            case .beat, .secondBeat: 1
            case .dip: 0.6
            }
        }

        /// The animation that arrives at this phase.
        var animation: Animation {
            switch self {
            case .beat, .secondBeat: .easeOut(duration: 0.13)
            case .dip: .easeIn(duration: 0.15)
            case .rest: .easeInOut(duration: 0.95)
            }
        }
    }

    private var breathPeriod: Double {
        switch urgency {
        case .twenty: 3.2
        case .fifteen: 2.4
        default: 1.6
        }
    }

    func body(content: Content) -> some View {
        if urgency == .calm || NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            content
        } else if urgency == .five {
            content.phaseAnimator(Heartbeat.allCases) { view, phase in
                view.opacity(phase.opacity)
            } animation: { phase in
                phase.animation
            }
        } else {
            content.phaseAnimator([1, 0.45]) { view, opacity in
                view.opacity(opacity)
            } animation: { _ in
                .easeInOut(duration: breathPeriod / 2)
            }
        }
    }
}

/// Marks the open prayer as prayed. It names the prayer, because it sits beside a headline
/// that is usually about the next one. Quiet for most of the day; solid once time runs short.
struct PrayedButton: View {
    let prayer: String
    var isUrgent = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("Prayed \(prayer)", systemImage: "checkmark")
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundStyle(isUrgent ? Palette.nightInk : .white)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(
                    isUrgent ? AnyShapeStyle(Palette.sunCream) : AnyShapeStyle(.white.opacity(0.14)),
                    in: Capsule())
                .overlay(Capsule().strokeBorder(.white.opacity(isUrgent ? 0 : 0.3), lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .animation(.easeInOut(duration: 0.5), value: isUrgent)
        .help("Mark \(prayer) as prayed")
        .accessibilityLabel("Mark \(prayer) as prayed")
    }
}
