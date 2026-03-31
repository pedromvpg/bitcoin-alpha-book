/**
 * Canonical order of Bitcoin v0.01 source files (Part II) — keep in sync with book build.
 */
export const SOURCE_FILE_ORDER = [
  'base58.h',
  'bignum.h',
  'db.cpp',
  'db.h',
  'headers.h',
  'irc.cpp',
  'irc.h',
  'key.h',
  'license.txt',
  'main.cpp',
  'main.h',
  'makefile',
  'makefile.vc',
  'market.cpp',
  'market.h',
  'net.cpp',
  'net.h',
  'readme.txt',
  'script.cpp',
  'script.h',
  'serialize.h',
  'sha.cpp',
  'sha.h',
  'ui.cpp',
  'ui.h',
  'ui.rc',
  'uibase.cpp',
  'uibase.h',
  'uint256.h',
  'uiproject.fbp',
  'util.cpp',
  'util.h',
];

/** DOM section id for a source filename (matches scripts/build.js). */
export function chapterIdFromFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
}

/** Emphasize these rows on the cover (heavily annotated / tour-style highlights). */
export const COVER_TOC_HIGHLIGHT = new Set([
  'db.cpp',
  'irc.h',
  'main.cpp',
  'net.cpp',
  'script.cpp',
  'sha.cpp',
  'util.cpp',
]);
