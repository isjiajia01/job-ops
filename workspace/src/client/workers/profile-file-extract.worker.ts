type WorkerInputFile = {
  name: string;
  type: string;
  buffer: ArrayBuffer;
};

type ExtractRequest = {
  id: string;
  files: WorkerInputFile[];
};

type ExtractedFileResult = {
  name: string;
  text: string | null;
};

type ExtractResponse = {
  id: string;
  results?: ExtractedFileResult[];
  error?: string;
};

function wrapFileContent(name: string, text: string): string {
  return text.trim()
    ? `# File: ${name}\n\n${text.trim()}`
    : `# File: ${name}\n\n[Empty file]`;
}

async function extractPdfText(file: WorkerInputFile): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: file.buffer });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) pages.push(pageText);
  }

  return pages.join("\n\n").trim();
}

async function extractDocxText(file: WorkerInputFile): Promise<string> {
  const mammoth = await import("mammoth-browser");
  const result = await mammoth.extractRawText({ arrayBuffer: file.buffer });
  return result.value.trim();
}

async function extractFile(file: WorkerInputFile): Promise<ExtractedFileResult> {
  const lowerName = file.name.toLowerCase();

  if (
    file.type.startsWith("text/") ||
    /\.(md|txt|json|csv|tsv|tex|yaml|yml)$/i.test(file.name)
  ) {
    const text = new TextDecoder().decode(file.buffer).trim();
    return {
      name: file.name,
      text: wrapFileContent(file.name, text),
    };
  }

  if (lowerName.endsWith(".docx")) {
    const text = await extractDocxText(file);
    return {
      name: file.name,
      text: text
        ? wrapFileContent(file.name, text)
        : `# File: ${file.name}\n\n[No extractable DOCX text found]`,
    };
  }

  if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
    const text = await extractPdfText(file);
    return {
      name: file.name,
      text: text
        ? wrapFileContent(file.name, text)
        : `# File: ${file.name}\n\n[No extractable PDF text found]`,
    };
  }

  return {
    name: file.name,
    text: null,
  };
}

self.onmessage = async (event: MessageEvent<ExtractRequest>) => {
  const { id, files } = event.data;

  try {
    const results = await Promise.all(files.map((file) => extractFile(file)));
    const response: ExtractResponse = { id, results };
    self.postMessage(response);
  } catch (error) {
    const response: ExtractResponse = {
      id,
      error: error instanceof Error ? error.message : "Failed to extract file text",
    };
    self.postMessage(response);
  }
};
