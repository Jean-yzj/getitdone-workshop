import express from 'express';
import pg from 'pg';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

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

pool.on('error', (err) => {
  console.error('Postgres pool error:', err);
});

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
  `);
  console.log('DB migration OK');
}

const VALID = {
  duration: new Set(['1week', '1month', '3month', 'halfyear', 'year', 'forever']),
  env: new Set(['silent', 'background', 'speak', 'flexible']),
  why: new Set(['busy', 'dontknow', 'afraid', 'annoying', 'perfectionism', 'emotional', 'alone', 'other']),
  help: new Set(['alone', 'chat', 'review', 'company', 'depends']),
  source: new Set(['ig', 'fb', 'threads', 'line', 'friend', 'other']),
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

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

  return {
    errors,
    cleaned: { name, email, phone, task, duration, env, source, notes, why, help, pledges },
  };
}

function basicAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin", charset="UTF-8"');
    return res.status(401).send('Authentication required');
  }
  let decoded = '';
  try {
    decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
  } catch {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Bad auth');
  }
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

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(express.urlencoded({ extended: true, limit: '64kb' }));
app.use(express.json({ limit: '64kb' }));

app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ ok: false, error: 'db' });
  }
});

const signupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'too_many_requests' },
});

app.post('/api/signup', signupLimiter, async (req, res, next) => {
  try {
    if (req.body && req.body._gotcha) {
      return res.redirect(303, '/success.html');
    }
    const { errors, cleaned } = validateSignup(req.body || {});
    if (errors.length) {
      return res.status(400).json({ ok: false, errors });
    }
    const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip;
    const ua = (req.headers['user-agent'] || '').toString().slice(0, 500);
    const q = `
      INSERT INTO signups (name, email, phone, task, duration, why, env, help, source, notes, pledges, ip, user_agent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id
    `;
    const params = [
      cleaned.name,
      cleaned.email,
      cleaned.phone || null,
      cleaned.task,
      cleaned.duration,
      cleaned.why,
      cleaned.env,
      cleaned.help,
      cleaned.source || null,
      cleaned.notes || null,
      cleaned.pledges,
      ip,
      ua,
    ];
    const result = await pool.query(q, params);
    console.log(`signup id=${result.rows[0].id} email=${cleaned.email}`);
    if (req.is('application/json')) {
      return res.json({ ok: true, id: result.rows[0].id });
    }
    return res.redirect(303, '/success.html');
  } catch (e) {
    next(e);
  }
});

app.get('/admin', basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin/api/signups', basicAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, created_at, name, email, phone, task, duration, why, env, help, source, notes, pledges, ip FROM signups ORDER BY id DESC'
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

app.get('/admin/api/export.csv', basicAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, created_at, name, email, phone, task, duration, why, env, help, source, notes, pledges, ip FROM signups ORDER BY id DESC'
    );
    const cols = [
      'id', 'created_at', 'name', 'email', 'phone', 'task',
      'duration', 'why', 'env', 'help', 'source', 'notes', 'pledges', 'ip',
    ];
    const headers = cols.join(',');
    const body = rows
      .map((r) =>
        cols
          .map((c) => {
            const v = r[c];
            if (Array.isArray(v)) return csvEscape(v.join('|'));
            if (v instanceof Date) return csvEscape(v.toISOString());
            return csvEscape(v);
          })
          .join(',')
      )
      .join('\r\n');
    const filename = `signups-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + headers + '\r\n' + body);
  } catch (e) {
    next(e);
  }
});

app.delete('/admin/api/signups/:id', basicAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false });
    const r = await pool.query('DELETE FROM signups WHERE id = $1', [id]);
    res.json({ ok: true, deleted: r.rowCount });
  } catch (e) {
    next(e);
  }
});

app.use(express.static(__dirname, { extensions: ['html'], maxAge: '5m', index: 'index.html' }));

app.use((req, res) => res.status(404).send('Not Found'));

app.use((err, req, res, _next) => {
  console.error('error:', err);
  if (res.headersSent) return;
  if (NODE_ENV === 'production') res.status(500).json({ ok: false, error: 'internal' });
  else res.status(500).json({ ok: false, error: err.message });
});

let server;
async function start() {
  await migrate();
  server = app.listen(PORT, () => {
    console.log(`getitdone listening on :${PORT} (${NODE_ENV})`);
  });
}

function shutdown(sig) {
  console.log(`${sig} received, shutting down`);
  if (server) server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((e) => {
  console.error('startup failed:', e);
  process.exit(1);
});
