/**
 * Write the silent-payment (BIP 352) donation payload for the print cover.
 *
 * The address is read from, in order:
 *   1. BITCOIN_SILENT_PAYMENT_ADDRESS environment variable
 *   2. a gitignored `.env` file at the repo root (same variable name)
 * If neither provides a valid sp1 address, a clearly-invalid PLACEHOLDER is
 * written instead, so the book, cover, and PDFs still build — the cover marks
 * it as a placeholder. Drop your real address in `.env` and re-run before
 * printing for real.
 *
 * Real addresses are validated strictly: bech32m, hrp "sp", 66-byte payload
 * (33-byte scan pubkey || 33-byte spend pubkey, per BIP 352).
 *
 * Nothing secret belongs in this file: the silent payment address is public
 * donation information printed on the cover — but keep the real one in the
 * gitignored .env anyway, so the repo never accumulates key material again.
 *
 * Usage:
 *   npm run donation:silent
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { bech32m } from 'bech32';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT_DIR   = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');
const ENV_PATH   = join(ROOT_DIR, '.env');
const OUT_PATH   = join(OUTPUT_DIR, 'donation-cover.json');

const PLACEHOLDER_ADDRESS = 'sp1-placeholder-replace-with-your-silent-payment-address';
const MAX_BECH32_LENGTH = 120; // bech32 lib default limit is 90; sp addresses are ~115

/** Minimal .env reader (KEY=VALUE per line, # comments, optional quotes). */
function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Strict BIP 352 silent payment address check. Returns true/false. */
function isValidSilentPaymentAddress(address) {
  try {
    const { prefix, words } = bech32m.decode(address, MAX_BECH32_LENGTH);
    if (prefix !== 'sp') return false;
    const data = bech32m.fromWords(words);
    return data.length === 66; // scan pubkey (33) || spend pubkey (33)
  } catch {
    return false;
  }
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const fromEnv = process.env.BITCOIN_SILENT_PAYMENT_ADDRESS?.trim();
  const fromFile = readEnvFile(ENV_PATH).BITCOIN_SILENT_PAYMENT_ADDRESS?.trim();
  const candidate = fromEnv || fromFile || '';
  const real = candidate && isValidSilentPaymentAddress(candidate);

  if (candidate && !real) {
    console.warn('⚠  BITCOIN_SILENT_PAYMENT_ADDRESS is set but is not a valid BIP 352');
    console.warn('   silent payment address (expected bech32m "sp1…" with a 66-byte');
    console.warn('   payload). Falling back to the placeholder.\n');
  }

  const address = real ? candidate : PLACEHOLDER_ADDRESS;
  const payload = {
    enabled:     true,
    scheme:      'silent-payment',
    placeholder: !real,
    address,
    // No URI scheme is standardized for silent payments; the QR encodes the
    // plain address (what BIP 352 wallets scan).
    qrDataUrl: await QRCode.toDataURL(address, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: 220,
      color: { dark: '#000000', light: '#ffffff' },
    }),
  };

  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

  if (real) {
    console.log(`   Donation: silent payment address → ${address.slice(0, 24)}…\n`);
  } else {
    console.log('   Donation: PLACEHOLDER payload written (no real sp1 address configured).');
    console.log('   Set BITCOIN_SILENT_PAYMENT_ADDRESS in .env and rerun before printing.\n');
  }
}

main().catch((err) => {
  console.error('Donation:', err.message || err);
  process.exit(1);
});
