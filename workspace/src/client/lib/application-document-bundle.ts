import { zipSync } from "fflate";
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

function buildBundleFileName(documents: DownloadableDocument[]): string {
  const sharedPrefix = documents[0]?.fileName
    ?.replace(/_(CV|Cover_Letter)_.+$/i, "")
    .trim();
  const safePrefix = sharedPrefix || "Application";
  return `${safePrefix}_CV_And_Cover_Letter.zip`;
}

async function createZipBundle(
  documents: DownloadableDocument[],
): Promise<DownloadableDocument> {
  const entries = await Promise.all(
    documents.map(async (document) => [
      document.fileName,
      new Uint8Array(await document.blob.arrayBuffer()),
    ] as const),
  );

  const archive = zipSync(Object.fromEntries(entries), {
    level: 0,
  });

  const archiveBytes = new Uint8Array(archive.byteLength);
  archiveBytes.set(archive);

  return {
    blob: new Blob([archiveBytes], { type: "application/zip" }),
    fileName: buildBundleFileName(documents),
  };
}

export async function saveApplicationDocumentsWithPrompt(jobId: string): Promise<{
  fileNames: string[];
  method: "zip-download" | "directory-picker";
}> {
  const showDirectoryPicker = (window as WindowWithDirectoryPicker)
    .showDirectoryPicker;

  if (showDirectoryPicker) {
    const directoryHandle = await showDirectoryPicker({
      id: "jobops-application-documents",
      mode: "readwrite",
    });

    const documents = await Promise.all([
      getCvPdfDocumentForJob(jobId),
      getCoverLetterPdfDocumentForJob(jobId),
    ]);

    for (const document of documents) {
      await writeDocumentToDirectory(directoryHandle, document);
    }

    return {
      fileNames: documents.map((document) => document.fileName),
      method: "directory-picker",
    };
  }

  const documents = await Promise.all([
    getCvPdfDocumentForJob(jobId),
    getCoverLetterPdfDocumentForJob(jobId),
  ]);
  const zipBundle = await createZipBundle(documents);
  triggerDownload(zipBundle.blob, zipBundle.fileName);

  return {
    fileNames: [zipBundle.fileName],
    method: "zip-download",
  };
}
