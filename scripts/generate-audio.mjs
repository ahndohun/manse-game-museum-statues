import { writeFile } from "node:fs/promises";

const sampleRate = 22_050;
const durationSeconds = 1.18;
const sampleCount = Math.floor(sampleRate * durationSeconds);
const data = Buffer.alloc(sampleCount * 2);
const notes = [523.25, 659.25, 783.99, 1046.5];

for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate;
  let signal = 0;
  for (let note = 0; note < notes.length; note += 1) {
    const start = note * 0.17;
    const age = time - start;
    if (age < 0 || age > 0.62) continue;
    const attack = Math.min(1, age / 0.018);
    const release = Math.max(0, 1 - age / 0.62) ** 1.7;
    signal += Math.sin(age * notes[note] * Math.PI * 2) * attack * release * 0.22;
    signal += Math.sin(age * notes[note] * Math.PI * 4) * attack * release * 0.035;
  }
  const shimmer = Math.sin(time * 2093 * Math.PI * 2) * Math.max(0, 1 - time / durationSeconds) * 0.018;
  const sample = Math.max(-1, Math.min(1, signal + shimmer));
  data.writeInt16LE(Math.round(sample * 32767), index * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

await writeFile("public/packs/museum-statues/assets/audio/masterpiece.wav", Buffer.concat([header, data]));
console.log("Generated original Museum Statues masterpiece chime.");
