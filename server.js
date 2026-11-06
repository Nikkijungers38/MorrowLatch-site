// MorrowLatch AI — own website server (off Polsia).
// Public site + inquiry form + owner admin dashboard.
// Inquiries are saved to a local JSON store. When RESEND_API_KEY and
// OWNER_EMAIL are set in the environment, each new inquiry is also
// emailed to the owner. Without them the site still works store-only.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3100;

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'inquiries.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const OWNER_EMAIL = process.env.OWNER_EMAIL || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'MorrowLatch AI <onboarding@resend.dev>';

// ---------- tiny JSON store ----------
function loadInquiries() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function saveInquiries(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

// ---------- admin auth (signed cookie token) ----------
function tokenFor() {
  return crypto.createHmac('sha256', ADMIN_PASSWORD || 'unset').update('morrowlatch-admin').digest('hex');
}
function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
function isAdmin(req) {
  if (!ADMIN_PASSWORD) return false;
  return parseCookies(req).ml_admin === tokenFor();
}

// ---------- email (optional, via Resend) ----------
async function emailOwner(inq) {
  if (!RESEND_API_KEY || !OWNER_EMAIL) return { sent: false, reason: 'email not configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [OWNER_EMAIL],
        reply_to: inq.email,
        subject: `New MorrowLatch inquiry — ${inq.name}${inq.business ? ` (${inq.business})` : ''}`,
        text: [
          `Package: ${inq.package || 'Not sure yet'}`,
          `Name: ${inq.name}`,
          `Email: ${inq.email}`,
          `Business: ${inq.business || '—'}`,
          ``,
          `What work repeats:`,
          inq.task || '—',
          ``,
          `Desired result:`,
          inq.result || '—',
          ``,
          `Current tools:`,
          inq.tools || '—',
          ``,
          `Must always get approval:`,
          inq.approval || '—',
          ``,
          `Submitted: ${inq.createdAt}`,
          `It is also saved in your admin dashboard.`,
        ].join('\n'),
      }),
    });
    if (!res.ok) return { sent: false, reason: `resend status ${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: String(e && e.message ? e.message : e) };
  }
}

// ---------- app ----------
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/inquire', async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const email = String(b.email || '').trim();
  const task = String(b.task || '').trim();
  if (!name || !email || !task) {
    return res.status(400).json({ ok: false, error: 'Please add your name, email, and what work you would like help with.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'That email address does not look right — mind checking it?' });
  }
  const inq = {
    id: crypto.randomUUID(),
    package: String(b.package || '').trim(),
    name,
    email,
    business: String(b.business || '').trim(),
    task,
    result: String(b.result || '').trim(),
    tools: String(b.tools || '').trim(),
    approval: String(b.approval || '').trim(),
    status: 'New',
    createdAt: new Date().toISOString(),
  };
  const list = loadInquiries();
  list.unshift(inq);
  saveInquiries(list);
  const mail = await emailOwner(inq);
  if (!mail.sent && (RESEND_API_KEY || OWNER_EMAIL)) {
    console.warn('Inquiry email not sent:', mail.reason);
  }
  return res.json({ ok: true });
});

app.post('/api/admin/login', (req, res) => {
  const password = String((req.body || {}).password || '');
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ ok: false, error: 'Admin password is not set on the server yet.' });
  }
  const given = Buffer.from(password);
  const expected = Buffer.from(ADMIN_PASSWORD);
  const match = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!match) return res.status(401).json({ ok: false, error: 'Wrong password.' });
  res.setHeader('Set-Cookie', `ml_admin=${tokenFor()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  return res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'ml_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return res.json({ ok: true });
});

app.get('/api/admin/inquiries', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Not signed in.' });
  const list = loadInquiries();
  const counts = { total: list.length, New: 0, Reviewing: 0, 'Follow up': 0, Closed: 0 };
  for (const inq of list) {
    if (counts[inq.status] !== undefined) counts[inq.status] += 1;
  }
  return res.json({ ok: true, counts, inquiries: list });
});

app.post('/api/admin/status', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Not signed in.' });
  const { id, status } = req.body || {};
  const allowed = ['New', 'Reviewing', 'Follow up', 'Closed'];
  if (!allowed.includes(status)) return res.status(400).json({ ok: false, error: 'Unknown status.' });
  const list = loadInquiries();
  const inq = list.find((x) => x.id === id);
  if (!inq) return res.status(404).json({ ok: false, error: 'Inquiry not found.' });
  inq.status = status;
  saveInquiries(list);
  return res.json({ ok: true });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log(`MorrowLatch site listening on http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin (password ${ADMIN_PASSWORD ? 'set' : 'NOT set'})`);
  console.log(`Inquiry email: ${RESEND_API_KEY && OWNER_EMAIL ? `on → ${OWNER_EMAIL}` : 'off (store-only mode)'}`);
});
