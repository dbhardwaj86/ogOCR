const PDF_MIME = 'application/pdf';
const FILE_PROCESSING_STATES = new Set(['PROCESSING', 'STATE_UNSPECIFIED']);
const GEMINI_FILE_POLL_INTERVAL_MS = 750;
const GEMINI_FILE_PROCESSING_TIMEOUT_MS = 180_000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function displayNameForUpload(file) {
  const raw = file?.originalname || file?.name || 'document';
  const cleaned = String(raw)
    .replace(/[/\\]/g, '')
    .split('\x00').join('')
    .trim()
    .slice(0, 255);
  return cleaned || 'document.pdf';
}

export function shouldUseGeminiFileApi(file) {
  return file?.mimetype === PDF_MIME;
}

export function buildInlineUploadPart(file) {
  return {
    inlineData: {
      data: file.buffer.toString('base64'),
      mimeType: file.mimetype,
    },
  };
}

function buildFileUploadPart(file) {
  return {
    fileData: {
      fileUri: file.uri,
      mimeType: file.mimeType,
    },
  };
}

export async function waitForGeminiFileActive(fileManager, file, options = {}) {
  const {
    now = () => Date.now(),
    sleep: sleepFn = sleep,
    pollIntervalMs = GEMINI_FILE_POLL_INTERVAL_MS,
    timeoutMs = GEMINI_FILE_PROCESSING_TIMEOUT_MS,
  } = options;
  const deadline = now() + timeoutMs;
  let current = file;

  while (FILE_PROCESSING_STATES.has(current?.state)) {
    if (now() >= deadline) {
      throw new Error(`Gemini file processing timed out for ${current?.name || 'uploaded PDF'}.`);
    }
    await sleepFn(pollIntervalMs);
    current = await fileManager.getFile(current.name);
  }

  if (current?.state === 'FAILED') {
    const reason = current.error?.message ? ` ${current.error.message}` : '';
    throw new Error(`Gemini file processing failed for ${current.name}.${reason}`);
  }
  if (current?.state !== 'ACTIVE') {
    throw new Error(`Gemini file is not active: ${current?.state || 'unknown state'}.`);
  }
  if (!current.uri || !current.mimeType) {
    throw new Error('Gemini file response did not include a usable URI.');
  }

  return current;
}

export async function buildGeminiUploadParts(file, options = {}) {
  const { fileManager, waitOptions } = options;

  if (!shouldUseGeminiFileApi(file)) {
    return {
      parts: [buildInlineUploadPart(file)],
      uploadedFileName: null,
    };
  }
  if (!fileManager?.uploadFile) {
    throw new Error('Gemini file manager is required for PDF uploads.');
  }

  const uploaded = await fileManager.uploadFile(file.buffer, {
    displayName: displayNameForUpload(file),
    mimeType: file.mimetype,
  });
  const activeFile = await waitForGeminiFileActive(fileManager, uploaded.file, waitOptions);

  return {
    parts: [buildFileUploadPart(activeFile)],
    uploadedFileName: activeFile.name,
  };
}

export async function cleanupGeminiUpload(fileManager, uploadedFileName) {
  if (!uploadedFileName || !fileManager?.deleteFile) return;
  try {
    await fileManager.deleteFile(uploadedFileName);
  } catch (error) {
    console.warn(`Gemini file cleanup failed for ${uploadedFileName}:`, error?.message || error);
  }
}
