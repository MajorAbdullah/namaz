import AppKit
import SwiftUI
import Testing
@testable import Namaz

/// The widget and the alarm banner live in windows that never become key, so that they cannot
/// take keyboard focus from whatever the user is typing in. These tests send mouse events
/// through such a window to make sure its controls still respond. The screen cover can become
/// key, but its button has to work even when the system does not let it.
@MainActor
@Suite(.serialized) struct PanelInteractionTests {
    final class Recorder {
        var stopped = false
        var prayed = false
    }

    /// Shows an alarm banner in a floating panel, as the app does.
    func presentBanner(_ recorder: Recorder) async throws -> (panel: FloatingPanel, size: CGSize) {
        _ = NSApplication.shared
        let hosting = ClickThroughHostingView(rootView: AlarmBanner(
            title: "Asr · 4:37 PM", detail: "It's time to pray.", period: .asr,
            onStop: { recorder.stopped = true }))
        let size = hosting.fittingSize
        hosting.sizingOptions = []

        let panel = FloatingPanel()
        panel.contentView = hosting
        panel.isMovableByWindowBackground = true
        panel.setFrame(CGRect(origin: CGPoint(x: 120, y: 120), size: size), display: true)
        panel.orderFrontRegardless()
        try await Task.sleep(for: .milliseconds(400))
        return (panel, size)
    }

    /// A click at `point`, in the panel's coordinates (origin bottom-left).
    func click(_ point: CGPoint, in panel: NSPanel) throws {
        for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
            panel.sendEvent(try #require(NSEvent.mouseEvent(
                with: type, location: point, modifierFlags: [],
                timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: panel.windowNumber,
                context: nil, eventNumber: 0, clickCount: 1, pressure: 1)))
        }
    }

    /// A model that keeps to itself: settings in memory, no prompts, no sound.
    func isolatedModel(layout: AppSettings.WidgetLayout) -> AppModel {
        _ = NSApplication.shared
        var diagnostics = Diagnostics()
        diagnostics.isActive = true
        diagnostics.mutesSound = true
        let model = AppModel(diagnostics: diagnostics)
        model.settings.showsWidget = true
        model.settings.widgetLayout = layout
        return model
    }

    func mouseEvent(_ type: NSEvent.EventType, at point: CGPoint, in panel: NSPanel) throws -> NSEvent {
        try #require(NSEvent.mouseEvent(
            with: type, location: point, modifierFlags: [],
            timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: panel.windowNumber,
            context: nil, eventNumber: 0, clickCount: 1, pressure: 1))
    }

    @Test func draggingTheDesktopCardMovesItsWindow() async throws {
        let model = isolatedModel(layout: .compact)
        let controller = WidgetPanelController(model: model, actions: AppActions(openSettings: {}, quit: {}))
        let panel = controller.panel
        defer { panel.close() }
        try await Task.sleep(for: .milliseconds(500))

        let start = panel.frame.origin
        // Grab the card near its top, away from any button, and pull 30 right and 10 down.
        let grab = CGPoint(x: 150, y: panel.frame.height - 24)
        panel.sendEvent(try mouseEvent(.leftMouseDown, at: grab, in: panel))
        panel.sendEvent(try mouseEvent(.leftMouseDragged, at: CGPoint(x: grab.x + 30, y: grab.y - 10), in: panel))
        panel.sendEvent(try mouseEvent(.leftMouseUp, at: CGPoint(x: grab.x + 30, y: grab.y - 10), in: panel))
        try await Task.sleep(for: .milliseconds(200))

        #expect(abs(panel.frame.origin.x - (start.x + 30)) < 1)
        #expect(abs(panel.frame.origin.y - (start.y - 10)) < 1)
    }

    @Test func theIslandOpensUnderThePointerAndClosesAfterItLeaves() async throws {
        let model = isolatedModel(layout: .island)
        let controller = IslandController(model: model, actions: AppActions(openSettings: {}, quit: {}))
        let panel = controller.panel
        defer { panel.close() }
        try await Task.sleep(for: .milliseconds(400))

        #expect(panel.isVisible)
        let resting = panel.frame.size
        #expect(resting.height <= 40, "at rest it is only as tall as the notch")

        func pointer(_ type: NSEvent.EventType) throws -> NSEvent {
            try #require(NSEvent.enterExitEvent(
                with: type, location: .zero, modifierFlags: [],
                timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: panel.windowNumber,
                context: nil, eventNumber: 0, trackingNumber: 0, userData: nil))
        }
        let view = try #require(panel.contentView)

        view.mouseEntered(with: try pointer(.mouseEntered))
        #expect(panel.frame.height > resting.height + 100, "room for the timetable")
        #expect(panel.frame.midX == NSRect(origin: panel.frame.origin, size: resting).midX + (panel.frame.width - resting.width) / 2)

        view.mouseExited(with: try pointer(.mouseExited))
        try await Task.sleep(for: .milliseconds(700))
        #expect(panel.frame.size == resting)
    }

    @Test func theDesktopCardHidesWhileTheIslandIsTheStyle() async throws {
        let model = isolatedModel(layout: .island)
        let card = WidgetPanelController(model: model, actions: AppActions(openSettings: {}, quit: {}))
        defer { card.panel.close() }
        try await Task.sleep(for: .milliseconds(200))
        #expect(!card.panel.isVisible)

        model.settings.widgetLayout = .compact
        try await Task.sleep(for: .milliseconds(200))
        #expect(card.panel.isVisible)
    }

    @Test func stopButtonRespondsInAWindowThatIsNeverKey() async throws {
        let recorder = Recorder()
        let (panel, size) = try await presentBanner(recorder)
        defer { panel.close() }

        #expect(!panel.canBecomeKey)
        // The Stop button sits at the right-hand end, vertically centred.
        try click(CGPoint(x: size.width - 52, y: size.height / 2), in: panel)
        try await Task.sleep(for: .milliseconds(300))
        #expect(recorder.stopped)
    }

    @Test func emptySpaceDragsTheWindowAndDoesNotPressAnything() async throws {
        let recorder = Recorder()
        let (panel, size) = try await presentBanner(recorder)
        defer { panel.close() }

        let middle = CGPoint(x: size.width / 2, y: size.height / 2)
        let background = try #require(panel.contentView?.hitTest(middle))
        #expect(background.mouseDownCanMoveWindow)

        try click(middle, in: panel)
        try await Task.sleep(for: .milliseconds(300))
        #expect(!recorder.stopped)
    }

    // MARK: - The screen cover's Prayed button

    /// Shows the cover's button on its own, filling a small panel, with a short hold time.
    func presentHoldButton(_ recorder: Recorder) async throws -> (panel: CoverPanel, centre: CGPoint) {
        _ = NSApplication.shared
        let hosting = ClickThroughHostingView(rootView: HoldToConfirmButton(
            title: "Prayed", duration: 0.4, action: { recorder.prayed = true }))
        let size = hosting.fittingSize
        hosting.sizingOptions = []

        let panel = CoverPanel()
        // At the cover's own level it would sit over whatever is on screen while the test runs.
        panel.level = .normal
        panel.contentView = hosting
        panel.setFrame(CGRect(origin: CGPoint(x: 120, y: 120), size: size), display: true)
        panel.orderFrontRegardless()
        try await Task.sleep(for: .milliseconds(400))
        return (panel, CGPoint(x: size.width / 2, y: size.height / 2))
    }

    @Test func lettingGoOfThePrayedButtonEarlyDoesNothing() async throws {
        let recorder = Recorder()
        let (panel, centre) = try await presentHoldButton(recorder)
        defer { panel.close() }

        panel.sendEvent(try mouseEvent(.leftMouseDown, at: centre, in: panel))
        try await Task.sleep(for: .milliseconds(100))
        panel.sendEvent(try mouseEvent(.leftMouseUp, at: centre, in: panel))
        try await Task.sleep(for: .milliseconds(700))
        #expect(!recorder.prayed)
    }

    @Test func holdingThePrayedButtonMarksThePrayer() async throws {
        let recorder = Recorder()
        let (panel, centre) = try await presentHoldButton(recorder)
        defer { panel.close() }

        panel.sendEvent(try mouseEvent(.leftMouseDown, at: centre, in: panel))
        // The hold, then the moment the confirmation stays on screen.
        try await Task.sleep(for: .milliseconds(1300))
        #expect(recorder.prayed)
        panel.sendEvent(try mouseEvent(.leftMouseUp, at: centre, in: panel))
    }

    @Test func theCoverTakesTheKeyboardAndSitsAboveEverything() {
        let panel = CoverPanel()
        #expect(panel.canBecomeKey)
        #expect(panel.level == .screenSaver)
        #expect(panel.collectionBehavior.isSuperset(of: [.canJoinAllSpaces, .fullScreenAuxiliary]))
    }
}
