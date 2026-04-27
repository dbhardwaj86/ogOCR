import { useCallback, useRef, useState } from 'react';
import Papa from 'papaparse';

// Sprint 3.2 — markdown table → editable spreadsheet block.
//
// We parse a single fenced GFM table out of the surrounding markdown without
// adding a parser dependency. The shape we look for is the standard GFM table
// pattern:
//
//   | Header A | Header B |
//   | -------- | -------- |
//   | Cell 1   | Cell 2   |
//   | Cell 3   | Cell 4   |
//
// The separator row uses dashes (with optional alignment colons) and pipes;
// any line that begins with `|` and consists of only `|`, `-`, `:`, or
// whitespace counts. We accept a small amount of leading whitespace on each
// line and a trailing pipe (it's optional in GFM, though most generators
// emit it).
//
// Exported so the unit test can exercise the parser directly without
// rendering React.
const PIPE_LINE = /^\s*\|.*\|\s*$/;
const SEPARATOR = /^\s*\|?[\s|:-]+\|?\s*$/;

function splitRow(line) {
  // Strip a single leading and trailing pipe, then split on `|`.
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

// eslint-disable-next-line react-refresh/only-export-components
export function parseGfmTable(markdown) {
  if (typeof markdown !== 'string' || !markdown) return null;
  const lines = markdown.split(/\r?\n/);
  // Track ``` fence state so a pipe-table that lives *inside* a code block
  // doesn't get hijacked into the editable TableBlock — the user wanted the
  // fence to render verbatim.
  const isFence = (line) => /^\s*(`{3,}|~{3,})/.test(line);
  let inFence = false;
  for (let i = 0; i < lines.length - 1; i++) {
    if (isFence(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    const headerLine = lines[i];
    const sepLine = lines[i + 1];
    if (!PIPE_LINE.test(headerLine)) continue;
    if (!SEPARATOR.test(sepLine)) continue;
    // Confirm the separator actually contains at least one `-` (the SEPARATOR
    // regex permits all-pipe lines, which we don't want to count).
    if (!/-/.test(sepLine)) continue;

    const headers = splitRow(headerLine);
    const rows = [];
    for (let j = i + 2; j < lines.length; j++) {
      const row = lines[j];
      // A fence inside the table body terminates the table.
      if (isFence(row)) break;
      if (!PIPE_LINE.test(row)) break;
      // Stop if the row turns out to be another separator (rare but possible
      // in malformed input).
      if (SEPARATOR.test(row) && /-/.test(row)) break;
      const cells = splitRow(row);
      // Pad / truncate to header width so downstream code can rely on a
      // rectangular grid.
      while (cells.length < headers.length) cells.push('');
      if (cells.length > headers.length) cells.length = headers.length;
      rows.push(cells);
    }
    return { headers, rows };
  }
  return null;
}

// Pure helper — builds CSV via papaparse so the unit test can call it
// directly without rendering. Exported for testability.
// eslint-disable-next-line react-refresh/only-export-components
export function tableToCsv(headers, rows) {
  return Papa.unparse({ fields: headers, data: rows });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Some browsers require the anchor to be in the DOM for the download to
  // fire reliably.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has a moment to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Inline styles — `src/index.css` is owned by the design migration tracks
// and not in our writable list, so we ship the spreadsheet block's surface
// CSS alongside the component (same pattern as Track F's QueueRail).
const TABLEBLOCK_CSS = `
.og-tableblock { margin: 16px 0; }
.og-tableblock-toolbar {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-bottom: 8px;
  padding: 6px 8px;
  background: var(--bg-tint, rgba(0,0,0,0.04));
  border: 1px solid var(--rule-soft, rgba(0,0,0,0.08));
  border-radius: var(--r-tile, 8px);
}
.og-tableblock-spacer { flex: 1; }
.og-tableblock-btn {
  font-family: var(--mono, ui-monospace, monospace);
  font-size: 11px;
  text-transform: uppercase; letter-spacing: 0.05em;
  padding: 5px 10px;
  border: 1px solid var(--rule, rgba(0,0,0,0.15));
  background: var(--bg-card, #fff);
  color: var(--ink, #111);
  border-radius: var(--r-chip, 4px);
  cursor: pointer;
  transition: background var(--tx-fast, 0.14s) ease;
}
.og-tableblock-btn:hover { background: var(--bg-tint, rgba(0,0,0,0.06)); }
.og-tableblock-btn:focus-visible {
  outline: 2px solid var(--accent, #4f46e5);
  outline-offset: 1px;
}
.og-tableblock-scroll { overflow-x: auto; }
.og-tableblock-table th[contenteditable],
.og-tableblock-table td[contenteditable] {
  outline: none;
  cursor: text;
  min-width: 4em;
}
.og-tableblock-table th[contenteditable]:focus,
.og-tableblock-table td[contenteditable]:focus {
  background: var(--accent-soft, rgba(79,70,229,0.10));
  box-shadow: inset 0 0 0 1px var(--accent, #4f46e5);
}
`;

function TableBlock({ headers: headersIn, rows: rowsIn, onChange, filename }) {
  const [headers, setHeaders] = useState(() => Array.isArray(headersIn) ? [...headersIn] : []);
  const [rows, setRows] = useState(() =>
    Array.isArray(rowsIn) ? rowsIn.map((r) => [...r]) : []
  );
  // Track the most recently focused column so Sort A→Z / Z→A know which
  // column to operate on.
  const [activeCol, setActiveCol] = useState(0);
  const baseName = filename || 'table';

  // We use uncontrolled contentEditable cells (writing a controlled value
  // into a contentEditable resets the caret on every keystroke). We only
  // read DOM text on blur and reconcile to React state.
  const cellRefs = useRef({});

  const fire = useCallback((nextHeaders, nextRows) => {
    if (typeof onChange === 'function') {
      onChange({ headers: nextHeaders, rows: nextRows });
    }
  }, [onChange]);

  // State updaters compute the next value from current state and call setters
  // and `fire()` sequentially. Calling `fire()` inside a functional updater
  // makes it a side-effecting (impure) updater, which React 18 Strict Mode
  // double-invokes — that would dispatch `onChange` twice per user action.
  const commitHeader = (col, value) => {
    if (headers[col] === value) return;
    const next = [...headers];
    next[col] = value;
    setHeaders(next);
    fire(next, rows);
  };

  const commitCell = (row, col, value) => {
    if (rows[row]?.[col] === value) return;
    const next = rows.map((r, i) => (i === row ? [...r] : r));
    if (!next[row]) next[row] = headers.map(() => '');
    next[row][col] = value;
    setRows(next);
    fire(headers, next);
  };

  const sortBy = (col, dir) => {
    const sign = dir === 'desc' ? -1 : 1;
    const next = [...rows].sort((a, b) => {
      const av = (a[col] ?? '').toString();
      const bv = (b[col] ?? '').toString();
      if (av < bv) return -1 * sign;
      if (av > bv) return 1 * sign;
      return 0;
    });
    setRows(next);
    fire(headers, next);
  };

  const addRow = () => {
    const blank = headers.map(() => '');
    const next = [...rows, blank];
    setRows(next);
    fire(headers, next);
  };

  const addCol = () => {
    const nextHeaders = [...headers, `Column ${headers.length + 1}`];
    const nextRows = rows.map((r) => [...r, '']);
    setHeaders(nextHeaders);
    setRows(nextRows);
    fire(nextHeaders, nextRows);
  };

  const exportCsv = () => {
    const csv = tableToCsv(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `${baseName}.csv`);
  };

  const exportXlsx = async () => {
    // Lazy-load exceljs only on the click path so the heavy writer stays out of
    // the main bundle. Vite splits the dynamic import into its own chunk.
    const mod = await import('exceljs');
    const Workbook = mod.Workbook || mod.default?.Workbook;
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(headers);
    rows.forEach((row) => sheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, `${baseName}.xlsx`);
  };

  return (
    <div className="og-tableblock">
      <style>{TABLEBLOCK_CSS}</style>
      <div className="og-tableblock-toolbar" role="toolbar" aria-label="Table actions">
        <button type="button" className="og-tableblock-btn" onClick={() => sortBy(activeCol, 'asc')}>
          Sort A→Z
        </button>
        <button type="button" className="og-tableblock-btn" onClick={() => sortBy(activeCol, 'desc')}>
          Sort Z→A
        </button>
        <button type="button" className="og-tableblock-btn" onClick={addRow}>
          Add row
        </button>
        <button type="button" className="og-tableblock-btn" onClick={addCol}>
          Add col
        </button>
        <span className="og-tableblock-spacer" />
        <button type="button" className="og-tableblock-btn" onClick={exportCsv}>
          Export CSV
        </button>
        <button type="button" className="og-tableblock-btn" onClick={exportXlsx}>
          Export XLSX
        </button>
      </div>
      <div className="og-tableblock-scroll">
        <table className="og-table og-tableblock-table">
          <thead>
            <tr>
              {headers.map((h, col) => (
                <th
                  key={`h-${col}`}
                  scope="col"
                  ref={(el) => { cellRefs.current[`h-${col}`] = el; }}
                  contentEditable
                  suppressContentEditableWarning
                  onFocus={() => setActiveCol(col)}
                  onBlur={(e) => commitHeader(col, e.currentTarget.textContent || '')}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={`r-${r}`}>
                {headers.map((_, c) => (
                  <td
                    key={`c-${r}-${c}`}
                    ref={(el) => { cellRefs.current[`c-${r}-${c}`] = el; }}
                    contentEditable
                    suppressContentEditableWarning
                    onFocus={() => setActiveCol(c)}
                    onBlur={(e) => commitCell(r, c, e.currentTarget.textContent || '')}
                  >
                    {row[c] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TableBlock;
