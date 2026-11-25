import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import { parseXml, XmlDeclaration, XmlElement, XmlNode, XmlText } from '@rgrove/parse-xml';

// A Live set (.als) is gzipped XML. Live 12 writes it in one fixed style: LF line ends, tab indentation, one
// element per line, every empty element as `<Name Attr="v" />`, no text content, comments or CDATA, and
// each attribute value quoted by one rule (see quoteAttribute). @rgrove/parse-xml keeps attribute order
// and the whitespace between elements, and the serializer below writes that style back, so an unchanged
// set comes out byte for byte as Live wrote it.

export type Element = { name: string; attributes: Record<string, string>; children: Node[] };
export type Text = { text: string };
export type Node = Element | Text;
export type AlsDocument = { declaration: string; root: Element };

export function parseAls(xml: string): AlsDocument {
  const document = parseXml(xml, {
    preserveXmlDeclaration: true,
    preserveComments: true,
    preserveCdata: true,
    preserveDocumentType: true,
  });
  let declaration = '';
  let root: Element | undefined;
  for (const node of document.children) {
    if (node instanceof XmlDeclaration) declaration = toDeclaration(node);
    else if (node instanceof XmlElement) root = toElement(node);
    else unsupported(node);
  }
  if (!root) throw new Error('The set has no root element.');
  return { declaration, root };
}

export function serializeAls(document: AlsDocument): string {
  const declaration = document.declaration ? `${document.declaration}\n` : '';
  return `${declaration}${serialize(document.root)}\n`;
}

export async function readAls(path: string): Promise<AlsDocument> {
  return parseAls(await readAlsXml(path));
}

// A set's XML, unzipped, not yet parsed.
export async function readAlsXml(path: string): Promise<string> {
  return gunzipSync(await readFile(path)).toString('utf8');
}

// The root element's attributes, the Live version among them, read leniently: comments are left out of the
// tree rather than refused, since an older Live's set holds them and parseAls stops on the first.
export function rootAttributes(xml: string): Record<string, string> {
  return { ...parseXml(xml).root?.attributes };
}

// `wx` refuses to replace an existing file, so a build never overwrites a set edited by hand.
export async function writeAls(path: string, document: AlsDocument): Promise<void> {
  await writeFile(path, gzipSync(serializeAls(document)), { flag: 'wx' });
}

function toDeclaration(node: XmlDeclaration): string {
  const encoding = node.encoding ? ` encoding="${node.encoding}"` : '';
  const standalone = node.standalone ? ` standalone="${node.standalone}"` : '';
  return `<?xml version="${node.version}"${encoding}${standalone}?>`;
}

function toElement(node: XmlElement): Element {
  return { name: node.name, attributes: { ...node.attributes }, children: node.children.map(toNode) };
}

function toNode(node: XmlNode): Node {
  if (node instanceof XmlElement) return toElement(node);
  if (node instanceof XmlText) return { text: node.text };
  return unsupported(node);
}

function unsupported(node: XmlNode): never {
  throw new Error(`The set holds a ${node.type} node, which Live 12 never writes.`);
}

function serialize(node: Node): string {
  if ('text' in node) return escapeMarkup(node.text).replaceAll('"', '&quot;');
  const attributes = Object.entries(node.attributes)
    .map(([name, value]) => ` ${name}=${quoteAttribute(value)}`)
    .join('');
  if (node.children.length === 0) return `<${node.name}${attributes} />`;
  return `<${node.name}${attributes}>${node.children.map(serialize).join('')}</${node.name}>`;
}

function escapeMarkup(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// Live double-quotes an attribute value, unless the value's first quote character is a double quote; then
// it single-quotes it. Only the delimiting quote is escaped, as &quot; or &apos;; the other stays raw.
// A raw tab, line feed or carriage return in an attribute value is read back as a space (XML 1.0, 3.3.3),
// so those three are written as the two-digit hex references Live writes. Whitespace between elements
// stays raw.
function quoteAttribute(value: string): string {
  const quote = value.match(/["']/)?.[0] === '"' ? "'" : '"';
  const escaped = escapeMarkup(value)
    .replaceAll(quote, quote === '"' ? '&quot;' : '&apos;')
    .replaceAll('\t', '&#x09;')
    .replaceAll('\n', '&#x0A;')
    .replaceAll('\r', '&#x0D;');
  return `${quote}${escaped}${quote}`;
}

// Element helpers for the build.

export function childElements(parent: Element, name?: string): Element[] {
  return parent.children.filter((node): node is Element => 'name' in node && (name === undefined || node.name === name));
}

// The first child element along `path`; a missing one is a set this builder cannot read.
export function child(parent: Element, ...path: string[]): Element {
  let current = parent;
  for (const name of path) {
    const next = childElements(current, name)[0];
    if (!next) throw new Error(`The set has no <${name}> inside <${current.name}>.`);
    current = next;
  }
  return current;
}

export function valueOf(parent: Element, ...path: string[]): string {
  const element = child(parent, ...path);
  const value = element.attributes.Value;
  if (value === undefined) throw new Error(`The set's <${element.name}> has no Value.`);
  return value;
}

export function setValue(parent: Element, path: string[], value: string): void {
  child(parent, ...path).attributes.Value = value;
}

// Replaces the items of the list `container` holds as its child <listName> (not `container`'s own
// children) with `items`, in Live's layout: each item on its own line, one tab deeper than the list. An
// empty list is written `<listName />`, as Live writes it.
export function replaceListItems(container: Element, listName: string, items: Element[]): void {
  const list = child(container, listName);
  const before = container.children[container.children.indexOf(list) - 1];
  const indent = before && 'text' in before ? before.text.slice(before.text.lastIndexOf('\n') + 1) : '';
  list.children = items.length === 0 ? [] : [...items.flatMap((item) => [{ text: `\n${indent}\t` }, item]), { text: `\n${indent}` }];
}

// Elements sorted by their Time attribute. The sort is stable, so the two events of an instant step, at
// one Time, keep their order: old value, then new.
export function byTime(elements: Element[], time: (element: Element) => string = (element) => element.attributes.Time ?? ''): Element[] {
  return [...elements].sort((a, b) => Number(time(a)) - Number(time(b)));
}

// Removes every <name> child, with the line break and indentation before it.
export function removeChildElements(parent: Element, name: string): void {
  parent.children = parent.children.filter((node, index, nodes) => {
    if ('name' in node) return node.name !== name;
    const next = nodes[index + 1];
    return !(next && 'name' in next && next.name === name);
  });
}
