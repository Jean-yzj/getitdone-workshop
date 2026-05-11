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
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_OAUTH_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || '';
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.compose'];

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
      special_experiences TEXT,
      expertise_areas     TEXT,
      duration     TEXT,
      why          TEXT[],
      env          TEXT,
      help         TEXT[],
      source       TEXT,
      notes        TEXT,
      paid_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
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

    CREATE TABLE IF NOT EXISTS gmail_oauth_tokens (
      provider       TEXT PRIMARY KEY,
      email          TEXT,
      access_token   TEXT,
      refresh_token  TEXT,
      scope          TEXT,
      token_type     TEXT,
      expiry_date    BIGINT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS special_experiences TEXT;
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS expertise_areas TEXT;
    ALTER TABLE signups ADD COLUMN IF NOT EXISTS paid_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  // seed any new keys with defaults (don't overwrite existing edits)
  for (const field of CONTENT_SCHEMA) {
    await pool.query(
      'INSERT INTO site_content (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [field.key, field.default]
    );
  }
  // force-update critical event info requested by organizer
  const forcedContent = [
    ['hero_tag', 'GET IT DONE WORKSHOP · 限額 30 人'],
    ['hero_subtitle', '把 3 小時花在那件你拖了很久的事上。<br>時間：5/16（六）｜地址：Garage+ (臺北市中山區中山北路二段 96 號 9 樓後棟）'],
    ['hero_stat3_num', '30'],
    ['meta_description', '今天一定要把事情解決工作坊：用 3 小時，把那件你拖了很久的事完成。限額 30 人。時間：5/16（六）。地址：Garage+ (臺北市中山區中山北路二段 96 號 9 樓後棟）。'],
    ['hero_card_sub', '誠實寫下、專注 3 小時、彼此歡呼'],
    ['form_q4_examples', `<span class="ok">✓</span> 把履歷改完，並投出 3 家職缺<br>
            <span class="ok">✓</span> 完成作品集一個案例頁，並上傳公開連結<br>
            <span class="ok">✓</span> 整理求職自我介紹版本，並完成一版可直接使用的面試稿<br>
            <span class="ng">✘</span> 傳一封訊息（範圍太小）<br>
            <span class="ng">✘</span> 我想變成更好的人（太抽象）`],
    ['faq_1_a', '這次我們會建議你寫「有明確產出」的任務，例如：履歷改完並投出、作品集完成一頁並公開。像「傳一封訊息」或「整理桌面」這種範圍太小，建議升級成更完整的任務。'],
    ['faq_3_q', '3 小時都不能做別的工作嗎？'],
    ['faq_3_a', '對。這 3 小時是為了你寫下的那件事。如果你的任務需要工作上的事，請在報名時就寫清楚。'],
    ['faq_4_a', '這不是一般課程，但我們會安排幾位有實戰經驗的夥伴在場，讓大家先看見彼此的經驗與做法。主持人會引導節奏、提醒時間、協助你推進，不會代替你完成你的任務。'],
    ['pledge_1', '我願意全程參加 3 小時，不會中途離開'],
    ['footer_tagline_en', 'Get It Done · 3 hours · 1 thing · together'],
    ['og_description', '用 3 小時，把那件你拖了很久的事完成。'],
  ];
  for (const [key, value] of forcedContent) {
    await pool.query(
      `INSERT INTO site_content (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value]
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

function stripHtml(input) {
  return String(input || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function firstLine(s) {
  return String(s || '').split('\n').map((v) => v.trim()).find(Boolean) || '';
}

function extractEventMeta(content) {
  const subtitle = stripHtml(content.hero_subtitle || '');
  const eventTitle = (content.footer_h4 || [content.hero_title_line1, content.hero_title_line2].filter(Boolean).join('')).trim();
  const eventDate = (subtitle.match(/時間[:：]\s*([^\n｜|]+)/) || [])[1]?.trim() || '';
  const eventLocation = (subtitle.match(/地址[:：]\s*([^\n]+)/) || [])[1]?.trim() || '';
  const introLine = firstLine(subtitle.replace(/時間[:：].*/g, '').trim());
  return {
    event_title: eventTitle,
    event_date: eventDate,
    event_location: eventLocation,
    event_intro: introLine,
    fee_notice_main: stripHtml(content.fee_notice_main || ''),
    fee_notice_detail: stripHtml(content.fee_notice_detail || ''),
  };
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
  const specialExperiences = String(body.special_experiences || '').trim();
  const expertiseAreas = String(body.expertise_areas || '').trim();
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
  if (!specialExperiences || specialExperiences.length < 3 || specialExperiences.length > 2000) errors.push('special_experiences');
  if (!expertiseAreas || expertiseAreas.length < 3 || expertiseAreas.length > 2000) errors.push('expertise_areas');
  if (!VALID.duration.has(duration)) errors.push('duration');
  if (!VALID.env.has(env)) errors.push('env');
  if (source && !VALID.source.has(source)) errors.push('source');
  for (const w of why) if (!VALID.why.has(w)) errors.push('why');
  for (const h of help) if (!VALID.help.has(h)) errors.push('help');
  if (pledges !== 4) errors.push('pledges');
  if (notes.length > 2000) errors.push('notes');

  return { errors, cleaned: { name, email, phone, task, specialExperiences, expertiseAreas, duration, env, source, notes, why, help, pledges } };
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

function isGmailConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function getBaseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}

function getGoogleRedirectUri(req) {
  return GOOGLE_OAUTH_REDIRECT_URI || `${getBaseUrl(req)}/admin/api/gmail/oauth/callback`;
}

function signState(payload) {
  const raw = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_PASSWORD).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

function verifyState(state, maxAgeMs = 10 * 60 * 1000) {
  if (!state || typeof state !== 'string' || !state.includes('.')) return null;
  const [raw, sig] = state.split('.', 2);
  const expected = crypto.createHmac('sha256', ADMIN_PASSWORD).update(raw).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!payload || typeof payload.ts !== 'number') return null;
    if (Date.now() - payload.ts > maxAgeMs) return null;
    return payload;
  } catch {
    return null;
  }
}

async function getStoredGmailConnection() {
  const { rows } = await pool.query(
    'SELECT provider, email, access_token, refresh_token, scope, token_type, expiry_date FROM gmail_oauth_tokens WHERE provider = $1',
    ['gmail']
  );
  return rows[0] || null;
}

async function saveGmailConnection(tokens, email) {
  const existing = await getStoredGmailConnection();
  const next = {
    email: email || existing?.email || null,
    access_token: tokens.access_token || existing?.access_token || null,
    refresh_token: tokens.refresh_token || existing?.refresh_token || null,
    scope: tokens.scope || existing?.scope || null,
    token_type: tokens.token_type || existing?.token_type || null,
    expiry_date: tokens.expiry_date ?? existing?.expiry_date ?? null,
  };
  await pool.query(
    `INSERT INTO gmail_oauth_tokens
      (provider, email, access_token, refresh_token, scope, token_type, expiry_date, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (provider) DO UPDATE
     SET email = EXCLUDED.email,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         scope = EXCLUDED.scope,
         token_type = EXCLUDED.token_type,
         expiry_date = EXCLUDED.expiry_date,
         updated_at = NOW()`,
    ['gmail', next.email, next.access_token, next.refresh_token, next.scope, next.token_type, next.expiry_date]
  );
}

async function deleteGmailConnection() {
  await pool.query('DELETE FROM gmail_oauth_tokens WHERE provider = $1', ['gmail']);
}

async function exchangeGoogleToken(params) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error_description || data.error || 'google_token_exchange_failed');
    err.status = 400;
    throw err;
  }
  return {
    ...data,
    expiry_date: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : null,
  };
}

async function refreshAccessTokenIfNeeded(connection) {
  if (!connection) {
    const err = new Error('gmail_not_connected');
    err.status = 400;
    throw err;
  }
  const now = Date.now();
  if (connection.access_token && connection.expiry_date && Number(connection.expiry_date) - now > 60 * 1000) {
    return connection;
  }
  if (!connection.refresh_token) {
    const err = new Error('gmail_refresh_token_missing');
    err.status = 400;
    throw err;
  }
  const refreshed = await exchangeGoogleToken({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: connection.refresh_token,
    grant_type: 'refresh_token',
  });
  const next = { ...connection, ...refreshed, refresh_token: connection.refresh_token };
  await saveGmailConnection(next, connection.email);
  return next;
}

async function gmailApiFetch(connection, pathname, options = {}) {
  const auth = await refreshAccessTokenIfNeeded(connection);
  const response = await fetch(`https://gmail.googleapis.com${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error?.message || 'gmail_api_error');
    err.status = response.status;
    throw err;
  }
  return data;
}

function replaceTemplateVars(template, data) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = data[key];
    return value == null ? '' : String(value);
  });
}

function encodeMimeSubject(value) {
  const normalized = String(value || '').replace(/\r?\n/g, ' ').trim();
  const b64 = Buffer.from(normalized, 'utf8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

function toBase64Url(input) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function buildDraftMessage({ to, bcc, subject, body }) {
  const lines = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    `To: ${String(to || '').replace(/\r?\n/g, ' ').trim()}`,
  ];
  if (bcc) lines.push(`Bcc: ${String(bcc).replace(/\r?\n/g, ' ').trim()}`);
  lines.push(`Subject: ${encodeMimeSubject(subject)}`);
  lines.push('');
  lines.push(String(body || '').replace(/\r?\n/g, '\r\n'));
  return toBase64Url(lines.join('\r\n'));
}

function buildMailTemplateData(signup, content) {
  return {
    name: signup.name || '',
    email: signup.email || '',
    task: signup.task || '',
    special_experiences: signup.special_experiences || '',
    expertise_areas: signup.expertise_areas || '',
    ...extractEventMeta(content),
  };
}

function getSignupFieldLabels(content) {
  return {
    special_experiences: String(content.form_q11_label || '三個比較特別的經驗'),
    expertise_areas: String(content.form_q12_label || '擅長領域'),
  };
}

const csvEscape = (v) => {
  let s = v == null ? '' : String(v);
  // Prevent CSV/Excel formula injection
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
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

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'too_many_requests' },
});

function requireSameOrigin(req, res, next) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return next();
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ ok: false, error: 'invalid_origin' });
  }
  if (originHost !== host) return res.status(403).json({ ok: false, error: 'forbidden_origin' });
  next();
}

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
      INSERT INTO signups (name, email, phone, task, special_experiences, expertise_areas, duration, why, env, help, source, notes, pledges, ip, user_agent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id`;
    const params = [
      cleaned.name, cleaned.email, cleaned.phone || null, cleaned.task, cleaned.specialExperiences, cleaned.expertiseAreas, cleaned.duration,
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
app.use('/admin', adminLimiter);
app.get('/admin', basicAuth, (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin/mail', basicAuth, (req, res) => res.sendFile(path.join(__dirname, 'admin-mail.html')));

app.get('/admin/api/signups', basicAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, created_at, name, email, phone, task, special_experiences, expertise_areas, duration, why, env, help, source, notes, paid_confirmed, pledges, ip FROM signups ORDER BY id DESC'
    );
    res.json({
      rows,
      labels: getSignupFieldLabels(contentCache),
    });
  } catch (e) { next(e); }
});

app.get('/admin/api/mail-drafts/setup', basicAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, created_at, name, email, phone, task, special_experiences, expertise_areas, duration, why, env, help, source, notes, pledges FROM signups ORDER BY id DESC'
    );
    const connection = await getStoredGmailConnection();
    res.json({
      signups: rows,
      event: extractEventMeta(contentCache),
      gmail: {
        configured: isGmailConfigured(),
        connected: Boolean(connection),
        email: connection?.email || null,
        redirect_uri: isGmailConfigured() ? getGoogleRedirectUri(req) : null,
      },
    });
  } catch (e) { next(e); }
});

app.get('/admin/api/gmail/oauth/start', basicAuth, (req, res) => {
  if (!isGmailConfigured()) {
    return res.status(400).send('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET');
  }
  const state = signState({ ts: Date.now(), next: '/admin/mail' });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', getGoogleRedirectUri(req));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('scope', GMAIL_SCOPES.join(' '));
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

app.get('/admin/api/gmail/oauth/callback', async (req, res, next) => {
  try {
    if (!isGmailConfigured()) return res.status(400).send('Gmail OAuth is not configured');
    if (req.query.error) return res.redirect('/admin/mail?gmail=denied');
    const state = verifyState(String(req.query.state || ''));
    if (!state) return res.status(403).send('Invalid OAuth state');
    const code = String(req.query.code || '');
    if (!code) return res.status(400).send('Missing OAuth code');

    const tokens = await exchangeGoogleToken({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: getGoogleRedirectUri(req),
      grant_type: 'authorization_code',
    });
    const profile = await gmailApiFetch(tokens, '/gmail/v1/users/me/profile');
    await saveGmailConnection(tokens, profile.emailAddress || null);
    res.redirect('/admin/mail?gmail=connected');
  } catch (e) { next(e); }
});

app.post('/admin/api/gmail/disconnect', basicAuth, requireSameOrigin, async (req, res, next) => {
  try {
    await deleteGmailConnection();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/admin/api/gmail/drafts', basicAuth, requireSameOrigin, async (req, res, next) => {
  try {
    if (!isGmailConfigured()) {
      return res.status(400).json({ ok: false, error: 'gmail_not_configured' });
    }
    const signupIds = Array.isArray(req.body?.signupIds)
      ? req.body.signupIds.map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v) && v > 0)
      : [];
    const subjectTemplate = String(req.body?.subject || '').trim();
    const bodyTemplate = String(req.body?.body || '').trim();
    const bcc = String(req.body?.bcc || '').trim();

    if (!signupIds.length) return res.status(400).json({ ok: false, error: 'missing_signup_ids' });
    if (!subjectTemplate) return res.status(400).json({ ok: false, error: 'missing_subject' });
    if (!bodyTemplate) return res.status(400).json({ ok: false, error: 'missing_body' });
    if (bcc && !EMAIL_RE.test(bcc)) return res.status(400).json({ ok: false, error: 'invalid_bcc' });

    const connection = await getStoredGmailConnection();
    if (!connection) return res.status(400).json({ ok: false, error: 'gmail_not_connected' });

    const { rows } = await pool.query(
      'SELECT id, name, email, task, special_experiences, expertise_areas FROM signups WHERE id = ANY($1::int[]) ORDER BY id DESC',
      [signupIds]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'signups_not_found' });

    const drafts = [];
    for (const signup of rows) {
      const data = buildMailTemplateData(signup, contentCache);
      const subject = replaceTemplateVars(subjectTemplate, data).trim();
      const body = replaceTemplateVars(bodyTemplate, data).trim();
      const raw = buildDraftMessage({ to: signup.email, bcc, subject, body });
      const draft = await gmailApiFetch(connection, '/gmail/v1/users/me/drafts', {
        method: 'POST',
        body: JSON.stringify({ message: { raw } }),
      });
      drafts.push({
        signup_id: signup.id,
        name: signup.name,
        email: signup.email,
        draft_id: draft.id,
        message_id: draft.message?.id || null,
        subject,
      });
    }

    res.json({
      ok: true,
      created: drafts.length,
      drafts,
      drafts_url: 'https://mail.google.com/mail/u/0/#drafts',
    });
  } catch (e) { next(e); }
});

const VALUE_LABELS = {
  duration: {
    '1week': '1 週以內',
    '1month': '1 個月以內',
    '3month': '3 個月以內',
    'halfyear': '半年以上',
    'year': '一年以上',
    'forever': '久到我不想算了',
  },
  why: {
    'busy': '沒有時間／太忙',
    'dontknow': '不知道從哪裡開始',
    'afraid': '害怕失敗或被拒絕',
    'annoying': '覺得太麻煩',
    'perfectionism': '完美主義在等最完美時機',
    'emotional': '不想面對裡面的情緒',
    'alone': '自己一個人做不下去',
    'other': '其他',
  },
  env: {
    'silent': '完全安靜，我要戴耳機專心做',
    'background': '有一點背景音也可以，不要太吵就好',
    'speak': '我可能需要打電話／開口說話，需要可以發出聲音的角落',
    'flexible': '不確定，看現場',
  },
  help: {
    'alone': '自己做，不需要被打擾',
    'chat': '卡住時有人陪聊 5 分鐘',
    'review': '有人幫我看一下做出來的東西',
    'company': '陪我打那通電話／傳那封訊息',
    'depends': '看狀況再說',
  },
  source: {
    'ig': 'Instagram',
    'fb': 'Facebook',
    'threads': 'Threads',
    'line': 'LINE 朋友轉發',
    'friend': '朋友／同事直接告訴我',
    'other': '其他',
  },
};

const translateValue = (col, val) => {
  if (col === 'paid_confirmed') {
    return val ? '已確認' : '未確認';
  }
  if (col === 'pledges') {
    const n = Number(val);
    if (!Number.isFinite(n)) return val;
    return n >= 4 ? '全部同意（4 項）' : `${n} / 4 項同意`;
  }
  const map = VALUE_LABELS[col];
  if (!map) return val;
  if (Array.isArray(val)) return val.map((v) => map[v] || v);
  return map[val] || val;
};

const formatTaipeiDateTime = (d) => {
  // 例：2026-05-06 10:46:27 (UTC+8)
  const t = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
};

app.get('/admin/api/export.csv', basicAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, created_at, name, email, phone, task, special_experiences, expertise_areas, duration, why, env, help, source, notes, paid_confirmed, pledges, ip FROM signups ORDER BY id DESC'
    );
    const signupLabels = getSignupFieldLabels(contentCache);
    const cols = ['id','created_at','name','email','phone','task','special_experiences','expertise_areas','duration','why','env','help','source','notes','paid_confirmed','pledges','ip'];
    const labels = {
      id: '編號',
      created_at: '建立時間',
      name: '姓名',
      email: '電郵',
      phone: '電話',
      task: '任務',
      special_experiences: signupLabels.special_experiences,
      expertise_areas: signupLabels.expertise_areas,
      duration: '預計時長',
      why: '原因',
      env: '環境',
      help: '需要協助',
      source: '來源',
      notes: '備註',
      paid_confirmed: '已確認繳費',
      pledges: '承諾',
      ip: 'IP 位址',
    };
    const headers = cols.map((c) => csvEscape(labels[c])).join(',');
    const body = rows.map((r) => cols.map((c) => {
      let v = r[c];
      if (c === 'created_at' && v instanceof Date) return csvEscape(formatTaipeiDateTime(v));
      v = translateValue(c, v);
      if (Array.isArray(v)) return csvEscape(v.join('、'));
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

app.delete('/admin/api/signups/:id', basicAuth, requireSameOrigin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false });
    const r = await pool.query('DELETE FROM signups WHERE id = $1', [id]);
    res.json({ ok: true, deleted: r.rowCount });
  } catch (e) { next(e); }
});

app.patch('/admin/api/signups/:id/payment', basicAuth, requireSameOrigin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid_id' });
    }
    const paidConfirmed = Boolean(req.body?.paid_confirmed);
    const { rows } = await pool.query(
      'UPDATE signups SET paid_confirmed = $2 WHERE id = $1 RETURNING id, paid_confirmed',
      [id, paidConfirmed]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
    res.json({ ok: true, signup: rows[0] });
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

app.put('/admin/api/content', basicAuth, requireSameOrigin, async (req, res, next) => {
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

app.post('/admin/api/content/reset/:key', basicAuth, requireSameOrigin, async (req, res, next) => {
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
