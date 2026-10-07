import AppKit
import Combine
import SwiftUI

/// The desktop widget's window: sized to fit its card, and kept where the user dragged it.
@MainActor
final class WidgetPanelController: NSObject, NSWindowDelegate {
    private static let positionKey = "widgetTopLeft"
    private static let screenMargin: CGFloat = 24

    private let model: AppModel
    let panel = FloatingPanel()
    private var observers = Set<AnyCancellable>()
    /// Set while the window is being moved by code, so only the user's drags are remembered.
    private var isPlacing = false

    private struct Appearance: Equatable {
        var isVisible: Bool
        var floatsOnTop: Bool
    }

    init(model: AppModel, actions: AppActions) {
        self.model = model
        super.init()

        let hosting = ClickThroughHostingView(rootView: WidgetView(
            model: model, actions: actions,
            onResize: { [weak self] size in self?.fit(to: size) },
            onDrag: { [weak self] offset in self?.drag(by: offset) }))
        // The window is sized here, to the card. Measure the card, then stop the hosting view
        // imposing size limits of its own on the window.
        let size = hosting.fittingSize
        hosting.sizingOptions = []
        panel.contentView = hosting
        panel.delegate = self
        fit(to: size)

        model.$settings
            .map {
                Appearance(
                    isVisible: $0.showsWidget && $0.widgetLayout != .island,
                    floatsOnTop: $0.widgetFloatsOnTop)
            }
            .removeDuplicates()
            .sink { [weak self] in self?.apply($0) }
            .store(in: &observers)

        NotificationCenter.default.publisher(for: NSApplication.didChangeScreenParametersNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.bringBackOnScreen() }
            .store(in: &observers)
    }

    private func apply(_ appearance: Appearance) {
        if appearance.floatsOnTop {
            panel.level = .floating
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        } else {
            // Just beneath ordinary windows, like a widget lying on the desktop. The real desktop
            // level is under Finder's icon layer, which would take all the clicks.
            panel.level = NSWindow.Level(rawValue: NSWindow.Level.normal.rawValue - 1)
            panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        }
        if appearance.isVisible {
            panel.orderFrontRegardless()
        } else {
            panel.orderOut(nil)
        }
    }

    /// Moves the window by a drag offset given in SwiftUI's terms, where y grows downwards.
    private func drag(by offset: CGSize) {
        panel.setFrameOrigin(CGPoint(
            x: panel.frame.minX + offset.width, y: panel.frame.minY - offset.height))
    }

    /// Resizes the window to the card, holding its top-left corner still.
    private func fit(to size: CGSize) {
        guard size.width > 0, size.height > 0, panel.frame.size != size else { return }
        let topLeft = panel.frame.isEmpty
            ? initialTopLeft(for: size)
            : CGPoint(x: panel.frame.minX, y: panel.frame.maxY)
        place(size: size, topLeft: topLeft)
    }

    private func place(size: CGSize, topLeft: CGPoint) {
        isPlacing = true
        panel.setFrame(
            CGRect(x: topLeft.x, y: topLeft.y - size.height, width: size.width, height: size.height),
            display: true)
        panel.invalidateShadow()
        isPlacing = false
    }

    /// Where the user last left the widget, if that is still on a screen; otherwise top right.
    private func initialTopLeft(for size: CGSize) -> CGPoint {
        if let saved = UserDefaults.standard.string(forKey: Self.positionKey).map(NSPointFromString),
           isReachable(CGRect(x: saved.x, y: saved.y - size.height, width: size.width, height: size.height)) {
            return saved
        }
        return defaultTopLeft(for: size)
    }

    private func defaultTopLeft(for size: CGSize) -> CGPoint {
        let visible = (NSScreen.main ?? NSScreen.screens.first)?.visibleFrame ?? .zero
        return CGPoint(x: visible.maxX - size.width - Self.screenMargin, y: visible.maxY - Self.screenMargin)
    }

    /// Whether enough of the frame shows on some screen for the user to grab it.
    private func isReachable(_ frame: CGRect) -> Bool {
        NSScreen.screens.contains { screen in
            let shown = screen.visibleFrame.intersection(frame)
            return shown.width >= 80 && shown.height >= 40
        }
    }

    /// After a display is unplugged or rearranged, make sure the widget is not left stranded.
    private func bringBackOnScreen() {
        guard !panel.frame.isEmpty, !isReachable(panel.frame) else { return }
        place(size: panel.frame.size, topLeft: defaultTopLeft(for: panel.frame.size))
    }

    func windowDidMove(_ notification: Notification) {
        guard !isPlacing, !model.diagnostics.isActive else { return }
        let topLeft = CGPoint(x: panel.frame.minX, y: panel.frame.maxY)
        UserDefaults.standard.set(NSStringFromPoint(topLeft), forKey: Self.positionKey)
    }
}
