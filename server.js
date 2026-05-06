import express from 'express';
import pg from 'pg';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { CONTENT_SCHEMA, CONTENT_DEFAULTS } from './content-schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '3000', 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!ADMIN_PASSWORD) {
  console.error('FATAL: ADMIN_PASSWORD env var is required');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL env var is required');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => console.error('Postgres pool error:', err));

// ─── Schema migration ─────────────────────────────────────────────
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signups (
      id           SERIAL PRIMARY KEY,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      name         TEXT NOT NULL,
      email        TEXT NOT NULL,
      phone        TEXT,
      task         TEXT NOT NULL,
      duration     TEXT,
      why          TEXT[],
      env          TEXT,
      help         TEXT[],
      source       TEXT,
      notes        TEXT,
      pledges      INTEGER NOT NULL DEFAULT 0,
      ip           TEXT,
      user_agent   TEXT
    );
    CREATE INDEX IF NOT EXISTS signups_created_at_idx ON signups (created_at DESC);
    CREATE INDEX IF NOT EXISTS signups_email_idx ON signups (email);

    CREATE TABLE IF NOT EXISTS site_content (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // seed any new keys with defaults (don't overwrite existing edits)
  for (const field of CONTENT_SCHEMA) {
    await pool.query(
      'INSERT INTO site_content (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [field.key, field.default]
    );
  }
  console.log('DB migration OK');
}

// ─── Content cache ────────────────────────────────────────────────
let contentCache = { ...CONTENT_DEFAULTS };

async function loadContent() {
  const { rows } = await pool.query('SELECT key, value FROM site_content');
  const next = { ...CONTENT_DEFAULTS };
  for (const r of rows) next[r.key] = r.value;
  contentCache = next;
}

// ─── Templates ────────────────────────────────────────────────────
function loadTemplate(name) {
  return fs.readFileSync(path.join(__dirname, name), 'utf8');
}
const templates = {
  'index.html': loadTemplate('index.html'),
  'success.html': loadTemplate('success.html'),
};

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isTruthy(v) {
  return v != null && v !== '' && v !== '0' && v !== 'false';
}

function render(template, data) {
  // {{#if key}}...{{/if}}  conditional block (non-greedy, supports siblings)
  let prev;
  do {
    prev = template;
    template = template.replace(
      /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_, k, body) => (isTruthy(data[k]) ? body : '')
    );
  } while (template !== prev); // re-run in case of adjacent blocks revealing more

  // {{{key}}} → raw HTML
  template = template.replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => (data[k] != null ? data[k] : ''));
  // {{key}} → escaped
  template = template.replace(/\{\{(\w+)\}\}/g, (_, k) => escapeHtml(data[k]));
  return template;
}

// ─── Validation for /api/signup ───────────────────────────────────
const VALID = {
  duration: new Set(['1week', '1month', '3month', 'halfyear', 'year', 'forever']),
  env: new Set(['silent', 'background', 'speak', 'flexible']),
  why: new Set(['busy', 'dontknow', 'afraid', 'annoying', 'perfectionism', 'emotional', 'alone', 'other']),
  help: new Set(['alone', 'chat', 'review', 'company', 'depends']),
  source: new Set(['ig', 'fb', 'threads', 'line', 'friend', 'other']),
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function validateSignup(body) {
  const errors = [];
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const task = String(body.task || '').trim();
  const duration = String(body.duration || '').trim();
  const env = String(body.env || '').trim();
  const source = String(body.source || '').trim();
  const notes = String(body.notes || '').trim();
  const why = asArray(body.why).map(String).filter(Boolean);
  const help = asArray(body.help).map(String).filter(Boolean);
  const pledges = ['pledge1', 'pledge2', 'pledge3', 'pledge4'].filter((k) => body[k]).length;

  if (!name || name.length > 100) errors.push('name');
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) errors.push('email');
  if (phone.length > 50) errors.push('phone');
  if (!task || task.length < 3 || task.length > 2000) errors.push('task');
  if (!VALID.duration.has(duration)) errors.push('duration');
  if (!VALID.env.has(env)) errors.push('env');
  if (source && !VALID.source.has(source)) errors.push('source');
  for (const w of why) if (!VALID.why.has(w)) errors.push('why');
  for (const h of help) if (!VALID.help.has(h)) errors.push('help');
  if (pledges !== 4) errors.push('pledges');
  if (notes.length > 2000) errors.push('notes');

  return { errors, cleaned: { name, email, phone, task, duration, env, source, notes, why, help, pledges } };
}

// ─── Auth ─────────────────────────────────────────────────────────
function basicAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin", charset="UTF-8"');
    return res.status(401).send('Authentication required');
  }
  let decoded = '';
  try { decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8'); }
  catch { res.set('WWW-Authenticate', 'Basic realm="Admin"'); return res.status(401).send('Bad auth'); }
  const idx = decoded.indexOf(':');
  const password = idx >= 0 ? decoded.slice(idx + 1) : '';
  const expected = Buffer.from(ADMIN_PASSWORD);
  const got = Buffer.from(password);
  if (got.length !== expected.length || !crypto.timingSafeEqual(expected, got)) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Wrong password');
  }
  next();
}

const csvEscape = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ─── App ──────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(express.json({ limit: '256kb' }));

// Health
app.get('/healthz', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false, error: 'db' }); }
});

// Templated pages — must come BEFORE express.static
function serveTemplate(name) {
  return (req, res) => {
    const html = render(templates[name], contentCache);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  };
}
app.get('/', serveTemplate('index.html'));
app.get('/index.html', serveTemplate('index.html'));
app.get('/success.html', serveTemplate('success.html'));

// Signup
const signupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'too_many_requests' },
});

app.post('/api/signup', signupLimiter, async (req, res, next) => {
  try {
    if (req.body && req.body._gotcha) return res.redirect(303, '/success.html');
    const { errors, cleaned } = validateSignup(req.body || {});
    if (errors.length) return res.status(400).json({ ok: false, errors });
    const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip;
    const ua = (req.headers['user-agent'] || '').toString().slice(0, 500);
    const q = `
      INSERT INTO signups (name, email, phone, task, duration, why, env, help, source, notes, pledges, ip, user_agent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id`;
    const params = [
      cleaned.name, cleaned.email, cleaned.phone || null, cleaned.task, cleaned.duration,
      cleaned.why, cleaned.env, cleaned.help, cleaned.source || null, cleaned.notes || null,
      cleaned.pledges, ip, ua,
    ];
    const result = await pool.query(q, params);
    console.log(`signup id=${result.rows[0].id} email=${cleaned.email}`);
    if (req.is('application/json')) return res.json({ ok: true, id: result.rows[0].id });
    return res.redirect(303, '/success.html');
  } catch (e) { next(e); }
});

// ─── Admin: signups ───────────────────────────────────────────────
app.get('/admin', basicAuth, (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/admin/api/signups', basicAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, created_at, name, email, phone, task, duration, why, env, help, source, notes, pledges, ip FROM signups ORDER BY id DESC'
    );
    res.json(rows);
  } catch (e) { next(e); }
});

app.get('/admin/api/export.csv', basicAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, created_at, name, email, phone, task, duration, why, env, help, source, notes, pledges, ip FROM signups ORDER BY id DESC'
    );
    const cols = ['id','created_at','name','email','phone','task','duration','why','env','help','source','notes','pledges','ip'];
    const labels = {
      id: '編號',
      created_at: '建立時間',
      name: '姓名',
      email: '電郵',
      phone: '電話',
      task: '任務',
      duration: '預計時長',
      why: '原因',
      env: '環境',
      help: '需要協助',
      source: '來源',
      notes: '備註',
      pledges: '承諾',
      ip: 'IP 位址',
    };
    const headers = cols.map((c) => csvEscape(labels[c])).join(',');
    const body = rows.map((r) => cols.map((c) => {
      const v = r[c];
      if (Array.isArray(v)) return csvEscape(v.join('|'));
      if (v instanceof Date) return csvEscape(v.toISOString());
      return csvEscape(v);
    }).join(',')).join('\r\n');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `報名資料-${dateStr}.csv`;
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set(
      'Content-Disposition',
      `attachment; filename="signups-${dateStr}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send('﻿' + headers + '\r\n' + body);
  } catch (e) { next(e); }
});

app.delete('/admin/api/signups/:id', basicAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false });
    const r = await pool.query('DELETE FROM signups WHERE id = $1', [id]);
    res.json({ ok: true, deleted: r.rowCount });
  } catch (e) { next(e); }
});

// ─── Admin: content editor ────────────────────────────────────────
app.get('/admin/edit', basicAuth, (req, res) => res.sendFile(path.join(__dirname, 'admin-edit.html')));

app.get('/admin/api/content', basicAuth, (req, res) => {
  // return schema with current values
  const fields = CONTENT_SCHEMA.map((f) => ({
    key: f.key,
    label: f.label,
    section: f.section,
    kind: f.kind,
    hint: f.hint || null,
    default: f.default,
    value: contentCache[f.key] != null ? contentCache[f.key] : f.default,
  }));
  res.json({ fields });
});

app.put('/admin/api/content', basicAuth, async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ ok: false, error: 'invalid_body' });
    }
    const validKeys = new Set(CONTENT_SCHEMA.map((f) => f.key));
    const entries = Object.entries(body).filter(([k]) => validKeys.has(k));
    if (!entries.length) return res.json({ ok: true, updated: 0 });

    // pre-validate values before opening a transaction
    for (const [k, v] of entries) {
      const value = String(v ?? '');
      if (value.length > 8000) {
        return res.status(400).json({ ok: false, error: 'value_too_long', key: k });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [k, v] of entries) {
        await client.query(
          'INSERT INTO site_content (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()',
          [k, String(v ?? '')]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    await loadContent(); // refresh in-memory cache
    res.json({ ok: true, updated: entries.length });
  } catch (e) { next(e); }
});

app.post('/admin/api/content/reset/:key', basicAuth, async (req, res, next) => {
  try {
    const key = req.params.key;
    const field = CONTENT_SCHEMA.find((f) => f.key === key);
    if (!field) return res.status(404).json({ ok: false });
    await pool.query(
      'INSERT INTO site_content (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()',
      [key, field.default]
    );
    await loadContent();
    res.json({ ok: true, key, value: field.default });
  } catch (e) { next(e); }
});

// ─── Static files: explicit whitelist (don't expose server source) ────
const sendStatic = (file) => (req, res) =>
  res.sendFile(path.join(__dirname, file), { maxAge: '5m' });
app.get('/style.css', sendStatic('style.css'));
app.get('/script.js', sendStatic('script.js'));
app.use('/assets', express.static(path.join(__dirname, 'assets'), { index: false, maxAge: '1h' }));

app.use((req, res) => res.status(404).send('Not Found'));

app.use((err, req, res, _next) => {
  console.error('error:', err);
  if (res.headersSent) return;
  const status = err.status || err.statusCode || 500;
  // body-parser surfaces `type` like 'entity.parse.failed' for malformed JSON
  const code = status === 400 ? (err.type || 'bad_request') : status === 500 ? 'internal' : 'error';
  if (NODE_ENV === 'production') res.status(status).json({ ok: false, error: code });
  else res.status(status).json({ ok: false, error: err.message, type: err.type });
});

// ─── Boot ─────────────────────────────────────────────────────────
let server;
async function start() {
  await migrate();
  await loadContent();
  server = app.listen(PORT, () => console.log(`getitdone listening on :${PORT} (${NODE_ENV})`));
}

function shutdown(sig) {
  console.log(`${sig} received, shutting down`);
  if (server) server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((e) => { console.error('startup failed:', e); process.exit(1); });
