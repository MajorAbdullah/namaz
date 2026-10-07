import { isTauri } from "./runtime";

let permitted: Promise<boolean> | null = null;

async function allowed(): Promise<boolean> {
  if (!isTauri) return false;
  permitted ??= (async () => {
    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
    return (await isPermissionGranted()) || (await requestPermission()) === "granted";
  })();
  return permitted;
}

/**
 * Posts a toast. These are a companion to the in-app alarm, not the alarm itself: they carry no
 * sound, because the app plays its own, and the alarm still rings, with its Stop button, if the
 * user has notifications turned off.
 */
export async function notify(title: string, body: string): Promise<void> {
  try {
    if (!(await allowed())) return;
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title, body, silent: true });
  } catch {
    // The toast is optional.
  }
}
