import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

// Initialize Firebase Admin singleton for server-side ID token verification
function getFirebaseAdmin(): App {
  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    return existingApps[0];
  }

  const projectId = 
    process.env.FIREBASE_PROJECT_ID || 
    process.env.VITE_FIREBASE_PROJECT_ID || 
    "movie-date-1";

  // Check for service account JSON or individual credentials if provided in Vercel env
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      return initializeApp({
        credential: cert(creds),
        projectId: creds.project_id || projectId,
      });
    } catch (e) {
      console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to projectId:", e);
    }
  }

  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    try {
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        projectId,
      });
    } catch (e) {
      console.warn("Failed to init with FIREBASE_CLIENT_EMAIL/PRIVATE_KEY:", e);
    }
  }

  // Fallback: Initialize with projectId. Firebase Admin verifies Google-issued ID tokens
  // against Google's public certificates.
  return initializeApp({
    projectId,
  });
}

function extractBearerToken(req: any): string | null {
  let authHeader = "";
  if (req.headers) {
    if (typeof req.headers.get === "function") {
      authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    } else {
      authHeader = req.headers.authorization || req.headers.Authorization || "";
    }
  }
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

/**
 * Node.js / Express / Vercel Serverless Function handler
 */
export default async function handler(req: any, res?: any) {
  // If called in a Web standard Request/Response environment
  if (req instanceof Request || (req.headers && typeof req.headers.get === "function" && !res)) {
    return handleWebRequest(req);
  }

  // Node.js / Express handling
  if (req.method !== "POST") {
    res.setHeader?.("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error("BLOB_READ_WRITE_TOKEN is missing in environment variables.");
    return res.status(500).json({
      error: "Vercel Blob storage is not configured. BLOB_READ_WRITE_TOKEN is missing.",
    });
  }

  try {
    let body = req.body;
    if (!body) {
      // Buffer raw body if not parsed by middleware
      const buffers: Buffer[] = [];
      for await (const chunk of req) {
        buffers.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const raw = Buffer.concat(buffers).toString("utf-8");
      body = raw ? JSON.parse(raw) : {};
    } else if (typeof body === "string") {
      body = JSON.parse(body);
    }

    const bodyObj = body as HandleUploadBody;

    // For token generation from the client, strictly enforce authenticated user session
    let decodedUser: DecodedIdToken | null = null;
    if (bodyObj.type === "blob.generate-client-token") {
      const idToken = extractBearerToken(req);
      if (!idToken) {
        return res.status(401).json({
          error: "Unauthorized: Missing Authorization Bearer token.",
        });
      }

      try {
        const adminApp = getFirebaseAdmin();
        decodedUser = await getAuth(adminApp).verifyIdToken(idToken);
        if (!decodedUser || !decodedUser.uid) {
          return res.status(401).json({
            error: "Unauthorized: Invalid Firebase session.",
          });
        }
      } catch (authError: any) {
        console.error("Firebase ID token verification failed:", authError);
        return res.status(401).json({
          error: `Unauthorized: Authentication failed (${authError.message || "Invalid token"}).`,
        });
      }
    }

    const jsonResponse = await handleUpload({
      body: bodyObj,
      request: req,
      token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Enforce valid user session
        if (!decodedUser) {
          throw new Error("Unauthorized: User not authenticated.");
        }

        // Restrict path to voice notes
        if (!pathname || (!pathname.startsWith("voice-notes/") && !pathname.startsWith("voice_"))) {
          throw new Error("Invalid pathname: Only voice notes are permitted at this endpoint.");
        }

        return {
          allowedContentTypes: [
            "audio/webm",
            "audio/webm;codecs=opus",
            "audio/ogg",
            "audio/ogg;codecs=opus",
            "audio/mp4",
            "audio/wav",
            "audio/wave",
            "audio/x-wav",
            "audio/mpeg",
            "audio/mp3",
            "audio/aac",
            "audio/x-m4a",
          ],
          maximumSizeInBytes: 15 * 1024 * 1024, // 15MB limit
          addRandomSuffix: true, // Prevents unauthorized overwrites
          allowOverwrite: false,
          tokenPayload: JSON.stringify({
            uid: decodedUser.uid,
            email: decodedUser.email || "",
            clientPayload: clientPayload || null,
            timestamp: Date.now(),
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("Vercel Blob upload completed successfully:", blob.url, tokenPayload);
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (err: any) {
    console.error("Vercel Blob handleUpload error:", err);
    return res.status(400).json({ error: err.message || "Failed to process upload." });
  }
}

/**
 * Web standard Request handler (Edge / Web API compatible)
 */
async function handleWebRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed. Use POST." }, { status: 405 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return Response.json(
      { error: "Vercel Blob storage is not configured. BLOB_READ_WRITE_TOKEN is missing." },
      { status: 500 }
    );
  }

  try {
    const bodyObj = (await request.json()) as HandleUploadBody;

    let decodedUser: DecodedIdToken | null = null;
    if (bodyObj.type === "blob.generate-client-token") {
      const idToken = extractBearerToken(request);
      if (!idToken) {
        return Response.json(
          { error: "Unauthorized: Missing Authorization Bearer token." },
          { status: 401 }
        );
      }

      try {
        const adminApp = getFirebaseAdmin();
        decodedUser = await getAuth(adminApp).verifyIdToken(idToken);
        if (!decodedUser || !decodedUser.uid) {
          return Response.json(
            { error: "Unauthorized: Invalid Firebase session." },
            { status: 401 }
          );
        }
      } catch (authError: any) {
        return Response.json(
          { error: `Unauthorized: Authentication failed (${authError.message || "Invalid token"}).` },
          { status: 401 }
        );
      }
    }

    const jsonResponse = await handleUpload({
      body: bodyObj,
      request,
      token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!decodedUser) {
          throw new Error("Unauthorized: User not authenticated.");
        }

        if (!pathname || (!pathname.startsWith("voice-notes/") && !pathname.startsWith("voice_"))) {
          throw new Error("Invalid pathname: Only voice notes are permitted at this endpoint.");
        }

        return {
          allowedContentTypes: [
            "audio/webm",
            "audio/webm;codecs=opus",
            "audio/ogg",
            "audio/ogg;codecs=opus",
            "audio/mp4",
            "audio/wav",
            "audio/wave",
            "audio/x-wav",
            "audio/mpeg",
            "audio/mp3",
            "audio/aac",
            "audio/x-m4a",
          ],
          maximumSizeInBytes: 15 * 1024 * 1024,
          addRandomSuffix: true,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({
            uid: decodedUser.uid,
            email: decodedUser.email || "",
            clientPayload: clientPayload || null,
            timestamp: Date.now(),
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("Vercel Blob upload completed successfully:", blob.url, tokenPayload);
      },
    });

    return Response.json(jsonResponse);
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Failed to process upload." },
      { status: 400 }
    );
  }
}

export { handler as POST };
