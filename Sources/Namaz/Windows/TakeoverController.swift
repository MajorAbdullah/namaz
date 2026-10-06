import AppKit
import Carbon.HIToolbox
import Combine
import SwiftUI

/// Covers every screen for the last minutes of an unprayed prayer. The cover goes when the
/// prayer is marked as prayed, when its time runs out, or when Namaz is quit.
@MainActor
final class TakeoverController {
    private let model: AppModel
    private var panels: [CoverPanel] = []
    private let quitHotKey = QuitHotKey()
    private var observers = Set<AnyCancellable>()
    private var isCovering = false
    /// The app the user was in when the cover took the keyboard, to give it back to afterwards.
    private var previouslyActive: NSRunningApplication?

    init(model: AppModel) {
        self.model = model

        model.$warning
            .combineLatest(model.$settings.map(\.endOfTimeCover))
            .map { warning, coverIsOn in coverIsOn && (warning?.urgency ?? .calm) >= .ten }
            .removeDuplicates()
            .sink { [weak self] shouldCover in
                self?.isCovering = shouldCover
                self?.update()
            }
            .store(in: &observers)

        // A display plugged in while the cover is up must be covered too.
        NotificationCenter.default.publisher(for: NSApplication.didChangeScreenParametersNotification)
            .map { _ in }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.update() }
            .store(in: &observers)
    }

    private func update() {
        quitHotKey.isHeld = isCovering
        guard isCovering else {
            // No fade: the view empties as soon as the warning goes, so there is nothing left to
            // fade, and a panel that lingers would keep swallowing clicks and keys.
            panels.forEach { $0.orderOut(nil) }
            handBackKeyboard()
            return
        }

        let screens = NSScreen.screens
        while panels.count < screens.count { panels.append(makePanel()) }
        panels.dropFirst(screens.count).forEach { $0.orderOut(nil) }
        for (panel, screen) in zip(panels, screens) {
            panel.setFrame(screen.frame, display: true)
            // Already up, as when a display changes: the new frame is all it needs.
            if panel.isVisible { continue }
            panel.alphaValue = 0
            panel.orderFrontRegardless()
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.4
                panel.animator().alphaValue = 1
            }
        }
        // Take the keyboard if the system lets us, so typing does not carry on unseen in the
        // app underneath. Nothing depends on this succeeding.
        if previouslyActive == nil, let front = NSWorkspace.shared.frontmostApplication,
           front != NSRunningApplication.current {
            previouslyActive = front
        }
        panels.first?.makeKey()
        NSApp.activate()
    }

    /// Namaz has no window of its own to keep the keyboard in, so without this the user's app
    /// would stay without focus until clicked, and a habitual ⌘Q would quit Namaz.
    private func handBackKeyboard() {
        guard let previous = previouslyActive else { return }
        previouslyActive = nil
        guard NSApp.isActive, !previous.isTerminated else { return }
        NSApp.yieldActivation(to: previous)
        previous.activate()
    }

    private func makePanel() -> CoverPanel {
        let panel = CoverPanel()
        let hosting = ClickThroughHostingView(rootView: TakeoverView(model: model))
        hosting.sizingOptions = []
        panel.contentView = hosting
        return panel
    }
}

/// ⌘Q for the whole system, held only while the screen is covered.
///
/// The cover cannot count on having keyboard focus: macOS may leave it with the app the user
/// was typing in, and an ordinary ⌘Q would then quit that app, out of sight. A hot key reaches
/// Namaz whichever app is in front. It is the one way out of the cover other than praying, so
/// if reserving the key fails, holding Prayed still works, and the other way round.
@MainActor
private final class QuitHotKey {
    private var hotKey: EventHotKeyRef?
    private var handler: EventHandlerRef?

    var isHeld = false {
        didSet {
            guard isHeld != oldValue else { return }
            if isHeld { hold() } else { release() }
        }
    }

    private func hold() {
        if handler == nil {
            var pressed = EventTypeSpec(
                eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
            InstallEventHandler(GetApplicationEventTarget(), { _, _, _ in
                // Hot keys are delivered on the main thread, through the app's event loop.
                MainActor.assumeIsolated { NSApp.terminate(nil) }
                return noErr
            }, 1, &pressed, nil, &handler)
        }
        let status = RegisterEventHotKey(
            UInt32(kVK_ANSI_Q), UInt32(cmdKey), EventHotKeyID(signature: 0x4E4D_5A51, id: 1),
            GetApplicationEventTarget(), 0, &hotKey)
        if status != noErr { Log.info("Could not reserve ⌘Q while the screen is covered (\(status))") }
    }

    private func release() {
        if let hotKey { UnregisterEventHotKey(hotKey) }
        hotKey = nil
    }
}
