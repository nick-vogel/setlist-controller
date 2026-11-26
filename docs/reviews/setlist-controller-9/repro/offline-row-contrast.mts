import { chromium } from '@playwright/test';
import { startE2eRig } from '../../../../e2e/rig.ts';

function parseRgb(value: string): [number, number, number] {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (!match) throw new Error(`Cannot parse color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function composite(fg: [number, number, number], bg: [number, number, number], alpha: number): [number, number, number] {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const e2e = await startE2eRig();
const browser = await chromium.launch();
try {
  const producerCtx = await browser.newContext();
  const producer = await producerCtx.newPage();
  await producer.goto(e2e.producerUrl);
  await producer.getByText('Intro').first().waitFor();

  const phoneCtx = await browser.newContext();
  const phone = await phoneCtx.newPage();
  await phone.goto(e2e.viewerUrl);
  await phone.getByText('Intro').first().waitFor();
  await phone.getByLabel('Device name').fill('Drums');
  await producer.locator('.device', { hasText: 'Drums' }).waitFor();
  await phoneCtx.close();
  await producer.locator('.device.offline', { hasText: 'Drums' }).waitFor();

  const measured = await producer.evaluate(() => {
    const rootBg = getComputedStyle(document.documentElement).backgroundColor;
    const row = document.querySelector('.device.offline')!;
    const rowStyle = getComputedStyle(row);
    const status = row.querySelector('.device-status')!;
    const statusStyle = getComputedStyle(status);
    const name = row.querySelector('.device-name')!;
    const nameStyle = getComputedStyle(name);
    return {
      rootBg,
      rowBg: rowStyle.backgroundColor,
      rowOpacity: Number(rowStyle.opacity),
      statusColor: statusStyle.color,
      statusFontSize: statusStyle.fontSize,
      statusFontWeight: statusStyle.fontWeight,
      nameColor: nameStyle.color,
      nameFontSize: nameStyle.fontSize,
      nameFontWeight: nameStyle.fontWeight,
    };
  });

  const root = parseRgb(measured.rootBg);
  const rowBg = composite(parseRgb(measured.rowBg), root, measured.rowOpacity);
  const statusFg = composite(parseRgb(measured.statusColor), root, measured.rowOpacity);
  const nameFg = composite(parseRgb(measured.nameColor), root, measured.rowOpacity);
  const statusRatio = contrast(statusFg, rowBg);
  const nameRatio = contrast(nameFg, rowBg);

  console.log(`status/role/battery contrast: ${statusRatio.toFixed(2)}:1 (${measured.statusFontSize} weight ${measured.statusFontWeight})`);
  console.log(`name contrast: ${nameRatio.toFixed(2)}:1 (${measured.nameFontSize} weight ${measured.nameFontWeight})`);
  if (statusRatio < 4.5 || nameRatio < 4.5) {
    process.exit(1);
  }
} finally {
  await browser.close();
  await e2e.close();
}
