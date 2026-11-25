# Phase 0 of setlist-controller#108 (ticket #150): record what Eos sends and receives, for the fake Eos to replay.
#
#   python3 scripts/eos/record-eos-fixtures.py test/fixtures/eos
#   python3 scripts/eos/record-eos-fixtures.py --edge-cases test/fixtures/eos
#   python3 scripts/eos/record-eos-fixtures.py --before-wrap test/fixtures/eos
#   python3 scripts/eos/record-eos-fixtures.py --wrap test/fixtures/eos
#   python3 scripts/eos/record-eos-fixtures.py --lights test/fixtures/eos
#   python3 scripts/eos/record-eos-fixtures.py --lights-confirm-off test/fixtures/eos
#   python3 scripts/eos/record-eos-fixtures.py --lights-again test/fixtures/eos
#   python3 scripts/eos/record-eos-fixtures.py --lights-chain test/fixtures/eos
#
# Without a --lights flag, needs the test show from build-eos-test-show.py in cue list 1 of the show
# open in Eos on this Mac, in Live. Connects to TCP 3032 with OSC 1.0 packet-length framing, runs each scenario, and
# writes one JSON file per scenario. The last scenario waits up to 15 minutes for a cue fired by hand at the console.
# When no fire comes in that wait, it leaves fire-by-hand.json as it was, prints NO FIRE SEEN, and exits non-zero.
#
# --edge-cases records only the scenarios setlist-controller#259 added, and writes no other file: the ping, the
# connect with no active cue, a Go on the last cue, a Back on the first cue, and a Back during a fade then a Go. None
# waits for the console.
#
# --before-wrap and --wrap record only the scenarios setlist-controller#286 added, each writing no other file, and
# each stops before it reads or sends anything unless the command line reads LIVE. --before-wrap runs with cue list 1's
# Go From Last and Back From First not set to Wrap: it reads cue list 1's properties, records, renumbers and deletes
# cue 1/9 on the command line, then 1/11 the same way while subscribed to notifies, links cue 1/4 to a cue in a
# temporary cue list 99, and fires a cue by number as a follow in list 99 is due to fire it. It ends with list 1 as
# it started and no list 99. --wrap runs after Nick has set both to Wrap by hand: it reads the properties again,
# then records a Go on the last cue and a Back on the first.
#
# --lights, --lights-confirm-off and --lights-again record only the scenarios setlist-controller#498 added, what the
# lights step of the set build (setlist-controller#247) sends, and write no other file. They do not run on the test
# show above. They run on a test copy of the church show, a copy of the show file whose file name holds "Colour test",
# open in Eos in Live: cue list 1 with cues 1, 11, 22, 35 and 36 and no cue 22.5 or 23, RGB fixtures on channels 1 to
# 3 and 16 to 18, and a dimmer on channel 24. Each reads the open show's path first, and again before each scenario,
# and sends nothing else unless the command line reads LIVE and the file name holds "Colour test". They change the
# test copy: colours in cues 1/1, 1/11 and 1/22, the label of 1/1, and --lights saves the show, which Eos writes as a
# new file. --lights runs with Record Confirm on, as the church show has it. --lights-confirm-off runs after Nick has
# turned Record Confirm off by hand, and records the Record Only alone. Each of the two stops when Eos answers the
# Record Only the other way. --lights-again runs after them with Record Confirm on or off: a Record Only of the colour
# a cue already holds, a Record Only of a new colour while subscribed, each with the cue read before and after, and a
# Copy To onto cue 1/22.5, which it deletes.
#
# --lights-chain records only the scenarios setlist-controller#508 added, on the same test copy and behind the same
# guard: a song cue that runs on into the next cue. It stops before it writes anything unless cue 1/22 has no link,
# follow or hang and there is no cue 1/23. It gives 1/22 a follow of 3 s, then records a Go To Cue in no time onto it,
# the lights step's own commands on it, a fire by number, a Copy To onto 1/23 and a fire with the copy in the list,
# then the same Go To Cue with a hang of 2 s. It takes the follow, the hang and the copy away again, whichever
# scenario stopped it, reads the list to show that, and does not save. Each Go To Cue and each fire of 1/22 shows on
# the lights, and the fires run on into 1/35 or the copy.
import argparse, json, os, socket, struct, sys, time
sys.path.insert(0, os.path.dirname(__file__))
from eososc import msg, parse

EOS_VERSION = "3.3.10 (ETCnomad, macOS)"
TRANSPORT = "TCP 127.0.0.1:3032, OSC 1.0 packet-length framing"

class Recorder:
    """One connection to Eos, and the log of the scenario being recorded on it."""
    def __init__(self, sock, clock=time.time):
        self.s = sock; self.clock = clock; self.buf = b""; self.log = []; self.t0 = clock()
        self.cmdline = None  # the OSC user's command line as Eos last sent it

    def start(self):
        self.log = []; self.t0 = self.clock()

    def reconnect(self, connect):
        """Closes this connection, then goes on with a fresh one, as the app does after a drop."""
        self.s.close(); self.buf = b""; self.s = connect()

    def note(self, d, pkt):
        a, args = parse(pkt)
        if d == "eos->app" and a == "/eos/out/cmd" and args: self.cmdline = args[0]
        self.log.append({"t_ms": int((self.clock() - self.t0) * 1000), "dir": d, "address": a, "args": args, "hex": pkt.hex()})
        return a, args

    def pump(self, sec, until=None):
        end = self.clock() + sec
        while self.clock() < end:
            try:
                d = self.s.recv(65536)
                if not d: raise SystemExit("eos closed the connection")
                self.buf += d
            except socket.timeout: pass
            while len(self.buf) >= 4:
                n = struct.unpack(">i", self.buf[:4])[0]
                if len(self.buf) < 4 + n: break
                a, args = self.note("eos->app", self.buf[4:4+n]); self.buf = self.buf[4+n:]
                if until and until(a, args): return True
        return False

    def send(self, addr, *args):
        m = msg(addr, *args); self.note("app->eos", m); self.s.sendall(struct.pack(">i", len(m)) + m)

def write(rec, out, name, desc):
    with open(os.path.join(out, name + ".json"), "w") as f:
        json.dump({"scenario": name, "description": desc, "eos_version": EOS_VERSION, "transport": TRANSPORT,
                   "packets": rec.log}, f, indent=1)

def scenario(rec, out, name, desc, steps, after=3.0):
    rec.start()
    for st in steps:  # a message to send, a command line to run (a function), or a wait in seconds
        if isinstance(st, tuple): rec.send(*st)
        elif callable(st): st()
        else: rec.pump(st)
    rec.pump(after)
    write(rec, out, name, desc)
    print("wrote", name, len(rec.log), "packets", flush=True)

# By hand: wait for Nick to fire a cue at the console.
def fire_by_hand(rec, out, wait=900):
    rec.start()
    print("WAITING for a cue fired by hand", flush=True)
    got = rec.pump(wait, until=lambda a, args: a.startswith("/eos/out/event/cue/") and a.endswith("/fire"))
    if not got: raise SystemExit("NO FIRE SEEN: fire-by-hand.json left as it was")  # the wait alone is no recording
    fire_t = rec.log[-1]["t_ms"]
    rec.log = [x for x in rec.log if x["t_ms"] >= fire_t - 3000]  # keep 3 s before the fire, drop the wait
    rec.pump(7)
    write(rec, out, "fire-by-hand", "The operator fires a cue at the console by hand (Go To Cue 6 on the virtual keyboard). The app sends nothing.")
    print("wrote fire-by-hand", len(rec.log), "packets", "GOT FIRE", flush=True)

def newcmd(rec, text, wait=2.0):
    """Runs one command line and records what Eos sends for `wait` s. A command line Eos rejects stops the run, since
    the scenarios after it would record from the wrong state."""
    rec.send("/eos/newcmd", text)
    if rec.pump(wait, until=lambda a, args: a == "/eos/out/cmd" and "Error" in str(args)):
        raise SystemExit(f"Eos rejected {text!r}: {rec.log[-1]['args'][0]}")

def require_live(rec):
    """Stops the run unless the command line reads LIVE. Patch and Live share the command line, so a cue command run
    in Patch would do something else."""
    if not str(rec.cmdline).startswith("LIVE"):
        raise SystemExit(f"The command line does not read LIVE: {rec.cmdline!r}")

def command(rec, text, wait=2.0):
    """newcmd, once the command line reads LIVE."""
    require_live(rec); newcmd(rec, text, wait)

def park(rec, cue, live=False):
    """Goes to cue 1/<cue> in no time and lets Eos settle, so the next scenario starts from a known state. With `live`,
    first confirms the command line reads LIVE."""
    (command if live else newcmd)(rec, f"Go_To_Cue 1 / {cue} Time 0#")

def default_scenarios(rec, out):
    scenario(rec, out, "connect", "Everything Eos sends after the TCP connect, before the app sends anything.", [])

    park(rec, 8)  # park on the last cue, so each scenario starts from a known state

    scenario(rec, out, "read-cue-list", "Count, count without parts, then every cue by index 0 to 9 (index 9 is past the end).",
             [("/eos/get/cue/1/count",), ("/eos/get/cue/1/noparts/count",)] + [("/eos/get/cue/1/index", i) for i in range(10)])
    scenario(rec, out, "read-missing", "Reads for a cue that does not exist (1/99) and a cue list that does not exist (list 2).",
             [("/eos/get/cue/1/99",), ("/eos/get/cue/2/count",), ("/eos/get/cuelist/2",), ("/eos/get/cuelist/count",)])
    scenario(rec, out, "fire", "The app fires cue 1/3 (Goodness of God / Chorus), no argument.", [("/eos/cue/1/3/fire",)], after=7)
    scenario(rec, out, "fire-decimal", "The app fires cue 1/3.5 (Goodness of God / Bridge), no argument.", [("/eos/cue/1/3.5/fire",)], after=7)
    scenario(rec, out, "fire-missing", "The app fires cue 1/99, which does not exist.", [("/eos/cue/1/99/fire",)], after=3)
    scenario(rec, out, "go", "Go on cue list 1 after cue 3.5 completed: /eos/cues/1/fire.", [("/eos/cues/1/fire",)], after=7)
    scenario(rec, out, "back", "Back on cue list 1 with no fade running: /eos/cues/1/stop.", [("/eos/cues/1/stop",)], after=7)
    scenario(rec, out, "back-during-fade", "Fire cue 1/7, then Back after 1 s while the 5 s fade runs, then Back again 2 s later.",
             [("/eos/cue/1/7/fire",), 1.0, ("/eos/cues/1/stop",), 2.0, ("/eos/cues/1/stop",)], after=7)

    fire_by_hand(rec, out)

# setlist-controller#259: the replies the fake Eos only guessed, and the cue rules of setlist-controller#273.
def edge_cases(rec, connect, out):
    rec.start(); rec.pump(3.0)  # let the connect burst pass; connect.json already holds it

    # The lights' ping, as src/server/eos.ts sends it: /eos/ping with no argument, once a second.
    scenario(rec, out, "ping", "The app pings Eos twice, 1 s apart, as the lights do: /eos/ping, no argument.",
             [("/eos/ping",), 1.0, ("/eos/ping",)])

    # Go To Cue 0 on list 1 leaves it with no active cue and its first cue pending; then connect again.
    park(rec, 0); rec.reconnect(connect)
    scenario(rec, out, "connect-no-active-cue",
             "Everything Eos sends after the TCP connect, before the app sends anything, with no cue of cue list 1 "
             "active (after Go To Cue 1 / 0).", [])

    park(rec, 8)
    scenario(rec, out, "go-last-cue", "Go on cue list 1 with the last cue, 1/8, completed: /eos/cues/1/fire.",
             [("/eos/cues/1/fire",)], after=7)
    park(rec, 1)
    scenario(rec, out, "back-first-cue", "Back on cue list 1 with the first cue, 1/1, completed and no fade running: "
             "/eos/cues/1/stop.", [("/eos/cues/1/stop",)], after=7)
    park(rec, 6)
    scenario(rec, out, "back-during-fade-then-go", "From cue 1/6 completed, fire cue 1/7, then Back after 1 s while the "
             "5 s fade runs, then Go 2 s later.",
             [("/eos/cue/1/7/fire",), 1.0, ("/eos/cues/1/stop",), 2.0, ("/eos/cues/1/fire",)], after=7)

# setlist-controller#286, with cue list 1's Go From Last and Back From First not set to Wrap.
def before_wrap(rec, out):
    rec.start(); rec.pump(3.0); require_live(rec)  # the connect burst names the command line; connect.json holds it

    scenario(rec, out, "cuelist-properties-wrap-off", "Cue list 1's properties, /eos/get/cuelist/1, with Go From Last "
             "and Back From First as the show left them, not set to Wrap. Diff against cuelist-properties-wrap-on to "
             "find the field that holds Wrap.", [("/eos/get/cuelist/1",)], after=2.0)

    # Each edit runs on the OSC user's command line, standing in for the console's, 3 s apart.
    edit = lambda text: lambda: command(rec, text, wait=3.0)
    park(rec, 8, live=True)
    scenario(rec, out, "cue-edit-at-console", "From cue 1/8 completed, with the app sending nothing else, a cue is "
             "recorded, renumbered and deleted on the command line, 3 s apart: Record Cue 1 / 9, then Cue 1 / 9 "
             "Move_To Cue 1 / 10, then Delete Cue 1 / 10 with its confirmation, then the cue count of list 1. Every "
             "packet Eos sent, to show whether it notifies (/eos/out/notify/cue/1/...) for each edit.",
             [edit("Record Cue 1 / 9#"), edit("Cue 1 / 9 Move_To Cue 1 / 10#"), edit("Delete Cue 1 / 10 Enter Enter"),
              ("/eos/get/cue/1/count",)], after=3.0)

    # The same edits after /eos/subscribe=1, which the OSC Dictionary says Eos needs before it notifies, on cue numbers
    # of their own. Unsubscribed at the end, so the scenarios after it record Eos as the app, which never subscribes,
    # sees it.
    park(rec, 8, live=True)
    scenario(rec, out, "cue-edit-at-console-subscribed", "As cue-edit-at-console, after the app subscribes with "
             "/eos/subscribe 1 and waits 2 s: from cue 1/8 completed, Record Cue 1 / 11, then Cue 1 / 11 Move_To Cue "
             "1 / 12, then Delete Cue 1 / 12 with its confirmation, 3 s apart, then the cue count of list 1, then "
             "/eos/subscribe 0 3 s later. Every packet Eos sent, to show what it notifies for each edit once "
             "subscribed.",
             [("/eos/subscribe", 1), 2.0, edit("Record Cue 1 / 11#"), edit("Cue 1 / 11 Move_To Cue 1 / 12#"),
              edit("Delete Cue 1 / 12 Enter Enter"), ("/eos/get/cue/1/count",), 3.0, ("/eos/subscribe", 0)],
             after=2.0)

    park(rec, 8, live=True)
    command(rec, "Record Cue 99 / 1 Time 1#")
    scenario(rec, out, "link-to-another-list", "With cue 99/1 recorded in a temporary cue list 99, cue 1/4 is linked "
             "to it (Cue 1 / 4 Link 99 / 1), then read with /eos/get/cue/1/4, and list 99 read with "
             "/eos/get/cuelist/99. Shows the link to a cue in another list (argument 19 of the list/0/31 reply) "
             "and the cues that link to list 99. The run then clears the link and deletes list 99.",
             [lambda: command(rec, "Cue 1 / 4 Link 99 / 1#"), ("/eos/get/cue/1/4",), ("/eos/get/cuelist/99",)],
             after=2.0)
    command(rec, "Cue 1 / 4 Link#")
    command(rec, "Delete Cue 99 / Enter Enter")

    # 99/3 is there so a follow that still runs after 99/2 is fired by number shows as a fire of 99/3.
    park(rec, 8, live=True)
    for cue in (1, 2, 3): command(rec, f"Record Cue 99 / {cue} Time 1#")
    command(rec, "Cue 99 / 1 Follow 1#")
    scenario(rec, out, "fire-racing-follow", "In a temporary cue list 99 (99/1 with a follow of 1 s, then 99/2 and "
             "99/3, each a 1 s fade), the app fires 99/1, then fires 99/2 by number 1 s later, as 99/1's follow is due "
             "to fire it. Shows whether Eos sends one fire event for 99/2 or two, and whether the follow fires 99/3 "
             "instead. The run then deletes list 99.",
             [("/eos/cue/99/1/fire",), 1.0, ("/eos/cue/99/2/fire",)], after=7)
    command(rec, "Delete Cue 99 / Enter Enter")

# setlist-controller#286, after Nick has set cue list 1's Go From Last and Back From First to Wrap by hand.
def wrap(rec, out):
    rec.start(); rec.pump(3.0); require_live(rec)

    scenario(rec, out, "cuelist-properties-wrap-on", "Cue list 1's properties, /eos/get/cuelist/1, after Go From Last "
             "and Back From First were set to Wrap by hand in the Cue List Index. Diff against "
             "cuelist-properties-wrap-off to find the field that holds Wrap.", [("/eos/get/cuelist/1",)], after=2.0)
    park(rec, 8, live=True)
    scenario(rec, out, "go-last-cue-wrap", "Go on cue list 1 with the last cue, 1/8, completed, and Go From Last set "
             "to Wrap: /eos/cues/1/fire.", [("/eos/cues/1/fire",)], after=7)
    park(rec, 1, live=True)
    scenario(rec, out, "back-first-cue-wrap", "Back on cue list 1 with the first cue, 1/1, completed and no fade "
             "running, and Back From First set to Wrap: /eos/cues/1/stop.", [("/eos/cues/1/stop",)], after=7)

# setlist-controller#498: what the lights step of the set build sends, on a test copy of the church show.
TEST_COPY = "Colour test"  # the open show's file name has to hold this, or a lights mode sends only the read of the path
COLOUR_CHANNELS = (1, 2, 3, 16, 17, 18)  # the six colour lights, RGB fixtures
RECORD_ONLY = "Chan 1 Thru 3 + 16 Thru 18 Record_Only Cue 1 / {}#"  # COLOUR_CHANNELS, as the spec writes the command
FIRST_SONG = 1  # the first song cue of cue list 1
LATER_CUES = (11, 22, 35, 36)  # the two other song cues, then the two cues after them
TEAL = (20.0, 90.0, 100.0)  # red, green and blue, 0 to 100, that no cue of the show holds
AMBER = (100.0, 70.0, 20.0)  # another one

def require_test_copy(rec):
    """Stops the run unless the command line reads LIVE and the open show is the test copy. The read of the path is the
    one thing a lights mode sends before it knows. The folder does not count, only the file name."""
    require_live(rec); rec.send("/eos/get/show/path")
    if not rec.pump(2.0, until=lambda a, args: a == "/eos/out/get/show/path"):
        raise SystemExit("Eos did not answer /eos/get/show/path")
    path = str((rec.log[-1]["args"] or [""])[0])
    if TEST_COPY not in os.path.basename(path):
        raise SystemExit(f"The open show is not the test copy, so nothing was sent: {path!r}")

def guarded(rec, out, name, desc, steps, after=2.0):
    """A scenario that runs only on the test copy. The check is not part of the recording."""
    require_test_copy(rec); scenario(rec, out, name, desc, steps, after)

def levels(args):
    """{parameter: level} from a /eos/out/get/params/<chan> reply: the fixture's maker and model, then the name, level,
    min and max of each parameter."""
    number = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool)
    return {args[i]: float(args[i + 1]) for i in range(len(args) - 3)
            if isinstance(args[i], str) and all(number(x) for x in args[i + 1:i + 4])}

def read(rec, chan, colours=None, key=None):
    """A step that reads a channel's live levels and waits for the reply, so the replies stay in the order of the
    reads. With `colours`, keeps the channel's red, green and blue there under `key`."""
    def step():
        rec.send(f"/eos/get/params/{chan}")
        if not rec.pump(2.0, until=lambda a, args: a == f"/eos/out/get/params/{chan}"):
            raise SystemExit(f"Eos did not answer /eos/get/params/{chan}")
        if colours is None: return
        args = rec.log[-1]["args"]; found = levels(args)
        if not all(name in found for name in ("Red", "Green", "Blue")):
            raise SystemExit(f"Channel {chan} has no Red, Green and Blue: {args!r}")
        colours[key] = (found["Red"], found["Green"], found["Blue"])
    return step

def paint(rec, chan, colour):
    """A step that sets a channel's red, green and blue, as manual levels, once the command line reads LIVE. `colour`
    is the three levels, or a function that gives them when the step runs."""
    def step():
        require_live(rec); rec.send(f"/eos/chan/{chan}/param/red/green/blue", *(colour() if callable(colour) else colour))
    return step

def go_to(rec, cue):
    """A step that goes to cue 1/<cue> in no time and gives the levels 1 s to settle."""
    return lambda: command(rec, f"Go_To_Cue 1 / {cue} Time 0#", wait=1.0)

def answered(rec, text, confirm):
    """Runs one command line that Eos may ask to confirm, and gives the record 2 s after its answer. With `confirm`
    True, Eos has to ask "Please Confirm", and an Enter on the command line answers it. With False, Eos has to end the
    command line at once. With None, either will do, and the Enter goes out only when Eos asks. An error, no answer,
    or the answer `confirm` rules out stops the run."""
    def answer(a, args):  # the command line with an error, a question, or its end
        line = str(args[0]) if args else ""
        return a == "/eos/out/cmd" and ("Error" in line or "Please Confirm" in line or line.endswith("#"))
    require_live(rec); rec.send("/eos/newcmd", text)
    if not rec.pump(2.0, until=answer): raise SystemExit(f"Eos did not answer {text!r}")
    line = str(rec.cmdline)
    if "Error" in line: raise SystemExit(f"Eos rejected {text!r}: {line}")
    asked = "Please Confirm" in line
    if asked and confirm is False:
        raise SystemExit(f"Eos asked to confirm {text!r}: Record Confirm is on. Clear the command line, then use --lights")
    if confirm and not asked:
        raise SystemExit(f"Eos recorded {text!r} and did not ask to confirm: Record Confirm is off. Use --lights-confirm-off")
    if asked: rec.send("/eos/cmd", "Enter")
    rec.pump(2.0)

def record_only(rec, cue, confirm):
    """A step that records only the colour lights into cue 1/<cue>, with `confirm` as `answered` takes it. The file's
    name says which answer a --lights or --lights-confirm-off file holds, so there the other answer stops the run."""
    return lambda: answered(rec, RECORD_ONLY.format(cue), confirm)

def rejected(rec, text):
    """A step that runs a command line Eos has to reject, and records the error. Stops the run when Eos takes it. The
    scenario's own check for LIVE comes straight before it."""
    def step():
        rec.send("/eos/newcmd", text)
        if not rec.pump(2.0, until=lambda a, args: a == "/eos/out/cmd" and "Error" in str(args)):
            raise SystemExit(f"Eos did not reject {text!r}")
    return step

def save(rec):
    """A step that saves the show as the keypad does, Shift held and Update pressed, and waits 10 s for Eos to say it
    saved. Shift is released before the wait, so a save that never comes does not leave it held. The scenario's own
    check for LIVE comes straight before it."""
    def step():
        for key, down in (("shift", 1.0), ("update", 1.0), ("update", 0.0)): rec.send(f"/eos/key/{key}", down); rec.pump(0.5)
        rec.send("/eos/key/shift", 0.0)
        saved = lambda: any(p["address"] == "/eos/out/event/show/saved" for p in rec.log)
        if not saved(): rec.pump(10.0, until=lambda a, args: a == "/eos/out/event/show/saved")
        if not saved(): raise SystemExit("Eos sent no /eos/out/event/show/saved in 10 s")
    return step

def lights(rec, connect, out):
    rec.start(); rec.pump(3.0); require_test_copy(rec); rec.pump(2.0)
    write(rec, out, "show-path", "Everything Eos sends after the TCP connect, the show name in it, then the open "
          "show's path, /eos/get/show/path. The show is a copy of the church show under a new file name, opened and not "
          "yet saved.")
    print("wrote show-path", len(rec.log), "packets", flush=True)

    guarded(rec, out, "channel-params", "Go To Cue 1/1 in no time, then the live levels of channel 1, an RGB fixture, "
            "and of channel 24, a dimmer: /eos/get/params/<chan>, each sent once the reply to the one before came.",
            [go_to(rec, FIRST_SONG), read(rec, 1), read(rec, 24)])

    # Before anything is written to the show: when Eos takes this line after all, the run stops with the show as it was.
    q_only = RECORD_ONLY.format(FIRST_SONG)[:-1] + " Q_Only#"
    guarded(rec, out, "command-rejected", f"A command line Eos rejects, for the error text: {q_only}",
            [rejected(rec, q_only)])

    before = {}  # (cue, channel) to the red, green and blue the show holds there before the run records any
    go_and_read = lambda cue, keep=None: [go_to(rec, cue)] + [read(rec, chan, keep, (cue, chan)) for chan in COLOUR_CHANNELS]
    guarded(rec, out, "colours-before-record", "Before any colour is recorded: Go To Cue 1/11, 1/22, 1/35 and 1/36 in "
            "no time, each followed by the live levels of the six colour lights, channels 1 to 3 and 16 to 18.",
            [step for cue in LATER_CUES for step in go_and_read(cue, before)])

    guarded(rec, out, "colour-set", "Go To Cue 1/1 in no time, the live levels of channel 1, then its red, green and "
            "blue set to 20, 90 and 100 through /eos/chan/1/param/red/green/blue, and its live levels again 0.5 s "
            "later. Nothing is recorded into the cue.",
            [go_to(rec, FIRST_SONG), read(rec, 1), paint(rec, 1, TEAL), 0.5, read(rec, 1)])

    guarded(rec, out, "record-only-confirm-on", "With Record Confirm on, after colour-set: the other five colour "
            "lights get the same 20, 90 and 100, then the six are recorded into cue 1/1 with Record Only. Eos asks "
            "Please Confirm, and /eos/cmd with Enter answers it. Then the live levels of channels 1 and 16.",
            [paint(rec, chan, TEAL) for chan in COLOUR_CHANNELS[1:]]
            + [0.5, record_only(rec, FIRST_SONG, confirm=True), read(rec, 1), read(rec, 16)])

    guarded(rec, out, "colours-after-record", "After the colour was recorded into cue 1/1: as colours-before-record, "
            "the six colour lights in cues 1/11, 1/22, 1/35 and 1/36. Diff against it to see which cues track the "
            "colour of 1/1.", [step for cue in LATER_CUES for step in go_and_read(cue)])

    second_song = LATER_CUES[0]
    guarded(rec, out, "colour-recorded-back", "Go To Cue 1/11 in no time, then each of the six colour lights is set "
            "to the red, green and blue colours-before-record read for it in 1/11, and the six are recorded into 1/11 "
            "with Record Only and its confirmation. Then the six in cues 1/22, 1/35 and 1/36 again, to see whether "
            "they hold their own colour again.",
            [go_to(rec, second_song)]
            + [paint(rec, chan, lambda chan=chan: before[(second_song, chan)]) for chan in COLOUR_CHANNELS]
            + [0.5, record_only(rec, second_song, confirm=True)]
            + [step for cue in LATER_CUES[1:] for step in go_and_read(cue)])

    def label(): require_live(rec); rec.send("/eos/set/cue/1/1/label", "Test Song A")
    guarded(rec, out, "cue-label-set", "After /eos/subscribe 1 and 2 s, the label of cue 1/1 is set to Test Song A "
            "with /eos/set/cue/1/1/label, the cue is read 3 s later with /eos/get/cue/1/1, then /eos/subscribe 0 3 s "
            "after that. Every packet Eos sent, to show what it notifies for a label set over OSC.",
            [("/eos/subscribe", 1), 2.0, label, 3.0, ("/eos/get/cue/1/1",), 3.0, ("/eos/subscribe", 0)])

    guarded(rec, out, "cue-copy-to", "After /eos/subscribe 1 and 2 s, cue 1/22 is copied to a new cue 1/23 on the "
            "command line (Cue 1 / 22 Copy_To Cue 1 / 23), then 1/23 and the cue count of list 1 are read, then Go To "
            "Cue 1/23 in no time and the live levels of channel 16, then /eos/subscribe 0. The run then deletes 1/23.",
            [("/eos/subscribe", 1), 2.0, lambda: command(rec, "Cue 1 / 22 Copy_To Cue 1 / 23#", wait=3.0),
             ("/eos/get/cue/1/23",), ("/eos/get/cue/1/count",), 2.0, go_to(rec, 23), read(rec, 16), ("/eos/subscribe", 0)])
    require_test_copy(rec); command(rec, "Delete Cue 1 / 23 Enter Enter")

    guarded(rec, out, "show-save", "The show is saved as the keypad saves it: /eos/key/shift 1.0, /eos/key/update "
            "1.0 then 0.0, /eos/key/shift 0.0, half a second apart. Once Eos sent /eos/out/event/show/saved, the open "
            "show's path is read again.", [save(rec), ("/eos/get/show/path",)], after=3.0)

    rec.reconnect(connect)
    scenario(rec, out, "show-path-after-save", "On a new connection after the save: everything Eos sends after the "
             "TCP connect, the show name in it, then the open show's path.", [3.0, ("/eos/get/show/path",)], after=2.0)

# setlist-controller#498, after Nick has turned Record Confirm off by hand.
def lights_confirm_off(rec, out):
    rec.start(); rec.pump(3.0)
    guarded(rec, out, "record-only-confirm-off", "With Record Confirm off: Go To Cue 1/1 in no time, the six colour "
            "lights set to 100, 70 and 20, then recorded into cue 1/1 with Record Only. Eos asks nothing, and the run "
            "sends no Enter. Then the live levels of channels 1 and 16.",
            [go_to(rec, FIRST_SONG)] + [paint(rec, chan, AMBER) for chan in COLOUR_CHANNELS]
            + [0.5, record_only(rec, FIRST_SONG, confirm=False), read(rec, 1), read(rec, 16)])

# setlist-controller#498, after the two runs above, with Record Confirm on or off: what a second run of the lights step
# sends, and a copy onto a decimal cue number.
def lights_again(rec, out):
    rec.start(); rec.pump(3.0)
    second_song, third_song = LATER_CUES[0], LATER_CUES[1]
    held = {}  # channel to the red, green and blue it has live in the second song cue
    cue = lambda number: (f"/eos/get/cue/1/{number}",)
    guarded(rec, out, "record-only-same-colour", "As a second run of the lights step does it: after /eos/subscribe 1 "
            "and 2 s, cue 1/11 is read, then Go To Cue 1/11 in no time, the live levels of the six colour lights, each "
            "set to the red, green and blue just read for it, and the six recorded into 1/11 with Record Only, with "
            "an Enter when Eos asks to confirm. Then 1/11 read again, channels 1 and 16, and /eos/subscribe 0 3 s "
            "later. Diff the two reads of the cue to see what a Record Only changes in it beside the levels.",
            [("/eos/subscribe", 1), 2.0, cue(second_song), go_to(rec, second_song)]
            + [read(rec, chan, held, chan) for chan in COLOUR_CHANNELS]
            + [paint(rec, chan, lambda chan=chan: held[chan]) for chan in COLOUR_CHANNELS]
            + [0.5, record_only(rec, second_song, confirm=None), cue(second_song), read(rec, 1), read(rec, 16),
               3.0, ("/eos/subscribe", 0)])

    guarded(rec, out, "record-only-subscribed", "A Record Only of a new colour, subscribed: after /eos/subscribe 1 and "
            "2 s, cue 1/22 is read, then Go To Cue 1/22 in no time, the six colour lights set to 100, 70 and 20 and "
            "recorded into 1/22 with Record Only, with an Enter when Eos asks to confirm. Then 1/22 read again, "
            "channels 1 and 16, and /eos/subscribe 0 3 s later. Every packet Eos sent, to show what it notifies.",
            [("/eos/subscribe", 1), 2.0, cue(third_song), go_to(rec, third_song)]
            + [paint(rec, chan, AMBER) for chan in COLOUR_CHANNELS]
            + [0.5, record_only(rec, third_song, confirm=None), cue(third_song), read(rec, 1), read(rec, 16),
               3.0, ("/eos/subscribe", 0)])

    guarded(rec, out, "cue-copy-to-decimal", "After /eos/subscribe 1 and 2 s, cue 1/22 is copied to a new cue 1/22.5 "
            "on the command line (Cue 1 / 22 Copy_To Cue 1 / 22.5), then 1/22.5 is read, the cue count of list 1, "
            "and every cue by index 0 to 8, to show where the new cue sits, then /eos/subscribe 0. The run then "
            "deletes 1/22.5.",
            [("/eos/subscribe", 1), 2.0, lambda: command(rec, "Cue 1 / 22 Copy_To Cue 1 / 22.5#", wait=3.0),
             cue(22.5), ("/eos/get/cue/1/count",), 1.0] + [("/eos/get/cue/1/index", i) for i in range(9)]
            + [2.0, ("/eos/subscribe", 0)])
    require_test_copy(rec); answered(rec, "Delete Cue 1 / 22.5#", None)

# setlist-controller#508: a song cue that runs on into the next cue by a follow or a hang, on the same test copy.
CHAIN_SONG = LATER_CUES[1]  # the last song cue, 1/22, which gets the follow and then the hang
CHAIN_COPY = 23  # the copy an extra song gets, numbered straight after the last song cue

def timing(rec, cue):
    """The link, the follow and the hang of cue 1/<cue>, arguments 19 to 21 of its list/0/31 reply, or None when Eos
    answers that the cue is not there, or does not answer in 2 s."""
    reply, missing = f"/eos/out/get/cue/1/{cue}/0/list/0/31", f"/eos/out/get/cue/1/{cue}"  # a cue that is not there
    rec.send(f"/eos/get/cue/1/{cue}")
    if not rec.pump(2.0, until=lambda a, args: a in (reply, missing)) or rec.log[-1]["address"] != reply: return None
    return tuple(rec.log[-1]["args"][19:22])

def require_plain(rec):
    """Stops the run, before it writes anything, unless the last song cue has no link, follow or hang and no cue has
    the copy's number. The run sets and clears both, so a show that holds one of them would lose it."""
    require_test_copy(rec)
    held = timing(rec, CHAIN_SONG)
    if held != (0, -1, -1):
        raise SystemExit(f"Cue 1/{CHAIN_SONG} has to be there with no link, follow or hang, so nothing was sent: {held!r}")
    if timing(rec, CHAIN_COPY) is not None:
        raise SystemExit(f"Cue 1/{CHAIN_COPY} is there already, so nothing was sent")

def lights_chain(rec, out):
    rec.start(); rec.pump(3.0)
    song, copy = CHAIN_SONG, CHAIN_COPY
    cue = lambda number: (f"/eos/get/cue/1/{number}",)
    the_list = [("/eos/get/cue/1/count",), 1.0] + [("/eos/get/cue/1/index", i) for i in range(10)]
    edit = lambda text: lambda: command(rec, text, wait=3.0)
    fire = lambda: (require_live(rec), rec.send(f"/eos/cue/1/{song}/fire"))

    guarded(rec, out, "chain-cue-list-before", "Before the run changes a cue: the cue count of list 1, then every cue "
            "by index 0 to 9. Arguments 19 to 21 of each list/0/31 reply are the cue's link, follow and hang.", the_list)
    require_plain(rec)
    made = False  # whether the copy was asked for, so the cleanup deletes only a cue this run made
    try:
        guarded(rec, out, "chain-follow-set", "After /eos/subscribe 1 and 2 s, cue 1/22 gets a follow of 3 s on the "
                "command line (Cue 1 / 22 Follow 3), the cue is read 3 s later, then /eos/subscribe 0.",
                [("/eos/subscribe", 1), 2.0, edit(f"Cue 1 / {song} Follow 3#"), cue(song), 1.0, ("/eos/subscribe", 0)])

        guarded(rec, out, "chain-go-to-cue-follow", "With a follow of 3 s on cue 1/22: Go To Cue 1/22 in no time, as "
                "the lights step sends it (Go_To_Cue 1 / 22 Time 0), the live levels of channel 16 a second later, "
                "then 8 s with nothing sent, and channel 16 again. Shows whether the follow fires 1/35 after a Go To "
                "Cue in no time.", [go_to(rec, song), read(rec, 16), 8.0, read(rec, 16)])

        held = {}  # channel to the red, green and blue it has live in the cue
        guarded(rec, out, "chain-record-only-follow", "What the lights step sends for a song cue, on cue 1/22 with its "
                "follow of 3 s: Go To Cue 1/22 in no time, the live levels of the six colour lights, each set to the "
                "red, green and blue just read for it, and the six recorded into 1/22 with Record Only, with an Enter "
                "when Eos asks to confirm. Then 8 s with nothing sent, and channel 16 read. Shows whether the follow "
                "fires during or after the step's own commands.",
                [go_to(rec, song)] + [read(rec, chan, held, chan) for chan in COLOUR_CHANNELS]
                + [paint(rec, chan, lambda chan=chan: held[chan]) for chan in COLOUR_CHANNELS]
                + [0.5, record_only(rec, song, confirm=None), 8.0, read(rec, 16)])

        guarded(rec, out, "chain-fire-follow", "The follow at work, for comparison: the app fires cue 1/22 by number "
                "(/eos/cue/1/22/fire), then sends nothing for 8 s. Cue 1/22 has a 2 s fade and the follow of 3 s, and "
                "1/35 is the next cue in the list.", [fire], after=8.0)

        made = True
        guarded(rec, out, "chain-copy-to-follow", "After /eos/subscribe 1 and 2 s, cue 1/22, with its follow of 3 s, "
                "is copied to a new cue 1/23 (Cue 1 / 22 Copy_To Cue 1 / 23), and 1/23 is read: arguments 19 to 21 "
                "show whether the copy takes the follow. Then the follow is taken off the copy (Cue 1 / 23 Follow, "
                "with no time), 1/23 is read again, then /eos/subscribe 0.",
                [("/eos/subscribe", 1), 2.0, edit(f"Cue 1 / {song} Copy_To Cue 1 / {copy}#"), cue(copy), 1.0,
                 edit(f"Cue 1 / {copy} Follow#"), cue(copy), 1.0, ("/eos/subscribe", 0)])

        guarded(rec, out, "chain-fire-follow-with-copy", "With the copy 1/23 in the list straight after 1/22, and no "
                "follow on the copy: the app fires cue 1/22 by number, then sends nothing for 8 s. Shows which cue the "
                "follow of 1/22 fires now.", [fire], after=8.0)

        guarded(rec, out, "chain-follow-cleared", "The follow is taken off cue 1/22 (Cue 1 / 22 Follow, with no "
                "time), and the cue is read 3 s later.", [edit(f"Cue 1 / {song} Follow#"), cue(song)])

        guarded(rec, out, "chain-go-to-cue-hang", "Cue 1/22 gets a hang of 2 s (Cue 1 / 22 Hang 2) and is read, then "
                "Go To Cue 1/22 in no time, the live levels of channel 16 a second later, then 8 s with nothing sent, "
                "and channel 16 again. Shows whether the hang fires the next cue after a Go To Cue in no time.",
                [edit(f"Cue 1 / {song} Hang 2#"), cue(song), go_to(rec, song), read(rec, 16), 8.0, read(rec, 16)])

        guarded(rec, out, "chain-hang-cleared", "The hang is taken off cue 1/22 (Cue 1 / 22 Hang, with no time), and "
                "the cue is read 3 s later.", [edit(f"Cue 1 / {song} Hang#"), cue(song)])
    finally:
        # The show goes back as it was, whichever scenario stopped the run: each step on its own, so one that Eos
        # rejects does not keep the next from running.
        for step in ([lambda: command(rec, f"Cue 1 / {song} Follow#"), lambda: command(rec, f"Cue 1 / {song} Hang#")]
                     + ([lambda: answered(rec, f"Delete Cue 1 / {copy}#", None)] if made else [])):
            try: require_test_copy(rec); step()
            except SystemExit as stopped: print("CLEANUP STOPPED:", stopped, flush=True)

    guarded(rec, out, "chain-cue-list-after", "After the run took the follow, the hang and the copy away again: the "
            "cue count of list 1, then every cue by index 0 to 9, to diff against chain-cue-list-before.", the_list)
    left = timing(rec, song)
    if left != (0, -1, -1) or timing(rec, copy) is not None:
        raise SystemExit(f"THE SHOW IS NOT AS IT WAS: cue 1/{song} reads {left!r}, and cue 1/{copy} may still be there")

def open_eos():
    s = socket.create_connection(("127.0.0.1", 3032), timeout=5); s.settimeout(0.1)
    return s

def main(argv, connect=open_eos, clock=time.time):
    ap = argparse.ArgumentParser(description="Record what Eos sends and receives, for the fake Eos to replay.")
    only = ap.add_mutually_exclusive_group()
    only.add_argument("--edge-cases", action="store_true",
                      help="record only the setlist-controller#259 scenarios, and write no other file")
    only.add_argument("--before-wrap", action="store_true",
                      help="record only the setlist-controller#286 scenarios with Wrap off, and write no other file")
    only.add_argument("--wrap", action="store_true",
                      help="record only the setlist-controller#286 scenarios with Wrap on, and write no other file")
    only.add_argument("--lights", action="store_true",
                      help="record only the setlist-controller#498 scenarios with Record Confirm on, on a test copy "
                           "of the church show, and write no other file")
    only.add_argument("--lights-confirm-off", action="store_true",
                      help="record only the setlist-controller#498 Record Only with Record Confirm off, and write no "
                           "other file")
    only.add_argument("--lights-again", action="store_true",
                      help="record only what a second run of the setlist-controller#498 lights step sends, and a copy "
                           "onto a decimal cue number, with Record Confirm on or off, and write no other file")
    only.add_argument("--lights-chain", action="store_true",
                      help="record only the setlist-controller#508 scenarios, a song cue with a follow or a hang, on "
                           "the same test copy, and write no other file")
    ap.add_argument("out", help="the folder to write one JSON file per scenario into")
    args = ap.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    rec = Recorder(connect(), clock=clock)
    try:
        if args.edge_cases: edge_cases(rec, connect, args.out)
        elif args.before_wrap: before_wrap(rec, args.out)
        elif args.wrap: wrap(rec, args.out)
        elif args.lights: lights(rec, connect, args.out)
        elif args.lights_confirm_off: lights_confirm_off(rec, args.out)
        elif args.lights_again: lights_again(rec, args.out)
        elif args.lights_chain: lights_chain(rec, args.out)
        else: default_scenarios(rec, args.out)
    finally:
        rec.s.close()

if __name__ == "__main__":
    main(sys.argv[1:])
