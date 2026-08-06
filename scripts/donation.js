/**
 * Write the donation payload for the print cover.
 *
 * Configuration is read from the environment or a gitignored `.env` file at
 * the repo root — never from tracked files. Priority:
 *
 *   1. BITCOIN_SILENT_PAYMENT_ADDRESS  — BIP 352 silent payment address
 *      (sp1…, bech32m, 66-byte payload). When set and valid, it WINS.
 *   2. BITCOIN_DONATION_XPUB           — BIP84 account xpub (m/84'/0'/0');
 *      the next bc1 receive address is derived from it, incrementing a
 *      counter in donation-derive-state.json on each run.
 *   3. otherwise                       — a clearly-invalid placeholder, so the
 *      book, cover, and PDFs always build (marked as placeholder on the cover).
 *
 * Nothing secret belongs in this repo: the xpub stays in the gitignored .env,
 * and only public-by-design artifacts (the derived address / payload printed
 * on the cover) are committed.
 *
 * Usage:
 *   npm run donation
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { bech32m } from 'bech32';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT_DIR   = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');
const ENV_PATH   = join(ROOT_DIR, '.env');
const STATE_PATH = join(ROOT_DIR, 'donation-derive-state.json');
const OUT_PATH   = join(OUTPUT_DIR, 'donation-cover.json');

const bip32 = BIP32Factory(ecc);

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

function config(name) {
  return process.env[name]?.trim() || readEnvFile(ENV_PATH)[name]?.trim() || '';
}

/** Strict BIP 352 silent payment address check. */
function isValidSilentPaymentAddress(address) {
  try {
    const { prefix, words } = bech32m.decode(address, MAX_BECH32_LENGTH);
    if (prefix !== 'sp') return false;
    return bech32m.fromWords(words).length === 66; // scan pubkey || spend pubkey
  } catch {
    return false;
  }
}

async function qrOf(text) {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 220,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

async function silentPaymentPayload(address) {
  return {
    enabled: true,
    scheme: 'silent-payment',
    placeholder: false,
    address,
    // No URI scheme is standardized for silent payments; the QR encodes the
    // plain address (what BIP 352 wallets scan).
    qrDataUrl: await qrOf(address),
  };
}

async function xpubPayload(xpub) {
  let nextIndex = 0;
  if (existsSync(STATE_PATH)) {
    try {
      const s = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
      if (typeof s.nextReceiveIndex === 'number' && s.nextReceiveIndex >= 0) {
        nextIndex = s.nextReceiveIndex;
      }
    } catch {
      /* use 0 */
    }
  }

  let node;
  try {
    node = bip32.fromBase58(xpub);
  } catch (e) {
    console.error('Donation: invalid BITCOIN_DONATION_XPUB:', e.message);
    process.exit(1);
  }

  const pay = bitcoin.payments.p2wpkh({
    pubkey: node.derive(0).derive(nextIndex).publicKey,
    network: bitcoin.networks.bitcoin,
  });
  const address = pay.address;
  if (!address || !address.startsWith('bc1')) {
    console.error('Donation: derived address is not native SegWit (bc1…). Use a BIP84 account xpub (m/84\'/0\'/0\').');
    process.exit(1);
  }

  writeFileSync(STATE_PATH, JSON.stringify({ nextReceiveIndex: nextIndex + 1 }, null, 2), 'utf8');
  return {
    enabled: true,
    scheme: 'xpub-derive',
    placeholder: false,
    address,
    receiveIndex: nextIndex,
    bip21: `bitcoin:${address}`,
    qrDataUrl: await qrOf(`bitcoin:${address}`),
  };
}

async function placeholderPayload(reason) {
  return {
    enabled: true,
    scheme: 'placeholder',
    placeholder: true,
    reason,
    address: PLACEHOLDER_ADDRESS,
    qrDataUrl: await qrOf(PLACEHOLDER_ADDRESS),
  };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const spAddress = config('BITCOIN_SILENT_PAYMENT_ADDRESS');
  const xpub = config('BITCOIN_DONATION_XPUB');

  let payload;
  if (spAddress && isValidSilentPaymentAddress(spAddress)) {
    payload = await silentPaymentPayload(spAddress);
    console.log(`   Donation: silent payment address (overrides xpub) → ${spAddress.slice(0, 24)}…\n`);
  } else if (spAddress) {
    console.warn('⚠  BITCOIN_SILENT_PAYMENT_ADDRESS is set but invalid (expected bech32m');
    console.warn('   "sp1…" with a 66-byte payload) — falling back to the xpub flow.\n');
  }

  if (!payload && xpub) {
    payload = await xpubPayload(xpub);
    console.log(`   Donation: bc1 address #${payload.receiveIndex} → ${payload.address}\n`);
  }

  if (!payload) {
    payload = await placeholderPayload(
      spAddress
        ? 'silent payment address invalid and no xpub configured'
        : 'no donation address configured',
    );
    console.log('   Donation: PLACEHOLDER payload written (nothing configured).');
    console.log('   Set BITCOIN_SILENT_PAYMENT_ADDRESS or BITCOIN_DONATION_XPUB in .env.\n');
  }

  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
}

main().catch((err) => {
  console.error('Donation:', err.message || err);
  process.exit(1);
});
