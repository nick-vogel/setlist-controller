# Phase 0 of setlist-controller#108 (ticket #150): build the small test show the Eos fixtures were recorded from.
#
#   python3 scripts/eos/build-eos-test-show.py
#
# Needs Eos (ETCnomad) running on this Mac with a new, empty show, OSC RX and OSC TX on, and the OSC TCP mode left at
# OSC 1.0. Records cue list 1 over TCP 3032: nine cues for two songs, one with a decimal number and one with no label.
# A label holds a slash, which the command line rejects, so each label goes through /eos/set/cue/<list>/<cue>/label.
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from eososc import Eos, parse

CUES = [("1", "Chan 1 Thru 4 At 30", "Goodness of God / Intro"),
        ("2", "Chan 1 Thru 2 At Full", "Goodness of God / Verse 1"),
        ("3", "Chan 1 Thru 4 At Full", "Goodness of God / Chorus"),
        ("3.5", "Chan 3 Thru 4 At 60", "Goodness of God / Bridge"),
        ("4", "Chan 1 Thru 4 At Out", "Goodness of God / End"),
        ("5", "Chan 1 At 20", "Great Are You Lord / Count Off"),
        ("6", "Chan 1 Thru 3 At 70", "Great Are You Lord / Verse 1"),
        ("7", "Chan 1 Thru 4 At Full", "Great Are You Lord / Chorus"),
        ("8", "Chan 1 Thru 4 At 10", None)]

e = Eos(); e.recv(1.5); errors = []
def run(command):
    e.send("/eos/newcmd", command)
    for address, args in (parse(p) for p in e.recv(0.6)):
        if address == "/eos/out/cmd" and "Error" in str(args): errors.append((command, args))
for number, levels, label in CUES:
    run(levels + "#"); run(f"Record Cue 1 / {number}#")
    if label: e.send(f"/eos/set/cue/1/{number}/label", label); e.recv(0.4)
run("Chan 1 Thru 4 At Out#"); run("Clear_Cmd#")
print("errors:", errors)
