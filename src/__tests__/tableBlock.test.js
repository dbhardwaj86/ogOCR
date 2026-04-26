import { describe, it, expect } from 'vitest';
import Papa from 'papaparse';
import { parseGfmTable, tableToCsv } from '../components/TableBlock';

// Sprint 3.2 — Track M.
//
// We test the pure helpers (parser + csv export) directly so the suite
// doesn't have to mount React or depend on the contentEditable behavior of
// jsdom (which is partial). The third test exercises sort by reproducing
// the same comparator the component uses.

describe('parseGfmTable', () => {
  it('parses a fenced GFM table out of surrounding markdown', () => {
    const md = [
      '# Heading',
      '',
      'Some intro paragraph.',
      '',
      '| Name | Age | City     |',
      '| ---- | --- | -------- |',
      '| Alice | 30 | London   |',
      '| Bob   | 25 | Berlin   |',
      '| Carol | 40 | Toronto  |',
      '',
      'Trailing prose.',
    ].join('\n');
    const parsed = parseGfmTable(md);
    expect(parsed).not.toBeNull();
    expect(parsed.headers).toEqual(['Name', 'Age', 'City']);
    expect(parsed.rows).toEqual([
      ['Alice', '30', 'London'],
      ['Bob', '25', 'Berlin'],
      ['Carol', '40', 'Toronto'],
    ]);
  });

  it('returns null when no GFM table is present', () => {
    const md = '# Heading\n\nJust prose, no table here.\n';
    expect(parseGfmTable(md)).toBeNull();
  });

  it('pads ragged rows out to header width', () => {
    const md = [
      '| A | B | C |',
      '| - | - | - |',
      '| 1 | 2 |   |',
      '| 3 | 4 | 5 |',
    ].join('\n');
    const parsed = parseGfmTable(md);
    expect(parsed).not.toBeNull();
    expect(parsed.headers).toEqual(['A', 'B', 'C']);
    expect(parsed.rows).toEqual([
      ['1', '2', ''],
      ['3', '4', '5'],
    ]);
  });

  it('returns null for non-string input', () => {
    expect(parseGfmTable(null)).toBeNull();
    expect(parseGfmTable(undefined)).toBeNull();
    expect(parseGfmTable(42)).toBeNull();
  });
});

describe('sort by column (happy path)', () => {
  // Reproduce the comparator the TableBlock component uses, so we can verify
  // a 3-row sort A→Z by column 0 reorders correctly without rendering React
  // and dispatching button clicks.
  function sortRows(rows, col, dir) {
    const sign = dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = (a[col] ?? '').toString();
      const bv = (b[col] ?? '').toString();
      if (av < bv) return -1 * sign;
      if (av > bv) return 1 * sign;
      return 0;
    });
  }

  it('sorts rows ascending by column 0', () => {
    const rows = [
      ['Charlie', '3'],
      ['Alpha', '1'],
      ['Bravo', '2'],
    ];
    const sorted = sortRows(rows, 0, 'asc');
    expect(sorted.map((r) => r[0])).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts rows descending by column 1', () => {
    const rows = [
      ['Alpha', '1'],
      ['Bravo', '2'],
      ['Charlie', '3'],
    ];
    const sorted = sortRows(rows, 1, 'desc');
    expect(sorted.map((r) => r[1])).toEqual(['3', '2', '1']);
  });
});

describe('tableToCsv', () => {
  it('builds the expected CSV string from headers + rows', () => {
    const headers = ['Name', 'Age', 'City'];
    const rows = [
      ['Alice', '30', 'London'],
      ['Bob', '25', 'Berlin'],
    ];
    const csv = tableToCsv(headers, rows);
    // Compare to papaparse's own canonical output (CRLF separators) to make
    // the test resilient to platform line-ending differences.
    const expected = Papa.unparse({ fields: headers, data: rows });
    expect(csv).toBe(expected);
    // And spot-check the human-readable shape.
    expect(csv).toContain('Name,Age,City');
    expect(csv).toContain('Alice,30,London');
    expect(csv).toContain('Bob,25,Berlin');
  });

  it('quotes fields containing commas', () => {
    const headers = ['Title', 'Note'];
    const rows = [['Hello', 'one, two, three']];
    const csv = tableToCsv(headers, rows);
    expect(csv).toContain('"one, two, three"');
  });
});
