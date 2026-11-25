// The colour method of the lights step (setlist-controller#247): the hue a song's colour lights take from the picture of
// its ProPresenter background, and that hue as the red, green and blue Eos is sent. The backgrounds are pale, and their
// mean is close to white (dark teal water under white surf averages to hue 358 at 3% saturation), so the mean is never
// used: the opaque pixels are grouped into five colours, and among the groups that hold at least 5% of the pixels and
// are not near black the one with the highest saturation gives the hue. A picture whose chosen group is under 5%
// saturation has no colour to take a hue from, and neither has one with no such group or with no opaque pixel: all
// three are no picture (setlist-controller#502).

export type Rgb = [number, number, number];

// How many colours the pixels are grouped into, and the share of the pixels a group needs to count as a large area.
const GROUPS = 5;
const LARGE = 0.05;
// The saturation, from 0 to 1, the chosen group needs for the picture to have a colour. ProPresenter's grey placeholder
// and the checkerboard it draws for a slide with no background are at 0, and the palest recorded background, a grey city
// in rain, was at 0.077, and its made stand-in is at 0.078 (test/fixtures/propresenter/README.md, "The 2026-11-12
// session").
const COLOURED = 0.05;
// The level, of 255, the brightest of a group's red, green and blue needs for the group to give a hue. Saturation does
// not fall with brightness (red 3, green 2, blue 1 is 67% saturated), so a near-black area would win as the most
// saturated one. The darkest area a recorded background takes its hue from, the water of Ancient Gates, is at 41, as in
// its made stand-in.
const DARK = 20;
// The grouping is k-means in red, green and blue. It starts from the pixels at these places among the pixels ordered
// from dark to light, so the same picture gives the same hue on every run, and stops when no group's colour moves, or
// after this many rounds.
const STARTS = [0.1, 0.3, 0.5, 0.7, 0.9];
const ROUNDS = 20;

// The hue of a picture, a whole number of degrees from 0 to 359, or undefined when there is no picture: no opaque
// pixel, no large group that is not near black, or a chosen group under 5% saturation. `rgba` is the picture's pixels,
// four bytes each: red, green, blue, alpha.
export function pictureHue(rgba: Buffer): number | undefined {
  // The opaque pixels, each by the place of its first byte, in picture order.
  const pixels: number[] = [];
  for (let at = 0; at + 3 < rgba.length; at += 4) if (rgba[at + 3] === 255) pixels.push(at);
  if (pixels.length === 0) return undefined;
  const luminance = (at: number) => 0.299 * rgba[at]! + 0.587 * rgba[at + 1]! + 0.114 * rgba[at + 2]!;
  // From dark to light, two pixels of one luminance in picture order.
  const ordered = [...pixels].sort((a, b) => luminance(a) - luminance(b) || a - b);
  let groups = STARTS.map((share) => {
    const at = ordered[Math.min(ordered.length - 1, Math.floor(share * ordered.length))]!;
    return { colour: [rgba[at]!, rgba[at + 1]!, rgba[at + 2]!] as Rgb, count: 0 };
  });
  for (let round = 0; round < ROUNDS; round += 1) {
    // Each pixel joins the group whose colour is nearest, the first of them on a tie, and each group's colour becomes
    // the mean of its pixels. A group no pixel joined keeps its colour.
    const sums = groups.map(() => [0, 0, 0, 0]);
    for (const at of pixels) {
      let nearest = 0;
      let least = Infinity;
      for (let group = 0; group < GROUPS; group += 1) {
        const [red, green, blue] = groups[group]!.colour;
        const distance = (rgba[at]! - red) ** 2 + (rgba[at + 1]! - green) ** 2 + (rgba[at + 2]! - blue) ** 2;
        if (distance < least) [nearest, least] = [group, distance];
      }
      const sum = sums[nearest]!;
      sum[0]! += rgba[at]!;
      sum[1]! += rgba[at + 1]!;
      sum[2]! += rgba[at + 2]!;
      sum[3]! += 1;
    }
    const next = groups.map(({ colour }, group) => {
      const [red, green, blue, count] = sums[group] as [number, number, number, number];
      return { colour: count === 0 ? colour : ([red / count, green / count, blue / count] as Rgb), count };
    });
    const moved = next.some(({ colour }, group) => colour.some((part, at) => part !== groups[group]!.colour[at]));
    groups = next;
    if (!moved) break;
  }
  // Of the large groups that are not near black, the most saturated, the first of them on a tie. Five groups cannot all
  // hold under 5%, but every large one can be near black.
  const large = groups.filter(({ count, colour }) => count >= LARGE * pixels.length && Math.max(...colour) >= DARK).map(({ colour }) => hueAndSaturation(colour));
  if (large.length === 0) return undefined;
  const chosen = large.reduce((best, group) => (group.saturation > best.saturation ? group : best));
  return chosen.saturation < COLOURED ? undefined : Math.round(chosen.hue) % 360;
}

// A colour's hue in degrees, from 0 up to 360, and its saturation from 0 to 1, as HSV has them. A grey has hue 0.
function hueAndSaturation([red, green, blue]: Rgb): { hue: number; saturation: number } {
  const most = Math.max(red, green, blue);
  const spread = most - Math.min(red, green, blue);
  if (spread === 0) return { hue: 0, saturation: 0 };
  const sector = most === red ? ((green - blue) / spread + 6) % 6 : most === green ? (blue - red) / spread + 2 : (red - green) / spread + 4;
  return { hue: sector * 60, saturation: spread / most };
}

// A hue in degrees, at a saturation from 0 to 100 and full value, as red, green and blue percentages from 0 to 100,
// the three floats Eos takes for a channel's colour.
export function colourAt(hue: number, saturation: number): Rgb {
  const sector = (((hue % 360) + 360) % 360) / 60;
  // The share of full saturation each of red, green and blue has at that hue.
  const part = (shift: number) => {
    const at = (sector + shift) % 6;
    return Math.max(0, Math.min(1, Math.abs(at - 3) - 1));
  };
  const colour = (shift: number) => 100 - saturation * (1 - part(shift));
  return [colour(0), colour(4), colour(2)];
}
