// OSC 1.0 packet-length framing for OSC over TCP, as Eos speaks it on port 3032: each packet goes
// out behind a 4-byte big-endian int32 of its length. The packets themselves are the OSC codec's
// (src/shared/osc.ts). TCP hands the bytes over in chunks that need not line up with the packets, so
// the reader keeps a partial packet, or a partial length, until the rest comes.
// https://opensoundcontrol.stanford.edu/spec-1_0.html

const LENGTH_BYTES = 4;

export function frame(packet: Buffer): Buffer {
  const length = Buffer.alloc(LENGTH_BYTES);
  length.writeUInt32BE(packet.length);
  return Buffer.concat([length, packet]);
}

export type PacketReader = {
  // Takes the next chunk read from the connection, and returns every packet it completes, in order,
  // or none.
  push(chunk: Buffer): Buffer[];
};

// One reader per connection: a new connection starts with no partial packet.
export function packetReader(): PacketReader {
  let pending: Buffer = Buffer.alloc(0);
  return {
    push(chunk) {
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      const packets: Buffer[] = [];
      for (;;) {
        if (pending.length < LENGTH_BYTES) break;
        const end = LENGTH_BYTES + pending.readUInt32BE(0);
        if (pending.length < end) break;
        packets.push(Buffer.from(pending.subarray(LENGTH_BYTES, end)));
        pending = pending.subarray(end);
      }
      return packets;
    },
  };
}
