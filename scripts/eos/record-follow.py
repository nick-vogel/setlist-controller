# Phase 0 addendum for setlist-controller#138: record a cue list with a follow, a hang and links.
#
#   python3 scripts/eos/record-follow.py test/fixtures/eos
#
# Needs a show with cue list 99, built over OSC with the commands in test/fixtures/eos/README.md:
# 99/1 follow 1 s; 99/2 follow 1 s, link 99/4; 99/3 plain; 99/4 hang 1 s; 99/5 follow 1 s, link 99/3. Each cue has a 1 s fade.
import json, os, socket, struct, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eososc import msg, parse

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
s = socket.create_connection(("127.0.0.1", 3032), timeout=5); s.settimeout(0.1)
buf = b""; log = []; t0 = time.time()
META = {"eos_version": "3.3.10 (ETCnomad, macOS)", "transport": "TCP 127.0.0.1:3032, OSC 1.0 packet-length framing"}

def note(d, pkt):
    a, args = parse(pkt)
    log.append({"t_ms": int((time.time() - t0) * 1000), "dir": d, "address": a, "args": args, "hex": pkt.hex()})

def pump(sec):
    global buf
    end = time.time() + sec
    while time.time() < end:
        try:
            d = s.recv(65536)
            if not d: raise SystemExit("eos closed the connection")
            buf += d
        except socket.timeout: pass
        while len(buf) >= 4:
            n = struct.unpack(">i", buf[:4])[0]
            if len(buf) < 4 + n: break
            note("eos->app", buf[4:4+n]); buf = buf[4+n:]

def send(addr, *args):
    m = msg(addr, *args); note("app->eos", m); s.sendall(struct.pack(">i", len(m)) + m)

def scenario(name, desc, steps, after):
    global log, t0
    log = []; t0 = time.time()
    for st in steps: send(*st) if isinstance(st, tuple) else pump(st)
    pump(after)
    with open(os.path.join(OUT, name + ".json"), "w") as f:
        json.dump({"scenario": name, "description": desc, **META, "packets": log}, f, indent=1)
    print("wrote", name, len(log), "packets", flush=True)

pump(2.0)
scenario("read-follow-list", "Cue list 99: count, then every cue by index 0 to 5 (5 is past the end). Arguments 19 to 21 of each list reply are link, follow time and hang time.",
         [("/eos/get/cue/99/count",)] + [("/eos/get/cue/99/index", i) for i in range(6)], after=2.0)
scenario("fire-follow-chain", "The app fires 99/1 only. Eos then fires 99/2 by its follow, 99/4 by 99/2's link, 99/5 by 99/4's hang, and 99/3 by 99/5's link, and stops.",
         [("/eos/cue/99/1/fire",)], after=10.0)
