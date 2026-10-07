// Writes the short alert tones the app ships with as 16-bit mono WAV files, so that they need no
// licence and no audio tools. Run once; the output is committed.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RATE = 44_100;
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "tones");
mkdirSync(out, { recursive: true });

/** A struck bell: a few inharmonic partials that fade at their own rates. */
function strike(seconds, partials) {
  const samples = new Float32Array(Math.floor(seconds * RATE));
  for (const { hz, gain, decay } of partials) {
    for (let i = 0; i < samples.length; i++) {
      const t = i / RATE;
      samples[i] += gain * Math.sin(2 * Math.PI * hz * t) * Math.exp(-decay * t);
    }
  }
  // A short fade in, so it does not click.
  const fade = Math.floor(0.004 * RATE);
  for (let i = 0; i < fade; i++) samples[i] *= i / fade;
  return samples;
}

function wav(samples) {
  const peak = Math.max(...samples.map(Math.abs)) || 1;
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => data.writeInt16LE(Math.round((value / peak) * 0.8 * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const tones = {
  Bell: strike(2.2, [
    { hz: 523.25, gain: 1, decay: 2.2 },
    { hz: 1318.5, gain: 0.5, decay: 3.5 },
    { hz: 1568, gain: 0.3, decay: 4.5 },
  ]),
  Glass: strike(1.6, [
    { hz: 1046.5, gain: 1, decay: 3.2 },
    { hz: 2093, gain: 0.45, decay: 5 },
    { hz: 3136, gain: 0.2, decay: 7 },
  ]),
  Soft: strike(2.0, [
    { hz: 392, gain: 1, decay: 2.6 },
    { hz: 784, gain: 0.35, decay: 3.8 },
  ]),
};

for (const [name, samples] of Object.entries(tones)) {
  writeFileSync(join(out, `${name}.wav`), wav(samples));
  console.log(`${name}.wav ${(samples.length / RATE).toFixed(1)}s`);
}
