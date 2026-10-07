//! The shell around Namaz's web views: the plugins they use, a native clock tick, and the few
//! things a web page cannot do for itself. Everything the app decides lives in `src/`.

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, RunEvent};

/// Switches for exercising the app without waiting for a real prayer time, read from the
/// environment:
///
/// ```text
/// NAMAZ_FAKE_NOW=2026-10-04T18:15:50+05:00   start the clock at this instant
/// NAMAZ_TZ=Asia/Karachi                      use this time zone instead of the computer's
/// NAMAZ_MUTE=1                               play alarm sounds at zero volume
/// ```
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Diagnostics {
    fake_now: Option<String>,
    time_zone: Option<String>,
    mute: bool,
}

fn read_diagnostics(var: impl Fn(&str) -> Option<String>) -> Diagnostics {
    let nonempty = |name: &str| var(name).filter(|value| !value.trim().is_empty());
    Diagnostics {
        fake_now: nonempty("NAMAZ_FAKE_NOW"),
        time_zone: nonempty("NAMAZ_TZ"),
        mute: var("NAMAZ_MUTE").is_some(),
    }
}

#[tauri::command]
fn diagnostics() -> Diagnostics {
    read_diagnostics(|name| std::env::var(name).ok())
}

/// Quits the whole app. The windows cannot, since the hidden one that runs it must outlive them.
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

pub fn run() {
    let app = tauri::Builder::default()
        // Opening Namaz again while it runs shows its settings, as on the Mac.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.emit("second-instance", ());
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![diagnostics, quit_app])
        .setup(|app| {
            // A native tick about once a second. The window that keeps time is hidden, and a
            // hidden web view may hold back its own timers, but not messages sent to it.
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_secs(1));
                let _ = handle.emit("beat", ());
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Namaz");

    app.run(|_app, event| {
        // Closing every visible window must not end the app: it lives in the tray. Only
        // `quit_app` (an explicit exit, which carries a code) does.
        if let RunEvent::ExitRequested { api, code, .. } = event {
            if code.is_none() {
                api.prevent_exit();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn env(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        move |name| map.get(name).cloned()
    }

    #[test]
    fn nothing_set_means_a_normal_run() {
        assert_eq!(
            read_diagnostics(env(&[])),
            Diagnostics { fake_now: None, time_zone: None, mute: false }
        );
    }

    #[test]
    fn each_switch_is_read_by_its_name() {
        let diagnostics = read_diagnostics(env(&[
            ("NAMAZ_FAKE_NOW", "2026-10-04T18:15:50+05:00"),
            ("NAMAZ_TZ", "Asia/Karachi"),
            ("NAMAZ_MUTE", "1"),
        ]));
        assert_eq!(diagnostics.fake_now.as_deref(), Some("2026-10-04T18:15:50+05:00"));
        assert_eq!(diagnostics.time_zone.as_deref(), Some("Asia/Karachi"));
        assert!(diagnostics.mute);
    }

    #[test]
    fn an_empty_value_is_the_same_as_none() {
        assert_eq!(read_diagnostics(env(&[("NAMAZ_FAKE_NOW", "  ")])).fake_now, None);
    }
}
