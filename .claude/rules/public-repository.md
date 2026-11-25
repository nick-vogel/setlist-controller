# The repository is public

**Everything a commit carries is published: its files, its message, its author and committer, and the title and body of
the pull request that merges it.** The app is built for and tested at a real band's services, so the material it works
on names real people and a real organization. None of that may land here.

## What never lands

- **The name of any organization the app is used by or was recorded at**, in any form: the name, its initials, its
  domain, a ministry or team name that carries them, and an email address at its domain.
- **People's names**, other than the maintainer's own account. A name in a recorded fixture becomes a stand-in such as
  Alder or Birch (`test/fixtures/propresenter/README.md`).
- **Sermon titles, sermon series and the labels of a real library's media.** A dated title can be matched against an
  archive. Stand-ins are `Message <n>`, `Series One` and `Sample Message A`.
- **Real network details**: a stage network's addresses, a router's or a school's network name, a real machine's host
  name. Write documentation addresses from RFC 5737 (`192.0.2.x`) and names such as `production-mac.local`.
- **Another person's home folder**, in any path, including one inside a binary file such as a Live set
  (`test/fixture-sets-public.test.ts`).
- **An author or committer address other than a GitHub noreply address.**

## Recorded fixtures

A recording from a real Planning Center or ProPresenter goes through its scrub script before it is committed
(`scripts/scrub-pco-fixtures.mjs`, `scripts/scrub-propresenter-fixtures.mjs`). Eos has none, so its recordings are
edited by hand (`test/fixtures/eos/README.md`). A script keeps names it cannot judge, so read what it leaves, replace
every name above with a stand-in, and record each hand edit in that fixture folder's README, so the next recording gets
the same edits.

## The check

`pnpm check:private` fails when the tree holds a term from the maintainer's private list. With `--range
origin/main..HEAD` it reads each line the commits add, their messages and their authors, since a term added and later
removed is still in the public history. With `--stdin` it reads a pull request's title and body. The list lives outside
the repository, at `PRIVATE_TERMS_FILE` or `~/.config/setlist-controller/private-terms.txt`, because it names what it
guards: never commit it, and never quote one of its terms in a commit, a review doc or a pull request. Where no list
exists, as in a contributor's clone, the check passes with a note, and this rule is the whole guard.

Run it before every push, and on every pull request before its merge. A list term is a floor, not the rule: a new name
that the list does not hold yet still never lands, and it goes on the list in the same session that finds it.

## The tracker

The maintainer's issues stay in the private `nick-vogel/setlist-controller-archive`, since they hold the material above.
A commit subject refers to one as `setlist-controller-archive#<n>`.
