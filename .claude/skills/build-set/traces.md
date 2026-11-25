# Hand traces of the build-set skill

Each trace below is a conversation with the build-set skill (`SKILL.md` beside this file), traced by hand against its text: the date it is said on, Nick's words, each listing the skill runs with its exit code and last line, and the command, date line and question it gives. `Pins:` holds the sentences of `SKILL.md` the trace reads, each word for word. A pin is in `SKILL.md` exactly once, so a sentence `SKILL.md` gives in two places is pinned with enough of the text beside it to name one copy. `test/build-set-skill.test.ts` fails when a pinned sentence is no longer in `SKILL.md` or is there more than once, and runs each trace's listings against a workspace under `dist/` and a fake Planning Center, checking the exit code and last line.

**How to change a pinned sentence.** Whoever changes a pinned sentence of `SKILL.md`:

1. Traces again by hand every trace that pins it, against the edited text.
2. Updates the pin, and the trace when its outcome moved, in the same commit as the edit.
3. Names in the commit body each trace whose outcome moved, with what it gives now.

A trace that no longer holds by design is deleted in that commit, and the commit body says why. A new trace goes here in the same shape.

**The sentence check.** `test/build-set-skill.test.ts` also fails when a sentence of five sections of `SKILL.md`, `## Steps`, `## The plan path`, `## The yes to replacing`, `## The lights step` and `## Ask instead of guess`, each to the next `## ` heading, is neither inside a pin nor on the exempt list at the end of this file, and it names each such sentence with its `SKILL.md` line. This is the one statement of the check's rule; `skillSentences` and `sentenceCoverage` in `test/build-set-traces.ts` follow it.

- Each line of the five sections that is not blank is split on its own. Its indentation and one list marker (`1. ` or `- `) are dropped, then a bold label at its start: a `**...**` span whose text ends in `.`, `?` or `!`, such as **The consent.** A bold span that ends in anything else, such as **A yes with no change**, stays in its sentence.
- A sentence ends at `.`, `?` or `!` outside backticks, with any run of `*`, `"`, `'` or `)` right after it, when a space or the line's end follows. A `?` or `!` whose run holds a `"`, closing a quotation such as "Run it?", ends no sentence when the word after the space starts with a lowercase letter. A code span whose last character is `.`, `?` or `!` ends the sentence when a space follows its closing backtick and the word after it does not start with a lowercase letter. The text of a line after its last sentence end is a sentence too, such as `What crosses:` or an Ask instead of guess item that ends in `;`. Each sentence is trimmed.
- A sentence is covered when one pin's one place in `SKILL.md` holds all of it. Two pins never cover a sentence between them, and a pin that holds only part of it covers nothing.
- A sentence the rule splits badly is fixed in the rule, here and in `test/build-set-traces.ts` in the same commit, or in `SKILL.md`, never on the exempt list.

**The exempt list.** `# Sentences no trace pins`, after the last trace, lists each sentence of the five sections no trace pins. Each entry is a `Sentence:` line, the sentence word for word as the rule gives it, then a `Reason:` line that says why no trace pins it. Blank lines go between entries, and any other line there is an error. One entry stands for every place `SKILL.md` gives its sentence. The test fails on an entry with no reason, an entry that is no sentence of the five sections, an entry a pin covers in any place it stands, and an entry given twice.

**How to change a sentence in the five sections.** Whoever adds or rewords a sentence in the five sections, in the same commit as the edit:

1. Pins it in a trace that reads it, traced by hand against the edited text, or lists it word for word on the exempt list with its reason. A pin goes in a trace that reads the sentence, never in any trace only to pass the check.
2. Takes the sentence it replaces, or one deleted, off the exempt list.

**The shape of a trace.** Each `## <id>` section below is one trace:

- `Said on:` the weekday and date. A listing with no `--date` looks for the set folder of the coming Sunday, today when it is a Sunday.
- `Library:` the library the listings read. The worked examples' seven folders are the ones `SKILL.md`'s worked examples list.
- `Listing:` one command in a fenced block, then `Plan:` (a `--plan` listing only), `Set folders:` (the set folders under its output root when it runs, `/Users/nick/Music/Ableton/Sets` unless it names another), `Exit:` and `Last line:` (its last line on stdout, or none). A trace that runs no listing, a request for the lights alone, has the one line `Listing: none` in place of every listing block, and `Library: none` with why. The test runs nothing for it.
- `Command:`, `Date line:` and `Question:`: what the skill gives after Nick's last turn. `Command:` is the last command the skill showed or ran, a lights command when the trace ends on one, and `Date line:` is `none` then, since a date line goes under a build command.
- A trace of the lights step holds the listings its build ran, which the test runs as it runs every other. The test runs no build and no lights command: what a trace says a build or the lights mode printed is written by hand, in `Question:` or `Note:`. `test/set-builder-lights.test.ts` holds the lights mode to its lines, and `test/build-set-skill-quotes.test.ts` checks each line `SKILL.md` quotes.
- `Song lines:` and `Note:` are optional.

## example-9-yes

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: SKILL.md worked example 9; #190 acceptance criterion 1; #197 acceptance criterion 5; pre-PR review 5 (#190 trace) and 7 (#179)
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes

Listing:

```
pnpm build-set --list
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.`

Command: `pnpm build-set grace lord rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: none: the command runs at once on the yes, with no listing in between

Pins:

```
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
**A yes with no change** ("yes", "yep", "replace it") adds `--replace "<folder>"` to the command, the folder that line names: show it with `--replace` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between.
When Nick's answer to that command is a yes with no change ("yes", "yep", "run it"), run it exactly as shown, from this repo's root.
A yes with no change to step 4's replace question is no such change: its command runs at once, by The yes to replacing.
When Nick names no date, the line gives the command's default: `Date: Sunday <YYYY-MM-DD>, today, since no date is named` when today is a Sunday, and otherwise `Date: Sunday <YYYY-MM-DD>, the coming Sunday, since no date is named`.
Then ask whether to run it, or, when the listing's last line says the set folder for the date already exists, ask by The yes to replacing. Done when Nick answers.
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
Every `--replace` names the set folder it replaces, in double quotes, as `--replace "<folder>"`: the folder copied word for word from a listing's last line, or from the problem Steps step 6 answers.
Run `pnpm build-set --list` from this repo's root.
It prints one line per song folder the build can match, in three parts two spaces apart: the short name, the song's key or `no key`, and the folder name, such as `grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm`.
That line is no song line, and it never sets exit 1.
For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title).
Under it, open the listing with a date line, the date the set is built for with its weekday.
The listing of step 1 is the only command that runs before a yes.
When the listing's last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, the set for the date was built before.
The question is about the set folder that line names.
The listing that asked already answered for this date and output root, and `--replace` changes only what its last line says.
```

## example-9-swap-song-2

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: SKILL.md worked example 9; #190 acceptance criterion 2; #197 acceptance criterion 5; pre-PR review 7 (#190, typed route)
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes, but make song 2 Goodness of God

Listing:

```
pnpm build-set --list
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace goodness rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Run it?

Pins:

```
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
Every listing and every command of this build after it carries `--replace` while it looks in that set folder, whatever else that answer or a later one changes: a transition, or the songs (by Planning Center or by the Steps).
The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
An answer that names a change, a "no" with a change in it included ("no, make it Goodness of God"), is a change: compose the new command and go back to step 4.
Show the line as printed, and ask "Run it?" as usual, with no second question.
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
After the song lines, when the set folder for the date already exists under the output root, a last line says so: `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, or, with `--replace "<folder>"` for that folder on the listing, `<folder> already exists, and --replace replaces it.`
Nick says yes to replacing a set once per build.
So the next listing's last line reads `<folder> already exists, and --replace replaces it.` while that set folder exists, and the only question is "Run it?".
A listing whose last line reads `already exists, and --replace replaces it.` comes from a command that has `--replace`, named by Nick, carried by this rule, or on the command Steps step 6 shows for a set folder that appeared after the listing.
```

## example-10-change-in-planning-center

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: SKILL.md worked example 10; #197 acceptance criteria 3 and 4 (R2-1)
Nick says:
- Build Sunday's set from the plan.
- yes, but swap song 2 for Goodness of God
- I'll change it in Planning Center
- I changed its key to A in Planning Center. List it again.

Listing:

```
pnpm build-set --plan --list
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"
```

Plan: the recorded November 1 plan, with Goodness of God at song 2 in G
Set folders: 2026-11-01 Sunday
Exit: 1
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --plan --list --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"
```

Plan: the recorded November 1 plan, with Goodness of God at song 2 in A
Set folders: 2026-11-01 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set --plan --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"`
Date line: `Date: Sunday 2026-11-01, the coming Sunday, since no date is named`
Question: Run it?

Note: The listing after the swap exits 1 on song 2, `2. Goodness of God  G  "Goodness of God" is planned in G, and /Users/nick/Music/MultiTracks has it only in A.  gap, the default`, and shows no command. The same holds after an exit 1 on the build's own checks.

Pins:

```
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
Every listing and every command of this build after it carries `--replace` while it looks in that set folder, whatever else that answer or a later one changes: a transition, or the songs (by Planning Center or by the Steps).
That includes a listing that exits 1, and the listing after its fix.
Add any `--date`, `--service-type`, `--plan-id`, `--library`, `--pads`, `--template` or `--output-root` Nick named, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, after a fix included, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder.
Show the lines with a problem, and after each, what fixes it. Show no build command, since the build stops on the same problems.
`"<title>" is planned in <key>, and <library> has it only in <keys>.`: Nick changes the song's key in the plan, or adds the song in that key to the library.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
Exit 0: show the command in a code block: `pnpm build-set --plan`, then the transition flags in the order of the positions they name, then any `--date`, `--service-type`, `--plan-id`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
Exit 1 with a song line that has a problem: a song line whose folder field or transition field is a problem in place of a folder name or `<transition>, <source>`, or a `keep one:` folder list after it.
Nothing is printed on stderr.
```

## example-10-build-from-songs

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #197 acceptance criterion 6 (review 5 finding 1, Steps route); pre-PR review 6; #209 row 4 on the default date
Nick says:
- Build Sunday's set from the plan.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.

Listing:

```
pnpm build-set --plan --list
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"
```

Set folders: 2026-11-01 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace goodness rain --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"`
Date line: `Date: Sunday 2026-11-01, the coming Sunday, since no date is named`
Question: Run it?

Pins:

```
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
Every listing and every command of this build after it carries `--replace` while it looks in that set folder, whatever else that answer or a later one changes: a transition, or the songs (by Planning Center or by the Steps).
A `--replace` that crosses, named by Nick or carried by a yes to the replace question, stays on the listing and the build command only while they look in the set folder it was given for, by One set folder under The yes to replacing.
Add `--library <folder>` when Nick names a library folder, and `--pads <folder>` when he names a pads folder, and any `--date` or `--output-root <folder>` he names, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder.
Whether he then changes the plan in Planning Center or names the songs by the Steps, the next listing and command have `--replace` on the same terms, by From the plan path under Steps step 1 and One set folder under The yes to replacing.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
A change to the songs themselves is a question under Ask instead of guess.
```

## plan-rebuild-pad-after-song-2

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #190 acceptance criterion 3; #197 acceptance criterion 5
Nick says:
- Build Sunday's set from the plan.
- yes, but a pad after song 2

Listing:

```
pnpm build-set --plan --list
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --pad 2 --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set --plan --pad 2 --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"`
Date line: `Date: Sunday 2026-11-01, the coming Sunday, since no date is named`
Question: Run it?

Pins:

```
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
Every listing and every command of this build after it carries `--replace` while it looks in that set folder, whatever else that answer or a later one changes: a transition, or the songs (by Planning Center or by the Steps).
An answer to either question that names a change goes to step 3, a change to a transition ("yes, but pad after song 2") and a change to the songs alike.
Run the listing again with it, and with `--replace "<folder>"` when The yes to replacing carries it, or Nick named it and a listing has named its folder, by A `--replace` Nick names, without asking, and show it again from step 2.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
Songs are numbered by position, from 1 in service order, and every transition flag names the position of the song before its song change.
| a pad with no key named | `--pad <n>`: it plays in the key the next song's line prints, and after the last song in that song's own key |
| "a pad between A and B", "a pad after A", "a pad before B" | `--pad <A>`, A being the song before the song change |
A change Nick names to a transition becomes its transition flag, by the mapping below, on the listing and the command alike: `--overlap <n>`, `--pad <n>` or `--pad <n>=<key>`, or `--gap <n>` to take back a pad or an overlap the plan gives.
Exit 0: show the command in a code block: `pnpm build-set --plan`, then the transition flags in the order of the positions they name, then any `--date`, `--service-type`, `--plan-id`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
The source is `the default`, `from the plan` or `from <flag>`; the last song has the transition field only when something gives it one.
```

## 190-output-root-at-step-5

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #190 acceptance criterion 4 (an `--output-root` named at step 5 reruns the listing); pre-PR review 5
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- build it into /Volumes/Stage/Sets

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Listing:

```
pnpm build-set --list --output-root /Volumes/Stage/Sets
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Volumes/Stage/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Volumes/Stage/Sets/2026-10-18 Sunday" replaces it.`

Command: `pnpm build-set grace lord rain --output-root /Volumes/Stage/Sets`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Replace the set built before?

Note: The default output root holds no set folder for 2026-10-18, so the first listing asks "Run it?"; /Volumes/Stage/Sets holds one, which only the listing run again finds.

Pins:

```
Add `--library <folder>` when Nick names a library folder, and `--pads <folder>` when he names a pads folder, and any `--date` or `--output-root <folder>` he names, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder.
An answer that names a change, a "no" with a change in it included ("no, make it Goodness of God"), is a change: compose the new command and go back to step 4.
The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
```

## 190-replace-at-step-5

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #190 acceptance criterion 4 (a `--replace` named at step 5 reruns the listing); pre-PR review 5
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- replace it

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Listing:

```
pnpm build-set --list
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace lord rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Run it?

Note: The set folder for 2026-10-18 is not there at the first listing; another build writes it before Nick answers "Run it?". "replace it" there is no yes: it names `--replace`, a change at step 5. The listing runs again without it, by A `--replace` Nick names, and its last line now names the set folder, so the listing runs once more with `--replace` for that folder.

Pins:

```
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
When Nick's answer to that command is a yes with no change ("yes", "yep", "run it"), run it exactly as shown, from this repo's root.
An answer that names a change, a "no" with a change in it included ("no, make it Goodness of God"), is a change: compose the new command and go back to step 4.
The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
A command gains `--replace` only when Nick names it, says yes to the replace question, or says yes to the command Steps step 6 shows with it for a set folder that appeared after the listing, with a change or without one.
Show the line as printed, and ask "Run it?" as usual, with no second question.
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
Nick names `--replace` by The mapping, up front or in a later answer.
```

## 190-answered-date-question

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #190 acceptance criterion 4 (an answered date question reruns the listing); pre-PR review 5
Nick says:
- Grace, Great Are You Lord, Fall Like Rain for November 3.
- November 1

Listing:

```
pnpm build-set --list
```

Set folders: 2026-11-01 Sunday
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Listing:

```
pnpm build-set --list --date 2026-11-01
```

Set folders: 2026-11-01 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set grace lord rain --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Note: "November 3" said on 2026-10-17 is Tuesday 2026-11-03, no Sunday, so it puts no `--date` on the first listing, and the skill shows no command and asks which Sunday Nick means, naming Tuesday 2026-11-03. "November 1" is Sunday 2026-11-01, 15 days away, and the answer reruns the listing for it.

Pins:

```
a named date whose next occurrence, today or later, is not a Sunday, or is more than 28 days (four weeks) after today.
Name the date with its year and weekday, and ask which Sunday he means.
The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
A date on `--date` reads `Date: <weekday> <YYYY-MM-DD>, the date named`.
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
```

## 197-no-at-the-replace-question

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #197 acceptance criterion 7 ("a "no" with no change builds nothing"); pre-PR review 7 (the "Still true" table); pre-PR reviews 5 and 6 ("Must preserve")
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- no

Listing:

```
pnpm build-set --list
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.`

Command: no command
Date line: none
Question: none: the skill says that nothing was built, and stops

Note: Before the "no", the skill shows `pnpm build-set grace lord rain` with the date line `Date: Sunday 2026-10-18, the coming Sunday, since no date is named` and asks "Replace the set built before?". The "no" runs nothing.

Pins:

```
An answer to step 4's replace question follows The yes to replacing.
A "no" with no change builds nothing: say that nothing was built, and stop.
```

## 197-no-with-a-change-at-the-replace-question

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #197 acceptance criterion 7 ("a "no" with no change builds nothing", and a "no" with a change is a change); pre-PR review 7 (the "Still true" table); pre-PR reviews 5 and 6 ("Must preserve")
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- no, make song 2 Goodness of God

Listing:

```
pnpm build-set --list
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.`

Command: `pnpm build-set grace goodness rain`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Replace the set built before?

Note: The "no" with a change gives no consent, so the command has no `--replace`. The change names no date, `--output-root` or `--replace`, so the listing that asked still answers for the set folder and does not run again, and its last line still asks the replace question.

Pins:

```
An answer to step 4's replace question follows The yes to replacing.
A "no" that names a change is a change, by Steps step 5, and gives no consent.
An answer that names a change, a "no" with a change in it included ("no, make it Goodness of God"), is a change: compose the new command and go back to step 4.
A command gains `--replace` only when Nick names it, says yes to the replace question, or says yes to the command Steps step 6 shows with it for a set folder that appeared after the listing, with a change or without one.
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
```

## 203-date

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #203 acceptance criterion 2; c322fc1 trace 1; pre-PR review 9 (#203 acceptance hand traces)
Nick says:
- Build the set from the plan for November 8.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace goodness rain --date 2026-11-08`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Pins:

```
On every route, what he named on the plan path for this build crosses with him, as if he had named it again.
`--date`, `--output-root`, `--library` and `--pads` he named go on the listing and the build command. So a date he named there gives the date line `Date: <weekday> <YYYY-MM-DD>, the date named`.
A date on `--date` reads `Date: <weekday> <YYYY-MM-DD>, the date named`.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
With no set folder for the date, the listing prints no such line, and the question is "Run it?" as usual.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
Nick comes to the Steps from The plan path by the question under Ask instead of guess on a change to the songs, answered "build it from songs I name", by a problem under plan step 2 whose fix is to build the set from songs he names, or by any other route.
```

## 203-date-rebuild

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #203 acceptance criterion 3; c322fc1 trace 2; c2a8af8 trace 3; #209 row 4, The Steps switch (the #197 trace, still true); pre-PR review 9
Nick says:
- Build the set from the plan for November 8.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace goodness rain --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Note: No line names 2026-11-01, though its set folder exists.

Pins:

```
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
Every listing and every command of this build after it carries `--replace` while it looks in that set folder, whatever else that answer or a later one changes: a transition, or the songs (by Planning Center or by the Steps).
A `--replace` that crosses, named by Nick or carried by a yes to the replace question, stays on the listing and the build command only while they look in the set folder it was given for, by One set folder under The yes to replacing.
`--date`, `--output-root`, `--library` and `--pads` he named go on the listing and the build command. So a date he named there gives the date line `Date: <weekday> <YYYY-MM-DD>, the date named`.
The listing's flags go in step 4's order, without `--template`, which `--list` does not take.
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
```

## 203-folders-and-template

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #203 acceptance criterion 4; c322fc1 trace 3, with the folders named
Nick says:
- Build the set from the plan for November 8, from the library /Volumes/Stage/MultiTracks, with the pads in /Volumes/Stage/Pads and the template /Volumes/Stage/Sunday.als, into /Volumes/Stage/Sets.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --library /Volumes/Stage/MultiTracks --pads /Volumes/Stage/Pads --template /Volumes/Stage/Sunday.als --output-root /Volumes/Stage/Sets
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --list --date 2026-11-08 --library /Volumes/Stage/MultiTracks --pads /Volumes/Stage/Pads --output-root /Volumes/Stage/Sets
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace goodness rain --date 2026-11-08 --library /Volumes/Stage/MultiTracks --pads /Volumes/Stage/Pads --template /Volumes/Stage/Sunday.als --output-root /Volumes/Stage/Sets`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Pins:

```
Add any `--date`, `--service-type`, `--plan-id`, `--library`, `--pads`, `--template` or `--output-root` Nick named, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, after a fix included, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder.
`--date`, `--output-root`, `--library` and `--pads` he named go on the listing and the build command. So a date he named there gives the date line `Date: <weekday> <YYYY-MM-DD>, the date named`.
`--template` he named goes on the build command only.
`--service-type` and `--plan-id` stay behind, since they need `--plan`.
The listing's flags go in step 4's order, without `--template`, which `--list` does not take.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| a pads folder | `--pads <folder>` |
| a template | `--template <set.als>` |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
Add `--library <folder>` when Nick names a library folder, and `--pads <folder>` when he names a pads folder, and any `--date` or `--output-root <folder>` he names, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder.
When Nick comes here from The plan path, the flags he named there cross with him, by From the plan path below.
```

## 203-pad-crosses

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #203 acceptance criterion 5; c322fc1 trace 4; pre-PR review 9
Nick says:
- Build the set from the plan for November 8.
- A pad after Fall Like Rain for ministry time.
- swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --pad 3
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace goodness rain --pad 3 --date 2026-11-08`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Song lines:

```
1. This Is Amazing Grace (D), then a gap
2. Goodness of God (A), then a gap
3. Fall Like Rain (E), then a pad in E for ministry time
```

Pins:

```
A transition he named on the plan path, up front or at plan step 3, crosses when its song change is still there in the songs he names now: the same two songs side by side in the same order, or, for a pad after the last song, that song still last.
| "a pad after the last song", "a pad for ministry time" after it | `--pad <last>` |
On every route, what he named on the plan path for this build crosses with him, as if he had named it again.
`--date`, `--output-root`, `--library` and `--pads` he named go on the listing and the build command. So a date he named there gives the date line `Date: <weekday> <YYYY-MM-DD>, the date named`.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Songs are numbered by position, from 1 in service order, and every transition flag names the position of the song before its song change.
| a pad with no key named | `--pad <n>`: it plays in the key the next song's line prints, and after the last song in that song's own key |
A pad after the last song names the last song's position, since no song change follows it.
A change Nick names to a transition becomes its transition flag, by the mapping below, on the listing and the command alike: `--overlap <n>`, `--pad <n>` or `--pad <n>=<key>`, or `--gap <n>` to take back a pad or an overlap the plan gives.
Number the songs from 1 in the order Nick names them, and turn each transition he names into its flag by the mapping below, and each transition that crosses from The plan path by step 1 into its flag at its new position.
Its flag takes the position of the song before the song change in the new order, and keeps any key he named (`--pad <n>=<key>`).
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
The flags and transitions he named on the plan path come with him to the Steps, by From the plan path under Steps step 1.
```

## 203-pad-moved

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #203 acceptance criterion 5; c322fc1 trace 4; pre-PR review 9
Nick says:
- Build the set from the plan for November 8.
- A pad after Fall Like Rain for ministry time.
- swap song 2 for Goodness of God
- build it from songs I name
- Fall Like Rain, Grace, Goodness of God.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --pad 3
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: no command
Date line: none
Question: The pad after Fall Like Rain, named for the last song, has no last song to follow now: does it go somewhere else, or is it left out?

Pins:

```
A transition he named on the plan path, up front or at plan step 3, crosses when its song change is still there in the songs he names now: the same two songs side by side in the same order, or, for a pad after the last song, that song still last.
When its song change is gone, it is a question under Ask instead of guess.
on the Steps after The plan path, a transition Nick named on the plan path whose song change is gone from the songs he names now, its two songs moved apart, reordered or dropped, or the song a pad came after no longer last: name it, and ask whether it goes somewhere else or is left out;
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Songs are numbered by position, from 1 in service order, and every transition flag names the position of the song before its song change.
| a pad with no key named | `--pad <n>`: it plays in the key the next song's line prints, and after the last song in that song's own key |
| "a pad after the last song", "a pad for ministry time" after it | `--pad <last>` |
A pad after the last song names the last song's position, since no song change follows it.
A change Nick names to a transition becomes its transition flag, by the mapping below, on the listing and the command alike: `--overlap <n>`, `--pad <n>` or `--pad <n>=<key>`, or `--gap <n>` to take back a pad or an overlap the plan gives.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
```

## 203-plan-prayer-pad

Said on: Saturday 2027-01-02
Library: the Phase 0 plan's songs
Source: #203 acceptance criterion 6; c322fc1 trace 5, on the Phase 0 plan, whose Prayer comes right after song 2
Nick says:
- Build Sunday's set from the plan.
- yes, but swap Fall Like Rain for Goodness of God

Listing:

```
pnpm build-set --plan --list
```

Plan: the recorded Phase 0 plan, on 2027-01-03
Set folders: none
Exit: 0
Last line: `Warning: song 2, "Yes And Amen", is planned in 4/4, and its song starts in 6/8.`

Command: no command
Date line: none
Question: Does Nick change the plan in Planning Center and it is listed again, or is the set built from songs he names, by the Steps? The question names the overlap from song 1 that the plan's `overlap` note gives and the pad after song 2 that its Prayer gives, and says they do not cross to the Steps.

Pins:

```
The plan's transition rule: an item titled `Prayer` that is the next item after a song, headers left out, puts a pad after that song, and a note on a song whose whole text is `overlap` overlaps it into the next song.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
When the plan gave a transition, a pad from a `Prayer` item or an overlap from an `overlap` note, the question names it and says it does not cross to the Steps, so he can name it there;
A transition the plan gave, a pad from a `Prayer` item or an overlap from an `overlap` note, is none Nick named, so it does not cross.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
Then a line for each item that is no song, from the first song on, such as `Prayer: a pad after song 2` or `Message: no effect`, then a `Warning:` line for each song whose plan BPM or meter differs from its folder's, then one for each song whose arrangement has no chart text in Planning Center, and one for each whose chart text has no chords in square brackets.
Then each item line that sits between two songs, as printed, so Nick sees an item that does or does not make a pad, then each warning as printed.
A warning never stops the build.
```

## 203-503-at-the-plan-listing

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: 88b9f7e trace 1; #203 lane review 1 finding 1
Nick says:
- Build the set from the plan for November 8.
- It is still down. Build Grace, Goodness of God, Fall Like Rain.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: Planning Center answering 503 to /service_types
Set folders: none
Exit: 1
Last line: none

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace goodness rain --date 2026-11-08`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Note: The plan listing prints `Planning Center answered 503 to /service_types.` on stderr, and it lasts until the service.

Pins:

```
Nick comes to the Steps from The plan path by the question under Ask instead of guess on a change to the songs, answered "build it from songs I name", by a problem under plan step 2 whose fix is to build the set from songs he names, or by any other route.
On every route, what he named on the plan path for this build crosses with him, as if he had named it again.
500, 503 or any other 5xx: a fault or maintenance on Planning Center's own servers. Nick builds again later, while the Mac is on the internet. When it lasts until the service, he builds the set from songs he names, by the Steps.
`--date`, `--output-root`, `--library` and `--pads` he named go on the listing and the build command. So a date he named there gives the date line `Date: <weekday> <YYYY-MM-DD>, the date named`.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
Exit 1 with no song lines: the problem stopped the listing before the plan's songs.
Show it, what fixes it, and no build command.
`Planning Center answered <status> to <path>.`: Planning Center answered a request with an error status.
`<path>` names the request: `/service_types` (the service types), a service type's `/plans`, or a plan's `/items`.
By status:
```

## 203-new-request-after-plan-build

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: 3c83d33 trace 1; c5e98d7 trace 2
Nick says:
- Build the set from the plan for November 8.
- yes
- Just build Grace, Great Are You Lord, Fall Like Rain.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain`
Date line: `Date: Sunday 2026-11-01, the coming Sunday, since no date is named`
Question: Run it?

Note: The plan build exits 1 on `Planning Center answered 429 to ...`. Nick says nothing to it and turns to something else, leaving it unanswered, so "Just build ..." is a new request, not his answer to that exit 1.

Pins:

```
It crosses until the build ends, by When the build ends under The yes to replacing, and a fix after a build's exit 1 that answers that failure keeps it too, by that section: a switch to these Steps with songs he names is such a fix. A build he asks for after that starts with nothing crossed.
A request he makes once he has turned from that failure to something else, leaving it unanswered, is no fix: it is a build he asks for after the build ended.
This build ends when a build command runs, or when Nick calls it off.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
```

## 203-called-off-then-new-request

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: 25b60bb (still green); #203 park-fix-2; c5e98d7 trace 4; c2a8af8 trace 4
Nick says:
- Build the set from the plan for November 8.
- forget it
- Just build Grace, Great Are You Lord, Fall Like Rain.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain`
Date line: `Date: Sunday 2026-11-01, the coming Sunday, since no date is named`
Question: Run it?

Pins:

```
It crosses until the build ends, by When the build ends under The yes to replacing, and a fix after a build's exit 1 that answers that failure keeps it too, by that section: a switch to these Steps with songs he names is such a fix. A build he asks for after that starts with nothing crossed.
This build ends when a build command runs, or when Nick calls it off.
A "no", or any other answer that calls the build off ("forget it", "never mind", "cancel"), runs nothing: say that nothing was built, and stop.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
```

## 209-row-1

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 1
Nick says:
- Rebuild the set from the plan for November 8.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set --plan --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Pins:

```
Nick naming `--replace`, "replace it" or "rebuild it" up front names `--replace`, which goes on by A `--replace` Nick names: this listing runs without it.
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Exit 0: show the command in a code block: `pnpm build-set --plan`, then the transition flags in the order of the positions they name, then any `--date`, `--service-type`, `--plan-id`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
When the set folder for the date already exists under the output root, the last line on stdout says so: `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, or, with `--replace "<folder>"` for that folder on the listing, `<folder> already exists, and --replace replaces it.`
```

## 209-row-1-stay-on-the-plan-path

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 1, Stay on the plan path
Nick says:
- Rebuild the set from the plan for November 8.
- yes, but a pad after song 3

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --pad 3 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set --plan --pad 3 --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Pins:

```
Run the listing again with it, and with `--replace "<folder>"` when The yes to replacing carries it, or Nick named it and a listing has named its folder, by A `--replace` Nick names, without asking, and show it again from step 2.
A listing or command keeps `--replace` only while it looks in that same set folder.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Songs are numbered by position, from 1 in service order, and every transition flag names the position of the song before its song change.
| a pad with no key named | `--pad <n>`: it plays in the key the next song's line prints, and after the last song in that song's own key |
| "a pad between A and B", "a pad after A", "a pad before B" | `--pad <A>`, A being the song before the song change |
A pad after the last song names the last song's position, since no song change follows it.
A change Nick names to a transition becomes its transition flag, by the mapping below, on the listing and the command alike: `--overlap <n>`, `--pad <n>` or `--pad <n>=<key>`, or `--gap <n>` to take back a pad or an overlap the plan gives.
Exit 0: show the command in a code block: `pnpm build-set --plan`, then the transition flags in the order of the positions they name, then any `--date`, `--service-type`, `--plan-id`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
```

## 209-row-1-steps-switch

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 1, The Steps switch (gap 1); #210 acceptance criterion 2
Nick says:
- Rebuild the set from the plan for November 8.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace goodness rain --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Pins:

```
A `--replace` that crosses, named by Nick or carried by a yes to the replace question, stays on the listing and the build command only while they look in the set folder it was given for, by One set folder under The yes to replacing.
`--date`, `--output-root`, `--library` and `--pads` he named go on the listing and the build command. So a date he named there gives the date line `Date: <weekday> <YYYY-MM-DD>, the date named`.
On every route, what he named on the plan path for this build crosses with him, as if he had named it again.
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
"Replace it" or "rebuild it" up front names `--replace`, as plan step 1 says, and it crosses as he named it: a listing that named its folder on the plan path named it for the Steps too, so the Steps listing for that folder carries `--replace "<folder>"` at once.
```

## 209-row-1-new-date-in-the-same-answer

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 1, A new date in the same answer as the switch
Nick says:
- Rebuild the set from the plan for November 8.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain for November 1.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-01
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set grace goodness rain --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Pins:

```
What Nick names in the Steps request itself wins over what crosses: a date, a folder, a template, or a transition on the same song change.
A `--replace` that crosses, named by Nick or carried by a yes to the replace question, stays on the listing and the build command only while they look in the set folder it was given for, by One set folder under The yes to replacing.
So a date or `--output-root` in the Steps request that points the listing at another set folder leaves it behind, unless he names `--replace` there too.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
```

## 209-row-1-new-date-later

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 1, A new date in a later answer
Nick says:
- Rebuild the set from the plan for November 8.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.
- make it November 1

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-01
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set grace goodness rain --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Pins:

```
The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
A listing or command keeps `--replace` only while it looks in that same set folder.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
"Replace it" or "rebuild it" up front names `--replace`, as plan step 1 says, and it crosses as he named it: a listing that named its folder on the plan path named it for the Steps too, so the Steps listing for that folder carries `--replace "<folder>"` at once.
```

## 209-row-1-new-date-later-on-the-plan-path

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 1, A new date in a later answer, on the plan path
Nick says:
- Rebuild the set from the plan for November 8.
- make it November 1

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-01
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set --plan --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Pins:

```
The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Exit 0: show the command in a code block: `pnpm build-set --plan`, then the transition flags in the order of the positions they name, then any `--date`, `--service-type`, `--plan-id`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
```

## 209-row-1-new-date-with-no-set-folder

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 1, A new date whose folder does not exist
Nick says:
- Rebuild the set from the plan for November 8.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.
- make it November 15

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-15
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace goodness rain --date 2026-11-15`
Date line: `Date: Sunday 2026-11-15, the date named`
Question: Run it?

Pins:

```
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
With no set folder for the date, the listing prints no such line, and the question is "Run it?" as usual.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
"Replace it" or "rebuild it" up front names `--replace`, as plan step 1 says, and it crosses as he named it: a listing that named its folder on the plan path named it for the Steps too, so the Steps listing for that folder carries `--replace "<folder>"` at once.
```

## 209-row-1-fix-after-exit-1

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 1, The build ends: exit 1 and the fix
Nick says:
- Rebuild the set from the plan for November 8.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.
- yes
- I added the WAV.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace goodness rain --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Note: The build exits 1 on a WAV missing from Goodness of God's folder, and Nick adds it. No flag changes, so the listing does not run again.

Pins:

```
A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1.
A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name".
It crosses until the build ends, by When the build ends under The yes to replacing, and a fix after a build's exit 1 that answers that failure keeps it too, by that section: a switch to these Steps with songs he names is such a fix. A build he asks for after that starts with nothing crossed.
A song folder is in the library, so Nick adds the file to that song's folder in the library.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
"Replace it" or "rebuild it" up front names `--replace`, as plan step 1 says, and it crosses as he named it: a listing that named its folder on the plan path named it for the Steps too, so the Steps listing for that folder carries `--replace "<folder>"` at once.
```

## 209-row-1-fix-after-exit-1-with-a-new-date

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 1, The build ends: a fix that makes it November 1
Nick says:
- Rebuild the set from the plan for November 8.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.
- yes
- I added the WAV, and make it November 1.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-01
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set grace goodness rain --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Pins:

```
A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1.
A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name".
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
A listing or command keeps `--replace` only while it looks in that same set folder.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
"Replace it" or "rebuild it" up front names `--replace`, as plan step 1 says, and it crosses as he named it: a listing that named its folder on the plan path named it for the Steps too, so the Steps listing for that folder carries `--replace "<folder>"` at once.
```

## 209-row-1-new-request

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 1, The build ends, then a new request
Nick says:
- Rebuild the set from the plan for November 8.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.
- yes
- Build Grace, Goodness of God, Fall Like Rain for November 8.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Command: `pnpm build-set grace goodness rain --date 2026-11-08`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Replace the set built before?

Note: The yes runs the command and the build exits 0; "forget it" at any "Run it?" ends the build the same way.

Pins:

```
This build ends when a build command runs, or when Nick calls it off.
A build Nick asks for after that starts with no consent.
It crosses until the build ends, by When the build ends under The yes to replacing, and a fix after a build's exit 1 that answers that failure keeps it too, by that section: a switch to these Steps with songs he names is such a fix. A build he asks for after that starts with nothing crossed.
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
"Replace it" or "rebuild it" up front names `--replace`, as plan step 1 says, and it crosses as he named it: a listing that named its folder on the plan path named it for the Steps too, so the Steps listing for that folder carries `--replace "<folder>"` at once.
Show what the command printed, and by its exit code:
0: the summary, the set's name, each song with the bar it starts on, its tempo and meter and the transition after it, and the set's path.
```

## 209-row-2

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 2
Nick says:
- Rebuild Grace, Great Are You Lord, Fall Like Rain for November 8.

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace lord rain --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Pins:

```
Nick naming "replace it" or "rebuild it" up front names `--replace`, which goes on by A `--replace` Nick names: this listing runs without it.
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
Every `--replace` names the set folder it replaces, in double quotes, as `--replace "<folder>"`: the folder copied word for word from a listing's last line, or from the problem Steps step 6 answers.
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
His words name it for the set folder of the date and output root they go with, and only a listing names that folder.
```

## 209-row-2-song-change

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 2, the nearest cell to The Steps switch
Nick says:
- Rebuild Grace, Great Are You Lord, Fall Like Rain for November 8.
- yes, but make song 2 Goodness of God

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace goodness rain --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Note: The date, the output root and --replace stay as they were, so the listing does not run again.

Pins:

```
An answer that names a change, a "no" with a change in it included ("no, make it Goodness of God"), is a change: compose the new command and go back to step 4.
A listing or command keeps `--replace` only while it looks in that same set folder.
The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
```

## 209-row-2-new-date-later

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 2, A new date in a later answer
Nick says:
- Rebuild Grace, Great Are You Lord, Fall Like Rain for November 8.
- make it November 1

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-01
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set grace lord rain --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Pins:

```
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
Every `--replace` is for one set folder, whatever gave it: Nick naming it, a yes to the replace question, or a yes to the command Steps step 6 shows with it.
It keeps `--replace` only for the set folder it was given for, by One set folder.
```

## 209-row-2-new-date-and-replace-it

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 2, A new date in a later answer, with "and replace it"
Nick says:
- Rebuild Grace, Great Are You Lord, Fall Like Rain for November 8.
- make it November 1, and replace it

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-01
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-01 --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace lord rain --date 2026-11-01 --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Run it?

Pins:

```
A `--replace` Nick names in the same answer as the new date or output root ("make it November 1, and replace it") is named for the new folder, by A `--replace` Nick names.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
```

## 209-row-2-new-date-with-no-set-folder

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 2, A new date whose folder does not exist
Nick says:
- Rebuild Grace, Great Are You Lord, Fall Like Rain for November 8.
- make it November 15

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-15
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain --date 2026-11-15`
Date line: `Date: Sunday 2026-11-15, the date named`
Question: Run it?

Pins:

```
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
With no set folder for the date, the listing prints no such line, and the question is "Run it?" as usual.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
```

## 209-row-2-no-date-then-november-1

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 2, A new date in a later answer, with no date named up front
Nick says:
- Rebuild Grace, Great Are You Lord, Fall Like Rain.
- make it November 1

Listing:

```
pnpm build-set --list
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace lord rain --date 2026-11-01 --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Run it?

Note: The listing for the default date, 2026-11-01, names its set folder, so the --replace Nick named takes that folder, and the listing runs again with it. "November 1" names that same date, so the listing already answered for it and does not run again.

Pins:

```
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
A date that gives the folder the listing already looked in, such as the coming Sunday said as "November 1", points at no other folder.
Nick naming "replace it" or "rebuild it" up front names `--replace`, which goes on by A `--replace` Nick names: this listing runs without it.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
So the listing for that date and output root runs without `--replace`.
When its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, his words are the yes to replacing that folder: the command takes `--replace "<folder>"`, copied from that line, the listing runs again with it, without asking, and the question is "Run it?".
```

## 209-row-2-no-set-folder

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: setlist-controller#230 (a `--replace` Nick names takes its folder from a listing, and with no set folder there the command has none)
Nick says:
- Rebuild Grace, Great Are You Lord, Fall Like Rain for November 15.

Listing:

```
pnpm build-set --list --date 2026-11-15
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain --date 2026-11-15`
Date line: `Date: Sunday 2026-11-15, the date named`
Question: Run it?

Note: "Rebuild" names `--replace` for the set folder for 2026-11-15, and the listing runs without it. It prints no line about that folder, since none is there, so the command has no `--replace`, and the question is "Run it?".

Pins:

```
Nick naming "replace it" or "rebuild it" up front names `--replace`, which goes on by A `--replace` Nick names: this listing runs without it.
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
So the listing for that date and output root runs without `--replace`.
When the listing prints no such line, no set folder is there to replace, and the command has no `--replace`; a later listing of this build for the same date and output root whose last line names the folder takes it the same way.
Never write the folder from a date or an output root.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
A date on `--date` reads `Date: <weekday> <YYYY-MM-DD>, the date named`.
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
```

## 209-row-3

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 3; #190 (a yes with no change runs at once)
Nick says:
- Build Grace, Great Are You Lord, Fall Like Rain for November 8.
- yes

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Command: `pnpm build-set grace lord rain --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: none: the command runs at once on the yes, with no listing in between

Pins:

```
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
**A yes with no change** ("yes", "yep", "replace it") adds `--replace "<folder>"` to the command, the folder that line names: show it with `--replace` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between.
A yes with no change to step 4's replace question is no such change: its command runs at once, by The yes to replacing.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
```

## 209-row-3-on-the-plan-path

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 3, on the plan path
Nick says:
- Build the set from the plan for November 8.
- yes

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Command: `pnpm build-set --plan --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: none: the command runs at once on the yes, with no listing in between

Pins:

```
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
**A yes with no change** ("yes", "yep", "replace it") adds `--replace "<folder>"` to the command, the folder that line names: show it with `--replace` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between.
**Run it on a yes, and show the outcome,** by steps 5 and 6 of the Steps, with the command step 2 showed.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Exit 0: show the command in a code block: `pnpm build-set --plan`, then the transition flags in the order of the positions they name, then any `--date`, `--service-type`, `--plan-id`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
```

## 209-row-3-fix-after-exit-1

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 3, The build ends: exit 1 and the fix
Nick says:
- Build Grace, Great Are You Lord, Fall Like Rain for November 8.
- yes
- I added the WAV.

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Command: `pnpm build-set grace lord rain --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Note: The build exits 1 on a missing WAV, and Nick adds it.

Pins:

```
A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1.
A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name".
A song folder is in the library, so Nick adds the file to that song's folder in the library.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
**A yes with no change** ("yes", "yep", "replace it") adds `--replace "<folder>"` to the command, the folder that line names: show it with `--replace` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between.
Show what the command printed, and by its exit code:
1: the problems, one per line.
After each, say what fixes it: what Nick adds to the library, the template, the stem map or the pads folder, or a change to the command.
```

## 209-row-4

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 4
Nick says:
- Build the set from the plan for November 8.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Command: `pnpm build-set --plan --date 2026-11-08`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Replace the set built before?

Pins:

```
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
Then ask whether to run it, or, when the listing's last line says the set folder for the date already exists, ask by The yes to replacing. An answer to either question
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Exit 0: show the command in a code block: `pnpm build-set --plan`, then the transition flags in the order of the positions they name, then any `--date`, `--service-type`, `--plan-id`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
When Nick asks for the set from the plan ("Sunday's set from the plan", "build it from Planning Center"), the songs, their keys and the plan's transitions come from the week's plan in Planning Center, not from his words.
Every other song change is a gap.
Run `pnpm build-set --plan --list` from this repo's root, without asking.
It prints the set's name, then each plan song as `<n>. <title>  <plan key>  <folder or its problem>  <transition>, <source>`, two spaces apart, such as `3. Fall Like Rain  E  Fall Like Rain-Call On Heaven-E-70.00bpm  pad in E, from --pad 3`.
That line is no problem and never sets exit 1 on its own.
Under it, the date line as step 4 writes it, then each song in step 4's form, its title, the plan key its line prints and the transition its line gives: `<n>. <title> (<key>), then a gap`, `then an overlap` or `then a pad in <key>`, and the last song `<n>. <title> (<key>), the last song`, or `then a pad in <key> for ministry time`.
```

## 209-row-4-stay-on-the-plan-path

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 4, Stay on the plan path
Nick says:
- Build the set from the plan for November 8.
- yes, but a pad after song 3

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --pad 3 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set --plan --pad 3 --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Pins:

```
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
Every listing and every command of this build after it carries `--replace` while it looks in that set folder, whatever else that answer or a later one changes: a transition, or the songs (by Planning Center or by the Steps).
Run the listing again with it, and with `--replace "<folder>"` when The yes to replacing carries it, or Nick named it and a listing has named its folder, by A `--replace` Nick names, without asking, and show it again from step 2.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Songs are numbered by position, from 1 in service order, and every transition flag names the position of the song before its song change.
| a pad with no key named | `--pad <n>`: it plays in the key the next song's line prints, and after the last song in that song's own key |
| "a pad between A and B", "a pad after A", "a pad before B" | `--pad <A>`, A being the song before the song change |
A pad after the last song names the last song's position, since no song change follows it.
A change Nick names to a transition becomes its transition flag, by the mapping below, on the listing and the command alike: `--overlap <n>`, `--pad <n>` or `--pad <n>=<key>`, or `--gap <n>` to take back a pad or an overlap the plan gives.
Exit 0: show the command in a code block: `pnpm build-set --plan`, then the transition flags in the order of the positions they name, then any `--date`, `--service-type`, `--plan-id`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
```

## 209-row-4-new-date-in-the-same-answer

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 4, A new date in the same answer (gap 2); #210 acceptance criterion 2
Nick says:
- Build the set from the plan for November 8.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain for November 1.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-01
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set grace goodness rain --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Pins:

```
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
What Nick names in the Steps request itself wins over what crosses: a date, a folder, a template, or a transition on the same song change.
So a date or `--output-root` in the Steps request that points the listing at another set folder leaves it behind, unless he names `--replace` there too.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
```

## 209-row-4-new-date-on-the-plan-path

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 4, A new date in the same answer, on the plan path
Nick says:
- Build the set from the plan for November 8.
- yes, but make it November 1

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-01
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set --plan --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Pins:

```
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Exit 0: show the command in a code block: `pnpm build-set --plan`, then the transition flags in the order of the positions they name, then any `--date`, `--service-type`, `--plan-id`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
```

## 209-row-4-replace-it-with-a-new-date

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: pre-PR review 10 finding 1
Nick says:
- Build the set from the plan for November 8.
- replace it, but make it November 1

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-01
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set --plan --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Pins:

```
In an answer to the replace question or to the command Steps step 6 shows with it, any words for replacing, "replace it", "rebuild it" and "rebuild the set I already built" among them, are the yes to that question or command, for the folder it was about, and name no `--replace` for a new date or output root in the same answer.
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
**A yes with no change** ("yes", "yep", "replace it") adds `--replace "<folder>"` to the command, the folder that line names: show it with `--replace` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between.
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
```

## 209-row-4-rebuild-the-set-with-a-new-date

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: setlist-controller#229; pre-PR review 11 finding 1
Nick says:
- Build the set from the plan for November 8.
- rebuild the set I already built, but make it November 1

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-01
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set --plan --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Pins:

```
In an answer to the replace question or to the command Steps step 6 shows with it, any words for replacing, "replace it", "rebuild it" and "rebuild the set I already built" among them, are the yes to that question or command, for the folder it was about, and name no `--replace` for a new date or output root in the same answer.
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
| "replace it", "rebuild the set I already built" | `--replace "<folder>"`, the folder a listing names, by A `--replace` Nick names |
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
```

## 209-row-4-replace-it-with-a-new-date-exit-2

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: setlist-controller#230 review 1 finding 1
Nick says:
- Build the set from the plan for November 8.
- replace it, but make it November 1

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --plan --list --date 2026-11-01 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 2
Last line: none

Listing:

```
pnpm build-set --plan --list --date 2026-11-01
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set --plan --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Note: The second listing is the fault this trace guards: it carries the November 8 `--replace` to November 1, which One set folder forbids, and exits 2 with a problem that names no folder to copy. Its fix drops `--replace` and lists again, so the November 1 set folder gets the replace question, as in 209-row-4-replace-it-with-a-new-date. Copying a folder onto `--replace` from the problem would give the listing `already exists, and --replace replaces it.`, and Already replacing would ask only "Run it?".

Pins:

```
- Exit 2: a fault in the listing command you composed. Fix it and run it again, and an exit 2 on `--replace` by The folder under The yes to replacing.
An exit 2 on `--replace` is fixed by dropping `--replace`, never by copying a folder from the problem it prints: run the listing for the command's date and output root again without it, and go on from its last line as from any listing without `--replace`, so a set folder it names gets the replace question unless Nick's words name `--replace` for that folder, by A `--replace` Nick names.
In an answer to the replace question or to the command Steps step 6 shows with it, any words for replacing, "replace it", "rebuild it" and "rebuild the set I already built" among them, are the yes to that question or command, for the folder it was about, and name no `--replace` for a new date or output root in the same answer.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
The command checks it: a `--replace` that names any other folder than the set folder for the command's date and output root, as a build or as a listing, exits 2, as every usage error does.
```

## 209-row-4-back-to-november-8

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 4, A new date in a later answer, then back
Nick says:
- Build the set from the plan for November 8.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.
- make it November 1
- make it November 8

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-01
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Command: `pnpm build-set grace goodness rain --date 2026-11-08`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Replace the set built before?

Pins:

```
A change back to a folder that had a yes earlier in this build asks again.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
```

## 209-row-4-new-date-with-no-set-folder

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 4, A new date whose folder does not exist
Nick says:
- Build the set from the plan for November 8.
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.
- make it November 15

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-15
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace goodness rain --date 2026-11-15`
Date line: `Date: Sunday 2026-11-15, the date named`
Question: Run it?

Pins:

```
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
With no set folder for the date, the listing prints no such line, and the question is "Run it?" as usual.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
```

## 209-row-5

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 5; #190 acceptance criterion 4 (step 6's --replace fix still holds)
Nick says:
- Build Grace, Great Are You Lord, Fall Like Rain.
- yes

Listing:

```
pnpm build-set --list
```

Set folders: 2026-11-08 Sunday
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"`
Date line: `Date: Sunday 2026-11-01, the coming Sunday, since no date is named`
Question: Run it?

Note: The set folder for 2026-11-01 is not there at the listing; another build writes it before the yes, and the build exits 1 on `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. Build with --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" to replace it.`

Pins:

```
A set folder that already exists is fixed by the same command with the `--replace "<folder>"` the problem names, copied as printed, which replaces that set: show it and wait for a yes, from step 4.
Step 4 asks about a set folder the listing found, so this problem comes only from a set folder that appeared after step 1's listing, such as one another build wrote in between.
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
A command gains `--replace` only when Nick names it, says yes to the replace question, or says yes to the command Steps step 6 shows with it for a set folder that appeared after the listing, with a change or without one.
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
Every `--replace` names the set folder it replaces, in double quotes, as `--replace "<folder>"`: the folder copied word for word from a listing's last line, or from the problem Steps step 6 answers.
```

## 209-row-5-stay-on-the-plan-path

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 5, Stay on the plan path
Nick says:
- Build Sunday's set from the plan.
- yes
- yes, but a pad after song 3

Listing:

```
pnpm build-set --plan --list
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-08 Sunday
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --plan --list --pad 3 --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set --plan --pad 3 --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"`
Date line: `Date: Sunday 2026-11-01, the coming Sunday, since no date is named`
Question: Run it?

Note: The set folder for 2026-11-01 is not there at the listing; another build writes it before the yes, and the build exits 1 on `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. Build with --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" to replace it.` Steps step 6 shows `pnpm build-set --plan --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"`.

Pins:

```
A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1.
A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name".
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
Run the listing again with it, and with `--replace "<folder>"` when The yes to replacing carries it, or Nick named it and a listing has named its folder, by A `--replace` Nick names, without asking, and show it again from step 2.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
Songs are numbered by position, from 1 in service order, and every transition flag names the position of the song before its song change.
| a pad with no key named | `--pad <n>`: it plays in the key the next song's line prints, and after the last song in that song's own key |
| "a pad between A and B", "a pad after A", "a pad before B" | `--pad <A>`, A being the song before the song change |
A pad after the last song names the last song's position, since no song change follows it.
A change Nick names to a transition becomes its transition flag, by the mapping below, on the listing and the command alike: `--overlap <n>`, `--pad <n>` or `--pad <n>=<key>`, or `--gap <n>` to take back a pad or an overlap the plan gives.
Exit 0: show the command in a code block: `pnpm build-set --plan`, then the transition flags in the order of the positions they name, then any `--date`, `--service-type`, `--plan-id`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
```

## 209-row-5-steps-switch

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 5, The Steps switch
Nick says:
- Build Sunday's set from the plan.
- yes
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.

Listing:

```
pnpm build-set --plan --list
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-08 Sunday
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --list --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace goodness rain --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"`
Date line: `Date: Sunday 2026-11-01, the coming Sunday, since no date is named`
Question: Run it?

Note: The set folder for 2026-11-01 is not there at the listing; another build writes it before the yes, and the build exits 1 on `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. Build with --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" to replace it.` Steps step 6 shows `pnpm build-set --plan --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"`.

Pins:

```
A `--replace` that crosses, named by Nick or carried by a yes to the replace question, stays on the listing and the build command only while they look in the set folder it was given for, by One set folder under The yes to replacing.
A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1.
A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name".
Whether he then changes the plan in Planning Center or names the songs by the Steps, the next listing and command have `--replace` on the same terms, by From the plan path under Steps step 1 and One set folder under The yes to replacing.
Show the line as printed, and ask "Run it?" as usual, with no second question.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
```

## 209-row-5-new-date

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 5, A new date in the same answer
Nick says:
- Build Grace, Great Are You Lord, Fall Like Rain.
- yes
- yes, but for November 8

Listing:

```
pnpm build-set --list
```

Set folders: 2026-11-08 Sunday
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Command: `pnpm build-set grace lord rain --date 2026-11-08`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Replace the set built before?

Note: The set folder for 2026-11-01 is not there at the listing; another build writes it before the yes, and the build exits 1 on `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. Build with --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" to replace it.`

Pins:

```
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
```

## 209-row-5-replace-it-with-a-new-date

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: setlist-controller#229; pre-PR review 11 finding 2
Nick says:
- Build Grace, Great Are You Lord, Fall Like Rain.
- yes
- replace it, but for November 8

Listing:

```
pnpm build-set --list
```

Set folders: 2026-11-08 Sunday
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Command: `pnpm build-set grace lord rain --date 2026-11-08`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Replace the set built before?

Note: The set folder for 2026-11-01 is not there at the listing; another build writes it before the yes, and the build exits 1 on `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. Build with --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" to replace it.`

Pins:

```
In an answer to the replace question or to the command Steps step 6 shows with it, any words for replacing, "replace it", "rebuild it" and "rebuild the set I already built" among them, are the yes to that question or command, for the folder it was about, and name no `--replace` for a new date or output root in the same answer.
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
```

## 209-row-5-new-date-later

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 5, A new date in a later answer
Nick says:
- Build Sunday's set from the plan.
- yes
- yes, but swap song 2 for Goodness of God
- build it from songs I name
- Grace, Goodness of God, Fall Like Rain.
- make it November 8

Listing:

```
pnpm build-set --plan --list
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-08 Sunday
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --list --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Command: `pnpm build-set grace goodness rain --date 2026-11-08`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Replace the set built before?

Note: The set folder for 2026-11-01 is not there at the listing; another build writes it before the yes, and the build exits 1 on `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. Build with --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" to replace it.` Steps step 6 shows `pnpm build-set --plan --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"`. The --replace it gave is for 2026-11-01, and crosses to the Steps with it; "make it November 8" at the Steps' "Run it?" points at another folder, so it stays behind.

Pins:

```
That folder is the set folder under the output root for the date of the listing or command it was given on: for a yes to the replace question, the folder its line names; for a `--replace` Nick names, the folder the listing names for the date and output root he names it with, the default date when he names none; for Steps step 6, the folder its problem names.
This holds for a `--replace` that crosses from The plan path, and for one that When the build ends keeps on a fix after a build's exit 1.
A listing or command keeps `--replace` only while it looks in that same set folder.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
```

## 209-row-5-new-date-with-no-set-folder

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 5, A new date whose folder does not exist
Nick says:
- Build Grace, Great Are You Lord, Fall Like Rain.
- yes
- yes, but for November 15

Listing:

```
pnpm build-set --list
```

Set folders: 2026-11-08 Sunday
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Listing:

```
pnpm build-set --list --date 2026-11-15
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain --date 2026-11-15`
Date line: `Date: Sunday 2026-11-15, the date named`
Question: Run it?

Note: The set folder for 2026-11-01 is not there at the listing; another build writes it before the yes, and the build exits 1 on `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. Build with --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" to replace it.`

Pins:

```
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
With no set folder for the date, the listing prints no such line, and the question is "Run it?" as usual.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
```

## 209-row-5-new-request

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #209 hand-trace matrix (353aae9), row 5, The build ends, then a new request
Nick says:
- Build Grace, Great Are You Lord, Fall Like Rain.
- yes
- yes
- Build Grace, Great Are You Lord, Fall Like Rain.

Listing:

```
pnpm build-set --list
```

Set folders: 2026-11-08 Sunday
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Listing:

```
pnpm build-set --list
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set grace lord rain`
Date line: `Date: Sunday 2026-11-01, the coming Sunday, since no date is named`
Question: Replace the set built before?

Note: The set folder for 2026-11-01 is not there at the listing; another build writes it before the yes, and the build exits 1 on `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. Build with --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" to replace it.` The yes to `pnpm build-set grace lord rain --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday"` runs it, exit 0.

Pins:

```
This build ends when a build command runs, or when Nick calls it off.
A build Nick asks for after that starts with no consent.
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
```

## 232-503-then-songs-i-name

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: 25b60bb's green; #232 acceptance criterion 3
Nick says:
- Build the set from the plan for November 8.
- yes
- Grace, Goodness of God, Fall Like Rain.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace goodness rain --date 2026-11-08`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Note: The yes runs `pnpm build-set --plan --date 2026-11-08`, which exits 1 on `Planning Center answered 503 to ...`, and it lasts until the service. The songs are Nick's answer to that exit 1.

Pins:

```
This build ends when a build command runs, or when Nick calls it off.
A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1.
A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name".
It crosses until the build ends, by When the build ends under The yes to replacing, and a fix after a build's exit 1 that answers that failure keeps it too, by that section: a switch to these Steps with songs he names is such a fix. A build he asks for after that starts with nothing crossed.
Songs Nick names in reply to the build's exit 1, whatever fix step 2 gives its problem, answer that failure: the set is built from them by the Steps, and what he named on the plan path crosses with him, with the `--replace` the command had, by When the build ends under The yes to replacing.
500, 503 or any other 5xx: a fault or maintenance on Planning Center's own servers. Nick builds again later, while the Mac is on the internet. When it lasts until the service, he builds the set from songs he names, by the Steps.
On every route, what he named on the plan path for this build crosses with him, as if he had named it again.
`--date`, `--output-root`, `--library` and `--pads` he named go on the listing and the build command. So a date he named there gives the date line `Date: <weekday> <YYYY-MM-DD>, the date named`.
When Nick's answer to that command is a yes with no change ("yes", "yep", "run it"), run it exactly as shown, from this repo's root.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
A plan problem the build prints is fixed as step 2 says.
```

## 232-429-then-swap

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: c5e98d7 trace 1's green; #232 acceptance criterion 3
Nick says:
- Build the set from the plan for November 8.
- yes
- swap Fall Like Rain for Build My Life
- build it from songs I name
- Grace, Great Are You Lord, Build My Life.

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord life --date 2026-11-08`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Note: The yes runs `pnpm build-set --plan --date 2026-11-08`, which exits 1 on `Planning Center answered 429 to ...`. The swap is Nick's answer to that exit 1, though the 429's fix is to wait and build again.

Pins:

```
This build ends when a build command runs, or when Nick calls it off.
A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1.
A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name".
It crosses until the build ends, by When the build ends under The yes to replacing, and a fix after a build's exit 1 that answers that failure keeps it too, by that section: a switch to these Steps with songs he names is such a fix. A build he asks for after that starts with nothing crossed.
Songs Nick names in reply to the build's exit 1, whatever fix step 2 gives its problem, answer that failure: the set is built from them by the Steps, and what he named on the plan path crosses with him, with the `--replace` the command had, by When the build ends under The yes to replacing.
429: too many requests to Planning Center for that account in a short time.
Nick waits about half a minute and builds again.
on the plan path, a change to the songs themselves: a song swapped, added, dropped or moved. The songs come from the plan, and `--plan` takes no song name, so ask whether Nick changes the plan in Planning Center and you list it again, or the set is built from songs he names, by the Steps.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
`--date`, `--output-root`, `--library` and `--pads` he named go on the listing and the build command. So a date he named there gives the date line `Date: <weekday> <YYYY-MM-DD>, the date named`.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
```

## 232-429-after-replace-then-songs

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: c2a8af8 trace 1; #232 acceptance criterion 3
Nick says:
- Build the set from the plan for November 8.
- yes
- just build Grace, Great Are You Lord, Fall Like Rain

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace lord rain --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`
Date line: `Date: Sunday 2026-11-08, the date named`
Question: Run it?

Note: The yes to the replace question runs `pnpm build-set --plan --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"`, which exits 1 on `Planning Center answered 429 to ...`. "just build ..." is Nick's answer to that exit 1, given straight after it, though the 429's fix is to wait and build again.

Pins:

```
This build ends when a build command runs, or when Nick calls it off.
A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1.
A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name".
It crosses until the build ends, by When the build ends under The yes to replacing, and a fix after a build's exit 1 that answers that failure keeps it too, by that section: a switch to these Steps with songs he names is such a fix. A build he asks for after that starts with nothing crossed.
Songs Nick names in reply to the build's exit 1, whatever fix step 2 gives its problem, answer that failure: the set is built from them by the Steps, and what he named on the plan path crosses with him, with the `--replace` the command had, by When the build ends under The yes to replacing.
429: too many requests to Planning Center for that account in a short time.
Nick waits about half a minute and builds again.
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
**A yes with no change** ("yes", "yep", "replace it") adds `--replace "<folder>"` to the command, the folder that line names: show it with `--replace` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between.
Every listing and every command of this build after it carries `--replace` while it looks in that set folder, whatever else that answer or a later one changes: a transition, or the songs (by Planning Center or by the Steps).
A `--replace` that crosses, named by Nick or carried by a yes to the replace question, stays on the listing and the build command only while they look in the set folder it was given for, by One set folder under The yes to replacing.
A listing or command keeps `--replace` only while it looks in that same set folder.
This holds for a `--replace` that crosses from The plan path, and for one that When the build ends keeps on a fix after a build's exit 1.
Show the line as printed, and ask "Run it?" as usual, with no second question.
`--date`, `--output-root`, `--library` and `--pads` he named go on the listing and the build command. So a date he named there gives the date line `Date: <weekday> <YYYY-MM-DD>, the date named`.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
A song change he names no transition for is a gap and adds nothing.
```

## example-1-overlap

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: SKILL.md worked example 1; setlist-controller#231
Nick says:
- Grace, Great Are You Lord, then Fall Like Rain. Overlap Grace into Great Are You Lord.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain --overlap 1`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Run it?

Pins:

```
Run `pnpm build-set --list` from this repo's root.
It prints one line per song folder the build can match, in three parts two spaces apart: the short name, the song's key or `no key`, and the folder name, such as `grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm`.
Run it every time; the listing under Worked examples is only what the examples assume.
For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title).
Number the songs from 1 in the order Nick names them, and turn each transition he names into its flag by the mapping below, and each transition that crosses from The plan path by step 1 into its flag at its new position.
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
Under it, open the listing with a date line, the date the set is built for with its weekday.
When Nick names no date, the line gives the command's default: `Date: Sunday <YYYY-MM-DD>, today, since no date is named` when today is a Sunday, and otherwise `Date: Sunday <YYYY-MM-DD>, the coming Sunday, since no date is named`.
Then ask whether to run it, or, when the listing's last line says the set folder for the date already exists, ask by The yes to replacing. Done when Nick answers.
| "overlap A into B", with B right after A | `--overlap <A>` |
A key is a note name: a letter A to G, then `#` or `b`, then `m` for minor. Write a spoken key that way: "B flat" is `Bb`, "F sharp minor" is `F#m`, "E minor" is `Em`. "Into", "then" and "and" only order the songs; the transition is the one Nick names.
```

## example-2-pad-between-songs

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: SKILL.md worked example 2; setlist-controller#231
Nick says:
- Grace, Goodness of God, Fall Like Rain, with a pad before Fall Like Rain.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace goodness rain --pad 2`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Run it?

Note: The song before Fall Like Rain is song 2. No key is named, so the pad plays in Fall Like Rain's key, E, as its line prints, and the song lines read `2. Goodness of God (A), then a pad in E`.

Pins:

```
It prints one line per song folder the build can match, in three parts two spaces apart: the short name, the song's key or `no key`, and the folder name, such as `grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm`.
For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title).
Number the songs from 1 in the order Nick names them, and turn each transition he names into its flag by the mapping below, and each transition that crosses from The plan path by step 1 into its flag at its new position.
Then list each song by position with its title, the key its line prints and the transition after it, as worked example 6 shows: `<n>. <title> (<key>), then a gap`, `then an overlap`, or `then a pad in <key>`.
| "a pad between A and B", "a pad after A", "a pad before B" | `--pad <A>`, A being the song before the song change |
| a pad with no key named | `--pad <n>`: it plays in the key the next song's line prints, and after the last song in that song's own key |
```

## example-3-pad-in-e

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: SKILL.md worked example 3; setlist-controller#231
Nick says:
- Great Are You Lord into Build My Life, with a pad in E between them.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set lord life --pad 1=E`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Run it?

Pins:

```
For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title).
Number the songs from 1 in the order Nick names them, and turn each transition he names into its flag by the mapping below, and each transition that crosses from The plan path by step 1 into its flag at its new position.
| "a pad between A and B", "a pad after A", "a pad before B" | `--pad <A>`, A being the song before the song change |
| "a pad in E", any key he names | `--pad <n>=E` |
A key is a note name: a letter A to G, then `#` or `b`, then `m` for minor. Write a spoken key that way: "B flat" is `Bb`, "F sharp minor" is `F#m`, "E minor" is `Em`. "Into", "then" and "and" only order the songs; the transition is the one Nick names.
```

## example-4-pad-in-the-key-of-the-song-before

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: SKILL.md worked example 4; setlist-controller#231
Nick says:
- Goodness of God, then a pad in the key of the song before, then Fall Like Rain.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set goodness rain --pad 1=A`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Run it?

Note: Goodness of God's line prints A.

Pins:

```
It prints one line per song folder the build can match, in three parts two spaces apart: the short name, the song's key or `no key`, and the folder name, such as `grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm`.
For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title).
| "a pad in the key of the song before" | `--pad <n>=<the key the song before's line prints>` |
```

## example-5-pad-after-the-last-song

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: SKILL.md worked example 5; setlist-controller#231
Nick says:
- Grace, Great Are You Lord, Fall Like Rain, and a pad after the last song for ministry time.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain --pad 3`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Run it?

Note: Fall Like Rain is song 3, the last, and its song lines end `3. Fall Like Rain (E), then a pad in E for ministry time`.

Pins:

```
For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title).
Number the songs from 1 in the order Nick names them, and turn each transition he names into its flag by the mapping below, and each transition that crosses from The plan path by step 1 into its flag at its new position.
The last song with no pad after it reads `<n>. <title> (<key>), the last song`, and with a pad after it, `<n>. <title> (<key>), then a pad in <key> for ministry time`.
| "a pad after the last song", "a pad for ministry time" after it | `--pad <last>` |
| a pad with no key named | `--pad <n>`: it plays in the key the next song's line prints, and after the last song in that song's own key |
A pad after the last song names the last song's position, since no song change follows it.
```

## example-6-whole-service

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: SKILL.md worked example 6; setlist-controller#231
Nick says:
- Grace, Goodness, Great Are You Lord, Fall Like Rain. Overlap Goodness into Great Are You Lord, a pad in E before Fall Like Rain, and a pad after Fall Like Rain for ministry time.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace goodness lord rain --overlap 2 --pad 3=E --pad 4`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Run it?

Song lines:

```
1. This Is Amazing Grace (D), then a gap
2. Goodness of God (A), then an overlap
3. Great Are You Lord (D), then a pad in E
4. Fall Like Rain (E), then a pad in E for ministry time
```

Pins:

```
Run `pnpm build-set --list` from this repo's root.
It prints one line per song folder the build can match, in three parts two spaces apart: the short name, the song's key or `no key`, and the folder name, such as `grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm`.
Run it every time; the listing under Worked examples is only what the examples assume.
For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title).
Number the songs from 1 in the order Nick names them, and turn each transition he names into its flag by the mapping below, and each transition that crosses from The plan path by step 1 into its flag at its new position.
A song change he names no transition for is a gap and adds nothing.
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
Under it, open the listing with a date line, the date the set is built for with its weekday.
When Nick names no date, the line gives the command's default: `Date: Sunday <YYYY-MM-DD>, today, since no date is named` when today is a Sunday, and otherwise `Date: Sunday <YYYY-MM-DD>, the coming Sunday, since no date is named`.
Then list each song by position with its title, the key its line prints and the transition after it, as worked example 6 shows: `<n>. <title> (<key>), then a gap`, `then an overlap`, or `then a pad in <key>`.
The last song with no pad after it reads `<n>. <title> (<key>), the last song`, and with a pad after it, `<n>. <title> (<key>), then a pad in <key> for ministry time`.
Then ask whether to run it, or, when the listing's last line says the set folder for the date already exists, ask by The yes to replacing. Done when Nick answers.
| "overlap A into B", with B right after A | `--overlap <A>` |
| "a pad after the last song", "a pad for ministry time" after it | `--pad <last>` |
| "a pad in E", any key he names | `--pad <n>=E` |
| a pad with no key named | `--pad <n>`: it plays in the key the next song's line prints, and after the last song in that song's own key |
```

## example-7-ask

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: SKILL.md worked example 7; setlist-controller#231
Nick says:
- God, then Grace, with a pad before God.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: no command
Date line: none
Question: Two questions: is "God" `Goodness of God-Victory-A-63.00bpm` or `Trust In God-CAN YOU IMAGINE--A-74.00bpm`? And the command has no pad before the first song: should the pad go somewhere else, or be left out?

Pins:

```
Run `pnpm build-set --list` from this repo's root.
It prints one line per song folder the build can match, in three parts two spaces apart: the short name, the song's key or `no key`, and the folder name, such as `grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm`.
For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title).
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
a song whose title is on no listed line, or on more than one (name the folders it could be);
a pad before the first song;
```

## ask-pad-key-from-a-no-key-song

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders, and Way Maker with no key
Source: setlist-controller#231
Nick says:
- Grace, Way Maker, with a pad before Way Maker.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `maker  no key  Way Maker-Sinach-68.00bpm`

Command: no command
Date line: none
Question: Way Maker's line prints no key, so the pad before it has none to take: which key does the pad play in?

Note: With no key named, the pad would play in the key the next song's line prints, and Way Maker's prints `no key`.

Pins:

```
It prints one line per song folder the build can match, in three parts two spaces apart: the short name, the song's key or `no key`, and the folder name, such as `grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm`.
`no key` means the song builds, but a pad cannot take its key from it.
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
a pad that would take its key from a song listed with `no key`: a pad with no key named before such a song, or after it when it is the last song, or a pad in the key of the song before or after when that song is such a song (ask which key the pad plays in);
| a pad with no key named | `--pad <n>`: it plays in the key the next song's line prints, and after the last song in that song's own key |
```

## ask-overlap-into-a-song-not-next

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: setlist-controller#231
Nick says:
- Grace, Great Are You Lord, Fall Like Rain. Overlap Grace into Fall Like Rain.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: no command
Date line: none
Question: Fall Like Rain does not come right after Grace, so the overlap has no song change: which song change does it go on, or is it left out?

Pins:

```
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
"overlap A into B" where B does not come right after A;
| "overlap A into B", with B right after A | `--overlap <A>` |
```

## ask-overlap-from-the-last-song

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: setlist-controller#231
Nick says:
- Grace, Great Are You Lord, Fall Like Rain, and overlap Fall Like Rain.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: no command
Date line: none
Question: Fall Like Rain is the last song, with no song after it to overlap into: does the overlap go somewhere else, or is it left out?

Pins:

```
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
an overlap from the last song, which has no song after it;
```

## ask-overlap-and-pad-on-one-song-change

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: setlist-controller#231
Nick says:
- Grace, Great Are You Lord, Fall Like Rain. Overlap Grace into Great Are You Lord, with a pad between them.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: no command
Date line: none
Question: The song change from Grace to Great Are You Lord has an overlap and a pad: which one does it get?

Pins:

```
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
an overlap and a pad on one song change;
A song change is the move from one song to the next, and its transition is a gap (the default: 4 bars of silence), an overlap, or a pad.
```

## ask-key-that-is-no-note-name

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: setlist-controller#231
Nick says:
- Grace, Great Are You Lord, with a pad in H between them.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: no command
Date line: none
Question: H is no note name: which key does the pad between Grace and Great Are You Lord play in?

Pins:

```
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
a key that is no note name;
A key is a note name: a letter A to G, then `#` or `b`, then `m` for minor. Write a spoken key that way: "B flat" is `Bb`, "F sharp minor" is `F#m`, "E minor" is `Em`. "Into", "then" and "and" only order the songs; the transition is the one Nick names.
```

## ask-transition-word

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: setlist-controller#231
Nick says:
- Grace, then flow into Great Are You Lord, then Fall Like Rain.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: no command
Date line: none
Question: "Flow into" is no overlap, pad or gap: which one does the song change from Grace to Great Are You Lord get?

Pins:

```
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
a transition word other than overlap, pad or gap, such as "flow into" or "segue";
```

## ask-no-flag-for-it

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: setlist-controller#231
Nick says:
- Grace, Great Are You Lord, with a crossfade between them.

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: no command
Date line: none
Question: The command has no crossfade: does the song change from Grace to Great Are You Lord get an overlap, a pad or a gap?

Pins:

```
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
anything the command has no flag for: a gap of another length (the gap is always 4 bars), a crossfade, a fade length, a pad of another length (the Pad section is always 60 seconds);
```

## date-passed-this-year

Said on: Sunday 2026-12-20
Library: the worked examples' seven folders
Source: SKILL.md Ask instead of guess, its "January 3" example; setlist-controller#231
Nick says:
- Grace, Great Are You Lord, Fall Like Rain for January 3.

Listing:

```
pnpm build-set --list --date 2027-01-03
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain --date 2027-01-03`
Date line: `Date: Sunday 2027-01-03, the date named`
Question: Run it?

Note: January 3 has passed this year, so it comes round on Sunday 2027-01-03, 14 days away, and goes on the command with no question.

Pins:

```
A date that has passed this year comes round next year, most often more than 28 days away; "January 3" said on 2026-12-20 is Sunday 2027-01-03, 14 days away, and goes on the command.
A date on `--date` reads `Date: <weekday> <YYYY-MM-DD>, the date named`.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
```

## date-more-than-28-days-away

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: setlist-controller#231
Nick says:
- Grace, Great Are You Lord, Fall Like Rain for November 29.
- yes, November 29

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Listing:

```
pnpm build-set --list --date 2026-11-29
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain --date 2026-11-29`
Date line: `Date: Sunday 2026-11-29, the date named`
Question: Run it?

Note: "November 29" said on 2026-10-17 is Sunday 2026-11-29, 43 days away, so it puts no `--date` on the first listing, and the skill shows no command and asks which Sunday Nick means, naming Sunday 2026-11-29. He answers that he means that very day.

Pins:

```
a named date whose next occurrence, today or later, is not a Sunday, or is more than 28 days (four weeks) after today.
Name the date with its year and weekday, and ask which Sunday he means.
When he answers that he means that very day, it goes on the command.
The line answers for one date and output root, so when the date, `--output-root` or `--replace` changes after this step (an answered date question, or a change at step 5), run the listing again with them, without asking, before step 4 shows the command.
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
```

## steps-library-cannot-be-read

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: setlist-controller#231
Nick says:
- Grace, Great Are You Lord, Fall Like Rain, from the library /Volumes/Stage/Missing.

Listing:

```
pnpm build-set --list --library /Volumes/Stage/Missing
```

Set folders: none
Exit: 1
Last line: none

Command: no command
Date line: none
Question: none: the skill shows `Cannot read the song library /Volumes/Stage/Missing.` and stops

Pins:

```
Add `--library <folder>` when Nick names a library folder, and `--pads <folder>` when he names a pads folder, and any `--date` or `--output-root <folder>` he names, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder.
On exit 1, show Nick the problem it printed (a library it cannot read) and stop there.
```

## steps-replace-exit-2

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: setlist-controller#231, the Steps form of 209-row-4-replace-it-with-a-new-date-exit-2
Nick says:
- Rebuild Grace, Great Are You Lord, Fall Like Rain for November 8.
- make it November 1

Listing:

```
pnpm build-set --list --date 2026-11-08
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-08 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday already exists, and --replace replaces it.`

Listing:

```
pnpm build-set --list --date 2026-11-01 --replace "/Users/nick/Music/Ableton/Sets/2026-11-08 Sunday"
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 2
Last line: none

Listing:

```
pnpm build-set --list --date 2026-11-01
```

Set folders: 2026-11-01 Sunday, 2026-11-08 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-11-01 Sunday" replaces it.`

Command: `pnpm build-set grace lord rain --date 2026-11-01`
Date line: `Date: Sunday 2026-11-01, the date named`
Question: Replace the set built before?

Note: The third listing is the fault this trace guards: it carries the November 8 `--replace` to November 1, which One set folder forbids, and exits 2. Its fix drops `--replace` and lists again, as in 209-row-2-new-date-later, so the November 1 set folder gets the replace question.

Pins:

```
Exit 2 is a fault in the listing command you composed: fix it and run it again, and an exit 2 on `--replace` by The folder under The yes to replacing.
The command checks it: a `--replace` that names any other folder than the set folder for the command's date and output root, as a build or as a listing, exits 2, as every usage error does.
An exit 2 on `--replace` is fixed by dropping `--replace`, never by copying a folder from the problem it prints: run the listing for the command's date and output root again without it, and go on from its last line as from any listing without `--replace`, so a set folder it names gets the replace question unless Nick's words name `--replace` for that folder, by A `--replace` Nick names.
When a new date or a new `--output-root` points the listing at another set folder, the listing runs again without `--replace`, by Steps step 1: when that folder exists, its last line is `<folder> already exists. The build stops on it unless --replace "<folder>" replaces it.`, and the question is "Replace the set built before?" for that folder; when it does not, the listing prints no such line, and the question is "Run it?" as usual.
Every `--replace` is for one set folder, whatever gave it: Nick naming it, a yes to the replace question, or a yes to the command Steps step 6 shows with it.
```

## plan-gap-crosses-as-nothing

Said on: Saturday 2027-01-02
Library: the Phase 0 plan's songs
Source: setlist-controller#231
Nick says:
- Build Sunday's set from the plan.
- yes, but no pad after song 2
- move Fall Like Rain to the start
- build it from songs I name
- Fall Like Rain, WELCOME HOME, Yes And Amen.

Listing:

```
pnpm build-set --plan --list
```

Plan: the recorded Phase 0 plan, on 2027-01-03
Set folders: none
Exit: 0
Last line: `Warning: song 2, "Yes And Amen", is planned in 4/4, and its song starts in 6/8.`

Listing:

```
pnpm build-set --plan --list --gap 2
```

Plan: the recorded Phase 0 plan, on 2027-01-03
Set folders: none
Exit: 0
Last line: `Warning: song 2, "Yes And Amen", is planned in 4/4, and its song starts in 6/8.`

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `amen  G  Yes And Amen-Jesus Culture-G-72.00bpm`

Command: `pnpm build-set rain home amen`
Date line: `Date: Sunday 2027-01-03, the coming Sunday, since no date is named`
Question: Run it?

Note: The `--gap 2` Nick named replaces the pad the plan's `Prayer` gives after song 2, and crosses as nothing. The question on the move names the overlap from song 1 that the plan's `overlap` note gives, and says it does not cross; it is none Nick named, so every song change on the Steps is a gap.

Pins:

```
A `--gap` he named crosses as nothing, since a song change with no transition named is a gap on the Steps.
A transition the plan gave, a pad from a `Prayer` item or an overlap from an `overlap` note, is none Nick named, so it does not cross.
A change Nick names to a transition becomes its transition flag, by the mapping below, on the listing and the command alike: `--overlap <n>`, `--pad <n>` or `--pad <n>=<key>`, or `--gap <n>` to take back a pad or an overlap the plan gives.
| "no pad after song n", "take out the overlap", "make it a gap", on the plan path | `--gap <n>`, n being the song before the song change |
The source is `the default`, `from the plan` or `from <flag>`; the last song has the transition field only when something gives it one.
```

## plan-listing-runs-the-build-checks

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders, with a WAV missing from Fall Like Rain
Source: setlist-controller#231
Nick says:
- Build Sunday's set from the plan.

Listing:

```
pnpm build-set --plan --list
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 1
Last line: `Dismissal: no effect`

Command: no command
Date line: none
Question: none: the skill shows `Fall Like Rain-Call On Heaven-E-70.00bpm: MultiTracks/AG 3.wav is missing from the song folder.`, from stderr, and its fix, the file added to that song's folder in the library, and shows no build command

Pins:

```
When Nick asks for the set from the plan ("Sunday's set from the plan", "build it from Planning Center"), the songs, their keys and the plan's transitions come from the week's plan in Planning Center, not from his words.
Run `pnpm build-set --plan --list` from this repo's root, without asking.
Then a line for each item that is no song, from the first song on, such as `Prayer: a pad after song 2` or `Message: no effect`, then a `Warning:` line for each song whose plan BPM or meter differs from its folder's, then one for each song whose arrangement has no chart text in Planning Center, and one for each whose chart text has no chords in square brackets.
When no song line and no song change has a problem, it then runs the build's own checks on the songs' folders, with the template, stem map, transitions and pads folder the build would use, and prints each problem the build would stop on, on stderr after the listing.
Exit 1 with song lines that are all clean (each holds a folder name, and a `<transition>, <source>` field where one is due), and one or more problem lines on stderr after the listing: these are the build's own checks, run because no song line and no song change has a problem.
The lines are on stderr, after the listing, word for word as the build prints them.
Show each, and after it what fixes it, as step 6 of the Steps gives it: a song folder in the library, the template, the stem map (`config/stem-map.json` in this repo) or the pads folder, or a change to the command, such as `--pads` naming the folder that holds the pads, which then goes on the listing and the build command alike.
Show no build command, since the build stops on the same lines.
`<folder>: <file> is missing from the song folder.`: a WAV the song's clips play is not in its folder, as a half-synced song folder leaves one.
```

## plan-listing-no-such-service-type

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: setlist-controller#231 review pass 2 finding 2
Nick says:
- Build Sunday's set from the plan, for the Youth Ministry service.

Listing:

```
pnpm build-set --plan --list --service-type "Youth Ministry"
```

Plan: the recorded Phase 0 plan, on 2027-01-03
Set folders: none
Exit: 1
Last line: none

Command: no command
Date line: none
Question: which service type he means, from the ones the problem lists, such as Youth, Youth Night or YTH - Mid

Note: The listing prints `Planning Center has no service type "Youth Ministry". Its service types: Service (997539), Hospitality (1000011), Nursery (1000012), Sunday Service (1000013), Kids Team (1000014), Host/Check-In (1000015), Youth Night (1000016), Prayer - Sunday Service (1000017), Life Safety Team (1000018), Event (1000019), Kids (1000020), Youth (1000021), YTH - Mid (1000022).` on stderr, and nothing on stdout. The skill shows it and asks, and guesses no service type.

Pins:

```
When Nick asks for the set from the plan ("Sunday's set from the plan", "build it from Planning Center"), the songs, their keys and the plan's transitions come from the week's plan in Planning Center, not from his words.
Run `pnpm build-set --plan --list` from this repo's root, without asking.
Add any `--date`, `--service-type`, `--plan-id`, `--library`, `--pads`, `--template` or `--output-root` Nick named, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, after a fix included, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder.
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| "the Christmas Eve service", a service type he names | `--service-type "<name>"` |
Exit 1 with no song lines: the problem stopped the listing before the plan's songs.
Show it, what fixes it, and no build command.
`"<type>" has no plan on <date> in Planning Center.`, `Planning Center has no service type "<name>". ...`, or `--plan-id <id> is not a "<type>" plan on <date>. ...`: ask which date, service type or plan he means, from what the problem lists.
```

## 226-name-matches-two-folders

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders, and Lord I Need You
Source: setlist-controller#226 name-match fixes, merged into setlist-controller#58
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes
- List it again.

Listing:

```
pnpm build-set --list
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace are rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Run it?

Note: Nick adds `Lord I Need You-Matt Maher-E-72.00bpm` to the library after the first listing, which printed `lord` for Great Are You Lord. The build of `pnpm build-set grace lord rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"` then exits 1 on `"lord" matches 2 song folders; name one more fully:`, followed by both folders. Nick's reply answers that failure, so the second listing keeps the `--replace` the build had, and prints `are` for Great Are You Lord, since `lord` and `you` are in Lord I Need You's name too. The first listing's exit and last line are the same with Lord I Need You or without it, so both run against the library with it.

Pins:

```
Run `pnpm build-set --list` from this repo's root.
Add `--library <folder>` when Nick names a library folder, and `--pads <folder>` when he names a pads folder, and any `--date` or `--output-root <folder>` he names, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder.
It prints one line per song folder the build can match, in three parts two spaces apart: the short name, the song's key or `no key`, and the folder name, such as `grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm`.
For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title).
`"<name>" matches <n> song folders; name one more fully:...`: the name is part of more than one folder name the library holds, so the library changed after step 1's listing, or the name is not one the listing printed.
The listing runs again (back to step 1), and the command takes the short name it prints for the folder Nick means, which names that folder alone.
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
When Nick names no date, the line gives the command's default: `Date: Sunday <YYYY-MM-DD>, today, since no date is named` when today is a Sunday, and otherwise `Date: Sunday <YYYY-MM-DD>, the coming Sunday, since no date is named`.
A song change he names no transition for is a gap and adds nothing.
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
**A yes with no change** ("yes", "yep", "replace it") adds `--replace "<folder>"` to the command, the folder that line names: show it with `--replace` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between.
Show what the command printed, and by its exit code:
1: the problems, one per line.
After each, say what fixes it: what Nick adds to the library, the template, the stem map or the pads folder, or a change to the command.
A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1.
A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name".
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
A listing whose last line reads `already exists, and --replace replaces it.` comes from a command that has `--replace`, named by Nick, carried by this rule, or on the command Steps step 6 shows for a set folder that appeared after the listing.
Show the line as printed, and ask "Run it?" as usual, with no second question.
```

## 226-name-matches-no-folder-folder-put-back

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: setlist-controller#226 name-match fixes, merged into setlist-controller#58
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes
- I put Fall Like Rain's folder back.

Listing:

```
pnpm build-set --list
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace lord rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Run it?

Note: Nick moves Fall Like Rain's folder out of the library after the first listing. The build of `pnpm build-set grace lord rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"` then exits 1 on `"rain" matches no song folder in /Users/nick/Music/MultiTracks. The song folders are:`, and Fall Like Rain is not among the folders it lists, so its folder is missing from the library. Nick puts it back, a reply that answers that failure, so the second listing keeps the `--replace` the build had, and prints `rain` for it again.

Pins:

```
Run `pnpm build-set --list` from this repo's root.
Add `--library <folder>` when Nick names a library folder, and `--pads <folder>` when he names a pads folder, and any `--date` or `--output-root <folder>` he names, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder.
It prints one line per song folder the build can match, in three parts two spaces apart: the short name, the song's key or `no key`, and the folder name, such as `grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm`.
For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title).
`"<name>" matches no song folder in <library>. The song folders are:...`: the short name is in no folder name the library holds, so the library changed after step 1's listing, or the name is not one the listing printed.
When it is not, its song folder is missing from the library: Nick adds it, and the listing runs again (back to step 1).
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
When Nick names no date, the line gives the command's default: `Date: Sunday <YYYY-MM-DD>, today, since no date is named` when today is a Sunday, and otherwise `Date: Sunday <YYYY-MM-DD>, the coming Sunday, since no date is named`.
A song change he names no transition for is a gap and adds nothing.
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
**A yes with no change** ("yes", "yep", "replace it") adds `--replace "<folder>"` to the command, the folder that line names: show it with `--replace` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between.
Show what the command printed, and by its exit code:
1: the problems, one per line.
After each, say what fixes it: what Nick adds to the library, the template, the stem map or the pads folder, or a change to the command.
A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1.
A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name".
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
A listing whose last line reads `already exists, and --replace replaces it.` comes from a command that has `--replace`, named by Nick, carried by this rule, or on the command Steps step 6 shows for a set folder that appeared after the listing.
Show the line as printed, and ask "Run it?" as usual, with no second question.
```

## 226-name-matches-no-folder-renamed

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders, with Goodness of God at 68 BPM and a second download in B
Source: setlist-controller#226 name-match fixes, merged into setlist-controller#58
Nick says:
- Grace, Goodness of God, Fall Like Rain.
- The one in A.
- yes
- I renamed it to 68 BPM. List it again.

Listing:

```
pnpm build-set --list
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace "Goodness of God-Victory-A-68.00bpm" rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Run it?

Note: The first listing ran on the library with Goodness of God at 63 BPM in A and in B, so it printed both whole folder names, `"Goodness of God-Victory-A-63.00bpm"` and `"Goodness of God-Victory-B-63.00bpm"`, and the title on two lines is a question. Nick answers it, and renames the A folder to `Goodness of God-Victory-A-68.00bpm` after the listing. The build of `pnpm build-set grace "Goodness of God-Victory-A-63.00bpm" rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"` then exits 1 on `"Goodness of God-Victory-A-63.00bpm" matches no song folder in /Users/nick/Music/MultiTracks. The song folders are:`, and the renamed folder is among the folders it lists. Nick's reply answers that failure, so the second listing keeps the `--replace` the build had, and the command takes the whole folder name it prints for the A folder now. The first listing's exit and last line are the same before the rename and after it, so both run against the renamed library.

Pins:

```
Run `pnpm build-set --list` from this repo's root.
Add `--library <folder>` when Nick names a library folder, and `--pads <folder>` when he names a pads folder, and any `--date` or `--output-root <folder>` he names, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder.
It prints one line per song folder the build can match, in three parts two spaces apart: the short name, the song's key or `no key`, and the folder name, such as `grace  D  This Is Amazing Grace-The Ascension-D-98.00bpm`.
For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title).
Ask, one line per open point, and show no command until Nick has answered each, when the request holds:
a song whose title is on no listed line, or on more than one (name the folders it could be);
`"<name>" matches no song folder in <library>. The song folders are:...`: the short name is in no folder name the library holds, so the library changed after step 1's listing, or the name is not one the listing printed.
When the song is among the folders the line lists, the listing runs again (back to step 1), and Nick's command takes the song's short name from it.
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
When Nick names no date, the line gives the command's default: `Date: Sunday <YYYY-MM-DD>, today, since no date is named` when today is a Sunday, and otherwise `Date: Sunday <YYYY-MM-DD>, the coming Sunday, since no date is named`.
A song change he names no transition for is a gap and adds nothing.
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
**A yes with no change** ("yes", "yep", "replace it") adds `--replace "<folder>"` to the command, the folder that line names: show it with `--replace` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between.
Show what the command printed, and by its exit code:
1: the problems, one per line.
After each, say what fixes it: what Nick adds to the library, the template, the stem map or the pads folder, or a change to the command.
A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1.
A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
It is the command shown again after a fix, with a change to it or none, as Steps step 6 shows it, or a switch to the Steps with songs he names, named straight or by a change to the songs answered "build it from songs I name".
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
A listing whose last line reads `already exists, and --replace replaces it.` comes from a command that has `--replace`, named by Nick, carried by this rule, or on the command Steps step 6 shows for a set folder that appeared after the listing.
Show the line as printed, and ask "Run it?" as usual, with no second question.
```

## r13-2-relist-before-reply-keeps-replace

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders, and Lord I Need You
Source: setlist-controller#240, from pre-PR review 13 finding 2 of setlist-controller#58
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes

Listing:

```
pnpm build-set --list
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.`

Listing:

```
pnpm build-set --list --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists, and --replace replaces it.`

Command: `pnpm build-set grace are rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: Run it?

Note: Nick adds `Lord I Need You-Matt Maher-E-72.00bpm` to the library after the first listing, which printed `lord` for Great Are You Lord. The build of `pnpm build-set grace lord rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"` then exits 1 on `"lord" matches 2 song folders; name one more fully:`, followed by both folders. Steps step 6's fix for it runs the listing again at once, before Nick says anything, and that listing is part of the fix, so it keeps the `--replace` the build had, and prints `are` for Great Are You Lord, since `lord` and `you` are in Lord I Need You's name too. The first listing's exit and last line are the same with Lord I Need You or without it, so both run against the library with it.

Pins:

```
Run `pnpm build-set --list` from this repo's root.
Add `--library <folder>` when Nick names a library folder, and `--pads <folder>` when he names a pads folder, and any `--date` or `--output-root <folder>` he names, by the mapping below, and `--replace "<folder>"` when The yes to replacing carries it, or when Nick names it and a listing has named its folder, by A `--replace` Nick names; each then goes on the build command too, a `--replace` only while they look in the set folder it was given for, by One set folder.
For each song Nick names, find the one listed line whose title he means, and take that line's short name exactly as printed, quotes included (`grace`, `"grace live"`, or a whole folder name in quotes when two folders hold one title).
`"<name>" matches <n> song folders; name one more fully:...`: the name is part of more than one folder name the library holds, so the library changed after step 1's listing, or the name is not one the listing printed.
The listing runs again (back to step 1), and the command takes the short name it prints for the folder Nick means, which names that folder alone.
Show it in a code block: the short names in service order, then the `--overlap` and `--pad` flags in the order of the positions they name, whatever their kind (`--pad 1 --overlap 2 --pad 3`), then any `--date`, `--replace`, `--library`, `--pads`, `--template` or `--output-root`.
When Nick names no date, the line gives the command's default: `Date: Sunday <YYYY-MM-DD>, today, since no date is named` when today is a Sunday, and otherwise `Date: Sunday <YYYY-MM-DD>, the coming Sunday, since no date is named`.
A song change he names no transition for is a gap and adds nothing.
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
**A yes with no change** ("yes", "yep", "replace it") adds `--replace "<folder>"` to the command, the folder that line names: show it with `--replace` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between.
Show what the command printed, and by its exit code:
1: the problems, one per line.
After each, say what fixes it: what Nick adds to the library, the template, the stem map or the pads folder, or a change to the command.
This build ends when a build command runs, or when Nick calls it off.
A fix after a build's exit 1 that answers that failure is no such build: it keeps the `--replace` that command has, and what Nick named on the plan path for this build, by From the plan path under Steps step 1.
A fix answers that failure when Nick gives it in reply to the problems Steps step 6 shows for that exit 1, whatever fix they name.
The listing a fix under Steps step 6 runs again (back to step 1) is part of that fix, whether Nick's reply comes before it or not.
A yes to the replace question, with a change or without one, is consent to `--replace` for the set folder the line it answered names.
A listing whose last line reads `already exists, and --replace replaces it.` comes from a command that has `--replace`, named by Nick, carried by this rule, or on the command Steps step 6 shows for a set folder that appeared after the listing.
Show the line as printed, and ask "Run it?" as usual, with no second question.
```

## 399-plan-skeleton

Said on: Saturday 2027-01-02
Library: the Phase 0 plan's songs
Source: #399 acceptance criterion 5, the build-set skill describes the chart skeleton
Nick says:
- Print the chart skeleton for Sunday's plan.

Listing:

```
pnpm build-set --plan --skeleton
```

Plan: the recorded Phase 0 plan, on 2027-01-03
Set folders: none
Exit: 0
Last line: `ENDING`

Command: no command
Date line: none
Question: none: the skill shows the skeleton as printed, passes on the two notes, on WELCOME HOME's Outro and on Yes And Amen's Pre Chorus, Breakdown and Outro, and points Nick to section 12 of the install doc

Pins:

```
When Nick asks for the chart skeleton, the headings to type each song's chord chart under in Planning Center, run it without asking, since it writes nothing.
For the plan's songs, such as "the chart skeleton for Sunday's plan", run `pnpm build-set --plan --skeleton`, with any `--date`, `--service-type` or `--plan-id` he names, by the mapping.
Show the output as printed: each song's number and title, then its headings, one per line.
Pass on each `Note:` line on stderr, which names the locators a song's skeleton leaves out, such as Outro, since the chart view shows each of those with its name and bar count.
Then point Nick to section 12 of `docs/install.md`: he pastes each song's headings, not its number and title line, into its arrangement's Lyrics & Chords editor, and types each chord in square brackets right before the syllable it falls on.
```

## 504-build-then-wait-for-the-file

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #504 acceptance criterion 1: the yes to the build covers the lights step, and after the build's summary the skill shows the weekly show file and the three steps, and waits
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: none: the build runs on the yes and exits 0; the skill shows its summary, then the weekly show file line and the three steps as printed, and waits for Nick's word that the file is open in ETCnomad

Pins:

```
When Nick's answer to that command is a yes with no change ("yes", "yep", "run it"), run it exactly as shown, from this repo's root.
Show what the command printed, and by its exit code:
0: the summary, the set's name, each song with the bar it starts on, its tempo and meter and the transition after it, and the set's path.
After the set's path the build prints its lines for the lights step: show them as printed, and go on by The lights step.
That yes covers the lights step after the build, by The lights step below: once the set is built and Nick says the weekly show file is open in ETCnomad, the lights mode, `pnpm build-set --lights`, runs with no second yes.
The lights step gives the lights their show file for the Sunday: the build makes the weekly show file, Nick opens it in ETCnomad, and the lights mode, `pnpm build-set --lights`, labels each song cue with its song's title, gives the colour lights in it the colour of the song's ProPresenter background, and saves the show.
Nick's yes to the build is the yes to the lights step after it, whichever question it answered: "Run it?", "Replace the set built before?", or the command Steps step 6 shows again after a fix.
Ask no second question for the lights.
When the build exits 0, it prints two lines for the lights after the set's path: a line that starts `Weekly show file:` with the path of the weekly show file, then `Open it in ETCnomad: File, Open; <file>; OK.`
Show both as printed, under the summary, and wait for Nick's word that the file is open in ETCnomad.
Run nothing until he gives it.
```

## 504-his-word-runs-the-lights

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #504 acceptance criterion 1: on Nick's word the skill runs the lights mode for the same date, and shows the summary as printed
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes
- it's open

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set --lights --date 2026-10-18`
Date line: none
Question: none: the lights mode runs at once on his word, with no second yes; it exits 0, and the skill shows its lines as printed and says the last path is the file to AirDrop

Note: The build command named no date, and the lights command takes the date of its date line. The lights mode prints three song lines, a warning for channel 3 at intensity 0 in song 1's cue, which the skill passes on, and the path of the show file the save made.

Pins:

```
The lights mode is the one command that runs after a build with no new yes, and it runs on Nick's word, never straight after the build.
Any answer that says the file is open is his word: "it's open", "open", "done", "go ahead".
On his word, run the lights mode at once, from this repo's root: `pnpm build-set --lights --date <YYYY-MM-DD>`, with the date of the date line the build was shown with, even when the build command named no date.
His word can come on a later day, when the default date has moved on, and the lights are for the set just built.
Nothing else of the build command goes on it: no song name, no `--plan`, `--service-type` or `--plan-id`, no `--overlap`, `--pad` or `--gap`, and no `--replace`, `--library`, `--pads` or `--template`.
The lights mode stops on each of those with exit 2.
Show what the lights mode printed, and by its exit code:
0: the lights step is done.
Show the lines as printed: one line per song, with its cue and its colour as hue and as red, green and blue, then the background file the colour came from, or `template colour` and why; then one line for each cue of a song's chain, `Cue <list>/<cue> is in the chain of cue <list>/<cue> (song <n>, <title>), and is coloured as that song is.`; then one line for each cue that is a copy, `Cue <list>/<cue> (song <n>, <title>) is a copy of cue <list>/<cue> (song <n>, <title>).`, and after it, when Eos copied a follow or a hang with the cue, `Cue <list>/<cue> does not keep <the follow or the hang> of cue <list>/<cue>: the lights step took it off.`; then each warning, `Warning: channel <n> is at intensity 0 in cue <list>/<cue> (song <n>, <title>), so the song's colour will not show on it.`; and last the path of the show file the save made.
Say that this last path is the file Nick AirDrops to the production computer.
A warning stops nothing: pass it on, since it names a colour light that is dark in that song's cue.
```

## 504-lights-take-the-date-and-the-output-root

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #504 acceptance criterion 1: the lights mode runs with the flags the build had that the lights mode takes
Nick says:
- Build Grace, Great Are You Lord, Fall Like Rain for November 8, into /Volumes/Stage/Sets.
- yes
- open

Listing:

```
pnpm build-set --list --date 2026-11-08 --output-root /Volumes/Stage/Sets
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set --lights --date 2026-11-08 --output-root /Volumes/Stage/Sets`
Date line: none
Question: none: the lights mode runs at once on his word, with the build's date and output root

Note: The build command was `pnpm build-set grace lord rain --date 2026-11-08 --output-root /Volumes/Stage/Sets`, under the date line `Date: Sunday 2026-11-08, the date named`. It had no `--show-folder`, so the lights command has none.

Pins:

```
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
Any answer that says the file is open is his word: "it's open", "open", "done", "go ahead".
On his word, run the lights mode at once, from this repo's root: `pnpm build-set --lights --date <YYYY-MM-DD>`, with the date of the date line the build was shown with, even when the build command named no date.
Add `--output-root <folder>` and `--show-folder <folder>` when the build command had them, with the build's own values, after `--date` and in that order.
Nothing else of the build command goes on it: no song name, no `--plan`, `--service-type` or `--plan-id`, no `--overlap`, `--pad` or `--gap`, and no `--replace`, `--library`, `--pads` or `--template`.
```

## 504-replace-yes-covers-the-lights

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #504 acceptance criterion 1: the yes to the build covers the lights step, the yes to replacing included, and the lights command carries no --replace
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes
- done

Listing:

```
pnpm build-set --list
```

Set folders: 2026-10-18 Sunday
Exit: 0
Last line: `/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday already exists. The build stops on it unless --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday" replaces it.`

Command: `pnpm build-set --lights --date 2026-10-18`
Date line: none
Question: none: the lights mode runs at once on his word; the yes to "Replace the set built before?" covered it

Note: The build command was `pnpm build-set grace lord rain --replace "/Users/nick/Music/Ableton/Sets/2026-10-18 Sunday"`. The rebuild makes a newer weekly show file, which is the one its two lines name.

Pins:

```
Show the command and its lines, as Steps step 4 or plan step 2 shows them, then that line as printed, and ask "Replace the set built before?" in place of "Run it?".
**A yes with no change** ("yes", "yep", "replace it") adds `--replace "<folder>"` to the command, the folder that line names: show it with `--replace` and run it at once, as Steps step 5 runs a command on a yes, with no listing in between.
Nick's yes to the build is the yes to the lights step after it, whichever question it answered: "Run it?", "Replace the set built before?", or the command Steps step 6 shows again after a fix.
Ask no second question for the lights.
Any answer that says the file is open is his word: "it's open", "open", "done", "go ahead".
On his word, run the lights mode at once, from this repo's root: `pnpm build-set --lights --date <YYYY-MM-DD>`, with the date of the date line the build was shown with, even when the build command named no date.
Nothing else of the build command goes on it: no song name, no `--plan`, `--service-type` or `--plan-id`, no `--overlap`, `--pad` or `--gap`, and no `--replace`, `--library`, `--pads` or `--template`.
The lights mode stops on each of those with exit 2.
```

## 504-plan-build-then-the-lights

Said on: Saturday 2026-10-31
Library: the worked examples' seven folders
Source: #504 acceptance criterion 1: the lights step on the plan path, where the lights command carries no --plan and no transition flag
Nick says:
- Build the set from the plan for November 8.
- A pad after Fall Like Rain for ministry time.
- yes
- it's open

Listing:

```
pnpm build-set --plan --list --date 2026-11-08
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 0
Last line: `Dismissal: no effect`

Listing:

```
pnpm build-set --plan --list --date 2026-11-08 --pad 3
```

Plan: the recorded November 1 plan, on November 1 and November 8
Set folders: none
Exit: 0
Last line: `Dismissal: no effect`

Command: `pnpm build-set --lights --date 2026-11-08`
Date line: none
Question: none: the lights mode runs at once on his word, with the date the plan build named and nothing else of it

Note: The build command was `pnpm build-set --plan --pad 3 --date 2026-11-08`. After its summary the skill showed the weekly show file line and the three steps, and waited, as on the Steps.

Pins:

```
| "the set from the plan", "from Planning Center" | `--plan`, by The plan path |
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
| "a pad after the last song", "a pad for ministry time" after it | `--pad <last>` |
A change Nick names to a transition becomes its transition flag, by the mapping below, on the listing and the command alike: `--overlap <n>`, `--pad <n>` or `--pad <n>=<key>`, or `--gap <n>` to take back a pad or an overlap the plan gives.
**Run it on a yes, and show the outcome,** by steps 5 and 6 of the Steps, with the command step 2 showed.
After the set's path the build prints its lines for the lights step: show them as printed, and go on by The lights step.
When the build exits 0, it prints two lines for the lights after the set's path: a line that starts `Weekly show file:` with the path of the weekly show file, then `Open it in ETCnomad: File, Open; <file>; OK.`
Show both as printed, under the summary, and wait for Nick's word that the file is open in ETCnomad.
Any answer that says the file is open is his word: "it's open", "open", "done", "go ahead".
On his word, run the lights mode at once, from this repo's root: `pnpm build-set --lights --date <YYYY-MM-DD>`, with the date of the date line the build was shown with, even when the build command named no date.
Nothing else of the build command goes on it: no song name, no `--plan`, `--service-type` or `--plan-id`, no `--overlap`, `--pad` or `--gap`, and no `--replace`, `--library`, `--pads` or `--template`.
The lights mode stops on each of those with exit 2.
```

## 504-another-show-open

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #504 acceptance criterion 1: when the lights mode exits 1 because another show is open, the skill shows the file and the steps again and waits
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes
- it's open
- ok, now it's open

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set --lights --date 2026-10-18`
Date line: none
Question: none: the same lights command runs again on his word, with no new yes

Note: The first run of the lights command exits 1 with the two weekly show file lines on stdout: last week's show is still open in Eos. The skill shows the line on stderr, then the file and the three steps again as printed, and waits for Nick's word.

Pins:

```
1: the lights step is not done, and one line on stderr says why.
Show the line and what fixes it, by Another show open, The playlist question or Every other problem.
On exit 1 with the two weekly show file lines on stdout, nothing was written to Eos, and the line on stderr, after `The lights step is not done:`, reads `the show open in Eos is <path>, not the weekly show file for <date>. Open the weekly show file, then run the lights step again.` or `the weekly show file for <date> was made just now, so it is not the show open in Eos. Open it, then run the lights step again.`
Show the line, then the file and the three steps again, as printed, and wait for Nick's word.
The file can be a newer one than the build printed, after a rebuild or a save in Eos, so show the one printed now.
On his word, run the same lights command again.
```

## 504-playlist-question

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #504 acceptance criterion 1: the playlist question, which SKILL.md worked example 11 shows after another build
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes
- it's open

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set --lights --date 2026-10-18`
Date line: none
Question: Which playlist?

Note: The lights command exits 1 and prints `--playlist "Oct 18 Sunday"` and `--playlist "Youth"` on stdout: no playlist has October 18, 2026 in its name. The skill shows the line on stderr and the two playlists as printed, then asks.

Pins:

```
1: the lights step is not done, and one line on stderr says why.
Show the line and what fixes it, by Another show open, The playlist question or Every other problem.
On exit 1 with one `--playlist "<name>"` line per playlist on stdout, the lights mode could not choose the ProPresenter playlist to take the colours from, and wrote nothing to Eos.
The line on stderr says why, `ProPresenter has no playlist ...` or `ProPresenter has more than one playlist ...`: none, or more than one, has the date of the set in its name, written as November 15, 2026, or has the name `--playlist` gave.
When the line ends `Run the lights step again with --playlist and the name of the one to use.`, show it and the playlists as printed, and ask "Which playlist?".
```

## 504-playlist-answer

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #504 acceptance criterion 1: the playlist question, answered with the playlist flag, which SKILL.md worked example 11 shows after another build
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes
- it's open
- the Sunday one

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set --lights --date 2026-10-18 --playlist "Oct 18 Sunday"`
Date line: none
Question: none: the lights command runs again with the flag of the line Nick picked, with no other yes

Pins:

```
When the line ends `Run the lights step again with --playlist and the name of the one to use.`, show it and the playlists as printed, and ask "Which playlist?".
Run the lights command again with the `--playlist "<name>"` of the line Nick picks, copied as printed, after its other flags, with no other yes.
That `--playlist` stays on every later run of the lights step for that date in this conversation.
```

## 504-eos-closed-then-open

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #504 acceptance criterion 1: for every other problem the skill shows the line and what fixes it, here Eos closed
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes
- go ahead
- ETCnomad is open now, with the file in it

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set --lights --date 2026-10-18`
Date line: none
Question: none: the same lights command runs again on his word, with no new yes

Note: The first run of the lights command exits 1 with nothing on stdout and one line on stderr, that Eos did not answer. The skill shows the line and its fix: Nick opens ETCnomad, and the weekly show file in it.

Pins:

```
1: the lights step is not done, and one line on stderr says why.
Show the line and what fixes it, by Another show open, The playlist question or Every other problem.
Every other exit 1 prints one line on stderr, and nothing on stdout but where a line below says so.
The line starts `The lights step is not done:`, or `config/lights.json` for a lights config problem.
After a fix, run the same lights command again on Nick's word, with no new yes.
Show the line, and after it what fixes it, by the rest of the line:
`Eos at <host>:<port> did not answer.`: ETCnomad is closed, or it is not at the address the `eos` section of the connections config names.
Nick opens ETCnomad, and the weekly show file in it by the three steps, or corrects the address by section 9 of `docs/install.md`.
```

## 504-build-says-the-lights-step-is-not-done

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #504 acceptance criterion 1: when the build's own output says the lights step is not done, the skill says so and what fixes it, and the build still counts as done
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: none: the build exits 0 with the set built, and the line that no template show file was found in place of the two lines for the lights; the skill says the set is built and the lights step is not done, shows the line and its fix, waits for no file and runs no second build

Pins:

```
Show what the command printed, and by its exit code:
0: the summary, the set's name, each song with the bar it starts on, its tempo and meter and the transition after it, and the set's path.
After the set's path the build prints its lines for the lights step: show them as printed, and go on by The lights step.
A build can end with the set built and the lights step not done.
On exit 0 it prints `The lights step is not done: no template show file named "<name>" was found in <folder>.` after the set's path, in place of the two lines for the lights.
Say that the set is built and the lights step is not done, show the line, and say what fixes it: the template show file, or the show folder the cause names, by Every other problem.
Wait for no file, since none was made, and run no second build: the set is built, the build has ended, and this fix is no fix after a build's exit 1 in the sense of When the build ends under The yes to replacing.
`no template show file named "<name>" was found in <folder>.`: the date has no weekly show file, and the show folder holds no template show file to copy.
Nick saves the template show file under that show name, from ETCnomad, into that folder, as section 9 of `docs/install.md` says.
```

## 504-template-saved-then-the-lights

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #504 acceptance criterion 1: once what the build named is fixed, the lights alone finish the lights step, with no second build
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes
- I saved the template, go ahead

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set --lights --date 2026-10-18`
Date line: none
Question: none: the lights command runs on his word, with no new yes; it makes the weekly show file, prints the two lines for it and exits 1, and the skill shows the line, the file and the three steps, and waits for Nick's word

Note: The build exited 0 with the line that no template show file was found. No build runs again: the set is built.

Pins:

```
Once Nick says it is fixed, run the lights command, as The lights command gives it, with no new yes.
With no weekly show file for the date, the lights mode makes one from the template show file, prints the two lines for it, and stops with exit 1, by Another show open.
On his word, run the lights mode at once, from this repo's root: `pnpm build-set --lights --date <YYYY-MM-DD>`, with the date of the date line the build was shown with, even when the build command named no date.
On exit 1 with the two weekly show file lines on stdout, nothing was written to Eos, and the line on stderr, after `The lights step is not done:`, reads `the show open in Eos is <path>, not the weekly show file for <date>. Open the weekly show file, then run the lights step again.` or `the weekly show file for <date> was made just now, so it is not the show open in Eos. Open it, then run the lights step again.`
Show the line, then the file and the three steps again, as printed, and wait for Nick's word.
```

## 504-template-colour-then-the-file-copied

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #504 acceptance criterion 1: a background file to copy to this Mac
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes
- it's open
- I copied the file, do the lights again

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set --lights --date 2026-10-18`
Date line: none
Question: none: the same lights command runs again on his word, with no new yes

Note: The first run of the lights command exits 0, and song 2's line reads template colour, no picture, with its background file. The skill shows the lines as printed and says that Nick copies that file to this Mac.

Pins:

```
For a song line that reads `template colour`, go on by Template colour.
A song line that reads `template colour` kept the colour its song cue has in the template show file, and the words after it say why.
`no picture`, `the picture cannot be read` or `ProPresenter refused the picture (<status>)`: ProPresenter gave no picture of the song's background to take a colour from.
Most often the background file the line names is not on this Mac, and Nick copies it to this Mac.
After his fix, the same lights command runs again on his word, with no new yes.
A second run on the same weekly show file does no harm: it finds each song cue by its title, copies nothing, and writes each colour again.
```

## 504-lights-alone

Said on: Saturday 2026-10-17
Library: none, since the lights alone read no library
Source: #504 acceptance criterion 1: "Do the lights for Sunday", with no build asked for, runs the lights mode for that date by the same rules
Nick says:
- Do the lights for Sunday.

Listing: none

Command: `pnpm build-set --lights`
Date line: none
Question: none: the lights mode runs at once, since the request is the yes, and the skill goes on by its exit code

Note: No date is named, so the lights mode takes its default, Sunday 2026-10-18.

Pins:

```
When Nick asks for the lights with no build ("do the lights for Sunday", "run the lights step", "the lights again"), the request is the yes.
Run `pnpm build-set --lights` at once, from this repo's root, with no listing before it and no question.
Add `--date` by The mapping when he names a date; with no date named, or "Sunday" alone, add none, since the lights mode's default date is the build's: today when today is a Sunday, and otherwise the coming Sunday.
Add any `--output-root`, `--show-folder` or `--playlist "<name>"` he names.
Then go on by The outcome.
The lights mode writes nothing unless the show open in Eos is the newest weekly show file for the date, so a request made before the file is open ends at Another show open, with the file to open.
```

## 504-lights-alone-for-a-date

Said on: Saturday 2026-10-31
Library: none, since the lights alone read no library
Source: #504 acceptance criterion 1: the lights alone, for a date Nick names
Nick says:
- Do the lights for November 8.

Listing: none

Command: `pnpm build-set --lights --date 2026-11-08`
Date line: none
Question: none: the lights mode runs at once, since the request is the yes, and the skill goes on by its exit code

Pins:

```
| a date, "November 1" said on 2026-10-17 | `--date 2026-11-01`: its next occurrence, today or later, when that is a Sunday at most 28 days away, and otherwise a question under Ask instead of guess |
When Nick asks for the lights with no build ("do the lights for Sunday", "run the lights step", "the lights again"), the request is the yes.
Run `pnpm build-set --lights` at once, from this repo's root, with no listing before it and no question.
Add `--date` by The mapping when he names a date; with no date named, or "Sunday" alone, add none, since the lights mode's default date is the build's: today when today is a Sunday, and otherwise the coming Sunday.
Then go on by The outcome.
```

## 504-lights-called-off

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #504 prep assumption: an answer that calls the lights off runs nothing
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes
- skip the lights

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set grace lord rain`
Date line: `Date: Sunday 2026-10-18, the coming Sunday, since no date is named`
Question: none: nothing more runs; the skill says the set is built and the lights step is not done, and that "do the lights" runs it later

Note: The build ran on the yes and exited 0, and the skill showed the weekly show file line and the three steps.

Pins:

```
Show both as printed, under the summary, and wait for Nick's word that the file is open in ETCnomad.
Run nothing until he gives it.
An answer that calls the lights off ("skip the lights", "not now") runs nothing: say that the set is built and the lights step is not done, and that "do the lights" runs it later, by The lights alone.
```

## 504-lights-called-off-then-asked-for

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #504 prep assumption: after the lights are called off, "do the lights" runs them for the set just built
Nick says:
- Grace, Great Are You Lord, Fall Like Rain.
- yes
- skip the lights
- ok, do the lights now

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set --lights --date 2026-10-18`
Date line: none
Question: none: the lights mode runs at once, since the request is the yes

Pins:

```
An answer that calls the lights off ("skip the lights", "not now") runs nothing: say that the set is built and the lights step is not done, and that "do the lights" runs it later, by The lights alone.
When Nick asks for the lights with no build ("do the lights for Sunday", "run the lights step", "the lights again"), the request is the yes.
After a build in this conversation for that date, the command is the one The lights command gives, with the build's date and folders, and any `--playlist` an answer gave.
On his word, run the lights mode at once, from this repo's root: `pnpm build-set --lights --date <YYYY-MM-DD>`, with the date of the date line the build was shown with, even when the build command named no date.
```

## 508-chain-line-and-copy-with-no-follow

Said on: Saturday 2026-10-17
Library: the worked examples' seven folders
Source: #508 What to build: the build-set skill says the rule, that a song owns its chain; the summary's line for a cue of a chain, and its line for a copy the lights step took a follow off
Nick says:
- Grace, Great Are You Lord, Fall Like Rain, Trust In God.
- yes
- it's open

Listing:

```
pnpm build-set --list
```

Set folders: none
Exit: 0
Last line: `trust  A  Trust In God-CAN YOU IMAGINE--A-74.00bpm`

Command: `pnpm build-set --lights --date 2026-10-18`
Date line: none
Question: none: the lights mode runs at once on his word, with no second yes; it exits 0, and the skill shows its lines as printed, passes on the chain line and the line of the copy that does not keep the follow, and says the last path is the file to AirDrop

Note: The build command was `pnpm build-set grace lord rain trust`. The weekly show file has three song cues, and its Song 3 cue, 1/22, runs on by a follow into cue 1/23, a build with no label. The lights mode prints four song lines, one line for cue 1/23, which is in the chain of cue 1/22 (song 3, Fall Like Rain), one line for cue 1/24, the copy of cue 1/22 for song 4, Trust In God, numbered after the chain, one line that says cue 1/24 does not keep the follow of cue 1/22, and the path of the show file the save made. Nothing in those lines is a problem, and the skill asks nothing.

Pins:

```
Any answer that says the file is open is his word: "it's open", "open", "done", "go ahead".
On his word, run the lights mode at once, from this repo's root: `pnpm build-set --lights --date <YYYY-MM-DD>`, with the date of the date line the build was shown with, even when the build command named no date.
Show what the lights mode printed, and by its exit code:
0: the lights step is done.
Show the lines as printed: one line per song, with its cue and its colour as hue and as red, green and blue, then the background file the colour came from, or `template colour` and why; then one line for each cue of a song's chain, `Cue <list>/<cue> is in the chain of cue <list>/<cue> (song <n>, <title>), and is coloured as that song is.`; then one line for each cue that is a copy, `Cue <list>/<cue> (song <n>, <title>) is a copy of cue <list>/<cue> (song <n>, <title>).`, and after it, when Eos copied a follow or a hang with the cue, `Cue <list>/<cue> does not keep <the follow or the hang> of cue <list>/<cue>: the lights step took it off.`; then each warning, `Warning: channel <n> is at intensity 0 in cue <list>/<cue> (song <n>, <title>), so the song's colour will not show on it.`; and last the path of the show file the save made.
Say that this last path is the file Nick AirDrops to the production computer.
A chain line stops nothing either: it names a cue the song cue runs on into by a follow or a hang, such as a build or a hit, and that cue now holds its song's colour.
A line that says a copy does not keep a follow or a hang stops nothing: the copy is the cue of a song past the song cues the show has, and such a cue runs on into nothing.
```

# Sentences no trace pins

Sentence: What crosses:
Reason: introduces the list after it, whose items carry the rules

Sentence: Done when you have every line.
Reason: a step's end condition: it says when the step is done, and no listing, command or question depends on it

Sentence: Each short name matches only its own folder, a whole folder name included: a folder whose whole name is part of another listed folder's name (`Grace-Live-D-98.00bpm` beside `Grace-Live-D-98.00bpm copy`) prints its whole name, which matches that folder alone, since the build prefers the one folder whose whole name it is (setlist-controller#57).
Reason: says why a printed whole folder name that another listed folder's name holds names its own folder alone; the skill copies the short name as printed either way, so no listing, command or question changes on it, and test/build-set-skill-quotes.test.ts checks it against foldersNamed

Sentence: Done when each song has its line's short name.
Reason: a step's end condition: it says when the step is done, and no listing, command or question depends on it

Sentence: Done when every transition he named is a flag, or a question under Ask instead of guess.
Reason: a step's end condition: it says when the step is done, and no listing, command or question depends on it

Sentence: Done when the command has run, or Nick has called the build off.
Reason: a step's end condition: it says when the step is done, and no listing, command or question depends on it

Sentence: An exit 1 can leave the set built: `The set is built, but the weekly show file cannot be made in <folder>: <cause>. The lights step is not done.` comes on stderr after the summary, and is answered by When the build says the lights step is not done under The lights step, with no second build.
Reason: a build's exit 1 that leaves the set built, which no trace's build gives; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: A pad problem is fixed by the pad file rule, whose source is the `--pad n=<key>` paragraph of the usage text in `src/set-builder/main.ts`:
Reason: introduces the fix lines after it, for build problems no trace runs into

Sentence: Nick adds the file the problem names.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: It lists every name the build looked for (`has no E.wav`, `has no C#.wav or Db.wav`), and any one of them fixes it.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: A minor key plays its root's file: `Em` plays `E.wav`, and `C#m` plays `C#.wav`.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: The build reads no file named for a minor key, so a pads folder that holds `Em.wav` is fixed by renaming it `E.wav`.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: C# and Db, D# and Eb, F# and Gb, G# and Ab, A# and Bb are one key, so either spelling's file plays it.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `Cannot read the pads folder <folder>.` names no file: the build stopped at the folder before it looked for one.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: The fix is the folder.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: The pads folder is `_pads` in the library unless `--pads` names another, so Nick creates `_pads` in the library, or names the folder that holds his pads with `--pads`, a change to the command (back to step 4).
Reason: fix advice for a build problem no trace runs into: what Nick changes in the library or the template, or a change to the command, which goes back to step 4 and is shown again by Steps step 5 and When the build ends, which traces pin

Sentence: The next build then names any pad file still missing.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `The pad after song <n> plays <file>, which lasts <s> s. ... needs a file of at least <s> s.` is a pad file too short for its clip, which starts on the song's Ending and runs through the 60-second Pad section, then into the next song's Intro, or after the last song through its 4-bar fade.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick replaces the file with a longer one of the same key.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `<folder>: the song has no locator named Ending, where a pad starts.` is fixed in the song, not the pads folder: Nick adds a locator named Ending to that song's set in the library.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `The pad after song <n> is in <key>, ...and the pads folder <folder> has no <file>. ...` is the whole line the first rule above answers, quoted once: the file names it lists are those pieces.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Its last sentence lists the keys the folder has, `The keys it has are <keys>.` or `It has no pad files.`, so Nick can see a file to rename or one missing.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `<folder>: the folder name has no key before its BPM, which the pad after song <n> is played in.` or `<folder>: the folder name's key, "<key>", is not a note name, which the pad after song <n> is played in.`: a pad with no key of its own takes the key of the song after it, or of the last song for a pad after it, from that song's folder name, and the name gives none.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick renames that song's folder in the library to the `<title>-<artist>-<key>-<bpm>bpm` form, with a note name for its key, or gives the pad its own key on the command, `--pad <n>=<key>` (back to step 4).
Reason: fix advice for a build problem no trace runs into: what Nick changes in the library or the template, or a change to the command, which goes back to step 4 and is shown again by Steps step 5 and When the build ends, which traces pin

Sentence: `<path>: the pad file could not be read as a WAV: <reason>.`: the file is there, but the build cannot read it as a WAV, and the reason says why.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick replaces that file in the pads folder with a WAV of the same key that plays.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: A song folder's file, the template's names and the stem map are fixed as the line names them.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: The stem map is `config/stem-map.json` in this repo, which puts each stem under the template group or single track it plays in:
Reason: introduces the fix lines after it, for build problems no trace runs into

Sentence: `The template has no group or single track named "<name>", which the stem map lists.` or `The stem map has no entry for the template's <group or single track> "<name>".`: the template and the stem map disagree on a track's name.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick renames the template's track to the name the stem map uses, or changes the name in `config/stem-map.json` to the template's.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: One rename often gives both lines, one for each name.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `<folder>: the stem map has no group for the stem "<stem>".`: the song has a stem the stem map puts under no group.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick adds the stem to its group in `config/stem-map.json`.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `The stem map lists the stem "<stem>" under <groups>.`: one stem is under two or more groups, and a stem plays in one.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick keeps it under one group in `config/stem-map.json`.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `config/stem-map.json cannot be read: ...`, `config/stem-map.json is not valid JSON: ...`, `config/stem-map.json must be an object that lists each group's stem names, ...` or `config/stem-map.json lists the stems of <groups> as something other than a list of stem names. ...`: the file itself cannot be read, is not valid JSON (the line keeps the cause, such as a comma after the last entry), or has the wrong shape.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick fixes `config/stem-map.json` in this repo; for a group whose stems are no list, the line gives the bracket form to write.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `The template has a group and a single track named "<name>".` or `The template has more than one <group or single track> named "<name>".`: two of the template's tracks share one name, so the stem map cannot say which one a stem plays in.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick renames or removes one of them in the template, so each name is one group or single track, and keeps the stem map on the name its stems go to.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `The template has no single track named "PAD", which a pad plays on. Add an audio track named PAD outside every group.`: Nick adds that track to the template as the line says, or takes the pads off the command (back to step 4).
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `<folder>: <group> needs <n> tracks for this song, and the template has <n>.`: the song has more stems under that name in the stem map than the template has tracks there.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: The name is a group, or a single track such as GUIDE or MT CLICK, which holds one stem.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: For a group, Nick adds tracks to that group in the template.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: For either, Nick can move some of those stems under another name in `config/stem-map.json`, which moves them for every song with a stem of that name.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: Two of the song's stems with one name move together, so for those Nick renames one in the song's set in the library and lists the new name in `config/stem-map.json`.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `<songs>: <the overlap needs or the overlaps need> <n> <group> tracks, <counts>, and the template has <n>.`: an overlap keeps the song before it ringing while the next song starts, so the stems of every song still ringing and the song that starts need tracks in that group at once.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `<songs>` names those songs, joined by `into`, and `<counts>` gives each one's share.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: Nick adds tracks to that group in the template, or makes one of those song changes a gap or a pad instead of an overlap, a change to the command (back to step 4).
Reason: fix advice for a build problem no trace runs into: what Nick changes in the library or the template, or a change to the command, which goes back to step 4 and is shown again by Steps step 5 and When the build ends, which traces pin

Sentence: An overlap's locators are fixed in the song's own set in the library, as the Ending line of the pad file rule is:
Reason: introduces the fix lines after it, for build problems no trace runs into

Sentence: `<folder>: the song has no locator named Ending, where an overlap starts the next song's Count Off.`: Nick adds a locator named `Ending` to that song's set in the library, where the song hands off to the next, or makes that song change a gap (back to step 4).
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `<folder>: the song's Ending, on beat <beat>, is not on a bar line, where an overlap starts the next song's Count Off.`: the next song's Count Off starts on the Ending, so it sits on a bar line of the song's own meter.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick moves the `Ending` locator onto a bar line in that song's set.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `<folder>: the song has no section after a locator named Count Off, where an overlap or a pad into it fades out what plays before it.`: the song an overlap or a pad goes into needs a locator named `Count Off` and a locator after it, its Intro, whatever that one is named.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick adds the missing locator to that song's set in the library, or makes the song change into it a gap (back to step 4).
Reason: fix advice for a build problem no trace runs into: what Nick changes in the library or the template, or a change to the command, which goes back to step 4 and is shown again by Steps step 5 and When the build ends, which traces pin

Sentence: A song's own set is checked before anything is built.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: Its problems are fixed in that song's set in the library, saved in Live 12, and then Nick builds again:
Reason: introduces the fix lines after it, for build problems no trace runs into

Sentence: `<folder>: the song could not be read: ...`: the song's set, `MultiTrack.als` in that song's folder in the library, is missing, or is not a Live set the build can read, such as a file that is not gzipped.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: The reason after the colon says which: "ENOENT" for a missing file, "incorrect header check" for one that is not gzipped.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: Nick saves the song's set from Live 12 into that folder as `MultiTrack.als`, then builds again.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `<folder>: saved by <Live version>, not Live 12. Open the song in Live 12 and save it, then build again.`: the line names its fix.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `<folder>: the song has no locators, which the builder does not handle.`: the build places the set's sections from the song's locators.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick adds a locator at the start of each of the song's sections in its set, with `Count Off` and `Ending` by those names.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `<folder>: "<track>" is a group track, which the builder does not handle.`: Nick ungroups it in the song's set, with Ungroup Tracks in Live's Edit menu, so each stem in it is a track of its own.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `<folder>: "<track>" is a MIDI track, which the builder does not handle.`: the build plays stems, which are audio.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick deletes the MIDI track from the song's set, or replaces it with an audio stem of what it plays.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `<folder>: the stem "<stem>" <reason>, which the builder does not handle.`: the build copies each stem's audio clips into the set as they are, so a stem holds its audio clips and nothing more.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: By the reason, quoted below with `...` for the rest of the line, Nick changes that stem in the song's set:
Reason: introduces the fix lines after it, for build problems no trace runs into

Sentence: `is frozen...`: Nick unfreezes the stem, with Unfreeze Track in Live's Edit menu or the track's context menu.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: The same build names each other reason the stem has on a line of its own, such as its devices, so Nick fixes those too before he builds again.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: `has devices...`: Nick removes the devices from the stem.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `has automation...`: Nick deletes the stem's automation.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `has clips on a take lane...`: Nick deletes the clips on the stem's take lanes, keeping the clips the song plays on the stem itself.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `has a warped clip...`: Nick turns Warp off on the stem's clips.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `has a clip with clip envelopes...`: Nick clears the envelopes of the stem's clips.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `has session-view clips...`: Nick deletes the stem's clips in Session View.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `refers to a file outside the song's folder...`: a clip plays a file from outside the song's folder.
Reason: a fix line for a build problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick copies it in with Collect All and Save in Live's File menu.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: Its dialog copies into the song's project folder only the files from the locations picked in it (Packs, the User Library, other Projects, and elsewhere on the computer), so Nick picks every location the stem's files come from, the User Library and Packs included.
Reason: fix advice for a build problem: what Nick changes in the library, the template, the stem map or the pads folder, and no listing, command or question depends on it

Sentence: A short name that matches no song folder, or more than one, is fixed on the command, or in the library:
Reason: introduces the fix lines after it, whose sentences the 226 traces pin

Sentence: 2: a usage error, a fault in the composed command.
Reason: a build's exit 2: no trace's build command exits 2, and the exit 2 of a listing is pinned in Steps step 1 and plan step 2

Sentence: Fix it and go back to step 4, and an exit 2 on `--replace` by The folder under The yes to replacing.
Reason: a build's exit 2: no trace's build command exits 2, and the exit 2 of a listing is pinned in Steps step 1 and plan step 2

Sentence: Done when Nick has the output, and a fix for each problem.
Reason: a step's end condition: it says when the step is done, and no listing, command or question depends on it

Sentence: `"<title>" has no song folder in <library>.`: the library has no folder whose title is the plan's title.
Reason: a fix line for a plan listing problem no recorded plan gives, so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick adds the song to the library, or makes the plan's title and the folder's title the same.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: `"<title>" has no key in the plan, ...`: Nick gives the song a key in the plan.
Reason: a fix line for a plan listing problem no recorded plan gives, so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: A key listed as `<folder> (its folder name's key, "<key>", is not a note name)` means that folder's name writes no note name, and Nick fixes the folder's name.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: A folder listed as `<folder>, whose name writes no key` means that folder's name breaks the `<title>-<artist>-<key>-<bpm>bpm` naming, and Nick renames it to that form.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: The same two forms can follow `has no key in the plan, and <library> has it in`.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: `"<title>" is planned in <key>, which is not a key. ...`: the plan's key for the song is no note name, even read in upper case or before a key change's hyphen.
Reason: a fix line for a plan listing problem no recorded plan gives, so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick fixes the song's key in the plan to a note name: A to G, then # or b, then m for minor.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: `"<title>" in <key> has <n> song folders in <library>; keep one:`: Nick keeps one of the folders it lists.
Reason: a fix line for a plan listing problem no recorded plan gives, so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: A song change the plan gives both a `Prayer` item and an `overlap` note, or an `overlap` note on the last song: Nick fixes the plan, or names the transition he wants, which becomes its flag (`--overlap`, `--pad` or `--gap` for that song) and replaces what the plan gives.
Reason: fix advice for a plan problem no recorded plan gives, so no trace lists it; a transition Nick names for it becomes its flag by plan step 3 and The mapping, which the plan traces pin

Sentence: `Planning Center has <n> "<type>" plans on <date>. Name one with --plan-id: ...`: ask which of the plans it lists Nick means, and add its `--plan-id`.
Reason: the question for a plan listing problem no recorded plan gives (two plans on one date), so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `The "<type>" plan on <date> has no songs in Planning Center. Add them to the plan, then build again.`: the plan is there, with no song on it yet.
Reason: a fix line for a plan listing problem no recorded plan gives, so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick adds the songs to the plan, or names another date.
Reason: fix advice for a plan listing problem no recorded plan gives: a change in Planning Center, or a date Nick names, which becomes `--date` on the listing and the command by plan step 1 and The mapping, which the plan traces pin

Sentence: `Cannot read the Planning Center token file <file>.` or `The Planning Center token file <file> has no <name>.`: Nick makes the file as step 8 of `docs/install.md` says.
Reason: a fix line for a plan listing problem no recorded plan gives, so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `The Planning Center token file <file> can be read by other users. Run chmod 600 <file>, then build again.`: Nick runs that `chmod 600`.
Reason: a fix line for a plan listing problem no recorded plan gives, so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `Cannot reach Planning Center at ...` or `Planning Center at ... did not answer within ...`: the Mac is off the internet, most often on the stage network.
Reason: a fix line for a plan listing problem no recorded plan gives, so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick builds the set while the Mac is on the internet, before it joins the stage network.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: `Planning Center sent an answer to <path> that cannot be read.`: an answer came, but it is no whole JSON:API document.
Reason: a fix line for a plan listing problem no recorded plan gives, so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: The body is not JSON or not a whole JSON:API document, was cut short on a connection that closes with no length, or is compressed and will not inflate.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: Most often that is an answer spoiled on the way, so Nick builds again while the Mac is on a steady internet connection, off the stage network.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: When it repeats on a steady connection, the answer itself is the problem, and `<path>` names the request it answered, such as `/service_types`.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: Nothing in the library, the plan or the command fixes that, so Nick can build the set from songs he names, by the Steps.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: `Planning Center refused the token in <file>. ...`: Nick makes a new personal access token and puts it in that file.
Reason: a fix line for a plan listing problem no recorded plan gives, so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: This line is for every status but 401: a 401 comes as the refused token line above, never as this one.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: Every id in the path is one Planning Center itself listed moments before.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: 403: the account the token works as cannot see Services, or that service type or plan in it.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: Nick makes the token from the account that can see the Sunday plan in Services, as step 8 of `docs/install.md` says, or gives his account that access in Planning Center.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: 404: Planning Center has nothing at that path, most often a plan or service type deleted or moved between one request and the next.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: Nick builds again.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: When it repeats, nothing in the library, the plan or the command fixes that, so Nick can build the set from songs he names, by the Steps.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: Planning Center's usual limit is 100 requests per 20 seconds per user, shared with every other app that acts as the same Planning Center user.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: Any other status, such as 400: a request Planning Center will not answer.
Reason: fix advice for a plan listing problem: what Nick changes in Planning Center, the library or his token, or when he builds again, and no listing, command or question depends on it

Sentence: `Planning Center sent a next page outside <base>.`: a page of a list named a next page outside `<base>`, on another host or another path, and the reader stops rather than follow it, so the token goes to no other host.
Reason: a fix line for a plan listing problem no recorded plan gives, so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `Cannot read the song library <library>.`: as step 1 of the Steps.
Reason: a fix line for a plan listing problem no recorded plan gives, so no trace lists it; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Done when Nick has the listing and a command, or the problems and their fixes.
Reason: a step's end condition: it says when the step is done, and no listing, command or question depends on it

Sentence: Done when Nick answers with a yes or calls the build off.
Reason: a step's end condition: it says when the step is done, and no listing, command or question depends on it

Sentence: A plan build's summary prints the warnings after its song lines, before the set's path; show them as printed.
Reason: how a plan build's summary is shown: the traces whose plan build runs end at the run or name only its exit 1, and the recorded plans' builds are run by no trace

Sentence: This is the one rule for it, on the Steps and The plan path alike; every other place points here.
Reason: says where the rule lives; no listing, command or question depends on it

Sentence: 2: a fault in the lights command you composed: fix it and run it again, with no new yes.
Reason: the lights mode's exit 2: no trace's lights command exits 2

Sentence: A refused picture is most often a presentation this Mac is not authorized for, which Nick authorizes in ProPresenter.
Reason: fix advice for a `template colour` reason no trace's lights run prints, and no listing, command or question depends on it

Sentence: `no presentation or playlist item of its name in the playlist "<name>"`: the playlist links no presentation whose own name, or whose playlist item's name, is the song's title.
Reason: a `template colour` reason no trace's lights run prints; test/build-set-skill-quotes.test.ts checks the piece it quotes

Sentence: Nick adds the song's presentation to that playlist in ProPresenter, renames its playlist item to the song's title when the presentation's own name differs, or leaves the template's colour.
Reason: fix advice for a `template colour` reason no trace's lights run prints, and no listing, command or question depends on it

Sentence: When the line ends `Rename one in ProPresenter, then run the lights step again.`, two playlists have the very name `--playlist` gave: Nick renames one in ProPresenter, and the same command runs again on his word.
Reason: the playlist problem of two playlists with the name `--playlist` gave, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: `no set is built for <date>, since <path> is not there. Build the set, then run the lights step again.`: the output root holds no set for that date.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick builds the set, by the Steps or The plan path, or names the date or the output root the set was built with, a change to the lights command.
Reason: fix advice for a lights problem no trace runs into: a build by the Steps or The plan path, or a date or output root Nick names, which goes on the lights command by The lights alone, which traces pin

Sentence: `the set built for <date>, <path>, cannot be read: ...` or `the set built for <date>, <path>, holds no song: ...`: the lights mode cannot read the set's songs from its Live set.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick builds the set again, with the yes to replacing it.
Reason: fix advice for a lights problem no trace runs into: a rebuild, which The yes to replacing governs and its traces pin

Sentence: `the connections config file <path>`, then `names no Eos to connect to: ...` or `names no ProPresenter to connect to: ...`: the file the server reads its connections from is not there, or its `eos` or `propresenter` section is missing or rejected, and the rest of the line says which.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick fixes the file as section 7 of `docs/install.md` says, with the lights' section by section 9 and ProPresenter's by section 11.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: `the weekly show file for <date> cannot be found or made in <folder>: ...`: the show folder cannot be read, or the copy of the template show file failed, and the rest of the line says why.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick fixes the folder as the cause names it, such as its permissions or a full disk.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: `ProPresenter at <host>:<port> did not answer.`: ProPresenter is closed, its network is off, or it is not at the address the `propresenter` section names.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick opens ProPresenter, or sets its network and its address by section 11 of `docs/install.md`.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: `ProPresenter at <host>:<port> answered <status> to GET <path>.`: ProPresenter is open and refused a request the lights mode needs.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Most often ProPresenter has only just opened, and Nick asks for the lights again.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: When it repeats, the status and the path name the request ProPresenter refuses, and nothing in the set or the lights command fixes that.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: `the command line in Eos does not read LIVE, it reads "<line>". Put Eos in Live, then run the lights step again.`: Eos is in Blind, in Patch or on another display, where the lights mode writes nothing.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick presses Live in ETCnomad.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: `cue list <n> has no cue labelled ...`: the cue list has no song cue for a song the line names, a cue labelled as `songCueLabel` in `config/lights.json` gives it, such as Song 1.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick labels that cue in the open show, and in the template show file for the weeks after, or corrects `cueList` in the `eos` section of the connections config.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: `the chain of <song cue> runs on into cue <list>/<cue>, ...`: a song cue runs on by a follow or a hang, cue after cue, into another song's cue or into a cue of another song's chain, and a cue is one song's.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick takes the follow or the hang off the last cue of the song's own chain in the open show, or corrects its link, and does the same in the template show file for the weeks after.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: A line that says a cue `runs on by a link to <link>, which is no cue of cue list <n>.`: a cue of a song's chain has a follow or a hang, and its link names a cue in another cue list or a cue the cue list does not hold.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick corrects the link of the cue the line names in the open show, or takes its follow and its hang off, and does the same in the template show file for the weeks after.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: `cue list <n> has no cue number free ...`: the set has more songs than the cue list has song cues, and no cue number is free for the copy of the last song cue that the line names.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick renumbers the cue after it in the open show, so a number between the two is free.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: `channel <n> has no red, green and blue in Eos, so it is no colour light. Check colourChannels in config/lights.json.`: the line names its fix.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: A line that says Eos `rejected the command "<command>", and its command line reads "<line>"`: Eos would not take a command the lights mode sent, and its command line says why.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick clears the command line in ETCnomad, then asks for the lights again.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: A line that says Eos `did not make ...`, `did not take off ...`, `did not take the label of ...` or `did not take the colour of ...`: Eos did not show a copy, a follow or a hang taken off a copy, a label or a colour the lights mode sent within its time limit.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Nick asks for the lights again, after the fix the line's last sentence gives when the open show is changed.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: `the song cues are labelled and coloured in the open show, but ... Save the show by hand in ETCnomad.`: every label and colour is written, and only the save is missing.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: This line comes with the song lines on stdout: show them.
Reason: says what comes with a lights problem no trace runs into, a show the lights mode could not save

Sentence: Nick saves the show in ETCnomad himself, and the file that save makes is the one he AirDrops.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: A line that ends `The open show is changed and not saved: open the weekly show file again without saving, then run the lights step again.`: the run stopped after it began to write, and the lights mode never saves a show it wrote half of.
Reason: a fix line for a lights problem, which no trace runs into; test/build-set-skill-quotes.test.ts checks the line it quotes

Sentence: Before any other fix for the line, Nick opens the weekly show file again in ETCnomad, by the three steps, without saving the open show.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: A line that starts `config/lights.json`: the lights config is missing, is not valid JSON, or gives a value the lights step cannot use, and the line says which.
Reason: a fix line for a lights config problem, which no trace runs into

Sentence: Nick fixes `config/lights.json` in this repo.
Reason: fix advice for a lights problem: what Nick changes in ETCnomad, ProPresenter, the connections config, the show folder or the lights config, and no listing, command or question depends on it

Sentence: A build stops on the same line with exit 1, before it writes anything, and is fixed the same way.
Reason: a build's exit 1 on the lights config, which no trace's build gives, and its fix is the lights config's own

Sentence: On exit 1 it can print the summary and then, on stderr, `The set is built, but the weekly show file cannot be made in <folder>: <cause>. The lights step is not done.`
Reason: a build's exit 1 that leaves the set built, which no trace's build gives; test/build-set-skill-quotes.test.ts checks the line it quotes
