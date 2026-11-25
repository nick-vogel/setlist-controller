# Planning Center fixtures

Recorded 2026-10-21 from the real Services API v2 by `scripts/record-pco-fixtures.mjs`, then scrubbed by `scripts/scrub-pco-fixtures.mjs`. Phase 0 of setlist-controller#58 (ticket #148). Every `--plan` test replays these; no test calls the real API.

    node scripts/record-pco-fixtures.mjs --plan 92852532 --date 2026-11-01 --date 2027-01-03
    node scripts/scrub-pco-fixtures.mjs

Each file is one request: `{ path, status, body }`, named for the request path. The body keeps the JSON:API shape (`data`, `included`, `links`, and the `meta` the reader can use) with an allowlist of attributes per record type. Lyrics, chord charts, the people who created or edited a record, the organization, item descriptions, and the text of every note on a non-song item are gone.

The scrub keeps each service type's name and ID. Before this repository went public (setlist-controller#604), the committed fixtures were edited by hand after the scrub. In `service_types_per_page_100.json`, the service types that named the church or its ministries became Kids Team, Kids, Youth, Youth Night and Nursery, and every service type but "Service" (997539) took a stand-in ID from 1000011 to 1000022. In `service_types_997539_plans_filter_past_order_-sort_date_per_page_25.json`, every plan title but "TEST TEST TEST" was a sermon title, and became `Message 1` to `Message 16`, in date order. "Service" keeps its ID, since every plan fixture's file name and path carries it. A new recording needs the same edits before it is committed.

## What is in it

- The service types, and only the service type "Service" (997539) beyond that list: its future plans, and its newest 25 past plans (one page; `links.next` points at the second).
- Plan 90897397, 2026-11-01: the November 1 set from the spike. Songs in plan order: This Is Amazing Grace, Great Are You Lord, Fall Like Rain. No transition notes.
- Plan 92852532, 2027-01-03, titled "TEST TEST TEST": a test plan Nick made for these fixtures. Songs: WELCOME HOME, Yes And Amen, Fall Like Rain, with an item titled `Prayer` between Yes And Amen and Fall Like Rain, and an item note on WELCOME HOME in the category "Audio/Visual" whose content is `Overlap`.
- For both plans: the items with `include=song,key,arrangement`, the items with `include=item_notes`, and each item's own `item_notes`.

No real plan shares 2027-01-03 with the test plan, so a two-plans-on-one-date case has to be derived from these files in the test.

## The second recording, 2026-10-22

Recorded for setlist-controller#168, by the same two scripts, to settle three forms the plan reader had only guessed at. It lives in `test/fixtures/planning-center-2026-10-22/`, beside this folder and not in it, on purpose: the scrubber replaces every `.json` file in this folder with the recording, so a fixture the recording does not hold is lost.

    node scripts/record-pco-fixtures.mjs --plan 92852532 --date 2026-11-01 --date 2027-01-03
    node scripts/scrub-pco-fixtures.mjs

In place of a new plan, Nick added three songs to the "TEST TEST TEST" plan 92852532, after Dismissal (sequence 20 to 22). That changed the plan's listing, which about 28 `--plan` tests pin. So this folder keeps the Phase 0 file for every request, those tests stay as they were, and the second folder holds only the six files that differ: the plan's two items files, the future plans list (only the plan's `items_count`, 19 to 22), and the three new items' own `item_notes` (all empty). A test that wants the three songs lays the second folder over this one by request path (`planningCenter20261022` in `test/set-builder-plan-list.test.ts`); no other test sees them. The November 1 plan, the service types and the past plans did not change.

The three songs, and what each is for:

- Build My Life (item 1248865969), with a new Key named "G - A test" that starts in G and ends in A: how Planning Center writes a key change. The Key was deleted from the song library after the recording, so the live item now has no key (`key_name` null), and a new recording would not show the key change.
- Holy Spirit (item 1248865970), in E, on an arrangement with no BPM and no meter set: whether a BPM that was never set comes back as 0 or `null`.
- Oh How I Need You (Find You) (item 1248865972), in A, on an arrangement whose BPM is 0 and whose meter is `2/4`: the other form of no BPM.

A recording replaces every JSON fixture in this folder, the three songs included. To record again and keep the split, move each file that differs from the Phase 0 one into the second folder, then restore the Phase 0 file here with `git checkout`.

## Found while recording

- Item notes arrive both ways: `include=item_notes` on the items request returns them in `included`, and each item's `item_notes` endpoint returns them too.
- A note's text is `content`, with its category in `category_name`. Its case is as typed (`Overlap`), so the name rule's case folding matters.
- Both plans also hold an item titled `Prayer` after the message, under the `MESSAGE` header, well after the last song. So the rule is: a `Prayer` counts only when it is the next item after a song, headers ignored (the 2026-10-21 comment on #58). The November 1 set then gets no pad.
- Songs that are not in the set builder's fixture library (Fall Like Rain, WELCOME HOME, Yes And Amen) need a fixture folder, or a test that renames the plan's titles.
- A key change arrives in the item's `key_name` as `G-A`, with no spaces, though the Key is named "G - A test": the Key's `starting_key` is `G`, its `ending_key` `A`, `starting_minor` false. The reader's rule (the key before the first hyphen) reads it as G.
- A BPM that was never set comes back both ways: `null` on Holy Spirit's arrangement, `0` on Oh How I Need You's. Across the 95 songs in the library on 2026-10-22, 21 arrangements had a `null` BPM and 1 had 0. The reader keeps a BPM only when it is a number above 0, so neither gives a BPM warning. Holy Spirit's meter is `null` too, and gives no meter warning; Oh How I Need You's `2/4` does, against the 4/4 song the test gives it.
- A lower-case `key_name` (`e`), and a minor song with no `key_name`, cannot be recorded, per Nick: a song item's key is linked to one of the song's Keys, so its `key_name` is always that Key's. No Key in the library has a minor starting key, and before this recording none had an ending key. The reader's `starting_key` plus `m` path (`plan-reader.ts`) is unchanged.
