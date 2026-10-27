import { list, del } from '@vercel/blob';

// Expiration time window: 24 hours in milliseconds
const VOICE_NOTE_EXPIRATION_MS = 24 * 60 * 60 * 1000;

interface CleanupResult {
  status: 'ok' | 'error';
  timestamp: string;
  scannedBlobs: number;
  expiredBlobsFound: number;
  deletedBlobsCount: number;
  updatedMessagesCount: number;
  errors: Array<{ url?: string; error: string }>;
}

/**
 * Validates request authorization using CRON_SECRET.
 * Vercel automatically passes `Authorization: Bearer <CRON_SECRET>` when invoking scheduled cron jobs.
 */
function isAuthorized(req: any): boolean {
  const cronSecret = process.env.CRON_SECRET;
  
  // If CRON_SECRET is not configured in development, allow execution
  if (!cronSecret) {
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }
    // In production, require secret configuration to prevent unauthorized invocations
    return false;
  }

  // Check Authorization Bearer header
  let authHeader = '';
  if (req && req.headers) {
    if (typeof req.headers.get === 'function') {
      authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    } else {
      authHeader = req.headers.authorization || req.headers.Authorization || '';
    }
  }

  if (authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === cronSecret) {
    return true;
  }

  // Also check query parameters (?key= or ?secret=)
  try {
    const rawUrl = req.url || '';
    const parsed = new URL(rawUrl, 'http://localhost');
    const queryKey = parsed.searchParams.get('key') || parsed.searchParams.get('secret');
    if (queryKey === cronSecret) {
      return true;
    }
  } catch {
    // Ignore URL parse failures
  }

  return false;
}

/**
 * Core cleanup engine:
 * 1. Safely lists voice-note blobs with pagination using prefix 'voice-notes/'.
 * 2. Identifies blobs older than 24 hours based on upload timestamp or filename metadata.
 * 3. Permanently deletes expired blobs from Vercel Blob storage.
 * 4. Cleans up Firebase Realtime Database chat references for expired voice notes.
 */
export async function performVoiceNoteCleanup(): Promise<CleanupResult> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    throw new Error('BLOB_READ_WRITE_TOKEN is missing in environment variables.');
  }

  const now = Date.now();
  let cursor: string | undefined = undefined;
  let hasMore = true;
  let scannedBlobs = 0;
  const expiredBlobUrls: string[] = [];
  const errors: Array<{ url?: string; error: string }> = [];

  // Step 1: Paginate through all voice-note blobs
  while (hasMore) {
    try {
      const listResponse: Awaited<ReturnType<typeof list>> = await list({
        prefix: 'voice-notes/',
        limit: 100,
        cursor,
        token: blobToken,
      });

      for (const blob of listResponse.blobs) {
        // Strict guard: only process voice-notes path
        if (!blob.pathname.startsWith('voice-notes/')) {
          continue;
        }

        scannedBlobs++;

        // Determine timestamp: prefer blob.uploadedAt, fallback to embedded filename timestamp
        let effectiveTime: number | null = null;
        if (blob.uploadedAt) {
          const parsedTime = new Date(blob.uploadedAt).getTime();
          if (!isNaN(parsedTime)) {
            effectiveTime = parsedTime;
          }
        }

        if (!effectiveTime) {
          const match = blob.pathname.match(/voice_(\d+)_/);
          if (match && match[1]) {
            effectiveTime = parseInt(match[1], 10);
          }
        }

        // Check if 24 hours have elapsed
        if (effectiveTime && (now - effectiveTime >= VOICE_NOTE_EXPIRATION_MS)) {
          expiredBlobUrls.push(blob.url);
        }
      }

      hasMore = listResponse.hasMore;
      cursor = listResponse.cursor;
    } catch (listErr: any) {
      console.error('Error listing voice-note blobs from Vercel Blob:', listErr);
      errors.push({ error: `List error: ${listErr.message || 'Failed to list blobs'}` });
      break;
    }
  }

  // Step 2: Permanently delete expired blobs from Vercel Blob storage
  let deletedBlobsCount = 0;
  if (expiredBlobUrls.length > 0) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < expiredBlobUrls.length; i += BATCH_SIZE) {
      const batch = expiredBlobUrls.slice(i, i + BATCH_SIZE);
      try {
        await del(batch, { token: blobToken });
        deletedBlobsCount += batch.length;
      } catch (batchErr: any) {
        console.warn(`Batch delete failed, retrying items individually:`, batchErr);
        // Fallback to individual deletions to maximize cleanup success
        for (const singleUrl of batch) {
          try {
            await del(singleUrl, { token: blobToken });
            deletedBlobsCount++;
          } catch (singleErr: any) {
            errors.push({ url: singleUrl, error: singleErr.message || 'Failed to delete blob' });
          }
        }
      }
    }
  }

  // Step 3: Clean up expired voice-note references in Firebase Realtime Database
  let updatedMessagesCount = 0;
  const dbUrl = (
    process.env.FIREBASE_DATABASE_URL ||
    process.env.VITE_FIREBASE_DATABASE_URL ||
    'https://movie-date-1-default-rtdb.asia-southeast1.firebasedatabase.app'
  ).replace(/\/$/, '');

  try {
    const roomsRes = await fetch(`${dbUrl}/rooms.json?shallow=true`);
    if (roomsRes.ok) {
      const roomsData = await roomsRes.json();
      if (roomsData && typeof roomsData === 'object') {
        const roomCodes = Object.keys(roomsData);

        for (const roomCode of roomCodes) {
          try {
            const chatRes = await fetch(`${dbUrl}/rooms/${roomCode}/chat.json`);
            if (!chatRes.ok) continue;

            const chatData = await chatRes.json();
            if (!chatData || typeof chatData !== 'object') continue;

            for (const [msgKey, msg] of Object.entries<any>(chatData)) {
              if (msg && msg.type === 'voice' && !msg.isExpired) {
                const isOver24Hours = typeof msg.createdAt === 'number' && (now - msg.createdAt >= VOICE_NOTE_EXPIRATION_MS);
                const isUrlExpired = msg.audioUrl && expiredBlobUrls.includes(msg.audioUrl);

                if (isOver24Hours || isUrlExpired) {
                  // Idempotently mark message as expired and clear playable audio URL
                  const patchRes = await fetch(`${dbUrl}/rooms/${roomCode}/chat/${msgKey}.json`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      isExpired: true,
                      audioUrl: null,
                      expiredAt: now,
                    }),
                  });

                  if (patchRes.ok) {
                    updatedMessagesCount++;
                  }
                }
              }
            }
          } catch (roomScanErr: any) {
            console.warn(`Error scanning chat for room ${roomCode}:`, roomScanErr);
          }
        }
      }
    }
  } catch (dbErr: any) {
    console.error('Error during database chat cleanup:', dbErr);
    errors.push({ error: `Database cleanup error: ${dbErr.message || 'RTDB scan failed'}` });
  }

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    scannedBlobs,
    expiredBlobsFound: expiredBlobUrls.length,
    deletedBlobsCount,
    updatedMessagesCount,
    errors,
  };
}

/**
 * Node.js / Express / Vercel Serverless Function entry point
 */
export default async function handler(req: any, res?: any) {
  // Web Standard Request/Response handling
  if (req instanceof Request || (req.headers && typeof req.headers.get === 'function' && !res)) {
    return handleWebRequest(req);
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing CRON_SECRET.' });
  }

  try {
    const result = await performVoiceNoteCleanup();
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Voice note cleanup job error:', err);
    return res.status(500).json({ error: err.message || 'Cleanup job failed.' });
  }
}

/**
 * Web standard Request handler (Vercel Edge / standard fetch)
 */
async function handleWebRequest(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized: Invalid or missing CRON_SECRET.' }, { status: 401 });
  }

  try {
    const result = await performVoiceNoteCleanup();
    return Response.json(result);
  } catch (err: any) {
    return Response.json({ error: err.message || 'Cleanup job failed.' }, { status: 500 });
  }
}

export { handler as GET, handler as POST };
