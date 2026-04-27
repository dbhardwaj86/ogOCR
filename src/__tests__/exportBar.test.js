/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import ExportBar from '../components/ExportBar.jsx';

const TEXT_SESSION = Object.freeze({
  id: 'sess_test',
  filename: 'sample.png',
  text: 'Hello world',
  svg: '',
  kind: 'text',
});

const SVG_SESSION = Object.freeze({
  id: 'sess_svg',
  filename: 'shape.png',
  text: '',
  svg: '<svg viewBox="0 0 1 1"><rect/></svg>',
  kind: 'sketch',
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('ExportBar (streamlined)', () => {
  it('renders the three primary affordances: Save, Copy, Print', () => {
    render(React.createElement(ExportBar, { session: TEXT_SESSION, processing: false }));
    const buttons = Array.from(document.querySelectorAll('button'));
    const labels = buttons.map(b => b.textContent.trim());
    expect(labels.some(l => l.includes('Save'))).toBe(true);
    expect(labels.some(l => l.includes('Copy'))).toBe(true);
    expect(labels.some(l => l.includes('Print'))).toBe(true);
  });

  it('does NOT render the legacy Drive / Email / Classroom / Share-link buttons', () => {
    render(React.createElement(ExportBar, { session: TEXT_SESSION, processing: false }));
    const text = document.body.textContent.toLowerCase();
    expect(text).not.toContain('drive');
    expect(text).not.toContain('email');
    expect(text).not.toContain('classroom');
    // 'Link' could be a substring of common words ("link to"), so check the
    // legacy aria-label / button text exactly.
    expect(screen.queryByRole('button', { name: /^link$/i })).toBeNull();
  });

  it('opens the Save picker on click and lists MD + JSON for a text-only session', () => {
    render(React.createElement(ExportBar, { session: TEXT_SESSION, processing: false }));
    const saveBtn = screen.getByTestId('og-save-btn');
    fireEvent.click(saveBtn);
    const menu = screen.getByTestId('og-save-menu');
    const items = within(menu).getAllByRole('menuitem');
    const labels = items.map(i => i.textContent);
    expect(labels.some(l => l.includes('MD'))).toBe(true);
    expect(labels.some(l => l.includes('JSON'))).toBe(true);
    expect(labels.some(l => l.includes('DOCX'))).toBe(true);
  });

  it('shows SVG (not MD) format when session has an SVG', () => {
    render(React.createElement(ExportBar, { session: SVG_SESSION, processing: false }));
    fireEvent.click(screen.getByTestId('og-save-btn'));
    const menu = screen.getByTestId('og-save-menu');
    const labels = within(menu).getAllByRole('menuitem').map(i => i.textContent);
    expect(labels.some(l => l.includes('SVG'))).toBe(true);
    // PNG / JPG appear once buildSvgExports yields ≥1 entry — SVG_SESSION qualifies.
    expect(labels.some(l => l.includes('PNG'))).toBe(true);
    expect(labels.some(l => l.includes('JPG'))).toBe(true);
  });

  it('disables the Save button when there is no content', () => {
    const empty = { id: 'e', filename: 'e.png', text: '', svg: '', kind: 'text' };
    render(React.createElement(ExportBar, { session: empty, processing: false }));
    const saveBtn = screen.getByTestId('og-save-btn');
    expect(saveBtn.disabled).toBe(true);
  });

  it('Print button is disabled with no content', () => {
    const empty = { id: 'e', filename: 'e.png', text: '', svg: '', kind: 'text' };
    render(React.createElement(ExportBar, { session: empty, processing: false }));
    const printBtn = screen.getByRole('button', { name: /^print$/i });
    expect(printBtn.disabled).toBe(true);
  });
});
