// The lights mode's own reads of ProPresenter, over its HTTP API, apart from the server's ProPresenter target: the
// playlists, a playlist's items, a presentation, and the picture of a presentation's first cue. Every request is a GET,
// and nothing is triggered. What ProPresenter answers, and how, is as recorded from ProPresenter 22
// (test/fixtures/propresenter/README.md, "The 2026-11-12 session").

// ProPresenter's API port when the connections config leaves it out, as the server takes it.
export const PROPRESENTER_PORT = 50001;
// How long a request waits for its answer, the server's own limit: a cold ProPresenter took up to 7.8 seconds to answer
// in the Phase 0 recordings.
export const PROPRESENTER_TIMEOUT_MS = 15_000;
// A first request for a picture can get ProPresenter's grey placeholder for a picture it has not drawn yet: one recorded
// run gave the picture on the same request 1.2 seconds later, another 0.4 seconds later. So an answer with no picture
// is asked again, after this long, up to this many more times. The recordings do not say how long ProPresenter can
// take, so the 5 seconds the two make are Nick's choice (setlist-controller#502).
export const PROPRESENTER_AGAIN_MS = 1000;
export const PROPRESENTER_ASKS_AGAIN = 5;

export type ProPresenterAddress = { host: string; port: number };

// ProPresenter did not answer within the limit: a connect that was refused or never finished, or an answer cut short.
export class ProPresenterSilent extends Error {}

// ProPresenter answered a read the mode cannot go on without, the playlists or a playlist, with another status than 200.
export class ProPresenterRefused extends Error {
  readonly status: number;
  readonly path: string;
  constructor(status: number, path: string) {
    super(`ProPresenter answered ${status} to GET ${path}`);
    this.status = status;
    this.path = path;
  }
}

export type ProPresenter = {
  // Every playlist, in ProPresenter's order, the playlists inside a folder among them, as the server reads them.
  playlists(): Promise<{ uuid: string; name: string }[]>;
  // The presentations a playlist links, in its order: each item of type presentation with a presentation_uuid, with the
  // item's own name, which can carry the arrangement, as "This Is Amazing Grace - [ Full ]" does. Headers and
  // placeholders are skipped, and so is a song ProPresenter has not linked to a presentation.
  linked(playlist: string): Promise<{ item: string; uuid: string }[]>;
  // A presentation, read: the status of the answer, and for a 200 its own name and its background file, the label of
  // the first slide of its first group that has one, "" when that slide has no label or the presentation no slide.
  presentation(uuid: string): Promise<{ status: number; name?: string; backgroundFile?: string }>;
  // The picture of a presentation's first cue, as the recordings asked for it: the status of the answer, and for a 200
  // the bytes of the PNG. One request, one answer: the lights mode asks again for the same presentation when the answer
  // has no picture, since the first answer can be ProPresenter's grey placeholder for a picture it has not drawn yet,
  // and a presentation this Mac is not authorized for answers 403 with no body.
  thumbnail(uuid: string): Promise<{ status: number; png?: Buffer }>;
};

export function proPresenter({ host, port }: ProPresenterAddress, timeoutMs: number): ProPresenter {
  // A GET, with the time limit on the answer and on its body. An answer is given whatever its status.
  const get = async (path: string): Promise<{ status: number; body: Buffer }> => {
    try {
      const response = await fetch(`http://${host}:${port}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
      return { status: response.status, body: Buffer.from(await response.arrayBuffer()) };
    } catch {
      throw new ProPresenterSilent();
    }
  };
  // A body read as JSON, or undefined for one that is not.
  const json = (body: Buffer): unknown => {
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      return undefined;
    }
  };
  // A read the mode cannot go on without: its body as JSON, or ProPresenterRefused for any status but 200.
  const read = async (path: string): Promise<unknown> => {
    const { status, body } = await get(path);
    if (status !== 200) throw new ProPresenterRefused(status, path);
    return json(body);
  };
  return {
    playlists: async () => playlistsIn(await read('/v1/playlists')),
    async linked(playlist) {
      const items = ((await read(`/v1/playlist/${playlist}`)) as { items?: unknown } | null)?.items;
      if (!Array.isArray(items)) return [];
      return items.flatMap((item) => {
        const { id, type, presentation_info: info } = (item ?? {}) as { id?: { name?: unknown }; type?: unknown; presentation_info?: { presentation_uuid?: unknown } };
        const uuid = info?.presentation_uuid;
        return type === 'presentation' && typeof uuid === 'string' && uuid !== '' ? [{ item: typeof id?.name === 'string' ? id.name : '', uuid }] : [];
      });
    },
    async presentation(uuid) {
      const { status, body } = await get(`/v1/presentation/${uuid}`);
      if (status !== 200) return { status };
      const presentation = (json(body) as { presentation?: { id?: { name?: unknown }; groups?: unknown } } | null | undefined)?.presentation;
      const groups = Array.isArray(presentation?.groups) ? (presentation.groups as { slides?: unknown }[]) : [];
      const [first] = groups.flatMap((group) => (Array.isArray(group?.slides) ? (group.slides as { label?: unknown }[]) : []));
      const name = presentation?.id?.name;
      return { status, ...(typeof name === 'string' ? { name } : {}), backgroundFile: typeof first?.label === 'string' ? first.label : '' };
    },
    async thumbnail(uuid) {
      const { status, body } = await get(`/v1/presentation/${uuid}/thumbnail/0?quality=400&thumbnail_type=png`);
      return status === 200 ? { status, png: body } : { status };
    },
  };
}

// The playlists in what GET /v1/playlists answers, flattened: a folder's playlists follow it.
function playlistsIn(items: unknown): { uuid: string; name: string }[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const { id, field_type: type, children } = (item ?? {}) as { id?: { uuid?: unknown; name?: unknown }; field_type?: unknown; children?: unknown };
    const own = type === 'playlist' && typeof id?.uuid === 'string' && typeof id.name === 'string' ? [{ uuid: id.uuid, name: id.name }] : [];
    return [...own, ...playlistsIn(children)];
  });
}
