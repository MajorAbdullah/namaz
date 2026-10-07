import type { Command, Snapshot } from "../app";
import { isTauri } from "./runtime";

/**
 * How windows talk to each other. The engine lives in one window and publishes snapshots; the
 * others draw them and send commands back. In a plain browser the same messages travel over a
 * BroadcastChannel, so the views can be tried without the shell.
 */
type Message =
  | { name: "state"; payload: Snapshot }
  | { name: "command"; payload: Command }
  | { name: "request-state" }
  | { name: string; payload?: unknown };

const channel = !isTauri && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("namaz") : null;

async function emit(message: Message): Promise<void> {
  if (isTauri) {
    const { emit: tauriEmit } = await import("@tauri-apps/api/event");
    await tauriEmit(`namaz:${message.name}`, "payload" in message ? (message.payload ?? null) : null);
  } else {
    channel?.postMessage(message);
  }
}

async function listen<T>(name: string, handler: (payload: T) => void): Promise<() => void> {
  if (isTauri) {
    const { listen: tauriListen } = await import("@tauri-apps/api/event");
    return tauriListen<T>(`namaz:${name}`, (event) => handler(event.payload));
  }
  const onMessage = (event: MessageEvent<Message>) => {
    if (event.data.name === name) handler(("payload" in event.data ? event.data.payload : null) as T);
  };
  channel?.addEventListener("message", onMessage);
  return () => channel?.removeEventListener("message", onMessage);
}

/** Anything else one window needs to tell another: the popover opening, the cover's options. */
export const publishEvent = (name: string, payload?: unknown) => emit({ name, payload });
export const onEvent = <T = undefined>(name: string, handler: (payload: T) => void) => listen<T>(name, handler);

export const publishState = (snapshot: Snapshot) => emit({ name: "state", payload: snapshot });
export const sendCommand = (command: Command) => emit({ name: "command", payload: command });
export const requestState = () => emit({ name: "request-state" });
export const onState = (handler: (snapshot: Snapshot) => void) => listen<Snapshot>("state", handler);
export const onCommand = (handler: (command: Command) => void) => listen<Command>("command", handler);
export const onStateRequest = (handler: () => void) => listen<null>("request-state", handler);
