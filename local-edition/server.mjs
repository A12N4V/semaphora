import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8787);
const MAX_BODY = 10 * 1024 * 1024;
const MAX_COLUMNS = 200;
const MAX_ROWS = 100_000;

const assets = new Map([
  ['/local-edition/', [join(HERE, 'index.html'), 'text/html; charset=utf-8']],
  ['/local-edition/app.js', [join(HERE, 'app.js'), 'text/javascript; charset=utf-8']],
  ['/local-edition/styles.css', [join(HERE, 'styles.css'), 'text/css; charset=utf-8']],
  ['/hero-dither.js', [join(ROOT, 'hero-dither.js'), 'text/javascript; charset=utf-8']],
  ['/assets/local-edition-header.png', [join(ROOT, 'assets', 'local-edition-header.png'), 'image/png']],
]);

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  res.end(body);
}

function json(res, status, value) {
  send(res, status, JSON.stringify(value));
}

async function readJson(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY) throw Object.assign(new Error('CSV exceeds the 10 MB limit.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); }
}

function parseCsv(source) {
  const matrix = [];
  let row = [], field = '', quoted = false;
  const text = source.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.length === 0) quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); matrix.push(row); row = []; field = '';
      if (matrix.length > MAX_ROWS + 1) throw Object.assign(new Error(`CSV exceeds the ${MAX_ROWS.toLocaleString()} row limit.`), { status: 413 });
    } else field += ch;
  }
  if (quoted) throw Object.assign(new Error('CSV contains an unclosed quoted field.'), { status: 400 });
  if (field.length || row.length) { row.push(field); matrix.push(row); }
  while (matrix.length && matrix[matrix.length - 1].every((cell) => !cell.trim())) matrix.pop();
  if (!matrix.length) throw Object.assign(new Error('CSV is empty.'), { status: 400 });

  const headers = matrix[0].map((name) => name.trim());
  const width = Math.max(headers.length, ...matrix.slice(1).map((line) => line.length));
  if (width > MAX_COLUMNS) throw Object.assign(new Error(`CSV exceeds the ${MAX_COLUMNS} column limit.`), { status: 413 });
  while (headers.length < width) headers.push(`Column ${headers.length + 1}`);
  if (headers.some((name) => !name)) throw Object.assign(new Error('Every column needs a header.'), { status: 400 });
  if (new Set(headers.map((name) => name.toLocaleLowerCase())).size !== headers.length) throw Object.assign(new Error('Column names must be unique.'), { status: 400 });

  const rows = matrix.slice(1).filter((line) => line.some((cell) => cell.trim())).map((line) => Object.fromEntries(headers.map((header, i) => [header, line[i] || ''])));
  return { headers, rows };
}

const emailHeaderPattern = /^(e-?mail(?:\s+address)?|primary\s+email|contact\s+email)$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/u;
const suppressedHeaders = /unsubscribe|suppression|bounc|complaint|opt[ _-]?out|do[ _-]?not[ _-]?mail/i;
const statusHeaders = /^(status|subscription status|consent|subscribed|subscription)$/i;
const trueValues = new Set(['1', 'true', 'yes', 'y', 'on', 'unsubscribed', 'bounced', 'complained', 'complaint', 'suppressed', 'opted out', 'opt-out', 'inactive', 'invalid', 'revoked', 'withdrawn']);
const falseValues = new Set(['0', 'false', 'no', 'n', 'off', 'subscribed', 'active', 'opted in', 'opt-in', 'valid', 'granted']);

function isSuppressed(record, headers) {
  return headers.some((header) => {
    const value = String(record[header] ?? '').trim().toLocaleLowerCase().replace(/[_-]+/g, ' ');
    if (!value) return false;
    if (suppressedHeaders.test(header)) return trueValues.has(value) || /^(unsubscribed|bounced|complained|complaint|suppressed|opted out)$/.test(value);
    if (statusHeaders.test(header)) return ['unsubscribed', 'bounced', 'complained', 'complaint', 'suppressed', 'opted out', 'inactive', 'invalid', 'revoked', 'withdrawn'].includes(value);
    return false;
  });
}

function nameFor(record, headers) {
  const find = (pattern) => {
    const key = headers.find((header) => pattern.test(header));
    return key ? String(record[key] ?? '').trim() : '';
  };
  return find(/^(name|full name)$/i) || [find(/^first[_ ]?name$/i), find(/^last[_ ]?name$/i)].filter(Boolean).join(' ') || '—';
}

function analyze(source, chosenEmailHeader) {
  const { headers, rows } = parseCsv(source);
  const emailHeader = headers.find((header) => header.toLocaleLowerCase() === String(chosenEmailHeader || '').trim().toLocaleLowerCase())
    || headers.find((header) => emailHeaderPattern.test(header));
  if (!emailHeader) throw Object.assign(new Error('Choose the column that contains email addresses.'), { status: 422, headers });

  const seen = new Set();
  const findings = [];
  const cleanRows = [];
  const normalizedRows = rows.map((record, index) => {
    const email = String(record[emailHeader] ?? '').trim();
    const normalized = email.toLocaleLowerCase();
    const issues = [];
    const duplicate = Boolean(normalized && seen.has(normalized));
    if (normalized) seen.add(normalized);
    if (!email) issues.push('missing_email');
    else if (!emailPattern.test(email)) issues.push('invalid_email');
    if (duplicate) issues.push('duplicate_email');
    const suppressed = isSuppressed(record, headers);
    if (suppressed) issues.push('suppressed');
    const missingFields = headers.filter((header) => !String(record[header] ?? '').trim());
    if (missingFields.length) issues.push('missing_fields');
    const validEmail = Boolean(email && emailPattern.test(email));
    const clean = validEmail && !duplicate && !suppressed;
    if (clean) cleanRows.push(record);
    if (issues.length) findings.push({ rowNumber: index + 2, name: nameFor(record, headers), email: email || '—', issues, missingFields });
    return { ...record, _rowNumber: index + 2, _issues: issues, _clean: clean };
  });

  const metrics = {
    total: rows.length,
    uniqueEmails: seen.size,
    invalidEmails: normalizedRows.filter((record) => record._issues.includes('invalid_email')).length,
    missingEmails: normalizedRows.filter((record) => record._issues.includes('missing_email')).length,
    duplicateRows: normalizedRows.filter((record) => record._issues.includes('duplicate_email')).length,
    suppressed: normalizedRows.filter((record) => record._issues.includes('suppressed')).length,
    incompleteRows: normalizedRows.filter((record) => record._issues.includes('missing_fields')).length,
    clean: cleanRows.length,
  };
  return { headers, emailHeader, metrics, findings, cleanRows, rows: normalizedRows };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(302, { Location: '/local-edition/', 'Cache-Control': 'no-store' }); res.end(); return;
  }
  if (req.method === 'GET' && url.pathname === '/healthz') {
    json(res, 200, { ok: true, edition: 'local' }); return;
  }
  if (req.method === 'GET' && assets.has(url.pathname)) {
    const [path, type] = assets.get(url.pathname);
    try { send(res, 200, await readFile(path), type); }
    catch { json(res, 404, { error: 'Not found.' }); }
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/analyze') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) { json(res, 403, { error: 'Cross-origin requests are not allowed.' }); return; }
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { json(res, 415, { error: 'Send JSON with the CSV text.' }); return; }
    try {
      const input = await readJson(req);
      if (typeof input.csv !== 'string' || Buffer.byteLength(input.csv, 'utf8') > MAX_BODY) { json(res, 413, { error: 'CSV exceeds the 10 MB limit.' }); return; }
      json(res, 200, analyze(input.csv, input.emailHeader));
    } catch (error) {
      json(res, error.status || 400, { error: error.message || 'Could not analyze this CSV.', headers: error.headers || undefined });
    }
    return;
  }
  json(res, 404, { error: 'Not found.' });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Semaphora Local listening at http://${HOST}:${PORT}\n`);
});
