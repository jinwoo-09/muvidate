import type { Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

// File size limit: 15MB
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const KEY_CACHE_FILE = path.join(process.cwd(), '.anondrop-key.json');

// Memory cache for user key to prevent re-registering on every upload
let cachedUserKey: string | null = null;

// Multer memory storage configuration
const storage = multer.memoryStorage();
export const anondropUploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

/**
 * Retrieves the AnonDrop user key.
 * 1. Checks environment variable ANONDROP_USER_KEY or ANONDROP_KEY.
 * 2. Checks in-memory cache.
 * 3. Checks persisted local file cache.
 * 4. Automatically registers once via GET https://anondrop.net/register if no key exists.
 */
export async function getOrRegisterAnonDropKey(): Promise<string> {
  // 1. Environment variable
  const envKey = process.env.ANONDROP_USER_KEY || process.env.ANONDROP_KEY;
  if (envKey && envKey.trim().length > 5) {
    cachedUserKey = envKey.trim();
    return cachedUserKey;
  }

  // 2. Memory cache
  if (cachedUserKey) {
    return cachedUserKey;
  }

  // 3. Persisted local cache file
  try {
    if (fs.existsSync(KEY_CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(KEY_CACHE_FILE, 'utf-8'));
      if (data && data.key) {
        cachedUserKey = String(data.key).trim();
        return cachedUserKey;
      }
    }
  } catch (err) {
    console.warn('[AnonDrop] Could not read local key cache file:', err);
  }

  // 4. One-time registration with AnonDrop API
  console.log('[AnonDrop] No key found. Registering new user key with https://anondrop.net/register...');
  const regRes = await fetch('https://anondrop.net/register', {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!regRes.ok) {
    throw new Error(`AnonDrop registration failed with HTTP status ${regRes.status}`);
  }

  const html = await regRes.text();
  // Match key from: localStorage.setItem('userkey', '1567175416148402291')
  const match = html.match(/localStorage\.setItem\(['"]userkey['"],\s*['"]([0-9a-zA-Z_-]+)['"]\)/i) ||
                html.match(/userkey['"],\s*['"]([0-9]+)['"]/i) ||
                html.match(/['"]([0-9]{15,})['"]/);

  if (!match || !match[1]) {
    throw new Error('Failed to parse user key from AnonDrop registration response.');
  }

  const newKey = match[1].trim();
  cachedUserKey = newKey;
  process.env.ANONDROP_USER_KEY = newKey;

  // Persist key to local file
  try {
    fs.writeFileSync(KEY_CACHE_FILE, JSON.stringify({ key: newKey, createdAt: new Date().toISOString() }), 'utf-8');
    console.log('[AnonDrop] New user key registered and saved successfully.');
  } catch (writeErr) {
    console.warn('[AnonDrop] Failed to write key to local cache file:', writeErr);
  }

  return newKey;
}

/**
 * Validates file upload category (avatar vs voice note) and file properties.
 */
function validateUpload(file: Express.Multer.File, category?: string): void {
  const isAvatar = category === 'avatar' || file.mimetype.startsWith('image/');
  const isVoice = category === 'voice' || file.mimetype.startsWith('audio/') || file.mimetype.includes('webm') || file.mimetype.includes('mp4');

  if (isAvatar) {
    const allowedImageMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
    ];
    if (!allowedImageMimes.includes(file.mimetype.toLowerCase()) && !file.mimetype.startsWith('image/')) {
      throw new Error(`Invalid image type (${file.mimetype}). Only PNG, JPG, WebP, and GIF profile pictures are supported.`);
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Profile picture exceeds 10MB size limit.');
    }
    return;
  }

  if (isVoice) {
    const isAllowedAudio =
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'video/webm' ||
      file.mimetype === 'video/mp4' ||
      file.originalname.match(/\.(mp3|webm|ogg|wav|m4a|aac|mp4)$/i);

    if (!isAllowedAudio) {
      throw new Error(`Invalid voice note format (${file.mimetype}). Only audio recordings are supported.`);
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new Error('Voice note exceeds 15MB size limit.');
    }
    return;
  }

  // If neither, verify it's at least an allowed image or audio format
  if (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('audio/')) {
    throw new Error('Only image and voice note files can be uploaded through this endpoint.');
  }
}

/**
 * Sanitizes and preserves original file extension and safe name.
 */
function sanitizeFileName(originalName: string, mimetype: string): string {
  const extFromMime: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/aac': '.aac',
    'audio/mp4': '.m4a',
    'video/webm': '.webm',
    'video/mp4': '.mp4',
  };

  const parsedExt = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, parsedExt).replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeBase = baseName.slice(0, 50) || 'file';

  let finalExt = parsedExt;
  if (!finalExt || finalExt.length < 2) {
    finalExt = extFromMime[mimetype.toLowerCase()] || '.bin';
  }

  return `${safeBase}${finalExt}`;
}

/**
 * Main AnonDrop upload handler.
 */
export default async function handler(req: any, res: any) {
  // Handle pre-flight or non-POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Ensure multipart body is parsed if not already parsed by middleware
  const file: Express.Multer.File | undefined = req.file;
  if (!file || !file.buffer) {
    return res.status(400).json({ error: 'No file received. Upload with multipart/form-data field name "file".' });
  }

  const category = (req.body?.category as string) || undefined;

  try {
    // 1. Validate file format and size server-side
    validateUpload(file, category);

    // 2. Retrieve or register AnonDrop user key securely
    const userKey = await getOrRegisterAnonDropKey();

    // 3. Prepare file data and sanitize filename
    const safeFileName = sanitizeFileName(file.originalname || 'upload.bin', file.mimetype);
    const fileBlob = new Blob([file.buffer as any], { type: file.mimetype });

    const formData = new FormData();
    formData.append('file', fileBlob, safeFileName);

    // 4. POST to official AnonDrop API endpoint: https://anondrop.net/upload?key=YOUR_KEY
    const anondropUrl = `https://anondrop.net/upload?key=${encodeURIComponent(userKey)}`;
    const uploadRes = await fetch(anondropUrl, {
      method: 'POST',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: formData,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('[AnonDrop Upload Error]:', uploadRes.status, errText);
      return res.status(502).json({
        error: `AnonDrop storage service returned error (${uploadRes.status}): ${errText || 'Upload failed'}`
      });
    }

    const responseText = await uploadRes.text();
    // Example response: File Link: <a href='https://anondrop.net/1567175484012372020'>https://anondrop.net/1567175484012372020</a>
    const fileIdMatch = responseText.match(/https:\/\/anondrop\.net\/([0-9a-zA-Z_-]+)/i);

    if (!fileIdMatch || !fileIdMatch[1]) {
      console.error('[AnonDrop Upload Failed]: Unrecognized response format:', responseText);
      return res.status(502).json({
        error: 'Failed to extract file ID from AnonDrop upload response.',
        details: responseText,
      });
    }

    const fileId = fileIdMatch[1].trim();

    // 5. Construct official AnonDrop direct URL format:
    // https://api2.anondrop.net/{fileId}/{filename}
    const directUrl = `https://api2.anondrop.net/${fileId}/${encodeURIComponent(safeFileName)}`;

    console.log(`[AnonDrop] Successfully uploaded ${category || 'file'}: ${safeFileName} -> ${directUrl}`);

    return res.status(200).json({
      success: true,
      directUrl,
      fileId,
      fileName: safeFileName,
      size: file.size,
      mimeType: file.mimetype,
    });
  } catch (err: any) {
    console.error('[AnonDrop Upload Handler Error]:', err);
    return res.status(400).json({
      error: err.message || 'Failed to upload file to AnonDrop storage.',
    });
  }
}
