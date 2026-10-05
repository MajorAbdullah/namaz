import AppKit
import SwiftUI

/// A borderless, see-through window for content that draws its own shape.
///
/// It never becomes the key window, so clicking the widget or an alarm does not take keyboard
/// focus away from whatever the user was typing in.
final class FloatingPanel: NSPanel {
    init() {
        super.init(
            contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        animationBehavior = .none
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// A borderless window that fills a screen and sits above everything on it, full-screen apps
/// included: the cover shown when a prayer's time is nearly gone.
///
/// Unlike `FloatingPanel` it takes keyboard focus when the system allows, and swallows what
/// is typed, so that work does not carry on unseen underneath.
final class CoverPanel: NSPanel {
    init() {
        super.init(
            contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        animationBehavior = .none
        level = .screenSaver
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle, .stationary]
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    // Without this every key pressed would sound the alert beep.
    override func keyDown(with event: NSEvent) {}
}

/// Hosts SwiftUI in a window that is never key. Without this, the first click on a button would
/// be swallowed as the click that "activates" the window.
final class ClickThroughHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

extension NSView {
    /// Renders the view as it currently appears on screen.
    func pngSnapshot() -> Data? {
        guard let bitmap = bitmapImageRepForCachingDisplay(in: bounds) else { return nil }
        cacheDisplay(in: bounds, to: bitmap)
        return bitmap.representation(using: .png, properties: [:])
    }
}
