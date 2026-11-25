// The part of OSC 1.0 that AbletonOSC uses: messages with int32, float32, string and boolean
// arguments. A boolean is the type tag T or F with no data, as python-osc sends a Python bool.
// https://opensoundcontrol.stanford.edu/spec-1_0.html

export type OscArgument = number | string | boolean;

export type OscMessage = {
  address: string;
  args: OscArgument[];
  // The type tag string without its comma, such as 'if'. An int32 and a float32 both decode to a
  // number, and python-osc hands AbletonOSC an int or a float by this tag.
  types: string;
};

// A number argument goes out as float32 unless it is marked as an int32.
export type OscOutArgument = OscArgument | { int: number };

export function encode(address: string, args: OscOutArgument[] = []): Buffer {
  let tags = ',';
  const parts: Buffer[] = [];
  for (const arg of args) {
    if (typeof arg === 'string') {
      tags += 's';
      parts.push(oscString(arg));
    } else if (typeof arg === 'boolean') {
      tags += arg ? 'T' : 'F';
    } else if (typeof arg === 'number') {
      tags += 'f';
      const part = Buffer.alloc(4);
      part.writeFloatBE(arg);
      parts.push(part);
    } else {
      tags += 'i';
      const part = Buffer.alloc(4);
      part.writeInt32BE(arg.int);
      parts.push(part);
    }
  }
  return Buffer.concat([oscString(address), oscString(tags), ...parts]);
}

// Returns null for a packet that is not a well-formed OSC message, so a stray datagram never throws.
export function decode(packet: Buffer): OscMessage | null {
  try {
    const address = readString(packet, 0);
    if (!address.value.startsWith('/')) return null;
    const tags = readString(packet, address.next);
    if (!tags.value.startsWith(',')) return null;

    const args: OscArgument[] = [];
    let offset = tags.next;
    for (const tag of tags.value.slice(1)) {
      if (tag === 'i') {
        args.push(packet.readInt32BE(offset));
        offset += 4;
      } else if (tag === 'f') {
        args.push(packet.readFloatBE(offset));
        offset += 4;
      } else if (tag === 's') {
        const string = readString(packet, offset);
        args.push(string.value);
        offset = string.next;
      } else if (tag === 'T' || tag === 'F') {
        args.push(tag === 'T');
      } else {
        return null;
      }
    }
    return { address: address.value, args, types: tags.value.slice(1) };
  } catch {
    return null;
  }
}

function oscString(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  // At least one null, then nulls up to a multiple of four bytes.
  return Buffer.concat([bytes, Buffer.alloc(4 - (bytes.length % 4))]);
}

function readString(packet: Buffer, offset: number): { value: string; next: number } {
  const end = packet.indexOf(0, offset);
  if (end === -1) throw new RangeError('Unterminated OSC string');
  return { value: packet.toString('utf8', offset, end), next: offset + Math.ceil((end - offset + 1) / 4) * 4 };
}
