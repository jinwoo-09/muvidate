import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Google's official public JWKS endpoint for Firebase Authentication
const GOOGLE_FIREBASE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
);

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

function getFirebaseJWKS() {
  if (!cachedJWKS) {
    cachedJWKS = createRemoteJWKSet(GOOGLE_FIREBASE_JWKS_URL, {
      cacheMaxAge: 10 * 60 * 1000, // 10 minutes cache
      cooldownDuration: 30 * 1000, // 30 seconds cooldown
    });
  }
  return cachedJWKS;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  [key: string]: any;
}

/**
 * Verifies a Firebase ID token cryptographically using pure ESM `jose` against Google's public JWKS.
 * This completely avoids the CommonJS `jwks-rsa` / `ERR_REQUIRE_ESM` incompatibility while
 * strictly enforcing Google's Firebase ID token authentication specifications.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    "movie-date-1";

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const jwks = getFirebaseJWKS();

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: expectedIssuer,
    audience: projectId,
    algorithms: ['RS256'],
    clockTolerance: 10, // 10 seconds leeway
  });

  const uid = payload.sub;
  if (!uid || typeof uid !== 'string') {
    throw new Error('Unauthorized: Firebase ID token has invalid or missing "sub" (uid) claim.');
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.auth_time === 'number' && payload.auth_time > nowInSeconds + 300) {
    throw new Error('Unauthorized: Firebase ID token auth_time is in the future.');
  }

  return {
    uid,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    email_verified: Boolean(payload.email_verified),
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    ...payload,
  };
}

function extractBearerToken(req: any): string | null {
  let authHeader = "";
  if (req && req.headers) {
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
  // If called in a Web standard Request/Response environment (Vercel Edge or Web fetch)
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

    // For token generation from the client, strictly enforce authenticated Firebase user session
    let decodedUser: VerifiedFirebaseUser | null = null;
    if (bodyObj.type === "blob.generate-client-token") {
      const idToken = extractBearerToken(req);
      if (!idToken) {
        return res.status(401).json({
          error: "Unauthorized: Missing Authorization Bearer token.",
        });
      }

      try {
        decodedUser = await verifyFirebaseIdToken(idToken);
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

        // Restrict path strictly to voice notes
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

    let decodedUser: VerifiedFirebaseUser | null = null;
    if (bodyObj.type === "blob.generate-client-token") {
      const idToken = extractBearerToken(request);
      if (!idToken) {
        return Response.json(
          { error: "Unauthorized: Missing Authorization Bearer token." },
          { status: 401 }
        );
      }

      try {
        decodedUser = await verifyFirebaseIdToken(idToken);
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
