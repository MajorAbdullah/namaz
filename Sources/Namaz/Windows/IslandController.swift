import AppKit
import Combine
import SwiftUI

/// The island's window: pinned to the top centre of the screen with the notch (or, failing that,
/// the screen in use), opening when the pointer is over it or an alarm is ringing.
@MainActor
final class IslandController {
    /// Without a notch the island is a pill that hangs this far below the menu bar.
    private static let pillHeight: CGFloat = 30
    private static let pillGap: CGFloat = 6
    private static let spring = Animation.spring(response: 0.36, dampingFraction: 0.82)

    private let model: AppModel
    let panel = FloatingPanel()
    private let state = IslandState()
    private var observers = Set<AnyCancellable>()
    private var shrink: Task<Void, Never>?

    private var isVisible = false
    private var isHovering = false
    private var isRinging = false

    init(model: AppModel, actions: AppActions) {
        self.model = model

        // The window is only ever as large as the island; there is nothing to cast a shadow from.
        panel.hasShadow = false
        // Above the menu bar, so the island can sit beside the notch, on every Space.
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 1)
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]

        let hosting = HoverTrackingHostingView(rootView: IslandView(model: model, state: state)
            .contextMenu { WidgetMenu(model: model, actions: actions) })
        hosting.sizingOptions = []
        hosting.onHover = { [weak self] isInside in
            self?.isHovering = isInside
            self?.update()
        }
        panel.contentView = hosting

        model.$settings
            .map { $0.showsWidget && $0.widgetLayout == .island }
            .removeDuplicates()
            .sink { [weak self] isVisible in
                self?.isVisible = isVisible
                self?.update()
            }
            .store(in: &observers)

        model.$ringing
            .map { $0 != nil }
            .removeDuplicates()
            .sink { [weak self] isRinging in
                self?.isRinging = isRinging
                self?.update()
            }
            .store(in: &observers)

        NotificationCenter.default.publisher(for: NSApplication.didChangeScreenParametersNotification)
            .map { _ in }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.update() }
            .store(in: &observers)
    }

    /// The screen with a notch if there is one, since that is where an island belongs.
    private var screen: NSScreen? {
        NSScreen.screens.first { $0.safeAreaInsets.top > 0 } ?? NSScreen.main ?? NSScreen.screens.first
    }

    private func metrics(for screen: NSScreen) -> IslandMetrics {
        guard screen.safeAreaInsets.top > 0,
              let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea
        else { return IslandMetrics(notchWidth: 0, barHeight: Self.pillHeight) }
        return IslandMetrics(
            notchWidth: screen.frame.width - left.width - right.width,
            barHeight: screen.safeAreaInsets.top)
    }

    private func frame(for size: CGSize, on screen: NSScreen) -> CGRect {
        let top = state.metrics.hasNotch ? screen.frame.maxY : screen.visibleFrame.maxY - Self.pillGap
        return CGRect(x: screen.frame.midX - size.width / 2, y: top - size.height, width: size.width, height: size.height)
    }

    /// Brings the window in line with what should be showing.
    private func update() {
        guard isVisible, let screen else {
            panel.orderOut(nil)
            return
        }
        let metrics = metrics(for: screen)
        if state.metrics != metrics { state.metrics = metrics }

        let expandedFrame = frame(for: metrics.expandedSize(ringing: isRinging), on: screen)
        let collapsedFrame = frame(for: metrics.collapsedSize, on: screen)
        shrink?.cancel()

        if isHovering || isRinging {
            // Make room first, then let the island grow into it.
            panel.setFrame(expandedFrame, display: true)
            if !state.isExpanded {
                withAnimation(Self.spring) { state.isExpanded = true }
            }
        } else if state.isExpanded {
            withAnimation(Self.spring) { state.isExpanded = false }
            // Keep the room until the island has finished closing, then take it away so the
            // window is not left covering the menu bar.
            shrink = Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(450))
                guard !Task.isCancelled, let self, !self.state.isExpanded else { return }
                self.panel.setFrame(collapsedFrame, display: true)
            }
        } else {
            panel.setFrame(collapsedFrame, display: true)
        }
        panel.orderFrontRegardless()
    }
}

/// Reports the pointer entering and leaving, whether or not the app is active. SwiftUI's own
/// hover tracking stops when the app is in the background, which for this app is always.
final class HoverTrackingHostingView<Content: View>: NSHostingView<Content> {
    var onHover: ((Bool) -> Void)?
    private var hoverArea: NSTrackingArea?

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let hoverArea { removeTrackingArea(hoverArea) }
        let area = NSTrackingArea(
            rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self, userInfo: nil)
        addTrackingArea(area)
        hoverArea = area
    }

    override func mouseEntered(with event: NSEvent) {
        super.mouseEntered(with: event)
        onHover?(true)
    }

    override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        onHover?(false)
    }
}
