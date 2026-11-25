import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './set-builder-harness.ts';

// The install doc's word on ProPresenter's slide buttons: Next slide and Previous slide cross the
// picked playlist, and a move out of the set pauses ProPresenter (setlist-controller#561).

// The install doc's subsection under this heading, up to the next heading.
async function subsection(heading: string): Promise<string> {
  const text = await readFile(join(REPO_ROOT, 'docs/install.md'), 'utf8');
  const start = text.indexOf(`\n${heading}\n`);
  if (start === -1) return '';
  const rest = text.slice(start + heading.length + 2);
  const end = rest.search(/^#{2,3} /m);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("the install doc's slide buttons", () => {
  it('moves Next slide and Previous slide across the playlist picked on the row, past headers and placeholders', async () => {
    const buttons = await subsection('### The slide buttons');

    expect(buttons).toContain('On the last slide of a presentation, Next slide moves on to slide 1 of the next presentation in the playlist picked on the row, past its headers and placeholders');
    expect(buttons).toContain('On the first slide, Previous slide moves back to the last slide of the presentation before it, so one Next slide and one Previous slide come back to the same slide.');
    expect(buttons).toContain('They follow the playlist picked on the row, not the one ProPresenter has open.');
    expect(buttons).toContain('A presentation listed twice is left from the place it was shown at.');
  });

  it('says nothing to move with no pick, outside the pick, and at the end of the playlist', async () => {
    const buttons = await subsection('### The slide buttons');

    expect(buttons).toContain('With no playlist picked, with a presentation up that is not in the picked playlist, such as one shown from the library, and on the last slide of the last presentation, such as Dismissal, the row says "Pressed Next slide: nothing to move."');
  });

  it('pauses ProPresenter alone on a move out of the set, naming the presentation, until Arm or the next Count Off', async () => {
    const buttons = await subsection('### The slide buttons');

    expect(buttons).toContain('A move into a presentation that is not a song of the set, such as Facetime, MC or the message, pauses ProPresenter, and the row reads "Paused: moved to Facetime"');
    expect(buttons).toContain('A move into another song of the set does not pause it.');
    expect(buttons).toContain("The pause ends when the producer arms ProPresenter, or at the next song's Count Off, as a Fade out's pause does.");
    expect(buttons).toContain('It pauses ProPresenter alone: the lights and the ATEM follow the music.');
  });

  it('moves on inside a presentation shown by hand after a clear', async () => {
    const buttons = await subsection('### The slide buttons');

    expect(buttons).toContain('After a slide shown by hand in another presentation, such as an announcement after a Turnaround clears the screen, Next slide moves on inside that presentation.');
  });
});
