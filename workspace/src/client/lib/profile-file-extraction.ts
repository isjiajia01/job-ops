import ProfileFileExtractWorker from "@/client/workers/profile-file-extract.worker?worker";

type ExtractedFileResult = {
  name: string;
  text: string | null;
};

type WorkerResponse = {
  id: string;
  results?: ExtractedFileResult[];
  error?: string;
};

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new ProfileFileExtractWorker();
  }
  return worker;
}

export async function extractTextFromFiles(files: File[]): Promise<{
  extractedParts: string[];
  skippedCount: number;
}> {
  if (files.length === 0) {
    return { extractedParts: [], skippedCount: 0 };
  }

  const payload = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type,
      buffer: await file.arrayBuffer(),
    })),
  );

  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const activeWorker = getWorker();

    const cleanup = () => {
      activeWorker.removeEventListener("message", handleMessage);
      activeWorker.removeEventListener("error", handleError);
    };

    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return;
      cleanup();

      if (event.data.error) {
        reject(new Error(event.data.error));
        return;
      }

      const results = event.data.results ?? [];
      const extractedParts = results
        .map((result) => result.text)
        .filter((part): part is string => Boolean(part));
      resolve({
        extractedParts,
        skippedCount: results.length - extractedParts.length,
      });
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Failed to start file extraction worker"));
    };

    activeWorker.addEventListener("message", handleMessage);
    activeWorker.addEventListener("error", handleError);
    activeWorker.postMessage({ id, files: payload });
  });
}
