/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Mock showError before importing SignatureModal so the modal picks up the
// spy. Also mock showInfo to silence noise from the success path.
vi.mock('../errors/showError', () => ({
  showError: vi.fn(),
  showInfo: vi.fn(),
}));

import SignatureModal from '../components/SignatureModal.jsx';
import {
  SIGNATURES_KEY,
  SIGNATURES_MAX,
  strokesToSvg,
} from '../signatureLib';
import { showError } from '../errors/showError';

// jsdom doesn't ship a real 2D canvas context — it returns null and logs
// a not-implemented warning. The modal early-bails on null, which means
// pointer events become no-ops and Save/Insert stay disabled. Stub the
// canvas context with a minimal spy that supports every method the modal
// touches; tests that need to assert specific calls (Clear) install a
// per-test spy on top of this baseline.
function buildCtxStub() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  };
}
let originalGetContext;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => buildCtxStub());
});

afterEach(() => {
  cleanup();
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

describe('SignatureModal — library cap', () => {
  it('rejects the 6th save attempt and calls showError("SIG_LIBRARY_FULL")', () => {
    // Pre-seed the library with the maximum number of signatures so the
    // very next save attempt should hit the cap.
    const sig = (i) => ({
      id: `sig_${i}`,
      svg: strokesToSvg([[{ x: i, y: i }]]),
      createdAt: 1700000000000 + i,
    });
    const seed = Array.from({ length: SIGNATURES_MAX }, (_, i) => sig(i));
    localStorage.setItem(SIGNATURES_KEY, JSON.stringify(seed));

    // Render an open modal so we can drive the Save button. Insert callback
    // is a no-op for this test.
    const onClose = vi.fn();
    const onInsert = vi.fn();
    render(React.createElement(SignatureModal, {
      open: true,
      onClose,
      onInsert,
    }));

    // Synthesize a stroke so the Save button isn't disabled. We do this by
    // dispatching pointer events on the canvas — bypassing the disabled-state
    // gate while still exercising the canonical save path.
    const canvas = screen.getByTestId('og-signature-canvas');
    // jsdom canvases don't have setPointerCapture; the modal calls it via
    // optional chaining so this is fine.
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 60, pointerId: 1, pointerType: 'mouse' });

    // Click Save.
    const saveBtn = screen.getByTestId('og-signature-save');
    fireEvent.click(saveBtn);

    // Library cap → showError must have been called with the dedicated code,
    // and the persisted library must NOT have grown past the cap.
    expect(showError).toHaveBeenCalledWith('SIG_LIBRARY_FULL');
    const stored = JSON.parse(localStorage.getItem(SIGNATURES_KEY));
    expect(stored.length).toBe(SIGNATURES_MAX);
  });

  it('saves the first 5 signatures successfully (no SIG_LIBRARY_FULL until the cap)', () => {
    // Each iteration draws a stroke, clicks Save, then clears the canvas.
    const onClose = vi.fn();
    const onInsert = vi.fn();
    render(React.createElement(SignatureModal, {
      open: true,
      onClose,
      onInsert,
    }));
    const canvas = screen.getByTestId('og-signature-canvas');
    const saveBtn = screen.getByTestId('og-signature-save');
    const clearBtn = screen.getByTestId('og-signature-clear');

    for (let i = 0; i < SIGNATURES_MAX; i++) {
      fireEvent.pointerDown(canvas, { clientX: 10 + i, clientY: 10, pointerId: 1, pointerType: 'mouse' });
      fireEvent.pointerMove(canvas, { clientX: 20 + i, clientY: 20, pointerId: 1, pointerType: 'mouse' });
      fireEvent.pointerUp(canvas, { clientX: 20 + i, clientY: 20, pointerId: 1, pointerType: 'mouse' });
      fireEvent.click(saveBtn);
      fireEvent.click(clearBtn);
    }

    // 5 saves should have landed without ever hitting the cap.
    expect(showError).not.toHaveBeenCalledWith('SIG_LIBRARY_FULL');
    const stored = JSON.parse(localStorage.getItem(SIGNATURES_KEY));
    expect(stored.length).toBe(SIGNATURES_MAX);
  });
});

describe('SignatureModal — onInsert', () => {
  it('passes a well-formed SVG string starting with <svg to the onInsert callback', () => {
    const onClose = vi.fn();
    const onInsert = vi.fn();
    render(React.createElement(SignatureModal, {
      open: true,
      onClose,
      onInsert,
    }));

    const canvas = screen.getByTestId('og-signature-canvas');
    fireEvent.pointerDown(canvas, { clientX: 30, clientY: 40, pointerId: 1, pointerType: 'pen' });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 90, pointerId: 1, pointerType: 'pen' });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 110, pointerId: 1, pointerType: 'pen' });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 110, pointerId: 1, pointerType: 'pen' });

    const insertBtn = screen.getByTestId('og-signature-insert');
    fireEvent.click(insertBtn);

    expect(onInsert).toHaveBeenCalledTimes(1);
    const svg = onInsert.mock.calls[0][0];
    expect(typeof svg).toBe('string');
    expect(svg.startsWith('<svg')).toBe(true);
    // Should contain the namespace declaration so it renders standalone.
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // And the modal should have closed itself.
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SignatureModal — Clear button', () => {
  it('calls clearRect on the canvas context when Clear is pressed', () => {
    // Override the baseline stub for this test with a single shared ctx so
    // we can assert clearRect was called with canvas-sized args after click.
    const ctxSpy = buildCtxStub();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxSpy);

    const onClose = vi.fn();
    const onInsert = vi.fn();
    render(React.createElement(SignatureModal, {
      open: true,
      onClose,
      onInsert,
    }));

    // Clear the count from the initial mount paint so the assertion below
    // only counts the click-driven invocation.
    ctxSpy.clearRect.mockClear();

    const clearBtn = screen.getByTestId('og-signature-clear');
    fireEvent.click(clearBtn);

    expect(ctxSpy.clearRect).toHaveBeenCalled();
    // Verify it cleared the full canvas area (800×240 from CANVAS_W/H).
    expect(ctxSpy.clearRect).toHaveBeenCalledWith(0, 0, 800, 240);
  });
});
