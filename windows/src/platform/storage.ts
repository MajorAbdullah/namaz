import { isTauri } from "./runtime";

/** Settings and prayed marks, as JSON files in the app's data folder (localStorage in a browser). */
export async function loadJSON(name: string): Promise<unknown> {
  try {
    if (isTauri) {
      const { BaseDirectory, exists, readTextFile } = await import("@tauri-apps/plugin-fs");
      const file = `${name}.json`;
      if (!(await exists(file, { baseDir: BaseDirectory.AppData }))) return null;
      return JSON.parse(await readTextFile(file, { baseDir: BaseDirectory.AppData }));
    }
    const text = localStorage.getItem(`namaz:${name}`);
    return text ? JSON.parse(text) : null;
  } catch {
    // A missing or damaged file is the same as no file: start from the defaults.
    return null;
  }
}

export async function saveJSON(name: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value, null, 2);
  if (isTauri) {
    const { BaseDirectory, mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
    await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
    await writeTextFile(`${name}.json`, text, { baseDir: BaseDirectory.AppData });
  } else {
    localStorage.setItem(`namaz:${name}`, text);
  }
}
