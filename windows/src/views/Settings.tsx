import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  type AlarmSound,
  type AppSettings,
  type ClockFormat,
  type MenuBarStyle,
  type Snapshot,
  type WidgetLayout,
  currentPlace,
} from "../app";
import {
  HIGH_LATITUDE_RULES,
  type HighLatitudeRule,
  type AsrMadhab,
  type CalculationMethod,
  MADHABS,
  METHODS,
  methodSummary,
  type PauseLength,
  type Prayer,
  PRAYERS,
  type Place,
  CITIES,
  cityId,
  cityPlace,
  citiesByCountry,
  dayContaining,
  instantFromLocal,
  localParts,
  minutesFromCalculatedToClockTimeOf,
  prayerName,
  prayerTimes,
} from "../core";
import { TONES } from "../platform/audio";
import { isLinux } from "../platform/os";
import { PauseAlertsMenu } from "./Popover";

export type SettingsTab = "general" | "alarms" | "runningOut" | "calculation";
export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "alarms", label: "Alarms" },
  { id: "runningOut", label: "Running Out" },
  { id: "calculation", label: "Calculation" },
];

export interface SettingsActions {
  patch: (patch: Partial<AppSettings>) => void;
  pause: (length: PauseLength) => void;
  resume: () => void;
  testAlarm: () => void;
  stopAlarm: () => void;
  locate: () => void;
  chooseSound: () => Promise<AlarmSound | null>;
  importedSoundName: () => Promise<string | null>;
  launchAtLogin: { get: () => Promise<boolean>; set: (on: boolean) => Promise<void> };
}

function Section({ title, footer, children }: { title?: string; footer?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="form-section">
      {title && <h2>{title}</h2>}
      <div class="form-group">{children}</div>
      {footer && <p class="footnote">{footer}</p>}
    </section>
  );
}

function Field({ label, children, disabled }: { label: string; children: ComponentChildren; disabled?: boolean }) {
  return (
    <label class={`field ${disabled ? "is-disabled" : ""}`}>
      <span class="field-label">{label}</span>
      <span class="field-control">{children}</span>
    </label>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <Field label={label} disabled={disabled}>
      <input type="checkbox" class="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
    </Field>
  );
}

const CUSTOM_CITY = "custom";

function GeneralTab({ settings, actions, format }: { settings: AppSettings; actions: SettingsActions; format: ClockFormat }) {
  const [login, setLogin] = useState<boolean | null>(null);
  useEffect(() => {
    void actions.launchAtLogin.get().then(setLogin);
  }, []);

  const place = settings.manualPlace;
  const known = CITIES.find(
    (city) =>
      city.name === place.name &&
      city.coordinates.latitude === place.coordinates.latitude &&
      city.coordinates.longitude === place.coordinates.longitude,
  );
  const setCoordinate = (key: "latitude" | "longitude", limit: number) => (value: string) => {
    const number = Number(value);
    if (value.trim() === "" || !Number.isFinite(number) || Math.abs(number) > limit) return;
    actions.patch({ manualPlace: { ...place, coordinates: { ...place.coordinates, [key]: number } } });
  };

  return (
    <>
      <Section footer={`Times are shown in this computer's time zone (${format.timeZone}).`}>
        <Field label="Prayer times for">
          <select
            value={settings.locationMode}
            onChange={(event) => actions.patch({ locationMode: event.currentTarget.value as AppSettings["locationMode"] })}
          >
            <option value="automatic">My current location</option>
            <option value="manual">A city I choose</option>
          </select>
        </Field>
        {settings.locationMode === "automatic" ? (
          <>
            <Field label="Found">
              <span>
                {settings.detectedPlace ? settings.detectedPlace.name : `Not yet. Using ${currentPlace(settings).name}.`}{" "}
                <button type="button" class="button" onClick={actions.locate}>
                  Update
                </button>
              </span>
            </Field>
          </>
        ) : (
          <>
            <Field label="City">
              <select
                value={known ? cityId(known) : CUSTOM_CITY}
                onChange={(event) => {
                  const choice = event.currentTarget.value;
                  const city = CITIES.find((candidate) => cityId(candidate) === choice);
                  if (city) actions.patch({ manualPlace: cityPlace(city) });
                  else actions.patch({ manualPlace: { ...place, name: place.name || "My place" } });
                }}
              >
                {citiesByCountry().map((group) => (
                  <optgroup label={group.country} key={group.country}>
                    {group.cities.map((city) => (
                      <option value={cityId(city)} key={cityId(city)}>
                        {city.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value={CUSTOM_CITY}>Custom coordinates…</option>
              </select>
            </Field>
            {!known && (
              <>
                <Field label="Name">
                  <input type="text" value={place.name} onInput={(event) => actions.patch({ manualPlace: { ...place, name: event.currentTarget.value } })} />
                </Field>
                <Field label="Latitude">
                  <input type="number" step="0.0001" value={place.coordinates.latitude} onChange={(event) => setCoordinate("latitude", 90)(event.currentTarget.value)} />
                </Field>
                <Field label="Longitude">
                  <input type="number" step="0.0001" value={place.coordinates.longitude} onChange={(event) => setCoordinate("longitude", 180)(event.currentTarget.value)} />
                </Field>
              </>
            )}
          </>
        )}
      </Section>

      <Section title="Tray and Widget">
        <Field label="Tray tooltip shows">
          <select value={settings.menuBarStyle} onChange={(event) => actions.patch({ menuBarStyle: event.currentTarget.value as MenuBarStyle })}>
            <option value="nextPrayer">Next prayer and its time</option>
            <option value="countdown">Countdown to the next prayer</option>
            <option value="iconOnly">Namaz only</option>
          </select>
        </Field>
        <Toggle label="Show the widget" checked={settings.showsWidget} onChange={(on) => actions.patch({ showsWidget: on })} />
        <Field label="Widget style" disabled={!settings.showsWidget}>
          <select
            value={settings.widgetLayout}
            disabled={!settings.showsWidget}
            onChange={(event) => actions.patch({ widgetLayout: event.currentTarget.value as WidgetLayout })}
          >
            <option value="island">Island at the top of the screen</option>
            <option value="compact">Compact card on the desktop</option>
            <option value="list">List card on the desktop</option>
          </select>
        </Field>
        <Toggle
          label="Keep the card above other windows"
          checked={settings.widgetFloatsOnTop}
          disabled={!settings.showsWidget || settings.widgetLayout === "island"}
          onChange={(on) => actions.patch({ widgetFloatsOnTop: on })}
        />
      </Section>

      <Section title="Dates and Times">
        <Field label="Clock">
          <select value={settings.clockStyle} onChange={(event) => actions.patch({ clockStyle: event.currentTarget.value as AppSettings["clockStyle"] })}>
            <option value="system">Same as this computer</option>
            <option value="twelveHour">12-hour</option>
            <option value="twentyFourHour">24-hour</option>
          </select>
        </Field>
        <Field label="Hijri date">
          <span class="stepper">
            <button type="button" class="button" disabled={settings.hijriDayOffset <= -2} onClick={() => actions.patch({ hijriDayOffset: settings.hijriDayOffset - 1 })} aria-label="One day earlier">
              −
            </button>
            <span class="stepper-value">{settings.hijriDayOffset > 0 ? `+${settings.hijriDayOffset}` : settings.hijriDayOffset} days</span>
            <button type="button" class="button" disabled={settings.hijriDayOffset >= 2} onClick={() => actions.patch({ hijriDayOffset: settings.hijriDayOffset + 1 })} aria-label="One day later">
              +
            </button>
          </span>
        </Field>
      </Section>

      <Section footer={isLinux() ? "Namaz opens quietly in the tray when you sign in." : "Namaz opens quietly in the tray when you sign in to Windows."}>
        <Toggle
          label="Open Namaz when I sign in"
          checked={login ?? false}
          disabled={login === null}
          onChange={(on) => {
            setLogin(on);
            void actions.launchAtLogin.set(on).catch(() => setLogin(!on));
          }}
        />
      </Section>
    </>
  );
}

const REMINDERS = [5, 10, 15, 30];

function AlarmsTab({ settings, snapshot, actions }: { settings: AppSettings; snapshot: Snapshot; actions: SettingsActions }) {
  const [imported, setImported] = useState<string | null>(null);
  useEffect(() => {
    void actions.importedSoundName().then(setImported);
  }, []);

  const soundValue = (sound: AlarmSound) => (sound.kind === "tone" ? `tone:${sound.name}` : sound.kind);
  const soundFrom = (value: string): AlarmSound =>
    value.startsWith("tone:")
      ? { kind: "tone", name: value.slice(5) }
      : value === "custom" && imported
        ? { kind: "custom", fileName: imported }
        : value === "silent"
          ? { kind: "silent" }
          : { kind: "adhan" };

  const toggle = (prayer: Prayer, on: boolean) => {
    const enabled = new Set(settings.alarmPrayers);
    if (on) enabled.add(prayer);
    else enabled.delete(prayer);
    actions.patch({ alarmPrayers: PRAYERS.filter((candidate) => enabled.has(candidate)) });
  };

  return (
    <>
      <Section title="Ring the Alarm At" footer="Alarms ring while this computer is awake and Namaz is running.">
        {PRAYERS.map((prayer) => (
          <Toggle key={prayer} label={prayerName(prayer)} checked={settings.alarmPrayers.includes(prayer)} onChange={(on) => toggle(prayer, on)} />
        ))}
      </Section>

      <Section title="Sound">
        <Field label="Alarm sound">
          <select value={soundValue(settings.alarmSound)} onChange={(event) => actions.patch({ alarmSound: soundFrom(event.currentTarget.value) })}>
            <option value="adhan">Adhan (Masjid an-Nabawi)</option>
            <option value="silent">None (show the alarm silently)</option>
            {TONES.map((name) => (
              <option value={`tone:${name}`} key={name}>
                {name} tone
              </option>
            ))}
            {imported && <option value="custom">Your own: {imported}</option>}
          </select>
        </Field>
        <Field label="Your own adhan">
          <button
            type="button"
            class="button"
            onClick={() =>
              void actions.chooseSound().then((sound) => {
                if (!sound) return;
                if (sound.kind === "custom") setImported(sound.fileName);
                actions.patch({ alarmSound: sound });
              })
            }
          >
            Choose Audio File…
          </button>
        </Field>
        <Field label="Volume">
          <input type="range" min="0.1" max="1" step="0.05" value={settings.alarmVolume} onInput={(event) => actions.patch({ alarmVolume: Number(event.currentTarget.value) })} />
        </Field>
        <Field label="Try it">
          <span>
            <button type="button" class="button" onClick={actions.testAlarm}>
              Test Alarm
            </button>{" "}
            {snapshot.ringing && (
              <button type="button" class="button" onClick={actions.stopAlarm}>
                Stop
              </button>
            )}
          </span>
        </Field>
      </Section>

      <Section title="Reminder">
        <Field label="Remind me">
          <select value={settings.reminderMinutes} onChange={(event) => actions.patch({ reminderMinutes: Number(event.currentTarget.value) })}>
            <option value="0">Never</option>
            {REMINDERS.map((minutes) => (
              <option value={minutes} key={minutes}>
                {minutes} minutes before
              </option>
            ))}
          </select>
        </Field>
      </Section>
    </>
  );
}

function RunningOutTab({ settings, snapshot, now, format, actions }: { settings: AppSettings; snapshot: Snapshot; now: number; format: ClockFormat; actions: SettingsActions }) {
  const until = settings.alertsPausedUntil !== null && settings.alertsPausedUntil > now ? settings.alertsPausedUntil : null;
  return (
    <>
      <Section
        footer="From 20 minutes before a prayer's time ends, the island and card change colour and pulse until you mark it as prayed. Asr counts down to 20 minutes before Maghrib, after which delaying it is disliked."
      >
        <Toggle label="Alert me when a prayer's time is running out" checked={settings.endOfTimeAlerts} onChange={(on) => actions.patch({ endOfTimeAlerts: on })} />
      </Section>
      <Section
        footer="Every screen is covered until you press and hold Prayed, or the prayer's time ends. For Asr it comes 30 minutes before Maghrib and stays until Maghrib. There is no snooze. If you ever need the screen back at once, Ctrl+Alt+Q quits Namaz."
      >
        <Toggle label="Cover the screen in the last 10 minutes" checked={settings.endOfTimeCover} disabled={!settings.endOfTimeAlerts} onChange={(on) => actions.patch({ endOfTimeCover: on })} />
      </Section>
      <Section footer="A pause ends by itself. The adhan still rings while alerts are paused. The same menu is in the tray popover.">
        {until !== null ? (
          <Field label={`Paused until ${format.timeAndDay(until, now)}`}>
            <button type="button" class="button" onClick={actions.resume}>
              Resume
            </button>
          </Field>
        ) : (
          <Field label="Pause for a while" disabled={!settings.endOfTimeAlerts}>
            <PauseAlertsMenu onPause={actions.pause}>
              <span class="button">Pause Alerts</span>
            </PauseAlertsMenu>
          </Field>
        )}
      </Section>
      <span hidden>{snapshot.revision}</span>
    </>
  );
}

const pad = (value: number) => String(value).padStart(2, "0");

function CalculationTab({ settings, snapshot, now, actions }: { settings: AppSettings; snapshot: Snapshot; now: number; actions: SettingsActions }) {
  const zone = snapshot.timeZone;
  const config = settings.calculation;
  const patch = (changes: Partial<typeof config>) => actions.patch({ calculation: { ...config, ...changes } });
  const day = dayContaining(now, zone);
  // The calculated times, before any adjustment, for the day being shown.
  const calculated = prayerTimes(day, currentPlace(settings).coordinates, zone, { ...config, adjustments: {} });

  const clockOf = (instant: number) => {
    const { hour, minute } = localParts(instant, zone);
    return `${pad(hour)}:${pad(minute)}`;
  };

  return (
    <>
      <Section footer="The high-latitude rule only applies far from the equator in summer, when twilight lasts all night.">
        <Field label="Method">
          <select value={config.method} onChange={(event) => patch({ method: event.currentTarget.value as CalculationMethod })}>
            {(Object.keys(METHODS) as CalculationMethod[]).map((method) => (
              <option value={method} key={method}>
                {METHODS[method].name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Twilight">
          <span>{methodSummary(config.method)}</span>
        </Field>
        <Field label="Asr">
          <select value={config.madhab} onChange={(event) => patch({ madhab: event.currentTarget.value as AsrMadhab })}>
            {(Object.keys(MADHABS) as AsrMadhab[]).map((madhab) => (
              <option value={madhab} key={madhab}>
                {MADHABS[madhab]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="At high latitudes">
          <select value={config.highLatitudeRule} onChange={(event) => patch({ highLatitudeRule: event.currentTarget.value as HighLatitudeRule })}>
            {(Object.keys(HIGH_LATITUDE_RULES) as HighLatitudeRule[]).map((rule) => (
              <option value={rule} key={rule}>
                {HIGH_LATITUDE_RULES[rule]}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section
        title="Adjust Times"
        footer="Set each prayer to the time you want it. The difference from the calculated time is what is kept, so the adjustment carries over to every day."
      >
        {PRAYERS.map((prayer) => {
          const minutes = config.adjustments[prayer] ?? 0;
          return (
            <Field label={prayerName(prayer)} key={prayer}>
              {calculated ? (
                <span class="adjust">
                  <input
                    type="time"
                    value={clockOf(calculated.at(prayer) + minutes * 60)}
                    onChange={(event) => {
                      const [hour, minute] = event.currentTarget.value.split(":").map(Number);
                      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return;
                      const chosen = instantFromLocal(day, hour, minute, zone);
                      const change = minutesFromCalculatedToClockTimeOf(calculated.at(prayer), chosen);
                      const adjustments = { ...config.adjustments };
                      if (change === 0) delete adjustments[prayer];
                      else adjustments[prayer] = change;
                      patch({ adjustments });
                    }}
                  />
                  {minutes !== 0 && (
                    <>
                      <span class="dim">
                        {minutes > 0 ? "+" : "−"}
                        {Math.abs(minutes)} min
                      </span>
                      <button
                        type="button"
                        class="button"
                        onClick={() => {
                          const adjustments = { ...config.adjustments };
                          delete adjustments[prayer];
                          patch({ adjustments });
                        }}
                      >
                        Reset
                      </button>
                    </>
                  )}
                </span>
              ) : (
                <span class="dim">Not available here</span>
              )}
            </Field>
          );
        })}
      </Section>
    </>
  );
}

export function SettingsContent({
  tab,
  onTab,
  snapshot,
  now,
  format,
  actions,
}: {
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  snapshot: Snapshot;
  now: number;
  format: ClockFormat;
  actions: SettingsActions;
}) {
  const { settings } = snapshot;
  return (
    <div class="settings">
      <nav class="tabs" role="tablist">
        {SETTINGS_TABS.map((entry) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            class={`tab ${tab === entry.id ? "is-active" : ""}`}
            onClick={() => onTab(entry.id)}
            key={entry.id}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      <div class="settings-body">
        {tab === "general" && <GeneralTab settings={settings} actions={actions} format={format} />}
        {tab === "alarms" && <AlarmsTab settings={settings} snapshot={snapshot} actions={actions} />}
        {tab === "runningOut" && <RunningOutTab settings={settings} snapshot={snapshot} now={now} format={format} actions={actions} />}
        {tab === "calculation" && <CalculationTab settings={settings} snapshot={snapshot} now={now} actions={actions} />}
      </div>
    </div>
  );
}

export type { Place };
