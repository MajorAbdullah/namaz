import AppKit
import NamazCore
import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    enum Tab: String, CaseIterable {
        case general, alarms, calculation
    }

    @ObservedObject var model: AppModel
    @ViewState private var tab: Tab

    init(model: AppModel, tab: Tab = .general) {
        self.model = model
        _tab = ViewState(initialValue: tab)
    }

    var body: some View {
        TabView(selection: $tab) {
            GeneralSettings(model: model, location: model.location)
                .tabItem { Label("General", systemImage: "gearshape") }
                .tag(Tab.general)
            AlarmSettings(model: model)
                .tabItem { Label("Alarms", systemImage: "bell") }
                .tag(Tab.alarms)
            CalculationSettings(model: model)
                .tabItem { Label("Calculation", systemImage: "sun.horizon") }
                .tag(Tab.calculation)
        }
        .frame(width: 500, height: 730)
    }
}

/// A note under a settings section.
private struct Footnote: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - General

private struct GeneralSettings: View {
    @ObservedObject var model: AppModel
    @ObservedObject var location: LocationService
    @ViewState private var opensAtLogin = LoginItem.isEnabled
    @ViewState private var loginItemError: String?

    /// Picker tag for a hand-entered location, alongside the built-in cities' ids.
    private static let customCity = "custom"

    var body: some View {
        Form {
            Section {
                Picker("Prayer times for", selection: $model.settings.locationMode) {
                    Text("My current location").tag(AppSettings.LocationMode.automatic)
                    Text("A city I choose").tag(AppSettings.LocationMode.manual)
                }
                if model.settings.locationMode == .automatic {
                    automaticLocation
                } else {
                    manualLocation
                }
                LabeledContent(
                    "Qibla",
                    value: "\(model.settings.place.coordinates.qiblaDescription) of true north")
            } header: {
                Text("Location")
            } footer: {
                if model.settings.locationMode == .manual {
                    Footnote("Times are shown in this Mac's time zone.")
                }
            }

            Section("Menu Bar and Widget") {
                Picker("Menu bar shows", selection: $model.settings.menuBarStyle) {
                    Text("Next prayer and its time").tag(AppSettings.MenuBarStyle.nextPrayer)
                    Text("Countdown to the next prayer").tag(AppSettings.MenuBarStyle.countdown)
                    Text("Icon only").tag(AppSettings.MenuBarStyle.iconOnly)
                }
                Toggle("Show the widget", isOn: $model.settings.showsWidget)
                Picker("Widget style", selection: $model.settings.widgetLayout) {
                    Text("Island at the notch").tag(AppSettings.WidgetLayout.island)
                    Text("Compact card on the desktop").tag(AppSettings.WidgetLayout.compact)
                    Text("List card on the desktop").tag(AppSettings.WidgetLayout.list)
                }
                .disabled(!model.settings.showsWidget)
                Toggle("Keep the card above other windows", isOn: $model.settings.widgetFloatsOnTop)
                    .disabled(!model.settings.showsWidget || model.settings.widgetLayout == .island)
            }

            Section("Dates and Times") {
                Picker("Clock", selection: $model.settings.clockStyle) {
                    Text("Same as this Mac").tag(AppSettings.ClockStyle.system)
                    Text("12-hour").tag(AppSettings.ClockStyle.twelveHour)
                    Text("24-hour").tag(AppSettings.ClockStyle.twentyFourHour)
                }
                LabeledContent("Hijri date") {
                    Text(hijriPreview)
                    Stepper("Hijri date", value: $model.settings.hijriDayOffset, in: -2...2)
                        .labelsHidden()
                }
            }

            Section {
                Toggle("Open Namaz at login", isOn: loginItem)
                if let loginItemError {
                    Text(loginItemError)
                        .font(.callout)
                        .foregroundStyle(.red)
                }
            }
        }
        .formStyle(.grouped)
    }

    @ViewBuilder
    private var automaticLocation: some View {
        LabeledContent("Found") {
            HStack {
                Text(location.state == .locating
                    ? "Locating…"
                    : model.settings.detectedPlace?.name ?? "Not found yet")
                Button("Update") { model.updateLocation() }
                    .disabled(location.state == .locating)
            }
        }
        switch location.state {
        case .denied:
            VStack(alignment: .leading, spacing: 6) {
                Text("Namaz isn't allowed to use your location, so it is using \(model.settings.place.name). Allow it in System Settings, or choose a city instead.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Open Location Settings…") {
                    let pane = "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices"
                    if let url = URL(string: pane) { NSWorkspace.shared.open(url) }
                }
            }
        case .failed(let message):
            Text("Couldn't find your location (\(message)). Using \(model.settings.place.name).")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        case .idle, .locating:
            EmptyView()
        }
    }

    @ViewBuilder
    private var manualLocation: some View {
        Picker("City", selection: citySelection) {
            ForEach(City.byCountry, id: \.country) { group in
                Section(group.country) {
                    ForEach(group.cities) { city in
                        Text(city.name).tag(city.id)
                    }
                }
            }
            Divider()
            Text("Custom coordinates…").tag(Self.customCity)
        }
        if citySelection.wrappedValue == Self.customCity {
            TextField("Name", text: $model.settings.manualPlace.name)
            TextField("Latitude", value: coordinate(\.latitude, limit: 90), format: Self.degrees)
            TextField("Longitude", value: coordinate(\.longitude, limit: 180), format: Self.degrees)
        }
    }

    private static let degrees = FloatingPointFormatStyle<Double>.number.precision(.fractionLength(0...4))

    /// The built-in city matching the manual place, or the custom tag when none does.
    private var citySelection: Binding<String> {
        Binding(
            get: {
                City.all.first { $0.place == model.settings.manualPlace }?.id ?? Self.customCity
            },
            set: { id in
                if let city = City.all.first(where: { $0.id == id }) {
                    model.settings.manualPlace = city.place
                } else {
                    // Start custom entry from wherever the picker was, under a name no city has.
                    model.settings.manualPlace.name = "My Location"
                }
            })
    }

    private func coordinate(_ keyPath: WritableKeyPath<Coordinates, Double>, limit: Double) -> Binding<Double> {
        Binding(
            get: { model.settings.manualPlace.coordinates[keyPath: keyPath] },
            set: { model.settings.manualPlace.coordinates[keyPath: keyPath] = min(max($0, -limit), limit) })
    }

    private var hijriPreview: String {
        let now = model.now
        let date = HijriDate.string(
            for: now, timeZone: model.timeZone,
            afterMaghrib: model.schedule.map { now >= $0.today.maghrib } ?? false,
            dayOffset: model.settings.hijriDayOffset)
        let offset = model.settings.hijriDayOffset
        guard offset != 0 else { return date }
        return "\(date) (\(offset > 0 ? "+" : "−")\(abs(offset)) \(abs(offset) == 1 ? "day" : "days"))"
    }

    private var loginItem: Binding<Bool> {
        Binding(
            get: { opensAtLogin },
            set: { enabled in
                do {
                    try LoginItem.setEnabled(enabled)
                    loginItemError = nil
                } catch {
                    loginItemError = "Couldn't change the login item: \(error.localizedDescription)"
                }
                opensAtLogin = LoginItem.isEnabled
            })
    }
}

// MARK: - Alarms

private struct AlarmSettings: View {
    @ObservedObject var model: AppModel
    @ViewState private var importedSound = AlarmPlayer.importedSoundName
    @ViewState private var importError: String?

    var body: some View {
        Form {
            Section {
                ForEach(Prayer.allCases) { prayer in
                    Toggle(isOn: alarm(for: prayer)) {
                        Label {
                            Text(prayer == .sunrise ? "Sunrise (end of Fajr)" : prayer.name)
                        } icon: {
                            Image(systemName: prayer.symbolName)
                                .frame(width: 24)
                        }
                    }
                }
            } header: {
                Text("Ring the Alarm At")
            } footer: {
                Footnote("Alarms ring while this Mac is awake and Namaz is running.")
            }

            Section("Sound") {
                Picker("Alarm sound", selection: $model.settings.alarmSound) {
                    Text("Adhan (Masjid an-Nabawi)").tag(AlarmSound.adhan)
                    Text("None (show the alarm silently)").tag(AlarmSound.silent)
                    Divider()
                    ForEach(AlarmPlayer.systemSoundNames, id: \.self) { name in
                        Text(name).tag(AlarmSound.system(name))
                    }
                    if let importedSound {
                        Divider()
                        Text(importedSound).tag(AlarmSound.custom(fileName: importedSound))
                    }
                }
                LabeledContent("Your own adhan") {
                    Button("Choose Audio File…", action: chooseSound)
                }
                if let importError {
                    Text(importError)
                        .font(.callout)
                        .foregroundStyle(.red)
                }
                Slider(value: $model.settings.alarmVolume, in: 0.1...1) {
                    Text("Volume")
                } minimumValueLabel: {
                    Image(systemName: "speaker.fill")
                } maximumValueLabel: {
                    Image(systemName: "speaker.wave.3.fill")
                }
                LabeledContent("Try it") {
                    if model.ringing == nil {
                        Button("Test Alarm") { model.testAlarm() }
                    } else {
                        Button("Stop") { model.stopAlarm() }
                    }
                }
            }

            Section("Reminder") {
                Picker("Remind me", selection: $model.settings.reminderMinutes) {
                    Text("Never").tag(0)
                    ForEach([5, 10, 15, 20, 30], id: \.self) { minutes in
                        Text("\(minutes) minutes before").tag(minutes)
                    }
                }
            }
        }
        .formStyle(.grouped)
    }

    private func alarm(for prayer: Prayer) -> Binding<Bool> {
        Binding(
            get: { model.settings.alarmPrayers.contains(prayer) },
            set: { isOn in
                if isOn {
                    model.settings.alarmPrayers.insert(prayer)
                } else {
                    model.settings.alarmPrayers.remove(prayer)
                }
            })
    }

    private func chooseSound() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.audio]
        panel.allowsMultipleSelection = false
        panel.message = "Choose an audio file to play at prayer times."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            model.settings.alarmSound = try AlarmPlayer.importCustomSound(from: url)
            importedSound = AlarmPlayer.importedSoundName
            importError = nil
        } catch {
            importError = "That file couldn't be used: \(error.localizedDescription)"
        }
    }
}

// MARK: - Calculation

private struct CalculationSettings: View {
    @ObservedObject var model: AppModel

    var body: some View {
        Form {
            Section {
                Picker("Method", selection: $model.settings.calculation.method) {
                    ForEach(CalculationMethod.allCases) { method in
                        Text(method.name).tag(method)
                    }
                }
                LabeledContent("Twilight", value: model.settings.calculation.method.summary)
                Picker("Asr", selection: $model.settings.calculation.madhab) {
                    ForEach(AsrMadhab.allCases) { madhab in
                        Text(madhab.name).tag(madhab)
                    }
                }
                Picker("At high latitudes", selection: $model.settings.calculation.highLatitudeRule) {
                    ForEach(HighLatitudeRule.allCases) { rule in
                        Text(rule.name).tag(rule)
                    }
                }
            } footer: {
                Footnote("The high-latitude rule only applies far from the equator in summer, when twilight lasts all night.")
            }

            Section {
                ForEach(Prayer.allCases) { prayer in
                    LabeledContent(prayer.name) {
                        if model.settings.calculation.adjustments[prayer] != 0 {
                            Text(shiftSummary(for: prayer))
                            Button("Reset") { model.settings.calculation.adjustments[prayer] = 0 }
                                .buttonStyle(.link)
                        }
                        if model.schedule != nil {
                            DatePicker(prayer.name, selection: time(for: prayer), displayedComponents: .hourAndMinute)
                                .labelsHidden()
                        } else {
                            Text("Not available here")
                        }
                    }
                }
            } header: {
                Text("Adjust Times")
            } footer: {
                Footnote("Set each prayer to the time you want it, by typing or with the arrows. The difference from the calculated time is what is kept, so the adjustment carries over to every day.")
            }
        }
        .formStyle(.grouped)
    }

    /// Today's time for the prayer. Setting it stores how far that is from the calculated time.
    private func time(for prayer: Prayer) -> Binding<Date> {
        Binding(
            get: { model.schedule?.today[prayer] ?? model.now },
            set: { chosen in
                guard let shown = model.schedule?.today[prayer] else { return }
                let current = model.settings.calculation.adjustments[prayer]
                let calculated = shown.addingTimeInterval(Double(-current) * 60)
                model.settings.calculation.adjustments[prayer] =
                    PrayerAdjustments.minutes(from: calculated, toClockTimeOf: chosen)
            })
    }

    /// "+1 h 9 min" or "−19 min".
    private func shiftSummary(for prayer: Prayer) -> String {
        let minutes = model.settings.calculation.adjustments[prayer]
        let (hours, rest) = (abs(minutes) / 60, abs(minutes) % 60)
        let amount = hours == 0 ? "\(rest) min" : rest == 0 ? "\(hours) h" : "\(hours) h \(rest) min"
        return (minutes > 0 ? "+" : "−") + amount
    }
}
