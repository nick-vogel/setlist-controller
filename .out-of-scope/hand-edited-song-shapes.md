# Hand-edited song shapes

The set builder does not add a rule, a stop or a fallback for a song shape that the MultiTracks library never produces and that only a hand edit in Live can make.

## Why this is out of scope

Every song in the library comes from MultiTracks and is re-saved in Live 12 with its locators as MultiTracks wrote them. Each one has a `Count Off` locator on beat 0, sections after it, and an end marker after its last section. The builder is written for that shape.

A rule for a shape outside it only runs when someone renames, moves or deletes a locator by hand. That has no plausible user path today, so the rule is code and tests to maintain for a case nobody meets. This is the same bar the eng-pipeline#34 triage set on 2026-10-17: an item stays only when it has a plausible user path, or when it changes what a user sees or what is stored.

Two shapes were rejected on that bar:

- A song with no `Count Off` locator. The builder titles only a locator named `Count Off`, so such a song would show as `Song <n>` on the controller. An overlap or a pad into such a song already stops the build.
- A song with a named locator at or after its end marker. The controller already warns about it with `section-after-end` when the set loads.

If the library ever gains songs from another source, or a hand edit becomes part of the weekly routine, reconsider this file and reopen the matching request.

## Prior requests

- #45: "Give a song with no Count Off its title on its first locator"
- #47: "Stop on a song with a named locator after its End marker"
