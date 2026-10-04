import AppKit
import Combine
import SwiftUI

/// The menu bar item: an icon with the next prayer beside it, and a popover with the timetable.
@MainActor
final class StatusItemController: NSObject {
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let popover = NSPopover()
    private var observers = Set<AnyCancellable>()

    init(model: AppModel, actions: AppActions) {
        super.init()

        // Close the popover before acting, so it is not left hanging over a new window.
        let popoverActions = AppActions(
            openSettings: { [weak self] in
                self?.popover.performClose(nil)
                actions.openSettings()
            },
            quit: actions.quit)
        let content = NSHostingController(rootView: PopoverView(model: model, actions: popoverActions))
        content.sizingOptions = [.preferredContentSize]
        popover.contentViewController = content
        popover.behavior = .transient

        item.button?.target = self
        item.button?.action = #selector(togglePopover)

        model.$menuBarTitle.combineLatest(model.$ringing)
            .sink { [weak self] title, ringing in
                self?.show(title: title, isRinging: ringing != nil)
            }
            .store(in: &observers)
    }

    private func show(title: String, isRinging: Bool) {
        guard let button = item.button else { return }
        let symbol = isRinging ? "bell.and.waves.left.and.right.fill" : "moon.stars.fill"
        button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: "Namaz")
        button.imagePosition = title.isEmpty ? .imageOnly : .imageLeading
        // Fixed-width digits stop the item from jittering as the countdown changes.
        button.attributedTitle = NSAttributedString(
            string: title.isEmpty ? "" : " \(title)",
            attributes: [.font: NSFont.monospacedDigitSystemFont(
                ofSize: NSFont.menuBarFont(ofSize: 0).pointSize, weight: .regular)])
    }

    @objc private func togglePopover() {
        if popover.isShown {
            popover.performClose(nil)
        } else if let button = item.button {
            // A transient popover only closes on an outside click if its app is active.
            NSApp.activate()
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        }
    }
}
