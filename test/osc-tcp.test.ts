import { describe, expect, it } from 'vitest';
import { frame, packetReader } from '../src/server/osc-tcp.ts';
import { encode } from '../src/shared/osc.ts';

// OSC 1.0 packet-length framing, as Eos speaks it on TCP 3032: each packet goes out behind a 4-byte
// big-endian int32 of its length. TCP hands the bytes over in chunks that need not line up with the
// packets, so the reader is fed the chunks a test cuts by hand.

// Two packets recorded from Eos (test/fixtures/eos/read-cue-list.json): the count reply and the
// label of cue 3.5.
const COUNT = Buffer.from('2f656f732f6f75742f6765742f6375652f312f636f756e74000000002c69000000000009', 'hex');
const FIRE = encode('/eos/cue/1/3.5/fire');

describe('frame', () => {
  it('puts the packet behind its length as a big-endian int32', () => {
    expect(frame(COUNT).toString('hex')).toBe(`00000024${COUNT.toString('hex')}`);
  });
});

describe('the packet reader', () => {
  it('reassembles a message split across two reads exactly', () => {
    const reader = packetReader();
    const bytes = frame(COUNT);

    expect(reader.push(bytes.subarray(0, 13))).toEqual([]);
    expect(reader.push(bytes.subarray(13))).toEqual([COUNT]);
  });

  it('hands out two messages that came in one read, in order, exactly', () => {
    const reader = packetReader();

    expect(reader.push(Buffer.concat([frame(COUNT), frame(FIRE)]))).toEqual([COUNT, FIRE]);
  });

  it('keeps a length prefix split across reads, and the packet after it', () => {
    const reader = packetReader();
    const bytes = Buffer.concat([frame(FIRE), frame(COUNT)]);
    // The second packet's length is bytes FIRE.length + 4 to FIRE.length + 8; the cuts fall inside it.
    const cut = FIRE.length + 6;

    expect(reader.push(bytes.subarray(0, 2))).toEqual([]);
    expect(reader.push(bytes.subarray(2, cut))).toEqual([FIRE]);
    expect(reader.push(bytes.subarray(cut, cut + 1))).toEqual([]);
    expect(reader.push(bytes.subarray(cut + 1))).toEqual([COUNT]);
  });

  it('takes a packet one byte at a time', () => {
    const reader = packetReader();
    const out = [...frame(COUNT)].flatMap((byte) => reader.push(Buffer.from([byte])));

    expect(out).toEqual([COUNT]);
  });
});
