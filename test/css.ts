import { readFileSync } from 'node:fs';

// A small CSS cascade over the web app's stylesheet, enough to tell which rule wins a property on an
// element, so a test catches a selector that outranks the one meant to style it. There is no
// browser in the unit tests.
//
// It knows type and class selectors, `:root`, and the descendant and child combinators. An element
// is described by its ancestors only, so a sibling combinator never matches, and neither does a
// state such as `:active`, which a page at rest is never in. Anything else throws, so a stylesheet
// the helper cannot read fails the test plainly instead of passing it.

export type Element = { tag: string; classes?: string[] };

type Rule = { selectors: string[]; declarations: [string, string][] };

const STATES = new Set(['active', 'hover', 'focus', 'focus-visible', 'focus-within', 'visited']);

export function readStylesheet(path: string) {
  const rules = parse(readFileSync(path, 'utf8'));

  return {
    // The value that wins `property` on the last element of `path`, which runs from the root
    // element down. Undefined when no rule sets it.
    value(path: Element[], property: string): string | undefined {
      let winner: { specificity: number[]; value: string } | undefined;
      for (const rule of rules) {
        const value = rule.declarations.findLast(([name]) => name === property)?.[1];
        if (value === undefined) continue;
        for (const selector of rule.selectors) {
          const specificity = matches(selector, path);
          // A later rule wins a tie, as in the cascade.
          if (specificity && (!winner || compare(specificity, winner.specificity) >= 0)) {
            winner = { specificity, value };
          }
        }
      }
      return winner?.value;
    },
  };
}

function parse(css: string): Rule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  for (const [, prelude = '', body = ''] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (prelude.trim().startsWith('@')) throw new Error(`The CSS test helper cannot read at-rules: ${prelude.trim()}`);
    const declarations = body
      .split(';')
      .map((declaration) => declaration.split(/:(.*)/s).map((part) => part.trim()))
      .filter(([name, value]) => name && value)
      .flatMap(([name = '', value = '']) => expand(name, value));
    rules.push({ selectors: prelude.split(',').map((selector) => selector.trim()), declarations });
  }
  return rules;
}

// The margin shorthand, written out per side.
function expand(name: string, value: string): [string, string][] {
  if (name !== 'margin') return [[name, value]];
  const [top = value, right = top, bottom = top, left = right] = value.split(/\s+/);
  return [
    ['margin-top', top],
    ['margin-right', right],
    ['margin-bottom', bottom],
    ['margin-left', left],
  ];
}

// The selector's specificity, as [ids, classes, types], when it matches the last element of `path`.
function matches(selector: string, path: Element[]): number[] | null {
  // Compounds and combinators alternate. The split captures `>`, `+` and `~`, and leaves undefined
  // for a descendant combinator, which is only whitespace.
  const tokens = selector.trim().split(/\s*([>+~])\s*|\s+/);
  const joined: { compound: string; combinator: string }[] = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const compound = tokens[index];
    if (!compound) throw new Error(`The CSS test helper cannot read the selector ${selector}`);
    // The combinator that joins this compound to the one before it.
    joined.push({ compound, combinator: tokens[index - 1] ?? ' ' });
  }

  const specificity = [0, 0, 0];
  for (const { compound } of joined) {
    const counts = compoundSpecificity(compound, selector);
    for (let index = 0; index < 3; index += 1) specificity[index]! += counts[index]!;
  }
  return matchFrom(joined, joined.length - 1, path, path.length - 1) ? specificity : null;
}

function matchFrom(
  joined: { compound: string; combinator: string }[],
  part: number,
  path: Element[],
  at: number,
): boolean {
  const element = path[at];
  const current = joined[part];
  if (!element || !current || !matchesCompound(current.compound, element, at === 0)) return false;
  if (part === 0) return true;
  if (current.combinator === '+' || current.combinator === '~') return false;
  if (current.combinator === '>') return matchFrom(joined, part - 1, path, at - 1);
  for (let ancestor = at - 1; ancestor >= 0; ancestor -= 1) {
    if (matchFrom(joined, part - 1, path, ancestor)) return true;
  }
  return false;
}

const SIMPLE = /([.#:]?)(-?[_a-zA-Z][-_a-zA-Z0-9]*|\*)/g;

function simpleSelectors(compound: string, selector: string) {
  const simple = [...compound.matchAll(SIMPLE)];
  if (simple.map(([text]) => text).join('') !== compound) {
    throw new Error(`The CSS test helper cannot read the selector ${selector}`);
  }
  return simple.map(([, kind = '', name = '']) => {
    if (kind === ':' && name !== 'root' && !STATES.has(name)) {
      throw new Error(`The CSS test helper cannot read the selector ${selector}`);
    }
    return { kind, name };
  });
}

function compoundSpecificity(compound: string, selector: string): number[] {
  const counts = [0, 0, 0];
  for (const { kind, name } of simpleSelectors(compound, selector)) {
    if (kind === '#') counts[0]! += 1;
    else if (kind === '.' || kind === ':') counts[1]! += 1;
    else if (name !== '*') counts[2]! += 1;
  }
  return counts;
}

function matchesCompound(compound: string, element: Element, isRoot: boolean): boolean {
  return simpleSelectors(compound, compound).every(({ kind, name }) => {
    if (kind === '.') return element.classes?.includes(name) ?? false;
    if (kind === '#') return false;
    if (kind === ':') return name === 'root' && isRoot;
    return name === '*' || name === element.tag;
  });
}

function compare(a: number[], b: number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

// The WCAG 2.1 contrast ratio of two hex colours, such as #aaa or #2a2a2a.
export function contrast(a: string, b: string): number {
  const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function luminance(hex: string): number {
  const channels = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.length === 4 ? hex.replace(/[0-9a-f]/gi, '$&$&') : hex);
  if (!channels) throw new Error(`Not a hex colour: ${hex}`);
  const [r = 0, g = 0, b = 0] = channels.slice(1).map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
