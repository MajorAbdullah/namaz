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
