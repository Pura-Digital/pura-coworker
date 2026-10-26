import { request } from 'node:http';

export class VisionConsentDenied extends Error {
  constructor() {
    super('Invio della schermata escluso o annullato dall’utente.');
  }
}

/** No HTTP response deadline: waiting for a human must not trigger an automatic retry. */
export async function requireVisionConsent(
  capability: { url: string; token: string },
  fingerprint: string
): Promise<void> {
  const allowed = await new Promise<boolean>((resolve, reject) => {
    const body = JSON.stringify({ fingerprint });
    const req = request(
      capability.url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${capability.token}`,
        },
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          text += chunk;
          if (text.length > 8192) req.destroy();
        });
        response.on('end', () => {
          try {
            resolve(response.statusCode === 200 && JSON.parse(text).allowed === true);
          } catch {
            resolve(false);
          }
        });
        response.on('error', () => reject(new VisionConsentDenied()));
      }
    );
    req.on('error', () => reject(new VisionConsentDenied()));
    req.end(body);
  });
  if (!allowed) throw new VisionConsentDenied();
}
