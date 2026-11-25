import { open } from 'node:fs/promises';

// A WAV file's header, read for the clip that plays it: Live records a clip's file length in sample frames and its
// sample rate, and a clip for a file Live has never seen needs both.

export type WavHeader = { sampleRate: number; frames: number };

// Reads the header of the WAV at `path`. A WAV is a RIFF file of type WAVE: after its 12-byte RIFF header come its
// chunks, each a 4-byte id, a little-endian 4-byte size and a body of that size padded to an even length. The walk
// reads only each chunk's header and the fmt chunk's body, never the audio: the fmt chunk gives the sample rate and the
// block align, the bytes of one frame, and the data chunk's size over the block align is the frames. A data chunk whose
// size runs past the end of the file, as an interrupted copy leaves one, holds only the bytes the file has. Other chunks,
// such as the LIST chunk pad packs carry, are stepped over. The format code is not checked, so a 24-bit or float WAV
// reads as a 16-bit one does. Throws on a file that is not a RIFF WAVE with both chunks.
export async function readWavHeader(path: string): Promise<WavHeader> {
  const file = await open(path);
  try {
    const { size } = await file.stat();
    const read = async (position: number, length: number) => {
      const bytes = Buffer.alloc(length);
      const { bytesRead } = await file.read(bytes, 0, length, position);
      return bytes.subarray(0, bytesRead);
    };
    const riff = await read(0, 12);
    if (riff.length < 12 || riff.toString('latin1', 0, 4) !== 'RIFF' || riff.toString('latin1', 8, 12) !== 'WAVE') {
      throw new Error('it is not a RIFF WAVE file');
    }
    let format: { sampleRate: number; blockAlign: number } | undefined;
    let dataSize: number | undefined;
    for (let position = 12; position + 8 <= size && (format === undefined || dataSize === undefined); ) {
      const header = await read(position, 8);
      const length = header.readUInt32LE(4);
      const id = header.toString('latin1', 0, 4);
      if (id === 'fmt ') {
        const body = await read(position + 8, 16);
        if (body.length < 16) throw new Error('its fmt chunk is cut short');
        format = { sampleRate: body.readUInt32LE(4), blockAlign: body.readUInt16LE(12) };
      } else if (id === 'data') {
        dataSize = Math.min(length, size - position - 8);
      }
      position += 8 + length + (length % 2);
    }
    if (format === undefined) throw new Error('it has no fmt chunk');
    if (dataSize === undefined) throw new Error('it has no data chunk');
    if (format.sampleRate === 0 || format.blockAlign === 0) throw new Error('its fmt chunk gives no sample rate or frame size');
    return { sampleRate: format.sampleRate, frames: Math.floor(dataSize / format.blockAlign) };
  } finally {
    await file.close();
  }
}
