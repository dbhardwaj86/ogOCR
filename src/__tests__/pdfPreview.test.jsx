import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import SourcePreview from '../components/SourcePreview';
import UploadConfirmModal from '../components/UploadConfirmModal';

// Track the worker URL set by the components and capture which mocked PDF
// document instance was loaded. The mocked module is hoisted by vi.mock.
const mockWorkerOptions = { workerSrc: null };
const renderSpy = vi.fn(() => ({ promise: Promise.resolve() }));
const getDocumentSpy = vi.fn(() => ({
  promise: Promise.resolve({
    getPage: () =>
      Promise.resolve({
        getViewport: () => ({ width: 120, height: 160 }),
        render: renderSpy,
      }),
  }),
}));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: mockWorkerOptions,
  getDocument: getDocumentSpy,
}));

vi.mock('pdfjs-dist/build/pdf.worker.mjs?url', () => ({
  default: 'blob:mock-worker-url',
}));

// jsdom doesn't implement HTMLCanvasElement.toDataURL meaningfully; stub it.
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,MOCK');
  mockWorkerOptions.workerSrc = null;
  getDocumentSpy.mockClear();
  renderSpy.mockClear();
});

function makePdfFile() {
  const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'sample.pdf', {
    type: 'application/pdf',
  });
  // arrayBuffer is not always implemented by jsdom's File polyfill.
  if (!file.arrayBuffer) {
    file.arrayBuffer = () => Promise.resolve(new ArrayBuffer(4));
  }
  return file;
}

describe('PDF preview rendering', () => {
  it('renders page 1 of a PDF as an <img> in SourcePreview', async () => {
    const file = makePdfFile();
    const { container } = render(<SourcePreview file={file} />);
    await waitFor(() => {
      const imgs = container.querySelectorAll('img.og-doc-image');
      const pdfImg = Array.from(imgs).find(
        (i) => i.getAttribute('src') === 'data:image/png;base64,MOCK',
      );
      expect(pdfImg).toBeTruthy();
    });
    expect(getDocumentSpy).toHaveBeenCalled();
    expect(mockWorkerOptions.workerSrc).toBe('blob:mock-worker-url');
    cleanup();
  });

  it('renders page 1 thumbnail in UploadConfirmModal for a PDF', async () => {
    const file = makePdfFile();
    const { container } = render(
      <UploadConfirmModal file={file} onConfirm={() => {}} onCancel={() => {}} />,
    );
    await waitFor(() => {
      const img = container.querySelector('.og-upload-confirm-preview img');
      expect(img).not.toBeNull();
      expect(img.getAttribute('src')).toBe('data:image/png;base64,MOCK');
    });
    cleanup();
  });
});
