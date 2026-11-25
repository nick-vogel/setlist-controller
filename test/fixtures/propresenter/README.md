# ProPresenter fixtures

Recorded 2026-10-24 from ProPresenter 22 (API v1) on Nick's Mac at home, network API on port 50001, then scrubbed by `scripts/scrub-propresenter-fixtures.mjs`. Phase 0 of setlist-controller#84 (ticket #149). The fake ProPresenter replays these; no test calls a real ProPresenter.

    node scripts/scrub-propresenter-fixtures.mjs

The recording itself was a live session with Nick at the Mac, run by hand against the API, into `dist/propresenter-raw/` (git-ignored). It cannot be repeated without his ProPresenter, so no recorder is committed. To record again, read the request list below and the paths in `commands.json`.

Every slide's words are replaced by a stand-in that names the presentation, the group, the slide and the line (`There Is Freedom / Chorus / slide 1 line 1`). Zero-width spaces in the real text are kept, at the end of the line, and a line of only invisible characters is kept as it was. The stream's slide text gets the stand-in of the slide it shows. The Mac's name and the library path before `Libraries/` are gone. Times are ms since the status stream opened.

The script keeps library names and media labels. Before this repository went public (setlist-controller#604), the committed library and presentations were edited by hand after the scrub: the five Advent-reading families in `v1_library_Default.json` became made-up family names (Alder, Birch, Cedar, Elm and Fir), the church's initials came off three library names, and the media labels that named a person or carried the initials became plain ones (`Speaker.jpg`, `Logo.jpg`, `Welcome.jpg`, `Basics.jpg`, `Ways to Give.jpg`). Sermon titles became stand-ins too, in every file that holds them: the sermon series in playlist and presentation names are Series One to Series Four, the two sermons the tests read are Sample Message A and Sample Message B, the sermon art labels lost their titles, and every other library entry that is no song and no service element is `Message <index>`. A new recording needs the same edits before it is committed.

## What is in it

- `version.json`: `GET /version`.
- `v1_playlists.json`: `GET /v1/playlists`, the 14 playlists ProPresenter pulled from Planning Center.
- Two playlists with `GET /v1/playlist/{id}` and `GET /v1/presentation/{uuid}` for every presentation they link:
  - "Series One - October 11, 2026" (`6E51EFFD-...`). Its three songs (House of the Lord, Goodness of God, Reckless Love) are MultiTracks presentations that this Mac is not authorized for, so every trigger on them is a 403. `v1_playlist_6E51EFFD-before-songs-resolved.json` is the first read of it, before ProPresenter linked the songs (see below).
  - "Series One - October 25, 2026" (`49F3C197-...`). Headers, three placeholders (Huddle, Scripture Reading, Prayer), and three authorized songs: There Is Freedom, Holy Forever, Sinking Deep. Every trigger after the first round went to There Is Freedom (`894B40A0-...`).
- `commands.json`: every command the app would send, in order, with its status, its body and the times it was sent and answered: group triggers by UUID, by name and by index, next, previous, clear, and the error cases. The labels say what each one tested.
- `stream-status-updates.json`: `POST /v1/status/updates` for `status/slide`, `presentation/slide_index` and `presentation/current`, held open for the whole session. Every chunk, in order, with its time. It covers (a) the slide changes from the commands above and (b) slides Nick pressed by hand in ProPresenter. The last two hand presses are the clean pair: a Chorus slide at t=438140 and a Verse 3 slide at t=448784.

## Found while recording

These change the spec on #84, and the tickets should read them first.

- **A group trigger by UUID is always a 404.** Cold or warm, upper or lower case, every `GET /v1/presentation/{uuid}/group/{group uuid}/trigger` returned 404. By name it returns 204, and by index (`group/4/trigger`) it returns 204. The spec says the adapter sends the group's UUID; it has to send the name or the index.
- **A name is matched exactly and case-sensitively.** `Pre Chorus` triggers; `pre chorus` is a 404. So is a name the presentation does not have.
- **Group names repeat in one presentation.** House of the Lord has five groups named `Chorus` and two named `Bridge`, each with its own UUID; There Is Freedom has two `Bridge 1` and two `Bridge 2`. A trigger by name shows the first group with that name (the stream showed the first `Bridge 1`'s slide). A trigger by index reaches any one of them.
- **An unauthorized MultiTracks presentation refuses every trigger with 403.** Its `type` is `multitracks` and `is_authorized` is `false`. 18 of the 24 song presentations on this Mac are like that; at church the licence may differ. Clear still works (204). The pre-service check has no line for this today.
- **A playlist item's name is not the presentation's name.** A Planning Center item can carry the arrangement in its name, `House of the Lord - [ Full ]`, with `presentation_info.arrangement_name` `Full`, while the presentation itself is named `House of the Lord`. Match on the presentation's name, or strip the `- [ ... ]` suffix. A presentation may also exist twice with a suffix (`Yes and Amen-1`, `Good Plans-1`).
- **A presentation item can have no presentation.** Beside the `placeholder` items, an item of type `presentation` can have an empty `presentation_uuid`: a Planning Center song with no linked presentation. On the first read of October 11 all three songs were like that; a minute later ProPresenter had linked them. So the adapter reads again on Refresh, and an empty `presentation_uuid` counts as no presentation in the check.
- **The first commands are slow.** The first triggers took 1.2 s to 7.8 s, and one `previous` answered 500 after 10 s. Warm, every command answered in about 60 ms. A request timeout under about 10 s would put a working ProPresenter offline, and the pause-by-hand window has to start when a command is answered, not when it is sent.
- **Next and previous are a 404 when no presentation is active**: before the first trigger, after a clear, and `next` on the last slide. The adapter should report that as nothing to move, not as offline. Clear is 204 every time.
- **The stream.** `content-type: application/octet-stream`, chunked; every chunk held exactly one JSON frame ending in a blank line (`\r\n\r\n`). ProPresenter adds `timer/system_time` every 2 s though it was not asked for, which is a usable heartbeat. On open it sent `presentation/slide_index` and `presentation/current` (both null) but no `status/slide`. `status/slide` carries the slide's own UUID and, when it came, came 0.1 s to 0.4 s after the command was answered; `presentation/slide_index` sometimes came seconds later and out of order with it. So the pause by hand reads `status/slide`.
- **The stream does not report every slide change.** Several commands that changed the slide brought no frame at all: the cold trigger of `Verse 1`, the first `Bridge 1`, `Ending`, and some clears. Nick pressed many slides by hand, and the stream holds far fewer `status/slide` frames for that time. So a missing frame proves nothing, the pause by hand must not count frames, and the slide text on the row can go stale until the next frame.
- **`id.index` of a presentation is not stable.** The same presentation came back as index 0, 5 and 257 from different endpoints. Use the UUID.

## The 2026-11-02 session

Recorded 2026-11-02 from the same ProPresenter at home, for setlist-controller#275 (ticket #277), into `~/Library/Logs/setlist-controller/2026-11-02-propresenter-raw/`, which holds real lyrics and is never committed. Scrubbed by the same script into a new, empty folder, never into this one, since a run deletes every .json in its output folder, then copied in:

    node scripts/scrub-propresenter-fixtures.mjs --raw ~/Library/Logs/setlist-controller/2026-11-02-propresenter-raw --out dist/propresenter-2026-11-02-scrubbed

### What is in it

- `v1_playlist_306E3B2A-D71A-40B2-ACBD-DE96FC9FA5F5.json`: `GET /v1/playlist/{id}` of "November 8, 2026": headers, the Huddle placeholder, Loop, Countdown, Ancient Gates, Holy Forever, Worthy Of It All, Facetime, MC, Scripture Reading, Test Message, Sample Message B and Dismissal.
- `GET /v1/presentation/{uuid}` of the presentations new since 2026-10-24: Ancient Gates (`5A606BC5-...`), Worthy Of It All (`AA8F2F17-...`, since replaced by the 2026-11-06 read), Great Are You Lord (`D6AD4EA2-...`), Trust In God (`9A80A14C-...`) and the service item Test Message (`EB4A51A6-...`). Great Are You Lord and Trust In God are not in the playlist; they were read for their groups.
- `commands-2026-11-02.json`, the session's `commands.json` renamed: index triggers, `GET /v1/presentation/{uuid}/{index}/trigger`, on Ancient Gates, Worthy Of It All, Holy Forever and There Is Freedom, with the out-of-range cases, then a next and a clear, and reads of `GET /v1/presentation/slide_index` between them.
- `stream-status-updates-2026-11-02.json`, the session's `stream-status-updates.json` renamed: the status stream for `status/slide`, `presentation/slide_index` and `presentation/current`, held open through those commands.
- `v1_playlists-2026-11-02.json`, the session's `v1_playlists.json` renamed: the 6 playlists ProPresenter held, "November 8, 2026" first. The fake ProPresenter answers `GET /v1/playlists` with it only after `listNovember8()`, since the tests that count the 14 playlists of 2026-10-24 read `v1_playlists.json`.

### Not copied

- `version.json`: the same as the committed one.
- There Is Freedom (`894B40A0-...`): it read as not authorized this time, and the committed read, authorized, is the one the October tests trigger.
- Holy Forever (`27B59282-...`): its groups and slide counts are the same as the committed read's, so the committed file stays.
- Loop, Countdown, Facetime, MC, Scripture Reading, Sample Message B and Dismissal: the same UUIDs as committed files, and Loop and MC differ from them. The fake keeps one read per path, so the committed reads stay and the October tests are untouched.

### Found while recording

- **The index trigger counts every slide of the presentation, from 0, in the order its read lists its groups and their slides.** Groups with no name and slides with no words count too. Ancient Gates lists 58 slides across its groups, and the stream's `presentation/slide_index` gave `total_cues` 58, `index` 57 and `remaining_cues` 0 for its last slide. Index 1 showed the first slide of Verse 1, after the unnamed title slide at 0. Repeated group names are no problem: index 9 of Worthy Of It All showed the second Verse 1's first slide.
- **The answers.** 204 for an index inside the slide count; 404 at the count (58 on Ancient Gates), at 9999, at -1 (with the body `can not parse "-1" to a u32`) and for an unknown presentation; 403 on a presentation this Mac is not authorized for, There Is Freedom this time, at index 0. A warm index trigger answered in about 40 ms to 60 ms.
- **Every index trigger that changed the slide brought a `status/slide` frame**, 0.3 s to 0.5 s after its answer, with the slide and the one after it. Index 2 triggered again, with that slide already showing, brought none. Next after an index trigger answered 204 and brought its frame, so an index trigger makes the presentation active, as a group trigger does.
- **Each item's `presentation_info.arrangement_name`.** Every item of "November 8, 2026" is on `Master`. On October 11, House of the Lord and Goodness of God are on `Full`, and their presentations list only Master under `arrangements`: the API does not return another arrangement's groups, so an index into one would land on the wrong slide.

## The 2026-11-06 session

Recorded 2026-11-06 from the same ProPresenter at home, for setlist-controller#326 (found in the #284 home run), into `~/Library/Logs/setlist-controller/2026-11-06-propresenter-raw/`, which holds real lyrics and is never committed: the version, the playlists, "November 8, 2026", its 12 presentations, the libraries and the `Default` library. Scrubbed by the same script into a new, empty folder, then copied in:

    node scripts/scrub-propresenter-fixtures.mjs --raw ~/Library/Logs/setlist-controller/2026-11-06-propresenter-raw --out dist/propresenter-2026-11-06-scrubbed

### What is in it

- `v1_libraries.json`: `GET /v1/libraries`, the one library, `Default`. The fake ProPresenter answers it as recorded, unless a test refuses it.
- `v1_library_Default.json`: `GET /v1/library/Default`, its 310 presentations, each item `{ "uuid", "name", "index" }`. Every committed presentation is one of them, by its own UUID and name. The fake answers it as recorded, and a library it does not hold is a 404.
- Worthy Of It All (`AA8F2F17-...`), in place of the 2026-11-02 read, since Nick edited the presentation on 2026-11-03. It has 10 groups and 33 slides: Intro 1, Verse 1 3, Chorus 4, Verse 1 3, Chorus 3, Chorus 4, Bridge 4, Bridge 4, Chorus 3 and Chorus 4. The 2026-11-02 read had 9 groups and 34 slides, with no Intro, a first Verse 1 of 4 and a first Chorus of 5, so every index from the second Verse 1 on is one lower than in `commands-2026-11-02.json`.

### Found while recording

- **`GET /v1/libraries` is a flat list**, `[{ "uuid", "name", "index" }]`, where the OpenAPI spec (https://openapi.propresenter.com/swagger.json, read 2026-11-02) has `[{ "id": { "uuid", "name", "index" } }]`. The slide timing file's title check (setlist-controller#297) read the spec's shape, so on the real ProPresenter it found no library.
- **`GET /v1/library/{name}` names its update field `update_type`**, where the spec has `updateType`. The server reads only the items' names.

### Not copied

- `version.json`, `v1_playlists.json` (the same as `v1_playlists-2026-11-02.json`), Countdown, Dismissal and Facetime: the same as the committed files.
- Holy Forever, Sample Message B and Scripture Reading: only their `id.index` or a slide's stand-in text differs from the committed read.
- The "November 8, 2026" playlist: its Huddle and Scripture Reading items are now hidden, and the Test Message item now links another presentation, `SeriesFour_Part1_ProPresenter` (`445A11D5-...`), which is not copied either.
- Ancient Gates (`5A606BC5-...`): its last Bridge now holds 2 slides, not 24, and an Ending group of 1 slide follows it. With it, the tests that model Ancient Gates' End as a clear would change, so it waits for its own ticket.
- Loop and MC: they differ from the committed reads, and no test needs the new ones.

## The 2026-11-10 session

Recorded 2026-11-10 from the same ProPresenter 22 at home, for setlist-controller#134 (the recordings #264 and #269 need, and #377's Previous on a first slide), into `~/Library/Logs/setlist-controller/2026-11-10-propresenter-raw/`, which holds real lyrics and is never committed. ProPresenter had just opened, with no slide on screen. Every command went out from the playback Mac's side through the API, in this order: the live slide read, an index trigger of Holy Forever's Verse 1 slide 2, the live slide read again, the status stream opened over that slide, a clear, the reads after it, Next after the clear, an index trigger of Holy Forever's slide 1 (its Intro, no words), and Previous on it. Scrubbed by the same script into a new, empty folder, then copied in:

    node scripts/scrub-propresenter-fixtures.mjs --raw ~/Library/Logs/setlist-controller/2026-11-10-propresenter-raw --out dist/propresenter-2026-11-10-scrubbed

The script now also scrubs a `GET /v1/status/slide` answer, which has a status/slide frame's shape, with the same stand-ins as the frames.

### What is in it

- `commands-2026-11-10.json`, the session's `commands.json` renamed: 14 commands with their labels, statuses and bodies, times relative to the stream's open. The indexes are Holy Forever's (`27B59282-...`), whose groups and slide counts match the committed read.
- `stream-status-updates-2026-11-10.json`, the session's `stream-status-updates.json` renamed: `POST /v1/status/updates` for `status/slide` and `presentation/current`, the server's own request, opened while Holy Forever's Verse 1 slide 2 showed and held for 6 seconds.

### Found while recording

- **`GET /v1/status/slide` answers 204 with an empty body when no slide shows**: right after ProPresenter opened, after a clear, and also while a slide with no words shows (Holy Forever's Intro, index 0). With a slide that has words it answers 200 with `{ "current": { "text", "notes", "uuid" }, "next": { ... } }`, the shape of a status/slide frame.
- **A stream opened over a live slide sends that slide at once**: `timer/system_time`, then `presentation/current` with the live presentation, then `status/slide` with the slide showing and the one after it, all within 166 ms of the open. The Phase 0 note that the stream sends no `status/slide` on open held only because no slide showed then.
- **The heartbeat came every second**: `timer/system_time` at 1311, 2307, 3312, 4310, 5310 and 6309 ms, on a ProPresenter that had just opened.
- **`GET /v1/presentation/active` answers 200 with `{ "presentation": null }`** with no slide on screen, at the open and after a clear, and with the whole presentation while a slide shows.
- **Next after a clear is a 404**, as the Phase 0 session found, and **Previous on a presentation's first slide is a 404** too, the answer the fake ProPresenter assumed (#377).
- Every command answered in 2 to 163 ms; ProPresenter had been open a few minutes, so nothing was cold.

### Not copied

- `version.json`: the same as the committed file.
- `v1_playlists.json`, the "November 8, 2026" playlist and Holy Forever: the playlists list and the playlist changed since the committed reads, and Holy Forever differs from the committed read only in its library `id.index`, 126 for 125.

## The 2026-11-12 session

Recorded 2026-11-12 at about 15:50 from the same ProPresenter 22 at home, for setlist-controller#498: the reads the lights step of the set build (setlist-controller#247) makes. Every request was a GET, and nothing was triggered. The raw answers went into `~/Library/Logs/setlist-controller/2026-11-12-propresenter-raw/`, which holds real lyrics and is never committed. Scrubbed by the same script into a new, empty folder, then copied into the folder `2026-11-12/` here, not beside the other files:

    node scripts/scrub-propresenter-fixtures.mjs --raw ~/Library/Logs/setlist-controller/2026-11-12-propresenter-raw --out dist/propresenter-2026-11-12-scrubbed

The session has a folder of its own because the fake ProPresenter keeps one read per path from the files of this folder and reads no folder inside it. So this session's reads of `/v1/playlists`, of "November 8, 2026", of Ancient Gates and of There Is Freedom replace no committed read. The fake serves the session only once a test turns it on (`serveNovember12()`, for setlist-controller#501): from then on it answers each path a file here holds from that file, a thumbnail on its recorded path with its query alone, with the bytes of the PNG its `body_file` names, and every other path as before. `thumbnail-first-request-then-again.json`, `made-transparent.png` and `placeholder-with-marks-14-13.png` are no answer to a path, and the fake serves a picture of this folder on another path only where a test puts it (`answerThumbnails()`, for setlist-controller#502): on the thumbnail of one presentation's first cue, for its next requests in order and, when the test says so, for every request after them, as a 200 `image/png` with the file's bytes, or a status with no body and no content type, as the recorded 403 is. The bytes are recorded, or for `made-transparent.png` made, but no song's path answered with them in a recording. So a song's placeholder first and its own picture on the next request is a model of the one recorded run in `thumbnail-first-request-then-again.json`, not a recording of a song: that file's path is a message's slides, and its later answers were not kept. A test can also rename a playlist (`renamePlaylist()`), an answer the fake gives that no recording holds: no recorded playlist with a series title before its date has songs with pictures.

A thumbnail is two files. `<name>.json` is `{ method, path, status, content_type, body_file, body_bytes }`, and `body_file` names the PNG beside it, byte for byte as ProPresenter sent it, except the four song thumbnails below, which are made. An answer with no picture has `body` and no `body_file`. The script scrubs no picture and copies none: each recorded PNG was looked at, shows no lyric, and was copied by hand from the raw folder.

### What is in it

- `v1_playlists.json`: `GET /v1/playlists`, 7 playlists. Two are named by their date alone, "November 8, 2026" and "November 15, 2026". The other five carry a series title before it, such as "Series Two - November 1, 2026".
- `v1_playlist_5B02A251-921A-440A-A0C6-9FA5FF8C1A1A.json`: "November 15, 2026". Its songs are `This Is Amazing Grace - [ Full ]` (arrangement `Full`), `Yes and Amen` and `I Speak Jesus` (both `Master`).
- `v1_playlist_306E3B2A-D71A-40B2-ACBD-DE96FC9FA5F5.json`: "November 8, 2026" as it reads today. Its songs are Ancient Gates, Holy Forever and Worthy Of It All.
- `GET /v1/presentation/{uuid}` and `GET /v1/presentation/{uuid}/thumbnail/0?quality=400&thumbnail_type=png` for four songs. Each is a MultiTracks presentation this Mac is authorized for, and its first slide has no words and a label that holds the background file's name. The reads are recorded. The four thumbnails are **made, not recorded** (setlist-controller#604): the recorded ones were frames of licensed stock motion backgrounds. Each stand-in is 400 by 225, 8-bit RGBA, every pixel opaque, written by a few lines of Node with zlib (an IHDR, one IDAT with filter 0 on every line, an IEND). It is five flat bands, top to bottom, in the five colours the lights step's grouping found in the recorded frame, each band as many lines as its group's share of the pixels, two of them nudged a step so a hue is not a multiple of 3: its colour at saturation 80 is then no whole thousandth, which the test of an Eos that keeps a level to a thousandth needs. So each gives the dominant colour of its recorded frame, which is what the tests read: hue 41, 6, 25 and 192, where the recorded frames gave 41, 6, 27 and 188.

| Song | UUID | First slide's label | The recorded frame showed | The stand-in's bands, `red green blue x lines` |
|---|---|---|---|---|
| This Is Amazing Grace | `3CE373C7-...` | `OceanWaves_01_4K.mp4` | tan rock above white surf, a little teal water | `204 191 181 x 81`, `166 158 143 x 38`, `127 122 109 x 30`, `72 70 63 x 33`, `25 26 25 x 43` |
| Yes and Amen | `939B9443-...` | `Blossom_01_4K.mp4` | pink flowers, dark | `204 173 165 x 29`, `167 108 101 x 35`, `133 55 53 x 40`, `76 33 28 x 44`, `27 17 13 x 77` |
| I Speak Jesus | `145FCEE7-...` | `CityRain_09_4K.mp4` | a grey city in rain, almost no colour | `154 147 142 x 48`, `138 134 128 x 76`, `113 113 108 x 33`, `85 84 81 x 24`, `47 48 48 x 44` |
| Ancient Gates | `5A606BC5-...` | `TheCove_10_4K.mp4` | dark teal water and white surf | `169 144 142 x 43`, `137 117 116 x 28`, `90 87 87 x 18`, `50 61 62 x 26`, `31 39 41 x 110` |

- "2023-11-12 Sample Message A" (`1A0F6B8F-...`), a message's slides whose first slide's picture, `Sample Message A Title.png`, is not on this Mac: its read, and its thumbnail, the grey placeholder (36,140 bytes). Four reads over 5 s and one a minute later all gave the same bytes.
- There Is Freedom (`894B40A0-...`), a MultiTracks presentation this Mac is not authorized for today: its read, and its thumbnail's answer, a 403 with no body and no content type.
- `placeholder-with-marks-14-13.png`: the grey placeholder with the two white marks of a song's first slide over it (38,827 bytes). It is what the same thumbnail request gave for Holy Forever at 14:13 that day, in the session that wrote the spec, which kept the bytes and not the status or the headers. At 15:50 the same request gave Holy Forever's mountain picture.
- `v1_presentation_5A606BC5-..._thumbnail_36`: `thumbnail/36` of Ancient Gates, the one slide of its Ending group, which has no words and no media. It is what ProPresenter draws for a slide with no background: a dark checkerboard and the two white marks, every pixel opaque (5,778 bytes). A lyric slide's thumbnail is this with the words over it.
- `thumbnail-first-request-then-again.json`: one thumbnail asked for four times in 4.4 s, on a presentation ProPresenter had not drawn since it opened (`5F5C4A7C-...`, a message's slides). `{ method, path, answers }`, and each answer is `{ t_ms, answered_ms, status, content_type, body_bytes, body_md5 }`, the times counted from the first request. The first answer is the grey placeholder, byte for byte the `1A0F6B8F-...` thumbnail above (md5 `32baa3de...`). The other three are one real picture of 26,282 bytes, which is not kept.
- `made-transparent.png` is **made, not recorded**: 400 by 225, 8-bit RGBA, every pixel fully transparent, written by a few lines of Python with zlib (an IHDR, one IDAT of zero bytes with filter 0, an IEND). It is the stand-in the ticket asked for a lyric slide's thumbnail. ProPresenter never sent a thumbnail like it (see below).
- `made-black-noise.png`, `made-black-red-speckle.png` and `made-teal-dark-shadow.png` are **made, not recorded**, for finding 2 of setlist-controller#247's pre-PR review 1: each 400 by 225, 8-bit RGBA, every pixel opaque, written by a few lines of Node with zlib (an IHDR, one IDAT with filter 0 on every line, an IEND), with the pixels counted from 0 in rows from the top. The first is a black frame with noise, each of red, green and blue from 0 to 3: `seed = (seed * 1103515245 + 12345) % 2147483648` from a seed of 1, as JavaScript's numbers compute it, and each value is `floor(seed / 2147483648 * 4)` (92,091 bytes). The second is black with red at 1 of 255 on every even pixel (871 bytes). The third is pale teal water, red `150 + at % 5`, green `195 + at % 4` and blue 200 at pixel `at`, with a dark warm shadow, red `14 + at % 3`, green `9 + at % 2` and blue 5, on the first 12% of the pixels (1,589 bytes). They stand in for a background whose first frame is dark, such as a video that fades in from black. ProPresenter never sent a thumbnail like them.

### Found while recording

- **Every thumbnail is a 200 `image/png`, 400 by 225, 8-bit RGBA, with every pixel opaque**, and an `eXIf` and an `sRGB` chunk before the picture. A real picture answered in 20 ms to 70 ms once ProPresenter had made it.
- **A lyric slide's thumbnail is not transparent.** `thumbnail/1` of Ancient Gates, its first Verse 1 slide, came back with all 90,000 pixels opaque: ProPresenter draws the empty background as a dark checkerboard (8-pixel squares, greys 34 and 10), the words in white on a darker band, and the two white marks. It was read once and not kept, since it shows a lyric. `thumbnail/36`, a slide with no words, is kept and shows the same checkerboard and marks. So "no opaque pixels" never happens on this API. A lyric slide is a picture with no colour, which the spec's saturation rule covers and its transparency rule does not.
- **The grey placeholder is also what a first request can get for a picture that is on this Mac.** `thumbnail-first-request-then-again.json` holds one such run: the first request took 731 ms and gave the 36,140-byte placeholder, and the same request 1.2 s after the first gave the real picture, as did the two after it. Another presentation ProPresenter had not drawn yet gave the placeholder on the first request and its real picture (138,834 bytes) 0.4 s later. Dismissal, MC, Facetime, Test Message and Scripture Reading gave the placeholder on a first request and their real pictures about 30 s later. The four songs of 2026-11-08 and 2026-11-15 that gave the placeholder at 14:13 (Holy Forever, Worthy Of It All, Yes and Amen, I Speak Jesus) gave real pictures at 15:50, and this session does not know whether their files arrived in between or ProPresenter had only not drawn them yet. So one placeholder does not prove the background file is missing: the lights step has to ask again before it calls a song a song with no picture. Only the one run above is kept as a file, and no run on a song is, because a presentation gives its first answer only once and every song of the two playlists had been asked for by then.
- **A thumbnail of a presentation this Mac is not authorized for is a 403**, with no body, every time it was asked again. The very first thumbnail request to seven MultiTracks presentations this Mac was not authorized for on 2026-10-24 (There Is Freedom and Goodness of God were checked again today, the other five were not), all in the same second, answered 500 with no body, and that answer was not kept.
- **The two white marks are in every song thumbnail**, at the same place, top left and bottom right, on real pictures and on the placeholder alike. They are white, so they add nothing to a hue.
- **A playlist item's name can carry the arrangement**, as on 2026-10-24: `This Is Amazing Grace - [ Full ]` links the presentation named `This Is Amazing Grace`.

### Not copied

- `version.json`: the same as the committed file.
- The reads and thumbnails of Holy Forever (a snowy mountain, `Mountain_04_4K.mp4`) and Worthy Of It All (`Daybreak_06_4K.mp4`): four were recorded, and these two stay in the raw folder.
