# Minimal OSC 1.0 over TCP (int32 length-prefixed) client, for the Eos Phase 0 scripts beside it.
import socket, struct, sys, time

def pad(b): return b + b"\0" * (-len(b) % 4)  # to a multiple of 4; ostr adds the terminator first
def ostr(s): return pad(s.encode() + b"\0") if isinstance(s, str) else pad(s + b"\0")

def msg(addr, *args):
    tags, data = ",", b""
    for a in args:
        if isinstance(a, str): tags += "s"; data += ostr(a)
        elif isinstance(a, float): tags += "f"; data += struct.pack(">f", a)
        elif isinstance(a, int): tags += "i"; data += struct.pack(">i", a)
    return ostr(addr) + ostr(tags) + data

def parse(p):
    def rs(i):
        j = p.index(b"\0", i); s = p[i:j].decode("utf-8", "replace"); return s, (j // 4 + 1) * 4
    addr, i = rs(0)
    if i >= len(p): return addr, []
    tags, i = rs(i); out = []
    for t in tags[1:]:
        if t == "s": s, i = rs(i); out.append(s)
        elif t == "i": out.append(struct.unpack(">i", p[i:i+4])[0]); i += 4
        elif t == "f": out.append(round(struct.unpack(">f", p[i:i+4])[0], 4)); i += 4
        elif t == "T": out.append(True)
        elif t == "F": out.append(False)
        elif t == "N": out.append(None)
        else: out.append(f"<{t}>")
    return addr, out

class Eos:
    def __init__(self, host="127.0.0.1", port=3032):
        self.s = socket.create_connection((host, port), timeout=5); self.buf = b""
    def send(self, addr, *args):
        m = msg(addr, *args); self.s.sendall(struct.pack(">i", len(m)) + m)
    def recv(self, wait=1.0):
        self.s.settimeout(0.2); end = time.time() + wait; pkts = []
        while time.time() < end:
            try:
                d = self.s.recv(65536)
                if not d: break
                self.buf += d
            except socket.timeout: pass
            while len(self.buf) >= 4:
                n = struct.unpack(">i", self.buf[:4])[0]
                if len(self.buf) < 4 + n: break
                pkts.append(self.buf[4:4+n]); self.buf = self.buf[4+n:]
        return pkts
