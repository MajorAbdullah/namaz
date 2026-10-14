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

/// What kind of desktop session this is. Wayland ignores where windows are asked to go and never
/// delivers global shortcuts, so the pages skip or back those up there. `XDG_SESSION_TYPE` is what
/// the login manager says; `WAYLAND_DISPLAY` covers sessions started without one.
fn read_session_kind(var: impl Fn(&str) -> Option<String>) -> &'static str {
    match var("XDG_SESSION_TYPE").map(|value| value.trim().to_ascii_lowercase()).as_deref() {
        Some("wayland") => "wayland",
        Some("x11") => "x11",
        _ if var("WAYLAND_DISPLAY").is_some_and(|value| !value.trim().is_empty()) => "wayland",
        _ if var("DISPLAY").is_some_and(|value| !value.trim().is_empty()) => "x11",
        _ => "other",
    }
}

#[tauri::command]
fn session_kind() -> &'static str {
    if cfg!(target_os = "linux") {
        read_session_kind(|name| std::env::var(name).ok())
    } else {
        "other"
    }
}

/// Quits the whole app. The windows cannot, since the hidden one that runs it must outlive them.
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// WebKitGTK, the web view on Linux, ignores the `--autoplay-policy` argument WebView2 is given and
/// refuses to play sound that no click started, which is every adhan. Its own setting allows it.
/// Set on each page load, so windows made later from script get it too.
#[cfg(target_os = "linux")]
fn allow_sound_without_a_click<R: tauri::Runtime>(webview: &tauri::Webview<R>) {
    let _ = webview.with_webview(|platform| {
        use webkit2gtk::{SettingsExt, WebViewExt};
        if let Some(settings) = platform.inner().settings() {
            settings.set_media_playback_requires_user_gesture(false);
        }
    });
}

pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "linux")]
    let builder = builder.on_page_load(|webview, _| allow_sound_without_a_click(webview));
    let app = builder
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
        .invoke_handler(tauri::generate_handler![diagnostics, quit_app, session_kind])
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

    #[test]
    fn the_session_type_names_the_session() {
        assert_eq!(read_session_kind(env(&[("XDG_SESSION_TYPE", "wayland")])), "wayland");
        assert_eq!(read_session_kind(env(&[("XDG_SESSION_TYPE", "X11")])), "x11");
        // XWayland sets DISPLAY as well; the session type wins.
        assert_eq!(
            read_session_kind(env(&[("XDG_SESSION_TYPE", "wayland"), ("DISPLAY", ":0")])),
            "wayland"
        );
    }

    #[test]
    fn without_a_session_type_the_displays_decide() {
        assert_eq!(read_session_kind(env(&[("WAYLAND_DISPLAY", "wayland-0"), ("DISPLAY", ":0")])), "wayland");
        assert_eq!(read_session_kind(env(&[("DISPLAY", ":0")])), "x11");
        assert_eq!(read_session_kind(env(&[("XDG_SESSION_TYPE", "tty")])), "other");
        assert_eq!(read_session_kind(env(&[])), "other");
    }
}
