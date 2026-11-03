import type { IncomingMessage, ServerResponse } from 'http';
import https from 'https';
import http from 'http';
import { URL } from 'url';

export interface MediaDiagnosisResult {
  url: string;
  statusCode: number;
  contentType: string;
  contentLength: number | null;
  acceptRanges: string | null;
  hasByteRanges: boolean;
  hasCors: boolean;
  corsOrigin: string | null;
  server: string | null;
  isMp4: boolean;
  isHls: boolean;
  detectedCodecTag: 'hev1' | 'hvc1' | 'avc1' | 'unknown';
  appleCompatibility: {
    isCompatible: boolean;
    reason: string;
    recommendation: string;
  };
}

/**
 * Serverless / Express endpoint to diagnose media stream URLs.
 * Checks HTTP byte range support, Content-Type, CORS, and MP4 codec boxes (hev1 vs hvc1 vs avc1).
 */
export default async function handler(req: any, res: any) {
  // Support both Express and Vercel serverless request structures
  const targetUrl = (req.query?.url as string) || (typeof req.url === 'string' ? new URL(req.url, 'http://localhost').searchParams.get('url') : null);

  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing required "url" query parameter.' });
  }

  try {
    const parsedUrl = new URL(targetUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only HTTP and HTTPS URLs are supported.' });
    }

    const diagnosis = await probeMediaStream(targetUrl);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json(diagnosis);
  } catch (err: any) {
    console.error('[Media Diagnosis Error]:', err);
    return res.status(500).json({
      error: 'Failed to diagnose media stream',
      details: err?.message || String(err)
    });
  }
}

function probeMediaStream(mediaUrl: string): Promise<MediaDiagnosisResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(mediaUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request(
      mediaUrl,
      {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          Range: 'bytes=0-32767', // Request first 32KB to inspect container atoms (ftyp, moov, codec tags)
        },
        timeout: 7000,
      },
      (response: IncomingMessage) => {
        const statusCode = response.statusCode || 0;
        const headers = response.headers;
        const contentType = (headers['content-type'] as string) || 'unknown';
        const contentLength = headers['content-length'] ? parseInt(headers['content-length'] as string, 10) : null;
        const acceptRanges = (headers['accept-ranges'] as string) || null;
        const contentRange = (headers['content-range'] as string) || null;
        const hasByteRanges = statusCode === 206 || acceptRanges === 'bytes' || !!contentRange;
        const corsOrigin = (headers['access-control-allow-origin'] as string) || null;
        const hasCors = !!corsOrigin;
        const server = (headers['server'] as string) || null;

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          totalBytes += chunk.length;
          // 64KB is plenty to read moov/trak/stsd
          if (totalBytes >= 65536) {
            response.destroy();
          }
        });

        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const isMp4 = contentType.includes('video/mp4') || mediaUrl.toLowerCase().includes('.mp4');
          const isHls = contentType.includes('mpegurl') || mediaUrl.toLowerCase().includes('.m3u8');

          let detectedCodecTag: 'hev1' | 'hvc1' | 'avc1' | 'unknown' = 'unknown';

          if (isMp4) {
            // Check for MP4 codec fourcc tags in the moov/stsd atoms
            const hasHev1 = buffer.includes(Buffer.from('hev1'));
            const hasHvc1 = buffer.includes(Buffer.from('hvc1'));
            const hasAvc1 = buffer.includes(Buffer.from('avc1'));

            if (hasHev1) {
              detectedCodecTag = 'hev1';
            } else if (hasHvc1) {
              detectedCodecTag = 'hvc1';
            } else if (hasAvc1) {
              detectedCodecTag = 'avc1';
            }
          }

          let isCompatible = true;
          let reason = 'Stream is compatible with modern browsers.';
          let recommendation = 'No action needed.';

          if (isMp4 && detectedCodecTag === 'hev1') {
            isCompatible = false;
            reason =
              "The MP4 file is encoded in HEVC (H.265) with the 'hev1' tag. Apple AVFoundation (iOS Safari, WebKit, iOS Chrome) strictly requires HEVC in MP4 containers to use the 'hvc1' tag for hardware decoding. On Apple devices, this causes a black screen or decode error while audio may continue playing. Android Chrome and desktop VLC/Chromium support both tags.";
            recommendation =
              "Re-encode this video using H.264/AVC (avc1) or HEVC with 'hvc1' tag, or convert the stream to HLS (.m3u8) for universal cross-platform playback.";
          } else if (!hasByteRanges && isMp4) {
            isCompatible = false;
            reason = 'The media server does not support HTTP 206 byte-range requests, which iOS Safari requires for seeking and progressive playback.';
            recommendation = 'Enable HTTP Accept-Ranges: bytes on the hosting media server.';
          }

          resolve({
            url: mediaUrl,
            statusCode,
            contentType,
            contentLength,
            acceptRanges,
            hasByteRanges,
            hasCors,
            corsOrigin,
            server,
            isMp4,
            isHls,
            detectedCodecTag,
            appleCompatibility: {
              isCompatible,
              reason,
              recommendation,
            },
          });
        });

        response.on('error', (err) => {
          reject(err);
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Media probe timed out after 7000ms.'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}
