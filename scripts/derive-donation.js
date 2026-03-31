/**
 * Derive a fresh native SegWit (P2WPKH, bc1…) donation address from a BIP84 account xpub
 * and write output/donation-cover.json for the print cover.
 *
 * Increments a counter in donation-derive-state.json on each run (e.g. every release).
 *
 * Environment:
 *   BITCOIN_DONATION_XPUB  — required for a real address. Use the account-level xpub from
 *                            your wallet (same as for path m/84'/0'/0' on mainnet — often
 *                            shown as zpub / "Native SegWit account xpub").
 *
 * Usage:
 *   npm run donation:derive
 *
 * If BITCOIN_DONATION_XPUB is unset, writes { enabled: false } and exits 0.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT_DIR   = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT_DIR, 'output');
const STATE_PATH = join(ROOT_DIR, 'donation-derive-state.json');
const OUT_PATH   = join(OUTPUT_DIR, 'donation-cover.json');

const bip32 = BIP32Factory(ecc);

// Default donation xpub (BIP84 account-level, m/84'/0'/0').
// Override with BITCOIN_DONATION_XPUB env var if needed.
const DEFAULT_XPUB = '[donation-xpub-removed-from-history]';

async function main() {
  const xpub = process.env.BITCOIN_DONATION_XPUB?.trim() || DEFAULT_XPUB;

  mkdirSync(OUTPUT_DIR, { recursive: true });

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

  const child = node.derive(0).derive(nextIndex);
  const pay = bitcoin.payments.p2wpkh({
    pubkey: child.publicKey,
    network: bitcoin.networks.bitcoin,
  });
  const address = pay.address;

  if (!address || !address.startsWith('bc1')) {
    console.error(
      'Donation: derived address is not native SegWit (bc1…). Use a BIP84 account xpub (e.g. zpub) for m/84\'/0\'/0\'.',
    );
    process.exit(1);
  }

  const bip21 = `bitcoin:${address}`;
  const qrDataUrl = await QRCode.toDataURL(bip21, {
    errorCorrectionLevel: 'M',
    margin:            0,
    width:             220,
    color:             { dark: '#000000', light: '#ffffff' },
  });

  writeFileSync(STATE_PATH, JSON.stringify({ nextReceiveIndex: nextIndex + 1 }, null, 2), 'utf8');
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        enabled:      true,
        address,
        receiveIndex: nextIndex,
        bip21,
        qrDataUrl,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`   Donation: bc1 address #${nextIndex} → ${address}\n`);
}

main().catch(err => {
  console.error('Donation:', err.message || err);
  process.exit(1);
});
