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

export function uploadFileToWorker(
  file: File | Blob,
  fileName?: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const finalName = fileName || (file instanceof File ? file.name : "upload.bin");
    const formData = new FormData();
    formData.append("files[]", file, finalName);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", WORKER_URL, true);
    xhr.setRequestHeader("Accept", "application/json");

    if (onProgress) {
      onProgress(0);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result: WorkerResponse = JSON.parse(xhr.responseText);
          if (!result?.success || !result?.files || result.files.length === 0 || !result.files[0]?.url) {
            reject(new Error(result?.error || "File upload failed: No file URL returned by Worker API."));
            return;
          }
          if (onProgress) {
            onProgress(100);
          }
          resolve(result.files[0].url);
        } catch (err: any) {
          reject(new Error("Invalid response received from upload server."));
        }
      } else {
        reject(new Error(`Upload server returned HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network connection error during file upload. Please try again."));
    };

    xhr.ontimeout = () => {
      reject(new Error("File upload timed out. Please try again."));
    };

    xhr.send(formData);
  });
}
