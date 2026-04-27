import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LanguagePill from '../components/LanguagePill';

describe('LanguagePill (Track R — prop-driven)', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders nothing when neither lang nor overrideLang is set', () => {
    const { container } = render(<LanguagePill />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the detected language name', () => {
    render(<LanguagePill lang="en" />);
    expect(screen.getByRole('button', { name: /Detected language English/i })).toBeTruthy();
    expect(screen.getByText('English')).toBeTruthy();
  });

  it('renders Unknown for the "und" code', () => {
    render(<LanguagePill lang="und" />);
    expect(screen.getByText('Unknown')).toBeTruthy();
  });

  it('shows "(override)" suffix when overrideLang is set and not auto', () => {
    render(<LanguagePill lang="en" overrideLang="es" />);
    expect(screen.getByText('Spanish (override)')).toBeTruthy();
  });

  it('does not show "(override)" suffix when overrideLang is "auto"', () => {
    // When overrideLang is "auto" the pill renders without the (override)
    // suffix — Track K's documented behavior, preserved by Track R.
    render(<LanguagePill lang="en" overrideLang="auto" />);
    expect(screen.queryByText(/\(override\)/)).toBeNull();
  });

  it('still renders even when only overrideLang is set (no detected lang)', () => {
    render(<LanguagePill lang={null} overrideLang="fr" />);
    expect(screen.getByText('French (override)')).toBeTruthy();
  });

  it('opens the dropdown when the pill button is clicked', () => {
    render(<LanguagePill lang="en" />);
    const btn = screen.getByRole('button', { name: /Detected language/i });
    fireEvent.click(btn);
    expect(screen.getByRole('listbox', { name: /Override language/i })).toBeTruthy();
    // The 7 standard options (auto + 6 languages) should be present.
    expect(screen.getByRole('option', { name: /Auto-detect/i })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Spanish/i })).toBeTruthy();
  });

  it('calls onOverride with the chosen code and sessionId when an option is picked', () => {
    const onOverride = vi.fn();
    render(<LanguagePill lang="en" onOverride={onOverride} sessionId="sess-123" />);
    fireEvent.click(screen.getByRole('button', { name: /Detected language/i }));
    fireEvent.click(screen.getByRole('option', { name: /Spanish/i }).querySelector('button'));
    expect(onOverride).toHaveBeenCalledTimes(1);
    expect(onOverride).toHaveBeenCalledWith('es', 'sess-123');
  });

  it('calls onOverride with "auto" when the auto-detect option is picked', () => {
    const onOverride = vi.fn();
    render(<LanguagePill lang="en" overrideLang="es" onOverride={onOverride} sessionId="sess-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Detected language/i }));
    fireEvent.click(screen.getByRole('option', { name: /Auto-detect/i }).querySelector('button'));
    expect(onOverride).toHaveBeenCalledWith('auto', 'sess-1');
  });

  it('closes the dropdown after a selection', () => {
    const onOverride = vi.fn();
    render(<LanguagePill lang="en" onOverride={onOverride} />);
    fireEvent.click(screen.getByRole('button', { name: /Detected language/i }));
    expect(screen.queryByRole('listbox')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /Spanish/i }).querySelector('button'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes the dropdown when Escape is pressed', () => {
    render(<LanguagePill lang="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Detected language/i }));
    expect(screen.queryByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  // Track R guarantee: the pill is now a normal stateless component. It
  // must NOT touch window.dispatchEvent (the og:language-override
  // CustomEvent is gone). This test fails loudly if anyone re-introduces
  // the workaround.
  describe('no CustomEvent fallback', () => {
    let dispatchSpy;

    beforeEach(() => {
      dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    });

    afterEach(() => {
      dispatchSpy.mockRestore();
    });

    it('does not dispatch any window event when an option is picked with onOverride supplied', () => {
      const onOverride = vi.fn();
      render(<LanguagePill lang="en" onOverride={onOverride} sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: /Detected language/i }));
      fireEvent.click(screen.getByRole('option', { name: /Spanish/i }).querySelector('button'));
      expect(onOverride).toHaveBeenCalled();
      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('does not dispatch any window event even when onOverride is missing (no fallback)', () => {
      render(<LanguagePill lang="en" />);
      fireEvent.click(screen.getByRole('button', { name: /Detected language/i }));
      fireEvent.click(screen.getByRole('option', { name: /Spanish/i }).querySelector('button'));
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });
});
