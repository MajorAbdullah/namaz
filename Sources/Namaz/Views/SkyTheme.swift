import NamazCore
import SwiftUI

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255)
    }
}

/// The card's backdrop follows the sky: each prayer period has its own colours, deep enough
/// throughout to keep white text readable.
struct SkyTheme {
    /// Top to bottom.
    let colors: [Color]
    /// A soft light where the sun or moon would be.
    let glow: Color
    let glowCenter: UnitPoint
    let hasStars: Bool

    /// - Parameter period: the most recent event, which is the part of the day we are in.
    init(period: Prayer?) {
        switch period {
        case .fajr:
            colors = [Color(hex: 0x16184A), Color(hex: 0x41357A), Color(hex: 0xA65B7B)]
            glow = Color(hex: 0xFF9A6B)
            glowCenter = UnitPoint(x: 0.85, y: 1.1)
            hasStars = true
        case .sunrise:
            colors = [Color(hex: 0x14457F), Color(hex: 0x2A72B8), Color(hex: 0x4690CC)]
            glow = Color(hex: 0x9FD2FF)
            glowCenter = UnitPoint(x: 1.0, y: 1.1)
            hasStars = false
        case .dhuhr:
            colors = [Color(hex: 0x0A4A80), Color(hex: 0x1273AB), Color(hex: 0x2493BD)]
            glow = Color(hex: 0xA8E6FF)
            glowCenter = UnitPoint(x: 0.5, y: 1.25)
            hasStars = false
        case .asr:
            colors = [Color(hex: 0x29487A), Color(hex: 0x7A5870), Color(hex: 0xB86C39)]
            glow = Color(hex: 0xFFC46B)
            glowCenter = UnitPoint(x: 1.05, y: 0.6)
            hasStars = false
        case .maghrib:
            colors = [Color(hex: 0x21184D), Color(hex: 0x6C2B69), Color(hex: 0xC4523F)]
            glow = Color(hex: 0xFF8A4C)
            glowCenter = UnitPoint(x: 0.1, y: 1.15)
            hasStars = false
        case .isha, nil:
            colors = [Color(hex: 0x060A1F), Color(hex: 0x0F1B3E), Color(hex: 0x1C2C58)]
            glow = Color(hex: 0x8FB2FF)
            glowCenter = UnitPoint(x: 0.9, y: 0.0)
            hasStars = true
        }
    }
}

struct SkyBackground: View {
    let theme: SkyTheme

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                LinearGradient(colors: theme.colors, startPoint: .top, endPoint: .bottom)
                RadialGradient(
                    colors: [theme.glow.opacity(0.5), theme.glow.opacity(0)],
                    center: theme.glowCenter,
                    startRadius: 0,
                    endRadius: max(proxy.size.width, proxy.size.height) * 0.55)
                if theme.hasStars {
                    Stars()
                }
            }
        }
    }
}

/// A fixed scatter of faint stars across the upper part of the card.
private struct Stars: View {
    var body: some View {
        Canvas { context, size in
            var random = SeededRandom(seed: 11)
            for _ in 0..<30 {
                let x = Double.random(in: 0...1, using: &random) * size.width
                let y = Double.random(in: 0...0.62, using: &random) * size.height
                let radius = Double.random(in: 0.35...1.05, using: &random)
                let opacity = Double.random(in: 0.15...0.6, using: &random)
                let star = CGRect(x: x, y: y, width: radius * 2, height: radius * 2)
                context.fill(Path(ellipseIn: star), with: .color(.white.opacity(opacity)))
            }
        }
    }
}

/// SplitMix64, so the stars land in the same places on every redraw.
private struct SeededRandom: RandomNumberGenerator {
    var state: UInt64

    init(seed: UInt64) { state = seed }

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
