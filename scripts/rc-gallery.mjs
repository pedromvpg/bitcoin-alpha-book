/**
 * Shared rc/ resources gallery — icons & bitmaps embedded as data URIs.
 * Used by the print build and the /review live manuscript.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const RC_RESOURCE_FILES = [
  { name: 'bitcoin.ico', description: 'Main application icon (multi-resolution: 16x16, 32x32, 48x48)' },
  { name: 'check.ico', description: 'Checkmark icon for confirmations' },
  { name: 'addressbook16.bmp', description: 'Address book toolbar icon (16x16)' },
  { name: 'addressbook16mask.bmp', description: 'Address book icon transparency mask' },
  { name: 'addressbook20.bmp', description: 'Address book toolbar icon (20x20)' },
  { name: 'addressbook20mask.bmp', description: 'Address book icon transparency mask' },
  { name: 'send16.bmp', description: 'Send payment toolbar icon (16x16)' },
  { name: 'send16mask.bmp', description: 'Send icon transparency mask' },
  { name: 'send16masknoshadow.bmp', description: 'Send icon mask without shadow' },
  { name: 'send20.bmp', description: 'Send payment toolbar icon (20x20)' },
  { name: 'send20mask.bmp', description: 'Send icon transparency mask' },
];

/**
 * @param {string} rcDir Absolute path to src/bitcoin-0.01/src/rc
 * @returns {string} HTML for `.resources-gallery`
 */
export function renderRcGalleryHtml(rcDir) {
  let html = '<div class="resources-gallery">';
  for (const file of RC_RESOURCE_FILES) {
    const filePath = join(rcDir, file.name);
    if (!existsSync(filePath)) continue;
    const base64 = readFileSync(filePath).toString('base64');
    const mimeType = file.name.endsWith('.ico') ? 'image/x-icon' : 'image/bmp';
    html += `
        <div class="resource-item">
          <div class="resource-preview">
            <img src="data:${mimeType};base64,${base64}" alt="${file.name}" />
          </div>
          <div class="resource-info">
            <code class="resource-filename">${file.name}</code>
            <span class="resource-description">${file.description}</span>
          </div>
        </div>`;
  }
  html += '</div>';
  return html;
}
