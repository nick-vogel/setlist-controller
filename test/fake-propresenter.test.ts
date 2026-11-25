import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startFakeProPresenter, type FakeProPresenter } from './fake-propresenter.ts';

// The fake ProPresenter on its own, against the index triggers recorded at home on 2026-11-02
// (commands-2026-11-02.json and stream-status-updates-2026-11-02.json in test/fixtures/propresenter).

const FIXTURES = resolve(import.meta.dirname, 'fixtures/propresenter');
type Command = { label: string; path: string; status: number };
const COMMANDS = JSON.parse(readFileSync(resolve(FIXTURES, 'commands-2026-11-02.json'), 'utf8')) as Command[];
type Frame = { url: string; data: unknown };
const CHUNKS = (JSON.parse(readFileSync(resolve(FIXTURES, 'stream-status-updates-2026-11-02.json'), 'utf8')) as { chunks: { t: number; frame: Frame }[] }).chunks;

const ANCIENT_GATES = '5A606BC5-9279-4509-983E-88092AE567F0';
const WORTHY_OF_IT_ALL = 'AA8F2F17-09BE-44ED-A618-C645D5EC8AAB';
const THERE_IS_FREEDOM = '894B40A0-42FE-411E-B915-F1919C6DA33E';
// Not authorized in the fixtures, as There Is Freedom was on 2026-11-02.
const HOUSE_OF_THE_LORD = 'E7B9D242-CF4D-40B2-A570-BA1AB638C967';
const NEXT = '/v1/presentation/active/next/trigger';
const PREVIOUS = '/v1/presentation/active/previous/trigger';
const CLEAR = '/v1/clear/layer/slide';
const indexTrigger = (uuid: string, index: number | string) => `/v1/presentation/${uuid}/${index}/trigger`;

let pro: FakeProPresenter | undefined;

afterEach(async () => {
  await pro?.close();
  pro = undefined;
});

const get = async (path: string) => {
  const response = await fetch(`http://127.0.0.1:${pro!.port}${path}`);
  const text = await response.text();
  return { status: response.status, body: text === '' ? undefined : (JSON.parse(text) as unknown) };
};
// The text of the current and the next slide, as a status/slide frame's data carries them.
const texts = (data: unknown) => {
  const { current, next } = data as { current: { text: string } | null; next: { text: string } | null };
  return { current: current?.text ?? null, next: next?.text ?? null };
};
// The recorded status/slide frame at that time, as texts.
const recordedSlide = (t: number) => texts(CHUNKS.find((chunk) => chunk.t === t && chunk.frame.url === 'status/slide')!.frame.data);
// A status stream opened on the fake, asking for those frames, once its opening frames are sent: each
// whole frame it has sent so far, and its close.
const openStream = async (asked: string[]) => {
  const response = await fetch(`http://127.0.0.1:${pro!.port}/v1/status/updates`, { method: 'POST', body: JSON.stringify(asked) });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const reading = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      text += decoder.decode(value, { stream: true });
    }
  })().catch(() => {});
  await pro!.streaming();
  return {
    frames: () =>
      text
        .split('\r\n\r\n')
        .slice(0, -1)
        .map((chunk) => JSON.parse(chunk) as Frame),
    async close() {
      await reader.cancel();
      await reading;
    },
  };
};

describe('the index trigger', () => {
  it('answers every recorded index trigger, next and clear with the recorded status, in order', async () => {
    pro = await startFakeProPresenter();
    const replayed = COMMANDS.filter(({ path }) => /\/-?\d+\/trigger$/.test(path) || path === NEXT || path === CLEAR);
    expect(replayed.length).toBeGreaterThan(10);

    const answered: { label: string; status: number }[] = [];
    for (const { label, path } of replayed) {
      // The committed There Is Freedom is authorized, so its recorded 403 is checked on House of the Lord.
      answered.push({ label, status: (await get(path.replace(THERE_IS_FREEDOM, HOUSE_OF_THE_LORD))).status });
    }

    expect(answered).toEqual(replayed.map(({ label, status }) => ({ label, status })));
    expect(pro.triggers()).toEqual(replayed.filter(({ path }) => path !== NEXT && path !== CLEAR).map(({ path }) => path.replace(THERE_IS_FREEDOM, HOUSE_OF_THE_LORD)));
  });

  // Worthy Of It All's recorded trigger 4 is not checked here: its frame shows the 2026-11-02 read's
  // next slide, and the committed read is the 2026-11-06 one, which Nick edited in between.
  it('makes the triggered slide the live slide, with the slide after it next, as the recorded frames show', async () => {
    pro = await startFakeProPresenter();

    for (const [uuid, index, t] of [
      [ANCIENT_GATES, 1, 4635],
      [ANCIENT_GATES, 2, 5884],
    ] as const) {
      expect((await get(indexTrigger(uuid, index))).status).toBe(204);
      const live = await get('/v1/status/slide');
      expect(live.status).toBe(200);
      expect(texts(live.body)).toEqual(recordedSlide(t));
    }
    // The last slide has no words, as its recorded frame shows, so the read answers 204 over it, as
    // the home ProPresenter's did over a slide with no words on 2026-11-10.
    expect(recordedSlide(9608)).toEqual({ current: '', next: null });
    expect((await get(indexTrigger(ANCIENT_GATES, 57))).status).toBe(204);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 57 });
    expect(await get('/v1/status/slide')).toEqual({ status: 204, body: undefined });
  });

  it('makes the presentation active, so next answers 204 where it answered 404 before', async () => {
    pro = await startFakeProPresenter();
    expect((await get(NEXT)).status).toBe(404);

    expect((await get(indexTrigger(ANCIENT_GATES, 1))).status).toBe(204);

    expect((await get(NEXT)).status).toBe(204);
  });

  it('leaves the live slide and the active presentation as they were on a refused index trigger', async () => {
    pro = await startFakeProPresenter();

    expect((await get(indexTrigger(ANCIENT_GATES, 58))).status).toBe(404);

    expect(await get('/v1/status/slide')).toEqual({ status: 204, body: undefined });
    expect((await get(NEXT)).status).toBe(404);
  });

  it('answers an index trigger with a forced status first', async () => {
    pro = await startFakeProPresenter();
    pro.answerTriggers(500);

    expect((await get(indexTrigger(ANCIENT_GATES, 1))).status).toBe(500);
    expect((await get(indexTrigger(ANCIENT_GATES, 1))).status).toBe(204);
  });
});

// Where the fake is: the slide it shows, which an index trigger, a group trigger, next and previous
// move and a clear takes down (setlist-controller#377).
describe('next and previous', () => {
  it('moves one slide on with next and one back with previous from an index trigger, and the live slide read follows', async () => {
    pro = await startFakeProPresenter();
    expect((await get(indexTrigger(ANCIENT_GATES, 1))).status).toBe(204);

    expect((await get(NEXT)).status).toBe(204);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 2 });
    expect(texts((await get('/v1/status/slide')).body)).toEqual(recordedSlide(5884));
    expect((await get(NEXT)).status).toBe(204);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 3 });
    expect((await get(PREVIOUS)).status).toBe(204);
    expect((await get(PREVIOUS)).status).toBe(204);

    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 1 });
    expect(texts((await get('/v1/status/slide')).body)).toEqual(recordedSlide(4635));
  });

  it('answers next with a 404 on the last slide and previous with a 404 on the first, and moves nothing', async () => {
    pro = await startFakeProPresenter();
    expect((await get(indexTrigger(ANCIENT_GATES, 57))).status).toBe(204);
    expect((await get(NEXT)).status).toBe(404);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 57 });

    expect((await get(indexTrigger(ANCIENT_GATES, 0))).status).toBe(204);
    expect((await get(PREVIOUS)).status).toBe(404);

    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 0 });
  });

  it('puts a group trigger on the first slide of the first group of that name', async () => {
    pro = await startFakeProPresenter();

    expect((await get(`/v1/presentation/${ANCIENT_GATES}/group/Chorus%201/trigger`)).status).toBe(204);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 5 });
    expect((await get(NEXT)).status).toBe(204);

    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 6 });
  });

  it('shows nothing after a clear, so next and previous answer 404 until a trigger', async () => {
    pro = await startFakeProPresenter();
    expect(pro.showing()).toBeNull();
    expect((await get(indexTrigger(ANCIENT_GATES, 3))).status).toBe(204);

    expect((await get(CLEAR)).status).toBe(204);

    expect(pro.showing()).toBeNull();
    expect((await get(NEXT)).status).toBe(404);
    expect((await get(PREVIOUS)).status).toBe(404);
    expect(await get('/v1/status/slide')).toEqual({ status: 204, body: undefined });
  });

  it('puts the active presentation on its last slide with lastSlide(), so next answers 404 there', async () => {
    pro = await startFakeProPresenter();
    expect((await get(indexTrigger(ANCIENT_GATES, 3))).status).toBe(204);

    pro.lastSlide();

    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 57 });
    expect((await get(NEXT)).status).toBe(404);
    expect((await get(PREVIOUS)).status).toBe(204);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 56 });
  });

  it('names the presentation in a presentation/current frame before the status/slide frame of a slide the test sends in another presentation, as the 2026-11-02 stream did', async () => {
    pro = await startFakeProPresenter();
    const stream = await openStream(['status/slide', 'presentation/current']);
    expect((await get(indexTrigger(ANCIENT_GATES, 1))).status).toBe(204);
    const opened = stream.frames().length;

    await pro.sendSlide(ANCIENT_GATES, 2);
    await pro.sendSlide(THERE_IS_FREEDOM, 2);
    await stream.close();

    const sent = stream
      .frames()
      .slice(opened)
      .map(({ url, data }) => (url === 'presentation/current' ? `current ${(data as { presentation: { id: { uuid: string } } }).presentation.id.uuid}` : url));
    expect(sent).toEqual(['status/slide', `current ${THERE_IS_FREEDOM}`, 'status/slide']);
  });

  it('sends the presentation/current frame after the status/slide frame when the test asks, as the 2026-11-02 stream did at t 2186 and 2189', async () => {
    pro = await startFakeProPresenter();
    const stream = await openStream(['status/slide', 'presentation/current']);
    expect((await get(indexTrigger(ANCIENT_GATES, 1))).status).toBe(204);
    const opened = stream.frames().length;

    await pro.sendSlide(THERE_IS_FREEDOM, 2, { currentLast: true });
    await stream.close();

    expect(stream.frames().slice(opened).map(({ url }) => url)).toEqual(['status/slide', 'presentation/current']);
  });

  it('moves to a slide the test sends, as a press by hand does', async () => {
    pro = await startFakeProPresenter();
    expect((await get(indexTrigger(ANCIENT_GATES, 1))).status).toBe(204);

    await pro.sendSlide(ANCIENT_GATES, 7);
    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 7 });
    expect((await get(NEXT)).status).toBe(204);

    expect(pro.showing()).toEqual({ uuid: ANCIENT_GATES, index: 8 });
  });
});

// A real status/slide frame names each slide by a UUID of its own, which a slide shown again repeats
// (stream-status-updates.json, Verse 2 slide 1 at t 227323, 243448 and 248770), so the fake's slides
// carry one too: made up, and the same for a presentation's slide at one index every time
// (setlist-controller#266).
describe('the slide UUID', () => {
  // The UUIDs of the current and the next slide, as a status/slide frame's data carries them.
  const uuids = (data: unknown) => {
    const { current, next } = data as { current: { uuid?: unknown } | null; next: { uuid?: unknown } | null };
    return { current: current?.uuid, next: next?.uuid };
  };

  it('gives each slide a UUID of its own, the same each time it shows, on the current and the next slide of the live slide read', async () => {
    pro = await startFakeProPresenter();

    expect((await get(indexTrigger(THERE_IS_FREEDOM, 2))).status).toBe(204);
    const verse1 = uuids((await get('/v1/status/slide')).body);
    expect((await get(indexTrigger(THERE_IS_FREEDOM, 14))).status).toBe(204);
    const verse4 = uuids((await get('/v1/status/slide')).body);
    expect((await get(indexTrigger(THERE_IS_FREEDOM, 3))).status).toBe(204);
    const verse2 = uuids((await get('/v1/status/slide')).body);
    expect((await get(indexTrigger(THERE_IS_FREEDOM, 2))).status).toBe(204);

    expect(uuids((await get('/v1/status/slide')).body)).toEqual(verse1);
    expect(verse1.current).toEqual(expect.any(String));
    // Verse 1 slide 2 and Verse 4 slide 2 hold the same text, and are two slides.
    expect(verse4.current).not.toBe(verse1.current);
    // The next slide's UUID is that slide's own.
    expect(verse1.next).toBe(verse2.current);
  });

  it('gives no two slides one UUID, across presentations', async () => {
    pro = await startFakeProPresenter();
    const stream = await openStream(['status/slide']);
    const seen = new Set<unknown>();

    for (const [uuid, count] of [
      [THERE_IS_FREEDOM, 37],
      [ANCIENT_GATES, 58],
    ] as const) {
      for (let index = 0; index < count; index += 1) {
        expect((await get(indexTrigger(uuid, index))).status).toBe(204);
        const read = await get('/v1/status/slide');
        if (read.status === 200) {
          seen.add(uuids(read.body).current);
          continue;
        }
        // The read answers 204 over a slide with no words, so its UUID comes from its frame.
        await pro.sendSlide(uuid, index);
        seen.add(uuids(stream.frames().at(-1)!.data).current);
      }
    }
    await stream.close();

    expect(seen.size).toBe(37 + 58);
  });

  it('puts the UUID on the status/slide frame sendSlide() writes', async () => {
    pro = await startFakeProPresenter();
    const response = await fetch(`http://127.0.0.1:${pro.port}/v1/status/updates`, { method: 'POST', body: JSON.stringify(['status/slide']) });
    const reader = response.body!.getReader();
    await pro.streaming();
    expect((await get(indexTrigger(THERE_IS_FREEDOM, 2))).status).toBe(204);
    const live = uuids((await get('/v1/status/slide')).body);
    expect(live.current).toEqual(expect.any(String));

    await pro.sendSlide(THERE_IS_FREEDOM, 2);

    // The frames read so far, each whole one, until one is a status/slide.
    const decoder = new TextDecoder();
    let text = '';
    let frame: Frame | undefined;
    while (!frame) {
      text += decoder.decode((await reader.read()).value, { stream: true });
      frame = text
        .split('\r\n\r\n')
        .slice(0, -1)
        .map((chunk) => JSON.parse(chunk) as Frame)
        .find(({ url }) => url === 'status/slide');
    }
    await reader.cancel();
    expect(uuids(frame.data)).toEqual(live);
  });
});

// The stream's open and the live slide read as the home ProPresenter answered them on 2026-11-10
// (commands-2026-11-10.json and stream-status-updates-2026-11-10.json in test/fixtures/propresenter):
// Holy Forever's Verse 1 slide 2, index 2, was the slide with words, and its Intro, index 0, the slide
// with no words (setlist-controller#269).
describe('the 2026-11-10 recording', () => {
  const RECORDED_COMMANDS = JSON.parse(readFileSync(resolve(FIXTURES, 'commands-2026-11-10.json'), 'utf8')) as (Command & { body: unknown })[];
  const OPENED = JSON.parse(readFileSync(resolve(FIXTURES, 'stream-status-updates-2026-11-10.json'), 'utf8')) as { request: string[]; chunks: { t: number; frame: Frame }[] };
  const HOLY_FOREVER = '27B59282-5C91-478D-B677-23BE463959BB';
  // The recorded read of the live slide while Holy Forever's Verse 1 slide 2 showed.
  const recordedRead = RECORDED_COMMANDS.find(({ label }) => label === 'status/slide with Holy Forever Verse 1 slide 2 showing')!;
  // The frames the recorded stream sent as it opened over that slide, up to its status/slide at t 166.
  const recordedOpen = OPENED.chunks.filter(({ t }) => t <= 166).map(({ frame }) => frame);

  // The frames a stream opened now, asking for what the recorded one asked for, sends as it opens.
  const openingFrames = async () => {
    const stream = await openStream(OPENED.request);
    await stream.close();
    return stream.frames();
  };
  const presentationIn = (frame: Frame | undefined) => (frame?.data as { presentation: { id: { uuid: string } } | null } | undefined)?.presentation?.id.uuid ?? null;

  it('opens a stream over a slide with words with the heartbeat, its presentation/current and its status/slide, in the recorded order', async () => {
    pro = await startFakeProPresenter();
    expect((await get(indexTrigger(HOLY_FOREVER, 2))).status).toBe(204);

    const frames = await openingFrames();

    expect(frames.map(({ url }) => url)).toEqual(recordedOpen.map(({ url }) => url));
    expect(presentationIn(frames[1])).toBe(presentationIn(recordedOpen[1]));
    expect(presentationIn(frames[1])).toBe(HOLY_FOREVER);
    expect(texts(frames[2]!.data)).toEqual(texts(recordedOpen[2]!.data));
  });

  it('opens a stream over a slide with words with no status/slide after lateOpeningSlide()', async () => {
    pro = await startFakeProPresenter();
    expect((await get(indexTrigger(HOLY_FOREVER, 2))).status).toBe(204);
    pro.lateOpeningSlide();

    const frames = await openingFrames();

    expect(frames.map(({ url }) => url)).toEqual(recordedOpen.map(({ url }) => url).filter((url) => url !== 'status/slide'));
  });

  it.each([
    ['with no slide showing', async () => {}],
    [
      'after a clear',
      async () => {
        expect((await get(indexTrigger(HOLY_FOREVER, 2))).status).toBe(204);
        expect((await get(CLEAR)).status).toBe(204);
      },
    ],
    ['over a slide with no words, as Intro is', async () => expect((await get(indexTrigger(HOLY_FOREVER, 0))).status).toBe(204)],
  ])('opens a stream %s with no status/slide', async (_, before) => {
    pro = await startFakeProPresenter();
    await before();

    const frames = await openingFrames();

    expect(frames.map(({ url }) => url)).toContain('timer/system_time');
    expect(frames.map(({ url }) => url)).not.toContain('status/slide');
  });

  it('answers the live slide read with a 200 and the slide showing and the one after it, while a slide with words shows', async () => {
    pro = await startFakeProPresenter();
    expect((await get(indexTrigger(HOLY_FOREVER, 2))).status).toBe(204);

    const read = await get('/v1/status/slide');

    expect(read.status).toBe(recordedRead.status);
    expect(texts(read.body)).toEqual(texts(recordedRead.body));
  });

  it.each([
    ['with no slide showing', 'status/slide with no slide showing, ProPresenter just opened', async () => {}],
    [
      'after a clear',
      'status/slide after a clear of the slide layer',
      async () => {
        expect((await get(indexTrigger(HOLY_FOREVER, 2))).status).toBe(204);
        expect((await get(CLEAR)).status).toBe(204);
      },
    ],
    ['over a slide with no words, as Intro is', 'status/slide with Holy Forever slide 1 (index 0) showing', async () => expect((await get(indexTrigger(HOLY_FOREVER, 0))).status).toBe(204)],
  ])('answers the live slide read %s with a 204 and no body', async (_, label, before) => {
    pro = await startFakeProPresenter();
    await before();

    const read = await get('/v1/status/slide');

    const recorded = RECORDED_COMMANDS.find((command) => command.label === label)!;
    expect(recorded).toMatchObject({ status: 204, body: '' });
    expect(read).toEqual({ status: 204, body: undefined });
  });
});

describe('the November 8 playlist list', () => {
  it('lists the 2026-10-24 playlists by default, and the 2026-11-02 ones once asked to', async () => {
    pro = await startFakeProPresenter();
    const names = async () => ((await get('/v1/playlists')).body as { id: { name: string } }[]).map(({ id }) => id.name);
    expect(await names()).not.toContain('November 8, 2026');

    pro.listNovember8();

    expect(await names()).toContain('November 8, 2026');
  });
});

// The libraries as the home ProPresenter answered them on 2026-11-06 (v1_libraries.json and
// v1_library_Default.json in test/fixtures/propresenter): a flat list of one library, Default, whose
// items are every presentation in it, each with its UUID, its name and its place in the list.
describe('the libraries', () => {
  it('lists the one recorded library, flat, and answers it by its name with its recorded items', async () => {
    pro = await startFakeProPresenter();

    const libraries = await get('/v1/libraries');
    expect(libraries.status).toBe(200);
    expect(libraries.body).toEqual([{ uuid: 'F8FEE980-5EB3-59A0-BD4A-A325D08DA4B7', name: 'Default', index: 0 }]);
    const library = await get('/v1/library/Default');
    expect(library.status).toBe(200);
    const { update_type, items } = library.body as { update_type: string; items: { uuid: string; name: string; index: number }[] };
    expect(update_type).toBe('all');
    expect(items).toContainEqual(expect.objectContaining({ uuid: WORTHY_OF_IT_ALL, name: 'Worthy Of It All' }));
    expect(items).toContainEqual(expect.objectContaining({ uuid: THERE_IS_FREEDOM, name: 'There Is Freedom' }));
    expect(items).toContainEqual(expect.objectContaining({ uuid: ANCIENT_GATES, name: 'Ancient Gates' }));
    expect(items).toHaveLength(310);
  });

  it('answers a library it does not hold with a 404', async () => {
    pro = await startFakeProPresenter();

    expect((await get('/v1/library/No%20Such%20Library')).status).toBe(404);
  });

  it('answers the list of libraries with the status a test gives once refused, and the library itself as before', async () => {
    pro = await startFakeProPresenter();
    const name = ((await get('/v1/libraries')).body as { name: string }[])[0]!.name;

    pro.refuseLibraries(500);

    expect((await get('/v1/libraries')).status).toBe(500);
    expect((await get(`/v1/library/${encodeURIComponent(name)}`)).status).toBe(200);
  });
});

describe('when each request came', () => {
  it("gives a time for each request, in the order of the requests, on the test's own clock: after the test's reading before it asked and before its reading once the answer came", async () => {
    pro = await startFakeProPresenter();
    const readings = [performance.now()];
    for (const path of ['/version', `/v1/presentation/${ANCIENT_GATES}`, '/v1/no-such-path']) {
      await get(path);
      readings.push(performance.now());
    }

    expect(pro.requests.map(({ path }) => path)).toEqual(['/version', `/v1/presentation/${ANCIENT_GATES}`, '/v1/no-such-path']);
    expect(pro.arrivals).toHaveLength(3);
    for (const [at, arrival] of pro.arrivals.entries()) {
      expect(arrival, `request ${at + 1}`).toBeGreaterThanOrEqual(readings[at]!);
      expect(arrival, `request ${at + 1}`).toBeLessThanOrEqual(readings[at + 1]!);
    }
  });
});

describe('a forced presentation read', () => {
  it('answers the next reads of one presentation with the statuses a test gives, then as recorded, and leaves the others as recorded', async () => {
    pro = await startFakeProPresenter();
    const recorded = await get(`/v1/presentation/${THERE_IS_FREEDOM}`);
    expect(recorded.status).toBe(200);

    pro.answerReads(THERE_IS_FREEDOM, 500, 503);

    expect((await get(`/v1/presentation/${ANCIENT_GATES}`)).status).toBe(200);
    expect(await get(`/v1/presentation/${THERE_IS_FREEDOM}`)).toEqual({ status: 500, body: undefined });
    expect(await get(`/v1/presentation/${THERE_IS_FREEDOM}`)).toEqual({ status: 503, body: undefined });
    expect(await get(`/v1/presentation/${THERE_IS_FREEDOM}`)).toEqual(recorded);
  });

  it('leaves the presentation\'s triggers as they were', async () => {
    pro = await startFakeProPresenter();
    pro.answerReads(ANCIENT_GATES, 500);

    expect((await get(indexTrigger(ANCIENT_GATES, 1))).status).toBe(204);
    expect((await get(`/v1/presentation/${ANCIENT_GATES}`)).status).toBe(500);
  });
});

// The reads the lights step of the set build makes, as the home ProPresenter answered them on 2026-11-12
// (test/fixtures/propresenter/2026-11-12, README "The 2026-11-12 session"). The fake serves them only once a test turns
// the session on, since its reads of /v1/playlists, "November 8, 2026", Ancient Gates and There Is Freedom differ from
// the older ones the other tests count on.
describe('the 2026-11-12 session', () => {
  const SESSION = resolve(FIXTURES, '2026-11-12');
  const recorded = (file: string) => JSON.parse(readFileSync(resolve(SESSION, file), 'utf8')) as { path: string; status: number; body?: unknown; body_file?: string; body_bytes?: number };
  const NOVEMBER_15 = '5B02A251-921A-440A-A0C6-9FA5FF8C1A1A';
  const NOVEMBER_8 = '306E3B2A-D71A-40B2-ACBD-DE96FC9FA5F5';
  const SONGS = { 'This Is Amazing Grace': '3CE373C7-68E1-49F7-AADF-670D1712E759', 'Yes and Amen': '939B9443-1F81-4A44-9BB3-ED5CB53A895F', 'I Speak Jesus': '145FCEE7-0A1A-4CC8-B300-F901B56E278B', 'Ancient Gates': ANCIENT_GATES };
  const thumbnail = (uuid: string, index = 0) => `/v1/presentation/${uuid}/thumbnail/${index}?quality=400&thumbnail_type=png`;
  const names = async () => ((await get('/v1/playlists')).body as { id: { name: string } }[]).map(({ id }) => id.name);
  // An answer as it came: its status, its content type and its bytes.
  const raw = async (path: string) => {
    const response = await fetch(`http://127.0.0.1:${pro!.port}${path}`);
    return { status: response.status, type: response.headers.get('content-type'), bytes: Buffer.from(await response.arrayBuffer()) };
  };

  it('answers as before until a test turns it on: 14 playlists, no "November 15, 2026", and a 404 for every thumbnail', async () => {
    pro = await startFakeProPresenter();

    expect(await names()).toHaveLength(14);
    expect(await names()).not.toContain('November 15, 2026');
    expect((await get(`/v1/playlist/${NOVEMBER_15}`)).status).toBe(404);
    expect((await get(`/v1/presentation/${SONGS['Yes and Amen']}`)).status).toBe(404);
    expect((await raw(thumbnail(ANCIENT_GATES))).status).toBe(404);
  });

  it('lists the 7 playlists of the session and answers its two playlists and its six presentations with the recorded bodies, over the older reads of the same paths', async () => {
    pro = await startFakeProPresenter();
    const older = await get(`/v1/presentation/${THERE_IS_FREEDOM}`);

    pro.serveNovember12();

    expect(await names()).toEqual(['November 8, 2026', 'November 15, 2026', 'Series Two - November 1, 2026', 'Series One - October 25, 2026', 'Series One - October 11, 2026', 'Series One - October 18, 2026', 'Series One - October 4, 2026']);
    for (const file of [`v1_playlist_${NOVEMBER_15}.json`, `v1_playlist_${NOVEMBER_8}.json`, ...[...Object.values(SONGS), THERE_IS_FREEDOM, '1A0F6B8F-9434-4462-854F-62D3CF499B68'].map((uuid) => `v1_presentation_${uuid}.json`)]) {
      const { path, status, body } = recorded(file);
      expect(await get(path), file).toEqual({ status, body });
    }
    // The session read There Is Freedom again, and its read is not the older one.
    expect((await get(`/v1/presentation/${THERE_IS_FREEDOM}`)).body).not.toEqual(older.body);
    // A path the session did not read answers as before.
    expect((await get(`/v1/presentation/${WORTHY_OF_IT_ALL}`)).status).toBe(200);
    expect((await get('/v1/libraries')).status).toBe(200);
  });

  it.each(Object.entries(SONGS))("answers the thumbnail of %s's first cue with the recorded PNG, byte for byte, as image/png", async (_song, uuid) => {
    pro = await startFakeProPresenter();
    pro.serveNovember12();
    const { path, body_file: file, body_bytes: size } = recorded(`v1_presentation_${uuid}_thumbnail_0.json`);
    expect(path).toBe(thumbnail(uuid));

    const answer = await raw(path);

    expect(answer.status).toBe(200);
    expect(answer.type).toBe('image/png');
    expect(answer.bytes).toHaveLength(size!);
    expect(answer.bytes.equals(readFileSync(resolve(SESSION, file!)))).toBe(true);
    // Each is a PNG.
    expect(answer.bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('answers the thumbnail of a presentation this Mac is not authorized for with the recorded 403, with no body and no content type', async () => {
    pro = await startFakeProPresenter();
    pro.serveNovember12();

    const answer = await raw(thumbnail(THERE_IS_FREEDOM));

    expect(answer).toEqual({ status: 403, type: null, bytes: Buffer.alloc(0) });
  });

  it('answers a thumbnail with no recording with a 404: another presentation, another cue, or another quality', async () => {
    pro = await startFakeProPresenter();
    pro.serveNovember12();

    expect((await raw(thumbnail(WORTHY_OF_IT_ALL))).status).toBe(404);
    expect((await raw(thumbnail(SONGS['Yes and Amen'], 1))).status).toBe(404);
    expect((await raw(`/v1/presentation/${SONGS['Yes and Amen']}/thumbnail/0?quality=200&thumbnail_type=png`)).status).toBe(404);
    expect((await raw(`/v1/presentation/${SONGS['Yes and Amen']}/thumbnail/0`)).status).toBe(404);
  });

  it("lists a presentation of a playlist again at its end, a copy of its item, and leaves the recorded items before it", async () => {
    pro = await startFakeProPresenter();
    const playlist = '/v1/playlist/306E3B2A-D71A-40B2-ACBD-DE96FC9FA5F5';
    const worthy = 'AA8F2F17-09BE-44ED-A618-C645D5EC8AAB';
    type Item = { type: string; presentation_info?: { presentation_uuid?: string } };
    const before = ((await get(playlist)).body as { items: Item[] }).items;

    pro.listAgain('306E3B2A-D71A-40B2-ACBD-DE96FC9FA5F5', worthy);

    const after = ((await get(playlist)).body as { items: Item[] }).items;
    expect(after.slice(0, -1)).toEqual(before);
    expect(after.at(-1)).toEqual(before.find((item) => item.presentation_info?.presentation_uuid === worthy));
  });

  it('renames a playlist, in the list and in its own read, and leaves its items as recorded', async () => {
    pro = await startFakeProPresenter();
    pro.serveNovember12();
    const before = (await get(`/v1/playlist/${NOVEMBER_15}`)).body as { id: { name: string }; items: unknown[] };

    pro.renamePlaylist(NOVEMBER_15, 'Series Two - November 15, 2026');

    expect(await names()).toEqual(expect.arrayContaining(['November 8, 2026', 'Series Two - November 15, 2026']));
    expect(await names()).not.toContain('November 15, 2026');
    const after = (await get(`/v1/playlist/${NOVEMBER_15}`)).body as { id: { name: string; uuid: string }; items: unknown[] };
    expect(after.id).toEqual({ ...before.id, name: 'Series Two - November 15, 2026' });
    expect(after.items).toEqual(before.items);
  });

  it("renames a presentation in its own read only, and leaves its playlist item's name and its groups as recorded", async () => {
    pro = await startFakeProPresenter();
    pro.serveNovember12();
    const grace = SONGS['This Is Amazing Grace'];
    type Read = { presentation: { id: { name: string; uuid: string }; groups: unknown[] } };
    const before = (await get(`/v1/presentation/${grace}`)).body as Read;
    const playlist = (await get(`/v1/playlist/${NOVEMBER_15}`)).body;

    pro.renamePresentation(grace, 'This Is Amazing Grace (Live)');

    const after = (await get(`/v1/presentation/${grace}`)).body as Read;
    expect(after.presentation.id).toEqual({ ...before.presentation.id, name: 'This Is Amazing Grace (Live)' });
    expect(after.presentation.groups).toEqual(before.presentation.groups);
    expect((await get(`/v1/playlist/${NOVEMBER_15}`)).body).toEqual(playlist);
    expect(((await get(`/v1/presentation/${SONGS['Yes and Amen']}`)).body as Read).presentation.id.name).toBe('Yes and Amen');
  });

  it("renames a presentation's item in one playlist's own read only, and leaves the presentation's own name and the other items as recorded", async () => {
    pro = await startFakeProPresenter();
    pro.serveNovember12();
    type Item = { id: { name: string; uuid: string }; presentation_info?: { presentation_uuid?: string } };
    const grace = SONGS['This Is Amazing Grace'];
    const before = ((await get(`/v1/playlist/${NOVEMBER_15}`)).body as { items: Item[] }).items;
    const own = (await get(`/v1/presentation/${grace}`)).body;

    pro.renameItem(NOVEMBER_15, grace, 'Grace');

    const after = ((await get(`/v1/playlist/${NOVEMBER_15}`)).body as { items: Item[] }).items;
    expect(after).toEqual(before.map((item) => (item.presentation_info?.presentation_uuid === grace ? { ...item, id: { ...item.id, name: 'Grace' } } : item)));
    expect(after).not.toEqual(before);
    expect((await get(`/v1/presentation/${grace}`)).body).toEqual(own);
  });

  // The answers a song's thumbnail gets only where a test puts them (answerThumbnails()): files of the session's folder
  // that no song's path answered with in a recording, or a status. Each is served as a recorded thumbnail is.
  const PLACEHOLDER_WITH_MARKS = 'placeholder-with-marks-14-13.png';
  const PLACEHOLDER = 'v1_presentation_1A0F6B8F-9434-4462-854F-62D3CF499B68_thumbnail_0.png';
  const CHECKERBOARD = 'v1_presentation_5A606BC5-9279-4509-983E-88092AE567F0_thumbnail_36.png';
  const TRANSPARENT = 'made-transparent.png';
  const picture = (file: string) => ({ status: 200, type: 'image/png', bytes: readFileSync(resolve(SESSION, file)) });

  it.each([
    ['the grey placeholder with the two marks', PLACEHOLDER_WITH_MARKS],
    ['the dark checkerboard of a slide with no background', CHECKERBOARD],
    ['the picture made with every pixel transparent', TRANSPARENT],
  ])("answers every request for a song's thumbnail with %s once a test gives it for every request, byte for byte, as image/png, and leaves the other songs' as recorded", async (_name, file) => {
    pro = await startFakeProPresenter();
    pro.serveNovember12();
    const other = await raw(thumbnail(SONGS['I Speak Jesus']));

    pro.answerThumbnails(SONGS['Yes and Amen'], [], file);

    for (let ask = 0; ask < 3; ask += 1) expect(await raw(thumbnail(SONGS['Yes and Amen']))).toEqual(picture(file));
    expect(await raw(thumbnail(SONGS['I Speak Jesus']))).toEqual(other);
    expect(other.bytes.equals(picture(file).bytes)).toBe(false);
    // Another cue of the same presentation is not the path the test named.
    expect((await raw(thumbnail(SONGS['Yes and Amen'], 1))).status).toBe(404);
  });

  it("answers a song's thumbnail with the grey placeholder once, then with the song's own recorded picture, as the one recorded run of a first request did", async () => {
    pro = await startFakeProPresenter();
    pro.serveNovember12();
    const own = await raw(thumbnail(SONGS['Yes and Amen']));
    const { answers } = JSON.parse(readFileSync(resolve(SESSION, 'thumbnail-first-request-then-again.json'), 'utf8')) as { answers: { status: number; content_type: string; body_bytes: number; body_md5: string }[] };

    pro.answerThumbnails(SONGS['Yes and Amen'], [PLACEHOLDER]);

    const first = await raw(thumbnail(SONGS['Yes and Amen']));
    expect(first).toEqual(picture(PLACEHOLDER));
    // The first answer of the recorded run, by its status, its content type, its size and its md5.
    expect({ status: first.status, content_type: first.type, body_bytes: first.bytes.length, body_md5: createHash('md5').update(first.bytes).digest('hex') }).toEqual({
      status: answers[0]!.status,
      content_type: answers[0]!.content_type,
      body_bytes: answers[0]!.body_bytes,
      body_md5: answers[0]!.body_md5,
    });
    expect(await raw(thumbnail(SONGS['Yes and Amen']))).toEqual(own);
    expect(await raw(thumbnail(SONGS['Yes and Amen']))).toEqual(own);
    expect(own.bytes.equals(first.bytes)).toBe(false);
  });

  it("answers a song's thumbnail with a 403 with no body and no content type, as the recorded thumbnail of a presentation this Mac is not authorized for does, for one request or for every one", async () => {
    pro = await startFakeProPresenter();
    pro.serveNovember12();
    const refused = await raw(thumbnail(THERE_IS_FREEDOM));
    expect(refused.status).toBe(403);
    const own = await raw(thumbnail(SONGS['Yes and Amen']));

    pro.answerThumbnails(SONGS['Yes and Amen'], [403]);
    pro.answerThumbnails(SONGS['I Speak Jesus'], [], 403);

    expect(await raw(thumbnail(SONGS['Yes and Amen']))).toEqual(refused);
    expect(await raw(thumbnail(SONGS['Yes and Amen']))).toEqual(own);
    for (let ask = 0; ask < 3; ask += 1) expect(await raw(thumbnail(SONGS['I Speak Jesus']))).toEqual(refused);
  });

  it('answers the next requests in the order given, a picture then a status then a picture, and every one after them as the test says', async () => {
    pro = await startFakeProPresenter();
    pro.serveNovember12();

    pro.answerThumbnails(SONGS['Yes and Amen'], [PLACEHOLDER, 500, CHECKERBOARD], PLACEHOLDER_WITH_MARKS);

    expect(await raw(thumbnail(SONGS['Yes and Amen']))).toEqual(picture(PLACEHOLDER));
    expect(await raw(thumbnail(SONGS['Yes and Amen']))).toEqual({ status: 500, type: null, bytes: Buffer.alloc(0) });
    expect(await raw(thumbnail(SONGS['Yes and Amen']))).toEqual(picture(CHECKERBOARD));
    expect(await raw(thumbnail(SONGS['Yes and Amen']))).toEqual(picture(PLACEHOLDER_WITH_MARKS));
    expect(await raw(thumbnail(SONGS['Yes and Amen']))).toEqual(picture(PLACEHOLDER_WITH_MARKS));
  });
});
