#!/usr/bin/env node
// Controllo statico delle traduzioni: elenca (1) le chiavi che mancano in
// ciascuna lingua rispetto all'italiano (la lingua sorgente, vedi
// src/i18n/locales/it.js) e (2) le stringhe italiane scritte direttamente
// nei componenti .jsx invece che passare da t('...') — un'euristica su
// testo JSX/attributi con lettere accentate o parole italiane comuni, non
// un parser vero: falsi positivi/negativi sono normali, serve a dare un
// punto di partenza, non una garanzia. Uso: node scripts/i18n-check.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, '..', 'src');

const it = (await import('../src/i18n/locales/it.js')).default;
const LOCALES = {
  en: (await import('../src/i18n/locales/en.js')).default,
  es: (await import('../src/i18n/locales/es.js')).default,
  fr: (await import('../src/i18n/locales/fr.js')).default,
  de: (await import('../src/i18n/locales/de.js')).default,
};

function flatten(obj, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const path_ = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path_));
    } else {
      out[path_] = value;
    }
  }
  return out;
}

const itFlat = flatten(it);
const itKeys = new Set(Object.keys(itFlat));

console.log('=== Chiavi mancanti per lingua (rispetto a it.js) ===\n');
let totalMissing = 0;
for (const [code, resource] of Object.entries(LOCALES)) {
  const flat = flatten(resource);
  const keys = new Set(Object.keys(flat));
  const missing = [...itKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !itKeys.has(k));
  totalMissing += missing.length;
  console.log(`--- ${code} ---`);
  if (missing.length === 0) {
    console.log('  (nessuna chiave mancante)');
  } else {
    missing.forEach((k) => console.log(`  MANCA  ${k}`));
  }
  if (extra.length > 0) {
    extra.forEach((k) => console.log(`  EXTRA  ${k} (non esiste in it.js, forse da rimuovere)`));
  }
  console.log('');
}

// --- Stringhe italiane scritte direttamente nei componenti ---
// Parole/lettere che, se trovate in testo JSX o in aria-label/placeholder/
// title, segnalano probabile italiano non tradotto. Il file va escluso se
// contiene "i18n-check-ignore" in un commento sulla riga (per i pochi casi
// legittimi, es. valori interni mai mostrati all'utente).
const ITALIAN_HINT = /[àèéìòù]|(?:\bche\b|\bper\b|\bcon\b|\bnon\b|\bdel\b|\bdella\b|\bsono\b|\buna\b|\bgli\b)/i;
const ATTR_RE = /(aria-label|placeholder|title)=["']([^"']+)["']/g;
const TEXT_RE = />\s*([^<>{}\n][^<>{}]*?)\s*</g;
const IGNORE_LINE = /i18n-check-ignore/;

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (/\.(jsx?|tsx?)$/.test(entry) && !full.includes(path.join('i18n', 'locales'))) files.push(full);
  }
  return files;
}

const files = walk(SRC_DIR);
const findings = [];
for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const code = stripComments(raw);
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    if (IGNORE_LINE.test(line)) return;
    if (/\bt\(/.test(line)) return; // già passa da t(...): non è hardcoded
    let m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(line))) {
      if (ITALIAN_HINT.test(m[2])) {
        findings.push(`${path.relative(SRC_DIR, file)}:${i + 1}  ${m[1]}="${m[2]}"`);
      }
    }
    TEXT_RE.lastIndex = 0;
    while ((m = TEXT_RE.exec(line))) {
      const text = m[1].trim();
      if (text && ITALIAN_HINT.test(text) && !/^\{/.test(text)) {
        findings.push(`${path.relative(SRC_DIR, file)}:${i + 1}  "${text}"`);
      }
    }
  });
}

console.log(`=== Stringhe italiane probabilmente non tradotte (euristica, ${findings.length} trovate) ===\n`);
findings.forEach((f) => console.log(f));

console.log(`\n=== Riepilogo ===`);
console.log(`Chiavi mancanti totali (tutte le lingue): ${totalMissing}`);
console.log(`Stringhe italiane sospette nei componenti: ${findings.length}`);

if (totalMissing > 0) process.exitCode = 1;
