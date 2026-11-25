import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

// The stage network has no internet, so the web app must load everything from the laptop.

const REPO_ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = join(REPO_ROOT, 'dist/offline-check');

type BuiltFile = { name: string; text: string };
type Finding = { file: string; url: string };

// An absolute URL with a scheme, such as https://cdn.example.com/x.js or ws://example.com.
const ABSOLUTE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`()<>\\]+/gi;
// A protocol-relative URL, such as //fonts.example.com/x.css, where a browser would load it: an src,
// href or srcset attribute, a CSS url() or @import, or a quoted string in script.
const PROTOCOL_RELATIVE = /(?:\b(?:src|href|srcset|poster|action)\s*=\s*["']?|url\(\s*["']?|@import\s+["']|["'`])(\/\/[a-z0-9][^\s"'`()<>\\]*)/gi;

// Hosts on the laptop itself, which the app may name.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'setlist.local']);

// Strings in the build that look like URLs but that a browser never fetches.
const NEVER_FETCHED = [
  // XML namespace URIs, which React carries to create SVG and MathML elements. A namespace is a name.
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/XML/1998/namespace',
];
// React's production error messages point a developer here; the app never loads it.
const NEVER_FETCHED_PREFIXES = ['https://react.dev/errors/'];

// A host the app names on the laptop, or one it fills in at run time, such as `ws://${location.host}`,
// which is the laptop the page came from.
function isLocal(url: string): boolean {
  const authority = url.replace(/^[a-z][a-z0-9+.-]*:/i, '').replace(/^\/\//, '');
  if (authority.startsWith('${')) return true;
  const host = authority.startsWith('[') ? authority.slice(0, authority.indexOf(']') + 1) : (authority.split(/[/:?#]/)[0] ?? '');
  return LOCAL_HOSTS.has(host.toLowerCase());
}

function isNeverFetched(url: string): boolean {
  return NEVER_FETCHED.includes(url) || NEVER_FETCHED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

// Every URL in the files that points off the laptop.
function externalUrls(files: BuiltFile[]): Finding[] {
  return files.flatMap(({ name, text }) => {
    const urls = [
      ...[...text.matchAll(ABSOLUTE)].map((match) => match[0]),
      ...[...text.matchAll(PROTOCOL_RELATIVE)].map((match) => match[1] ?? ''),
    ];
    return urls.filter((url) => !isLocal(url) && !isNeverFetched(url)).map((url) => ({ file: name, url }));
  });
}

function readTree(dir: string): BuiltFile[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return { name: relative(dir, path), text: readFileSync(path, 'utf8') };
    });
}

describe('the built web app', () => {
  let built: BuiltFile[] = [];

  // Built here, the way `pnpm build` builds it, since CI runs the tests before the build. Vitest sets
  // NODE_ENV to test, and the production build is the one the laptop serves.
  beforeAll(async () => {
    await promisify(execFile)(join(REPO_ROOT, 'node_modules/.bin/vite'), ['build', '--outDir', OUT_DIR, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: REPO_ROOT,
      env: { ...process.env, NODE_ENV: 'production' },
    });
    built = readTree(OUT_DIR);
  }, 60_000);

  it('references no host off the laptop: no CDN script, font, stylesheet or image', () => {
    expect(built.map((file) => file.name)).toContain('index.html');
    expect(built.some((file) => file.name.endsWith('.js'))).toBe(true);
    expect(built.some((file) => file.name.endsWith('.css'))).toBe(true);

    expect(externalUrls(built)).toEqual([]);
  });
});

describe('the offline check', () => {
  it('flags a CDN script, a web font, a remote stylesheet and a remote image', () => {
    const fixture: BuiltFile[] = [
      {
        name: 'index.html',
        text: [
          '<script type="module" src="https://cdn.jsdelivr.net/npm/react@19/umd/react.production.min.js"></script>',
          '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
          '<img srcset="//images.example.com/logo.png 2x">',
          '<script type="module" src="/assets/index.js"></script>',
          '<a href="http://localhost:8080/leader">leader</a>',
        ].join('\n'),
      },
      {
        name: 'assets/index.css',
        text: [
          '@import "https://use.typekit.net/abc.css";',
          "body{background:url('https://images.example.com/stage.jpg')}",
          '@font-face{font-family:x;src:url(//fonts.gstatic.com/s/inter.woff2)}',
          'h1{background:url(/assets/local.png)}',
        ].join('\n'),
      },
      {
        name: 'assets/index.js',
        text: 'const ns="http://www.w3.org/2000/svg";fetch("https://api.example.com/set");new WebSocket(`ws://${location.host}/ws`);',
      },
    ];

    expect(externalUrls(fixture)).toEqual([
      { file: 'index.html', url: 'https://cdn.jsdelivr.net/npm/react@19/umd/react.production.min.js' },
      { file: 'index.html', url: 'https://fonts.googleapis.com/css2?family=Inter' },
      { file: 'index.html', url: '//images.example.com/logo.png' },
      { file: 'assets/index.css', url: 'https://use.typekit.net/abc.css' },
      { file: 'assets/index.css', url: 'https://images.example.com/stage.jpg' },
      { file: 'assets/index.css', url: '//fonts.gstatic.com/s/inter.woff2' },
      { file: 'assets/index.js', url: 'https://api.example.com/set' },
    ]);
  });
});
