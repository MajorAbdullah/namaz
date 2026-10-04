import AppKit
import Combine
import NamazCore
import SwiftUI

/// Shows the alarm banner at the top of the screen for as long as an alarm is ringing.
@MainActor
final class AlarmBannerController {
    private static let gapBelowMenuBar: CGFloat = 12

    private let panel = FloatingPanel()
    private var observer: AnyCancellable?

    init(model: AppModel) {
        // Above everything, on every Space, including over full-screen apps.
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]

        observer = model.$ringing
            .removeDuplicates()
            .sink { [weak self, weak model] event in
                guard let self, let model else { return }
                // When the island is showing, it opens with the alarm itself.
                let islandShowsAlarms = model.settings.showsWidget && model.settings.widgetLayout == .island
                if let event, !islandShowsAlarms {
                    self.show(event, model: model)
                } else {
                    self.hide()
                }
            }
    }

    private func show(_ event: PrayerEvent, model: AppModel) {
        let text = model.alarmText(for: event)
        let hosting = ClickThroughHostingView(rootView: AlarmBanner(
            title: text.title, detail: text.detail, period: event.prayer,
            onStop: { [weak model] in model?.stopAlarm() }))
        let size = hosting.fittingSize
        hosting.sizingOptions = []

        // The screen the user is working on, so the alarm appears where they are looking.
        let screen = (NSScreen.main ?? NSScreen.screens.first)?.visibleFrame ?? .zero
        panel.contentView = hosting
        panel.setFrame(
            CGRect(
                x: screen.midX - size.width / 2,
                y: screen.maxY - size.height - Self.gapBelowMenuBar,
                width: size.width, height: size.height),
            display: true)
        panel.invalidateShadow()

        panel.alphaValue = 0
        panel.orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.25
            panel.animator().alphaValue = 1
        }
    }

    private func hide() {
        guard panel.isVisible else { return }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.2
            panel.animator().alphaValue = 0
        } completionHandler: { [panel] in
            MainActor.assumeIsolated {
                // A new alarm may have started during the fade; leave that one showing.
                if panel.alphaValue == 0 { panel.orderOut(nil) }
            }
        }
    }
}
