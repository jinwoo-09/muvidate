/**
 * Worker upload utility for MuviDate
 * Uses the exact provided Worker API for profile picture, voice note, and movie uploads.
 */

const WORKER_URL = "https://fileup.mohankumarr7175.workers.dev/";

export interface WorkerFileResult {
  filename: string;
  url: string;
  size: number;
  hash: string;
  dupe: boolean;
}

export interface WorkerResponse {
  success: boolean;
  files: WorkerFileResult[];
  error?: string;
}

export async function uploadFileToWorker(
  file: File | Blob,
  fileName?: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const finalName = fileName || (file instanceof File ? file.name : "upload.bin");
  const formData = new FormData();
  formData.append("files[]", file, finalName);

  if (onProgress) {
    onProgress(15);
  }

  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      Accept: "application/json"
    },
    body: formData
  });

  if (onProgress) {
    onProgress(75);
  }

  if (!response.ok) {
    throw new Error(`Upload server returned HTTP ${response.status}`);
  }

  const result: WorkerResponse = await response.json();

  if (!result.success || !result.files || result.files.length === 0) {
    throw new Error(result.error || "File upload failed: No file URL returned by Worker API.");
  }

  if (onProgress) {
    onProgress(100);
  }

  return result.files[0].url;
}
