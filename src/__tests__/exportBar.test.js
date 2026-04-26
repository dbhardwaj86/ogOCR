/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import ExportBar from '../components/ExportBar.jsx';

const SESSION = Object.freeze({
  id: 'sess_test',
  filename: 'sample.png',
  text: 'Hello world',
  svg: '',
  kind: 'text',
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('ExportBar', () => {
  it('renders the three menu buttons (Save / Share / Export)', () => {
    render(React.createElement(ExportBar, { session: SESSION, processing: false }));
    const triggers = document.querySelectorAll('.og-export-menu-btn');
    const labels = Array.from(triggers).map(t => t.textContent.trim());
    expect(labels).toEqual(expect.arrayContaining(['Save▾', 'Share▾', 'Export▾']));
    expect(triggers.length).toBe(3);
  });

  it('opens the Save menu and reveals Drive / MD / PDF entries on click', () => {
    render(React.createElement(ExportBar, { session: SESSION, processing: false }));
    const triggers = document.querySelectorAll('.og-export-menu-btn');
    const saveTrigger = Array.from(triggers).find(t => t.textContent.startsWith('Save'));
    fireEvent.click(saveTrigger);
    const menu = screen.getByRole('menu', { name: /save menu/i });
    const items = within(menu).getAllByRole('menuitem');
    const labels = items.map(i => i.textContent.toLowerCase());
    expect(labels.some(l => l.includes('drive'))).toBe(true);
    expect(labels.some(l => l.includes('md'))).toBe(true);
    expect(labels.some(l => l.includes('pdf'))).toBe(true);
  });

  it('shows recent folders from localStorage in the Drive folder dropdown', () => {
    localStorage.setItem(
      'ogOCR_drive_recent',
      JSON.stringify(['/Math/Algebra', '/Science', '/Misc'])
    );
    render(React.createElement(ExportBar, { session: SESSION, processing: false }));
    const input = screen.getByLabelText(/drive folder path/i);
    fireEvent.focus(input);
    const listbox = screen.getByRole('listbox', { name: /recent drive folders/i });
    const options = within(listbox).getAllByRole('option');
    const texts = options.map(o => o.textContent);
    expect(texts).toContain('/Math/Algebra');
    expect(texts).toContain('/Science');
    expect(texts).toContain('/Misc');
  });

  it('clicking a recent folder fills the input and closes the menu', () => {
    localStorage.setItem(
      'ogOCR_drive_recent',
      JSON.stringify(['/Math/Algebra'])
    );
    render(React.createElement(ExportBar, { session: SESSION, processing: false }));
    const input = screen.getByLabelText(/drive folder path/i);
    fireEvent.focus(input);
    const option = screen.getByRole('option', { name: '/Math/Algebra' });
    fireEvent.click(option);
    expect(input.value).toBe('/Math/Algebra');
    expect(screen.queryByRole('listbox', { name: /recent drive folders/i })).toBeNull();
  });

  it('falls back to the bottom-sheet when navigator.share is missing', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'share');
    Object.defineProperty(globalThis.navigator, 'share', { value: undefined, configurable: true });
    try {
      render(React.createElement(ExportBar, { session: SESSION, processing: false }));
      const fab = screen.getByTestId('og-share-fab');
      fireEvent.click(fab);
      expect(screen.getByRole('dialog', { name: /share options/i })).toBeTruthy();
    } finally {
      if (original) Object.defineProperty(globalThis.navigator, 'share', original);
      else delete globalThis.navigator.share;
    }
  });
});
