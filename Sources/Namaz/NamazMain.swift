import AppKit

@main
enum NamazMain {
    @MainActor
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        // A menu bar app: no Dock icon, no app menu.
        app.setActivationPolicy(.accessory)
        // NSApplication holds its delegate weakly, so keep it alive for the life of the run loop.
        withExtendedLifetime(delegate) {
            app.run()
        }
    }
}
