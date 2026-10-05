import AppKit
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let model = AppModel()
    private var statusItem: StatusItemController?
    private var widget: WidgetPanelController?
    private var island: IslandController?
    private var banner: AlarmBannerController?
    private var takeover: TakeoverController?
    private var settingsWindow: NSWindow?
    private var activity: NSObjectProtocol?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // App Nap can hold back a background app's timers by minutes, which would make alarms
        // late. This opts out of it while still letting the Mac go to sleep.
        activity = ProcessInfo.processInfo.beginActivity(
            options: .userInitiatedAllowingIdleSystemSleep, reason: "Ringing prayer alarms on time")

        installMainMenu()

        let actions = AppActions(
            openSettings: { [weak self] in self?.showSettings() },
            quit: { NSApp.terminate(nil) })
        statusItem = StatusItemController(model: model, actions: actions)
        widget = WidgetPanelController(model: model, actions: actions)
        island = IslandController(model: model, actions: actions)
        banner = AlarmBannerController(model: model)
        // A run that only saves pictures must not cover the screen if it lands on a deadline.
        if model.diagnostics.uiDumpDirectory == nil {
            takeover = TakeoverController(model: model)
        }
        model.start()

        if let directory = model.diagnostics.uiDumpDirectory {
            Task {
                await UIDump.run(model: model, into: directory)
                NSApp.terminate(nil)
            }
        }
    }

    /// Opening the app again while it is running (from Finder or Spotlight) shows its settings,
    /// since there is no Dock icon or main window to bring forward.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showSettings()
        return true
    }

    @objc private func showSettings() {
        if settingsWindow == nil {
            let window = NSWindow(contentViewController: NSHostingController(rootView: SettingsView(model: model)))
            window.title = "Namaz Settings"
            window.styleMask = [.titled, .closable]
            window.isReleasedWhenClosed = false
            window.center()
            settingsWindow = window
        }
        NSApp.activate()
        settingsWindow?.makeKeyAndOrderFront(nil)
    }

    /// The app has no visible menu bar, but keyboard shortcuts are still looked up in the main
    /// menu, so this is what makes ⌘Q, ⌘W, ⌘, and copy and paste in text fields work.
    private func installMainMenu() {
        let mainMenu = NSMenu()

        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Settings…", action: #selector(showSettings), keyEquivalent: ",").target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Namaz", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let fileMenu = NSMenu(title: "File")
        fileMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")

        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        for menu in [appMenu, fileMenu, editMenu] {
            let item = NSMenuItem()
            item.submenu = menu
            mainMenu.addItem(item)
        }
        NSApp.mainMenu = mainMenu
    }
}
