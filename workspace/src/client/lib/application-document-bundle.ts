import { getCoverLetterPdfDocumentForJob } from "@/client/lib/cover-letter-pdf";
import { getCvPdfDocumentForJob } from "@/client/lib/cv-pdf";
import {
  type DownloadableDocument,
  triggerDownload,
} from "@/client/lib/file-download";

type WritableFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type WritableDirectoryHandle = {
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<WritableFileHandle>;
};

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: string;
  }) => Promise<WritableDirectoryHandle>;
};

async function writeDocumentToDirectory(
  directoryHandle: WritableDirectoryHandle,
  document: DownloadableDocument,
): Promise<void> {
  const fileHandle = await directoryHandle.getFileHandle(document.fileName, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(document.blob);
  await writable.close();
}

export async function saveApplicationDocumentsWithPrompt(jobId: string): Promise<{
  fileNames: string[];
  method: "browser-download" | "directory-picker";
}> {
  const documents = await Promise.all([
    getCvPdfDocumentForJob(jobId),
    getCoverLetterPdfDocumentForJob(jobId),
  ]);

  const showDirectoryPicker = (window as WindowWithDirectoryPicker)
    .showDirectoryPicker;

  if (showDirectoryPicker) {
    const directoryHandle = await showDirectoryPicker({
      id: "jobops-application-documents",
      mode: "readwrite",
    });

    for (const document of documents) {
      await writeDocumentToDirectory(directoryHandle, document);
    }

    return {
      fileNames: documents.map((document) => document.fileName),
      method: "directory-picker",
    };
  }

  for (const document of documents) {
    triggerDownload(document.blob, document.fileName);
  }

  return {
    fileNames: documents.map((document) => document.fileName),
    method: "browser-download",
  };
}
