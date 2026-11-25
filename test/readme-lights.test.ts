import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './set-builder-harness.ts';

// The install doc's word on the lights: the weekly show file, the template show file, the song's colour,
// the weekly routine, and the cue rules, one Eos cue per song, fired on the song's Count Off.

async function installDoc(): Promise<string> {
  return readFile(join(REPO_ROOT, 'docs/install.md'), 'utf8');
}

// The install doc's subsection under this heading, up to the next heading.
async function subsection(heading: string): Promise<string> {
  const text = await installDoc();
  const start = text.indexOf(`\n${heading}\n`);
  if (start === -1) return '';
  const rest = text.slice(start + heading.length + 2);
  const end = rest.search(/^#{2,3} /m);
  return end === -1 ? rest : rest.slice(0, end);
}

// The install doc's section on the lights, from its heading to the next section's.
async function lightsSection(): Promise<string> {
  const text = await installDoc();
  const start = text.indexOf('\n## 9. The lights: Eos and the DMX cable\n');
  if (start === -1) return '';
  const rest = text.slice(start + 1);
  const end = rest.indexOf('\n## ', 1);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("the install doc's lights section", () => {
  it("opens by saying the playback Mac's ETCnomad writes each Sunday's show file, which the production computer then opens", async () => {
    const intro = (await lightsSection()).split('\n').find((line) => line.startsWith('The lights are ETC Eos')) ?? '';

    expect(intro).toContain('The playback Mac runs ETCnomad too');
    expect(intro).toContain("the lights step writes each Sunday's show file while the set is built");
    expect(intro).toContain('The production computer then opens that file for the service.');
    expect(intro).toContain("and in the playback Mac's ETCnomad for the lights step");
  });

  it("opens this Sunday's show file at setup, the one AirDropped from the playback Mac", async () => {
    const setup = await subsection('### Setup and teardown: the DMX cable');
    const open = setup.split('\n').find((line) => line.startsWith('4. ')) ?? '';

    expect(open).toContain("Open this Sunday's show file in ETCnomad, the one AirDropped from the playback Mac");
    expect(open).toContain('fire a cue at the console and check the room\'s lights change');
    expect(setup).not.toContain('Open ETCnomad on the church show');
  });

  it("cites ETC's online help for each Eos fact it states", async () => {
    const lights = await lightsSection();
    const help = 'https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/';

    for (const page of [
      '05_Show_Files/Saving_Show_Files.htm',
      '05_Show_Files/Opening_Show_Files.htm',
      '04_System_Basics/Important_Concepts.htm#TrackingvsCueOnly',
      '12_Cues_and_Cue_Lists/Selective_Storing_Cues_in_Live.htm',
      '08_Manual_Control/04_Advanced_Manual_Control/Copy_To.htm',
      '12_Cues_and_Cue_Lists/04_Cue_Attributes/Cue_Label.htm',
      '12_Cues_and_Cue_Lists/04_Cue_Attributes/Follow_Hang.htm',
      '12_Cues_and_Cue_Lists/05_Flags/Block.htm',
    ]) {
      expect(lights, page).toContain(`](${help}${page})`);
    }
  });

  it('keeps its four subsections and puts the four new ones before the cue list', async () => {
    const headings = (await lightsSection()).split('\n').filter((line) => line.startsWith('### '));

    expect(headings).toEqual([
      "### Eos's OSC settings",
      "### The lights' section of the connections config",
      '### The weekly show file',
      '### The template show file',
      "### The song's colour",
      '### The weekly routine',
      '### The cue list',
      '### Setup and teardown: the DMX cable',
    ]);
  });
});

describe("the install doc's weekly show file", () => {
  it('gives each Sunday its own show file, a copy of the newest template show file that the build makes', async () => {
    const weekly = await subsection('### The weekly show file');

    expect(weekly).toContain('Each Sunday has its own show file');
    expect(weekly).toContain('Every build of the set (`pnpm build-set`) makes it');
    expect(weekly).toContain('a copy of the newest template show file');
    expect(weekly).toContain('`~/Documents/ETC` unless `--show-folder` names another');
    expect(weekly).toContain('`<weekly show name prefix> <date of the set> <time of the copy>.esf3d`');
    expect(weekly).toContain('never replaces or deletes a file');
    expect(weekly).toContain('05_Show_Files/Saving_Show_Files.htm');
  });

  it('says the lights step changes the label of each song cue and the colour of the six colour lights, and nothing else', async () => {
    const weekly = await subsection('### The weekly show file');

    expect(weekly).toContain('`pnpm build-set --lights`');
    expect(weekly).toContain('and nothing else');
    expect(weekly).toContain("the label of each song cue, which becomes the song's title");
    expect(weekly).toContain('the six colour lights');
    expect(weekly).toContain('channels 1 to 3 and 16 to 18');
    expect(weekly).toContain('in each song cue and in each cue of its chain');
    expect(weekly).toContain('A song owns its chain: every cue its song cue runs on into by a follow time or a hang time, cue after cue (the cue list, below).');
    expect(weekly).toContain('never sets an intensity');
    expect(weekly).toContain('so every level a cue holds as its own stays as the template has it, the house lights included.');
    expect(weekly).toContain('the house lights included');
  });

  it("says a colour tracks, so each cue straight after one of a song's cues gets its own colour back, and a cue no chain reaches keeps the template's colour", async () => {
    const weekly = await subsection('### The weekly show file');

    expect(weekly).toContain('tracks forward');
    expect(weekly).toContain('04_System_Basics/Important_Concepts.htm');
    expect(weekly).toContain('Record Only');
    expect(weekly).toContain("records the six lights' colour into every song cue and every cue of its chain with Record Only");
    expect(weekly).toContain("records the colour each cue straight after one of a song's cues had back into that cue, so a song's colour stops at the end of its chain and a cue no chain reaches keeps the template's colour");
    expect(weekly).not.toContain('the first cue after the last song cue');
  });

  it("says a set with more songs than song cues gets a copy of the last song cue, numbered past that song's chain with no follow and no hang, and a shorter set leaves one alone", async () => {
    const weekly = await subsection('### The weekly show file');

    expect(weekly).toContain('a copy of the last song cue');
    expect(weekly).toContain('Copy To');
    expect(weekly).toContain("numbered after that cue and every cue of its chain, and then labelled and coloured like any song cue");
    expect(weekly).toContain('Eos copies a follow time and a hang time with the cue, and the lights step takes them off the copy, so an extra song runs on into nothing.');
    expect(weekly).toContain("The copy stands in front of the cue that followed the last song's chain, so every level that cue does not hold as its own now tracks from the copy, the last song cue's look, and no longer from the last cue of the chain.");
    expect(weekly).toContain('leaves the unused song cue as it is');
  });

  it('says the lights step writes only to the newest weekly show file for the date, then saves it', async () => {
    const weekly = await subsection('### The weekly show file');

    expect(weekly).toContain('only when the show open in Eos is the newest weekly show file for the date');
    expect(weekly).toContain('cannot change the template');
    expect(weekly).toContain('a new version of the weekly show file');
  });
});

describe("the install doc's template show file", () => {
  it('names the template by the show name of the lights config, and takes its newest save', async () => {
    const template = await subsection('### The template show file');

    expect(template).toContain('`Church Sunday template`');
    expect(template).toContain('the `templateShowName` of `config/lights.json`');
    expect(template).toContain('the newest save of that name');
  });

  it('says what the template must hold: the patch, the cue list with its three song cues labelled, and each full look', async () => {
    const template = await subsection('### The template show file');

    expect(template).toContain('the patch');
    expect(template).toContain("the service's cue list");
    for (const label of ['`Song 1`', '`Song 2`', '`Song 3`']) {
      expect(template, label).toContain(label);
    }
    expect(template).toContain('`songCueLabel`');
    expect(template).toContain("each song cue's full look, with its house light level");
    expect(template).toContain('at intensity 0');
    expect(template).toContain("A cue in no song's chain keeps the colour the template gives it, wherever it stands in the cue list.");
    expect(template).toContain("A build or a hit in a song's chain (the cue list, below) takes that song's colour each week, so the colour the template gives it on the six colour lights does not show.");
    expect(template).toContain("Block the cue that follows the last song's chain, such as Closing, in the template: a cue level block treats every tracked value in the cue as a move instruction, so no change upstream in the cue list reaches it (ETC's [Block](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/12_Cues_and_Cue_Lists/05_Flags/Block.htm)), a copy in front of it in a week with an extra song included.");
    expect(template).not.toContain('The first cue after the last song cue');
  });

  it('says how to make the template, and that a build with none still builds the set', async () => {
    const template = await subsection('### The template show file');

    expect(template).toContain('File > Save As');
    expect(template).toContain('timestamp suffix');
    expect(template).toContain('05_Show_Files/Saving_Show_Files.htm');
    expect(template).toContain('12_Cues_and_Cue_Lists/04_Cue_Attributes/Cue_Label.htm');
    expect(template).toContain('the build still builds the set');
    expect(template).toContain('the lights step is not done');
  });

  it('says how to change a look: change it in the template and save, and the next build copies it', async () => {
    const template = await subsection('### The template show file');
    const change = template.split('\n').find((line) => line.startsWith('To change a look')) ?? '';

    expect(change).toContain('change it in the template and save');
    expect(change).toContain('File > Open');
    expect(change).toContain('05_Show_Files/Opening_Show_Files.htm');
    expect(change).toContain('The next build copies the newest save');
    expect(change).toContain('keeps the old look');
    expect(change).toContain('`--replace`');
  });
});

describe("the install doc's word on the song's colour", () => {
  it("says where the colour comes from: the first cue's picture of the song's presentation in the playlist for the date", async () => {
    const colour = await subsection("### The song's colour");

    expect(colour).toContain('ProPresenter on the playback Mac');
    expect(colour).toContain('the `propresenter` section of the connections config');
    expect(colour).toContain('`November 15, 2026`');
    expect(colour).toContain("the first presentation whose own name is the song's title");
    expect(colour).toContain("or, with none, the first whose playlist item's name is the song's title, less a Planning Center arrangement such as ` - [ Full ]`");
    expect(colour).toContain('the picture of the first cue');
    expect(colour).toContain("the hue of the most saturated of the picture's large areas that are not near black, never its mean");
  });

  it('says a playlist the lights step cannot choose writes nothing, and names the flag that chooses it', async () => {
    const colour = await subsection("### The song's colour");

    expect(colour).toContain('With no playlist for the date, or more than one');
    expect(colour).toContain('writes nothing to Eos');
    expect(colour).toContain('`--playlist "<name>"`');
  });

  it('says what the saturation in the lights config does, and how to change it', async () => {
    const colour = await subsection("### The song's colour");

    expect(colour).toContain("the picture's hue and not its saturation");
    expect(colour).toContain('the `saturation` of `config/lights.json`, a number from 0 to 100');
    expect(colour).toContain('full brightness');
    expect(colour).toContain('A higher number gives a stronger colour and a lower one a paler colour');
    expect(colour).toContain('It is 80 to start');
  });

  it('says what no picture means, that the song cue keeps the template colour, and what to do about it', async () => {
    const colour = await subsection("### The song's colour");

    expect(colour).toContain('No picture means');
    expect(colour).toContain('`template colour  no picture, <background file>`');
    expect(colour).toContain('under 5% saturation');
    expect(colour).toContain('grey placeholder');
    expect(colour).toContain("keeps the template's colour");
    expect(colour).toContain('never show a guessed colour');
    expect(colour).toContain('copy the background file the line names to the playback Mac');
    expect(colour).toContain('`template colour  no presentation or playlist item of its name in the playlist "<playlist>"`');
    expect(colour).toContain('rename its playlist item in ProPresenter to the song\'s title');
    expect(colour.split('run the lights step again').length - 1).toBeGreaterThanOrEqual(3);
  });
});

describe("the install doc's weekly routine", () => {
  // The numbered steps of the routine, in the order the doc gives them.
  async function routineSteps(): Promise<string[]> {
    const routine = await subsection('### The weekly routine');
    return routine.split('\n').filter((line) => /^\d+\. /.test(line));
  }

  it('gives four steps in order: build the set, open the weekly show file, let the lights step run, AirDrop the saved file', async () => {
    const steps = await routineSteps();

    expect(steps.map((step) => step.slice(0, 3))).toEqual(['1. ', '2. ', '3. ', '4. ']);
    expect(steps[0]).toContain('Build the set: `pnpm build-set`.');
    expect(steps[1]).toContain('Open the weekly show file in ETCnomad: File, Open, the file, OK');
    expect(steps[2]).toContain('Let the lights step run: `pnpm build-set --lights`.');
    expect(steps[3]).toContain('AirDrop the saved file');
  });

  it('says the open is the one step done by hand, and cites how Eos opens a show', async () => {
    const steps = await routineSteps();

    expect(steps[1]).toContain('05_Show_Files/Opening_Show_Files.htm');
    expect(steps[1]).toContain('cannot open a show in Eos');
    expect(steps[1]).toContain('the one step done by hand');
  });

  it('says what the lights step prints, and that it writes nothing with another show open', async () => {
    const steps = await routineSteps();

    expect(steps[2]).toContain('saves the show as Shift and Update do');
    expect(steps[2]).toContain('05_Show_Files/Saving_Show_Files.htm');
    expect(steps[2]).toContain('one line per song');
    expect(steps[2]).toContain('a line for each cue of a chain with the song it belongs to, a line for each cue it copied, and one more when it took a follow or a hang off the copy,');
    expect(steps[2]).toContain('last the path of the saved file');
    expect(steps[2]).toContain('Read the summary.');
    expect(steps[2]).toContain('With another show open in Eos it writes nothing');
  });

  it('sends the saved file to the production computer, and names what the check reads there', async () => {
    const steps = await routineSteps();

    expect(steps[3]).toContain('the path on the last line');
    expect(steps[3]).toContain('to the production computer');
    expect(steps[3]).toContain("that computer's Eos show folder");
    expect(steps[3]).toContain('"Every song has a cue."');
    expect(steps[3]).toContain('`<song title>: no cue`');
  });

  it('says before the steps which Eos and ProPresenter the lights step talks to, and that an armed server pauses', async () => {
    const routine = await subsection('### The weekly routine');
    const before = routine.slice(0, routine.indexOf('\n1. '));

    expect(before).toContain('ETCnomad and ProPresenter are open on the playback Mac');
    expect(before).toContain('the `eos` and `propresenter` sections of the connections config');
    expect(before).toContain('name the playback Mac itself');
    expect(before).toContain('`--connections-config <path>`');
    expect(before).toContain('"Eos\'s OSC settings"');
    expect(before).toContain('as cues fired by hand');
    expect(before).toContain('arm them again before the service');
  });
});

describe("the install doc's cue list", () => {
  it("holds this Sunday's songs in the weekly show file's cue list, one cue per song, in set order", async () => {
    const cues = await subsection('### The cue list');

    expect(cues).toContain("in the weekly show file, holds this Sunday's songs");
    expect(cues).toContain('one cue per song');
    expect(cues).toContain('in set order');
    expect(cues).toContain('A song does not keep its cue from one Sunday to the next.');
  });

  it('labels each cue with the song title alone, matched whole by the name rule', async () => {
    const cues = await subsection('### The cue list');

    expect(cues).toContain('The lights step labels each song cue with the song title only');
    expect(cues).toContain('a cue labelled at the console follows the same rule');
    expect(cues).toContain('`There Is Freedom`');
    expect(cues).toContain('`1 - Count Off (There Is Freedom)`');
    expect(cues).toContain('ignoring letter case');
    expect(cues).toContain('each run of spaces as one');
    expect(cues).toContain('the whole label must match');
    expect(cues).toMatch(/`There Is Freedom \/ Verse 1` matches nothing/);
  });

  it("fires the song cue on the song's Count Off, and names what fires it", async () => {
    const cues = await subsection('### The cue list');

    expect(cues).toContain("A song's song-start section is its Count Off, or its first section when it has no Count Off.");
    expect(cues).toContain('The server fires the song cue at the start of that section, so the look is up as the band counts off.');
    expect(cues).not.toContain('first downbeat');
    for (const cause of ['Playing into that section', 'Play from start', 'a jump from another song that lands on it']) {
      expect(cues, cause).toContain(cause);
    }
    expect(cues).toContain("A Count Off on the previous song's End fires it too: once the band counts off, the previous song is done.");
    expect(cues).toContain("The Count Off is part of its song, so a jump from the song's own Count Off onto its next section is a jump inside the song.");
    expect(cues).toContain('A count-in onto the Count Off or the section after it is Play from start, so it fires the song cue on the Count Off.');
    expect(cues).toContain('A count-in onto a later section fires no song cue.');
    expect(cues).not.toContain('A count-in, which only a rehearsal uses, fires no song cue.');
  });

  it("fires nothing for the rest of the song, and keeps the song's look until the next song's cue", async () => {
    const cues = await subsection('### The cue list');

    // Lower-cased, since the list opens a sentence.
    const nothing = (cues.split('\n').find((line) => line.includes('fire nothing')) ?? '').toLowerCase();
    for (const event of ['a loop wrap', 'a jump inside the song', 'a start in the middle of the song', 'any other section', 'a Pad', 'a Pad Out', 'the End']) {
      expect(nothing, event).toContain(event.toLowerCase());
    }
    expect(cues).toContain("The song's look stays until the next song's cue");
  });

  it('fires the song cue of the song playing on Fire again, and nothing between songs', async () => {
    const cues = await subsection('### The cue list');

    expect(cues).toContain('Fire again fires the song cue of the song playing');
    expect(cues).toContain('nothing between songs');
  });

  it('leaves a build or a hit to the show file, on a follow time or a hang time', async () => {
    const cues = await subsection('### The cue list');

    expect(cues).toContain('The server fires only the song cue');
    expect(cues).toContain('A build or a hit inside the song lives in the show file');
    expect(cues).toContain('a follow time or a hang time');
    expect(cues).toContain('or Eos runs on into the next cue in the list');
    expect(cues).not.toContain("the next song's cue early");
  });

  it("says a song owns its chain: the chain's cues take the song's colour, a cue no chain reaches keeps the template's, an extra song's copy stands past the chain, and the lights step stops on a chain that runs on into another song's cue", async () => {
    const cues = await subsection('### The cue list');

    expect(cues).toContain('A song owns its chain: its song cue and every cue that cue runs on into this way, cue after cue, up to a cue with no follow and no hang.');
    expect(cues).toContain('A link on a cue with no follow and no hang runs on into nothing.');
    expect(cues).toContain("The lights step gives every cue of the chain its song's colour, and a cue no chain reaches keeps the template's colour, wherever it stands in the list.");
    expect(cues).toContain("An extra song's cue, the copy the lights step makes (the weekly show file, above), stands after the last song's chain and has no follow and no hang.");
    expect(cues).toContain("The lights step stops on a chain that runs on into another song's cue, into a cue of another song's chain, or by a link to a cue that is not in the cue list: it writes nothing, and one line names the cue.");
    expect(cues).toContain('one cue per song');
    expect(cues).toContain('in set order');
  });

  it('names each song with no cue in the check, two cues with one label, and an empty cue list', async () => {
    const cues = await subsection('### The cue list');

    expect(cues).toContain('each song of the set with no cue, as `<song title>: no cue`');
    expect(cues).toContain('When two cues carry one label, the first in list order fires, and the check names each other one as a problem.');
    expect(cues).toContain('"Cue list <n> is not in the show file, or holds no cues."');
    expect(cues).toContain('"Every song has a cue."');
    expect(cues).toContain('A song with no title on its first locator matches no cue, and reads `Song <n>: no cue`.');
  });
});

describe("the install doc's lateness log", () => {
  it('says the lights get a line each time the song cue fires on playback, and none on Fire again', async () => {
    const doc = await installDoc();
    const lateness = doc.split('\n').find((line) => line.startsWith('The server also measures how late each cue')) ?? '';

    expect(lateness).toContain("The lights act only on the song cue they fire, on the song's Count Off (section 9)");
    expect(lateness).toContain('each time the song cue fires on playback, the lights get one line, and no other cue gets one');
    expect(lateness).not.toContain('a song gets one lights line');
    expect(lateness).toContain('Fire again fires the song cue but writes no lights line.');
    expect(lateness).not.toContain('a section, Count Off, Pad, Pad Out or End that a cue in their cue list is labelled for');
  });
});

describe('the install doc', () => {
  it('no longer says that one cue list holds every song in the library', async () => {
    const doc = await installDoc();

    expect(doc).not.toContain('every song in the library');
    expect(doc).not.toContain('the same cue from one Sunday to the next');
  });

  it('holds no cue per section for the lights, no section label, and no em-dash', async () => {
    const doc = await installDoc();

    expect(doc).not.toContain('<song title> / <section>');
    expect(doc).not.toContain('no cue <section>');
    expect(doc).not.toContain('splits at its last');
    expect(doc).not.toContain('—');
  });
});
