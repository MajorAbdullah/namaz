import NamazCore
import SwiftUI

/// Things a view can ask of the app that are not changes to the model.
struct AppActions {
    var openSettings: @MainActor () -> Void
    var quit: @MainActor () -> Void
}

/// What drops down from the menu bar: the full timetable with alarm switches, and app controls.
struct PopoverView: View {
    @ObservedObject var model: AppModel
    let actions: AppActions

    var body: some View {
        VStack(spacing: 10) {
            LiveCard(model: model, layout: .list)

            HStack {
                Label("Qibla \(model.settings.place.coordinates.qiblaDescription)",
                      systemImage: "location.north.line.fill")
                Spacer()
                Text(model.settings.calculation.madhab == .hanafi ? "Hanafi Asr" : "Standard Asr")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 6)

            if model.settings.endOfTimeAlerts {
                pauseRow
            }

            Divider()

            HStack {
                Button(action: actions.openSettings) {
                    Label("Settings…", systemImage: "gearshape")
                }
                Spacer()
                Button {
                    model.settings.showsWidget.toggle()
                } label: {
                    Label(model.settings.showsWidget ? "Hide Widget" : "Show Widget",
                          systemImage: "macwindow")
                }
                Spacer()
                Button(action: actions.quit) {
                    Label("Quit", systemImage: "power")
                }
            }
            .buttonStyle(.borderless)
            .padding(.horizontal, 6)
        }
        .padding(12)
    }

    /// A way to quieten the end-of-time alerts for a while, or to bring them back.
    private var pauseRow: some View {
        HStack {
            if let until = model.pauseEnd {
                Label("Alerts paused until \(model.clockFormat.timeAndDay(until, relativeTo: model.now))",
                      systemImage: "pause.circle.fill")
                Spacer()
                Button("Resume") { model.resumeAlerts() }
            } else {
                PauseAlertsMenu(model: model) {
                    Label("Pause Alerts", systemImage: "pause.circle")
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .help("Stops the end-of-time alerts and the screen cover for a while. The adhan still rings.")
                Spacer()
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .buttonStyle(.borderless)
        .padding(.horizontal, 6)
    }
}

/// The lengths a pause can have, offered in the popover and in Settings.
struct PauseAlertsMenu<Title: View>: View {
    @ObservedObject var model: AppModel
    let title: Title

    init(model: AppModel, @ViewBuilder title: () -> Title) {
        self.model = model
        self.title = title()
    }

    var body: some View {
        Menu {
            Button("For 1 Hour") { model.pauseAlerts(.hour) }
            Button("For the Rest of Today") { model.pauseAlerts(.restOfToday) }
            Button("For 3 Days") { model.pauseAlerts(.days(3)) }
            Button("For 7 Days") { model.pauseAlerts(.days(7)) }
        } label: {
            title
        }
    }
}

/// The desktop widget: the card, plus a right-click menu.
struct WidgetView: View {
    @ObservedObject var model: AppModel
    let actions: AppActions
    /// Reports the card's size so the window can be made to fit it.
    let onResize: (CGSize) -> Void
    /// Reports how far the pointer has pulled the card from where it was grabbed.
    let onDrag: (CGSize) -> Void

    var body: some View {
        LiveCard(model: model, layout: model.settings.widgetLayout)
            .fixedSize()
            .onGeometryChange(for: CGSize.self) { $0.size } action: { onResize($0) }
            // Measured in the card's own space, which moves with the window: each report is the
            // distance the window still has to travel to catch up with the pointer.
            .gesture(DragGesture(minimumDistance: 2, coordinateSpace: .local).onChanged { value in
                onDrag(CGSize(
                    width: value.location.x - value.startLocation.x,
                    height: value.location.y - value.startLocation.y))
            })
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .contextMenu { WidgetMenu(model: model, actions: actions) }
    }
}

/// The right-click menu shared by the desktop card and the island.
struct WidgetMenu: View {
    @ObservedObject var model: AppModel
    let actions: AppActions

    var body: some View {
        Picker("Style", selection: $model.settings.widgetLayout) {
            Text("Island at the Notch").tag(AppSettings.WidgetLayout.island)
            Text("Compact Card").tag(AppSettings.WidgetLayout.compact)
            Text("List Card").tag(AppSettings.WidgetLayout.list)
        }
        .pickerStyle(.inline)
        if model.settings.widgetLayout != .island {
            Toggle("Keep Above Other Windows", isOn: $model.settings.widgetFloatsOnTop)
        }
        Divider()
        Button("Settings…") { actions.openSettings() }
        Button("Hide Widget") { model.settings.showsWidget = false }
        Divider()
        Button("Quit Namaz") { actions.quit() }
    }
}
