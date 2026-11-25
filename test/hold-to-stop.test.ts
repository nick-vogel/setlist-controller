import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHold, STOP_HOLD_MS } from '../web/src/hold.ts';
import { StopButton } from '../web/src/StopButton.tsx';
import { readStylesheet, type Element } from './css.ts';

// The leader's Stop: a press shorter than the hold sends nothing, a full hold sends one stop. The
// press itself in a browser is the Playwright suite's to prove.

describe('the hold timer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds for one second', () => {
    expect(STOP_HOLD_MS).toBe(1000);
  });

  it('does nothing on a release before the hold is done', () => {
    const onComplete = vi.fn();
    const hold = createHold(1000, onComplete);

    hold.press();
    vi.advanceTimersByTime(999);
    hold.release();
    vi.advanceTimersByTime(5000);

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('completes once on a full hold, and a release after that does nothing', () => {
    const onComplete = vi.fn();
    const hold = createHold(1000, onComplete);

    hold.press();
    vi.advanceTimersByTime(1000);
    hold.release();
    vi.advanceTimersByTime(5000);

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('starts again from zero on a press after a release, and ignores a second press while held', () => {
    const onComplete = vi.fn();
    const hold = createHold(1000, onComplete);

    hold.press();
    vi.advanceTimersByTime(600);
    hold.release();
    hold.press();
    vi.advanceTimersByTime(600);
    hold.press();
    vi.advanceTimersByTime(399);
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    // The second press started no timer of its own.
    vi.advanceTimersByTime(5000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('sends nothing on a release after a second press while held', () => {
    const onComplete = vi.fn();
    const hold = createHold(1000, onComplete);

    hold.press();
    vi.advanceTimersByTime(300);
    hold.press();
    vi.advanceTimersByTime(300);
    hold.release();
    vi.advanceTimersByTime(5000);

    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('the Stop button', () => {
  const markup = renderToStaticMarkup(createElement(StopButton, { available: true, send: () => {} }));
  const stylesheet = readStylesheet(resolve(import.meta.dirname, '../web/src/styles.css'));
  const fill = (button: string[]): Element[] => [
    { tag: 'html' },
    { tag: 'body' },
    { tag: 'div' },
    { tag: 'main' },
    { tag: 'section', classes: ['transport'] },
    { tag: 'button', classes: button },
    { tag: 'span', classes: ['stop-fill'] },
  ];

  it('has a fill bar in the button', () => {
    expect(markup).toMatch(/<button type="button" class="stop"[^>]*>.*<span class="stop-fill" aria-hidden="true">/);
    expect(markup).toContain('Stop');
  });

  it('fills the bar over the hold, and empties it at rest', () => {
    expect(stylesheet.value(fill(['stop']), 'transform')).toBe('scaleX(0)');
    expect(stylesheet.value(fill(['stop']), 'transition')).toBeUndefined();
    expect(stylesheet.value(fill(['stop', 'holding']), 'transform')).toBe('scaleX(1)');
    expect(stylesheet.value(fill(['stop', 'holding']), 'transition')).toBe(`transform ${STOP_HOLD_MS}ms linear`);
  });

  it('never selects text or opens a callout on a long press', () => {
    const button: Element[] = fill(['stop']).slice(0, -1);
    expect(stylesheet.value(button, 'touch-action')).toBe('none');
    expect(stylesheet.value(button, 'user-select')).toBe('none');
    expect(stylesheet.value(button, '-webkit-user-select')).toBe('none');
    expect(stylesheet.value(button, '-webkit-touch-callout')).toBe('none');
  });
});
