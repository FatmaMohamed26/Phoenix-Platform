const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

let PORT = parseInt(process.env.PORT, 10) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(__dirname, 'database.sqlite');

// Initialize SQLite database
const db = new DatabaseSync(DB_FILE);

// Set up database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'therapist', 'admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS venting_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT,
    category TEXT,
    mood TEXT,
    message TEXT NOT NULL,
    immediate_advice TEXT,
    counselor_reply TEXT DEFAULT NULL,
    replied_by TEXT DEFAULT NULL,
    replied_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('short', 'long')),
    category TEXT DEFAULT 'دراسي',
    description TEXT,
    completed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mood_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    mood TEXT NOT NULL,
    emoji TEXT,
    score INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    user_id INTEGER PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT,
    responses_json TEXT,
    primary_trait TEXT,
    insights TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Pre-seed demo users if none exist
const countStmt = db.prepare('SELECT COUNT(*) as count FROM users');
const userCount = countStmt.get().count;

if (userCount === 0) {
  const insertUser = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)');
  insertUser.run('أحمد المهدي (مدير النظام)', 'admin@phoenix.edu', 'admin123', 'admin');
  insertUser.run('د. ياسمين السيد (أخصائية نفسية)', 'therapist@phoenix.edu', 'doc123', 'therapist');
  insertUser.run('عمر خالد (طالب جامعي)', 'student@phoenix.edu', 'student123', 'user');

  // Seed sample initial venting message
  const insertVenting = db.prepare(`
    INSERT INTO venting_messages (user_id, user_name, category, mood, message, immediate_advice, counselor_reply, replied_by, replied_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  insertVenting.run(
    3,
    'عمر خالد (طالب جامعي)',
    'قلق الامتحانات وضغط المواد',
    'قلق ومشتت',
    'أشعر بضغط كبير مع اقتراب أسبوع الامتحانات، وأشعر بالعجز عن تنظيم وقتي بين المحاضرات والمذاكرة وتراودني أفكار بعدم القدرة على الإنجاز.',
    'تنظيم الوقت يبدأ بتقسيم المواد إلى جلسات بومودورو (25 دقيقة تركيز + 5 دقائق راحة)، مع كتابة قائمة مهام يومية واقعية لا تتعدى 3 أولويات.',
    'أهلاً بك يا عمر. الضغط الدراسي شعور طبيعي جداً يمر به أغلب الطلاب، والمهم ألا تلوم نفسك. خصص اليوم نصف ساعة لتنظيم جدول واقعي وابدأ بالمادة الأسهل لكسر حاجز الخوف، وتذكر أن تأخذ استراحات حقيقية وممارسة تمرين التنفس المهدئ في المنصة. نحن معك دائماً.',
    'د. ياسمين السيد (أخصائية نفسية)'
  );

  // Seed sample goals
  const insertGoal = db.prepare('INSERT INTO goals (user_id, title, type, category, description, completed) VALUES (?, ?, ?, ?, ?, ?)');
  insertGoal.run(3, 'إنهاء مراجعة الفصل الأول والثاني قبل يوم الخميس', 'short', 'دراسي', 'التركيز على الملخصات وحل الاختبارات السابقة', 1);
  insertGoal.run(3, 'ممارسة تمرين التنفس يومياً لمدة 5 دقائق صباحاً', 'short', 'صحة نفسية', 'تطبيق تقنية 4-7-8 لتقليل التوتر الصباحي', 0);
  insertGoal.run(3, 'التخرج بمرتبة شرف وإتقان اللغة الإنجليزية الأكاديمية', 'long', 'تطوير ذات', 'خطة مستمرة طوال العام الدراسي لتحسين المعدل التراكمي', 0);

  console.log('✅ Pre-seeded demo accounts and data successfully.');
}


// ---------- .env loader (SMTP settings, activation codes) ----------
try {
  for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env file: defaults are used */ }

// ---------- Minimal SMTP client (no npm packages needed): Gmail / Outlook / any SMTP ----------
const net = require('node:net');
const tls = require('node:tls');
const mailReady = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const b64 = (x) => Buffer.from(x, 'utf8').toString('base64');
function sendMail(to, subject, html) {
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
  const fromAddr = (process.env.SMTP_FROM || user).match(/<([^>]+)>/)?.[1] || (process.env.SMTP_FROM || user);
  return new Promise((resolve, reject) => {
    let sock, buf = '', waiter = null, finished = false;
    const q = [];
    const fail = (e) => { if (finished) return; finished = true; try { sock.destroy(); } catch {} reject(e); };
    const bind = (x) => {
      sock = x; buf = '';
      x.setTimeout(20000, () => fail(new Error('SMTP timeout')));
      x.on('error', fail);
      x.on('data', (d) => {
        buf += d.toString('utf8');
        const lines = buf.split('\r\n');
        if (lines.length >= 2 && lines[lines.length - 1] === '' && /^\d{3} /.test(lines[lines.length - 2])) {
          const r = buf; buf = '';
          if (waiter) { const w = waiter; waiter = null; w(r); } else q.push(r);
        }
      });
    };
    const read = () => (q.length ? Promise.resolve(q.shift()) : new Promise((r) => { waiter = r; }));
    const cmd = async (c, ok) => {
      if (c !== null) sock.write(c + '\r\n');
      const r = await read();
      if (!r.startsWith(ok)) throw new Error('SMTP ' + r.trim());
      return r;
    };
    bind(secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port }));
    (async () => {
      await cmd(null, '220');
      await cmd('EHLO phoenix.local', '250');
      if (!secure && process.env.SMTP_STARTTLS !== 'false') {
        await cmd('STARTTLS', '220');
        const raw = sock; raw.removeAllListeners('data');
        bind(tls.connect({ socket: raw, servername: host }));
        await cmd('EHLO phoenix.local', '250');
      }
      await cmd('AUTH LOGIN', '334'); await cmd(b64(user), '334'); await cmd(b64(pass), '235');
      await cmd(`MAIL FROM:<${fromAddr}>`, '250');
      await cmd(`RCPT TO:<${to}>`, '250');
      await cmd('DATA', '354');
      const msg = [
        `From: =?UTF-8?B?${b64('منصة فينيكس للدعم النفسي')}?= <${fromAddr}>`,
        `To: <${to}>`, `Subject: =?UTF-8?B?${b64(subject)}?=`, 'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
        b64(html).replace(/(.{76})/g, '$1\r\n'), '.'
      ].join('\r\n');
      await cmd(msg, '250');
      sock.write('QUIT\r\n'); finished = true; sock.end(); resolve();
    })().catch(fail);
  });
}
const resetEmailHtml = (name, code) => `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
<div style="background:#144955;color:#fff;padding:18px 22px;font-size:20px;font-weight:bold">مَنَصَّة فِينِيكْس للدعم النفسي</div>
<div style="padding:22px;color:#1e293b;line-height:1.8"><p>مرحباً ${String(name).replace(/[<>&]/g, '')}،</p>
<p>وصلنا طلب لاستعادة كلمة المرور. رمز التحقق الخاص بك:</p>
<p style="text-align:center;font-size:34px;letter-spacing:8px;font-weight:bold;color:#b87c17;background:#fdf6e7;border-radius:12px;padding:12px">${code}</p>
<p>الرمز صالح لمدة 15 دقيقة. إذا لم تطلب ذلك فتجاهل هذه الرسالة وكلمة مرورك آمنة.</p></div></div>`;

// ---------- Security helpers: password hashing + sessions + role guard ----------
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function verifyPassword(pw, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const a = crypto.scryptSync(pw, salt, 64), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// One-time migration: hash any plaintext passwords already in the database
for (const u of db.prepare('SELECT id, password FROM users').all()) {
  if (!u.password.startsWith('scrypt$')) db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(u.password), u.id);
}

// ---------- Therapist ownership migration: every case/student belongs to ONE therapist ----------
for (const sql of [
  'ALTER TABLE users ADD COLUMN therapist_id INTEGER',
  'ALTER TABLE venting_messages ADD COLUMN therapist_id INTEGER',
  'ALTER TABLE venting_messages ADD COLUMN replied_by_id INTEGER',
  'ALTER TABLE venting_messages ADD COLUMN edited_at DATETIME'
]) { try { db.exec(sql); } catch { /* column already exists */ } }
db.exec("UPDATE users SET name = REPLACE(name, 'سارة المنصوري', 'ياسمين السيد') WHERE name LIKE '%سارة المنصوري%'");
db.exec("UPDATE venting_messages SET replied_by = REPLACE(replied_by, 'سارة المنصوري', 'ياسمين السيد') WHERE replied_by LIKE '%سارة المنصوري%'");
// the therapist with the fewest students (used to auto-assign new students)
const pickTherapist = (excludeId = 0) => (db.prepare(`SELECT u.id FROM users u WHERE u.role = 'therapist' AND u.id != ?
  ORDER BY (SELECT COUNT(*) FROM users s WHERE s.therapist_id = u.id), u.id LIMIT 1`).get(excludeId) || {}).id || null;
for (const st of db.prepare("SELECT id FROM users WHERE role = 'user' AND therapist_id IS NULL").all()) {
  db.prepare('UPDATE users SET therapist_id = ? WHERE id = ?').run(pickTherapist(), st.id);
}
db.exec("UPDATE venting_messages SET therapist_id = (SELECT therapist_id FROM users WHERE users.id = venting_messages.user_id) WHERE therapist_id IS NULL");
db.exec("UPDATE venting_messages SET replied_by_id = therapist_id WHERE counselor_reply IS NOT NULL AND replied_by_id IS NULL");

const sessions = new Map();      // token -> { uid, exp }
const failedLogins = new Map();  // email -> { count, last }
function getAuth(req) {
  const t = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  const s = sessions.get(t);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(t); return null; }
  return db.prepare('SELECT id, name, email, role, therapist_id, created_at FROM users WHERE id = ?').get(s.uid) || null;
}
function requireRole(req, res, roles) {
  const u = getAuth(req);
  if (!u) { sendJson(res, 401, { error: 'يجب تسجيل الدخول أولاً' }); return null; }
  if (roles && !roles.includes(u.role)) { sendJson(res, 403, { error: 'ليس لديك صلاحية للوصول لهذا الإجراء' }); return null; }
  return u;
}

// MIME types map for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// Specialized guidance dictionary for university students based on venting category
const SPECIALIZED_SOLUTIONS = {
  'قلق الامتحانات وضغط المواد': {
    title: 'خطة التعامل المتخصصة مع قلق الامتحانات',
    tips: [
      'تطبيق تقنية تجزئة المهام (Chunking): قسّم الفصل الطويل إلى عناوين فرعية صغيرة تنجز كلاً منها في 20 دقيقة.',
      'تفريغ القلق على الورق قبل المذاكرة: اكتب كل ما يثير خوفك لمدة 5 دقائق، ثم ضعه جانباً واشرع في المذاكرة.',
      'احذر من وهم المذاكرة بدون استرجاع: ركّز على حل الأسئلة السابقة والتسميع الذاتي بدلاً من إعادة القراءة السلبية.',
      'تمرين التنفس 4-7-8 المتوفر في المنصة يخفض مستوى الكورتيزول ويساعدك على التركيز فوراً.'
    ]
  },
  'التسويف وصعوبة إدارة الوقت': {
    title: 'استراتيجية كسر التسويف لطلاب الجامعة',
    tips: [
      'قاعدة الخمس دقائق: ألزم نفسك بالبدء في المهمة لمدة 5 دقائق فقط دون التزام بالإكمال، وغالباً سيستمر تدفق العمل.',
      'عزل المشتتات: ضع الهاتف في غرفة أخرى أو فعّل نمط التركيز أثناء جلسات المذاكرة.',
      'سجل أهدافك اليومية في مذكرة الأهداف هنا واكتفِ بـ 3 مهام رئيسية يومياً فقط لمنع الشعور بالإرهاق.'
    ]
  },
  'الإرهاق النفسي والاحتراق الأكاديمي': {
    title: 'برنامج استعادة التوازن وتفريغ الطاقة السلبية',
    tips: [
      'النوم غير القابل للتفاوض: 7 ساعات نوم ليلاً تعيد ترميم النواقل العصبية والذاكرة طويلة المدى.',
      'تخصيص ساعة راحة يومية بدون دراسة وبدون شاشات (مشي خفيف، حديث مع صديق مقرب).',
      'تذكّر أن قيمتك كإنسان أكبر بكثير من أي درجة أو اختبار، وأن الراحة جزء أساسي من النجاح وليست كسلاً.'
    ]
  },
  'التشتت والخوف من المستقبل المهني': {
    title: 'بوصلة التركيز على الحاضر وصناعة الفرص',
    tips: [
      'ركّز على دائرة التحكم الخاصة بك (ما تفعله اليوم)، وليس دائرة القلق (ماذا سيحدث بعد سنتين أو ثلاث).',
      'قسّم أهدافك المستقبلية في مذكرة الأهداف إلى مهارات صغيرة تكتسبها تدريجياً.',
      'استشر معالجي المنصة لترتيب أولوياتك المهنية والنفسية.'
    ]
  },
  'العلاقات والضغوط الاجتماعية بالجامعة': {
    title: 'وضع الحدود النفسية وبناء بيئة داعمة',
    tips: [
      'تعلّم قول "لا" بلباقة لأي طلبات تستنزف طاقتك قبل الامتحانات.',
      'أحِط نفسك بالزملاء الداعمين وتجنب دوائر الشكوى المستمرة التي تضخم مشاعر القلق.',
      'شارك مشاعرك في ركن الفضفضة لتفريغ الثقل النفسي بأمان تام وبدون أي أحكام.'
    ]
  }
};

// Helper: parse request JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) { // limit 5MB
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Helper: send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(data));
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    // ----------------- API ROUTES ----------------- //
    const clean = (s) => String(s || '').trim();
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const newSession = (uid) => {
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { uid, exp: Date.now() + 8 * 3600 * 1000 });
      return token;
    };

    // 1. REGISTER: the person chooses the role. Therapist / admin need an activation code from the platform owner.
    if (pathname === '/api/register' && req.method === 'POST') {
      const b = await parseBody(req);
      const name = clean(b.name), email = clean(b.email).toLowerCase(), password = String(b.password || '');
      const role = ['user', 'therapist', 'admin'].includes(b.role) ? b.role : 'user';
      if (!name || !email || !password) return sendJson(res, 400, { error: 'جميع الحقول مطلوبة (الاسم، البريد، كلمة المرور)' });
      if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: 'صيغة البريد الإلكتروني غير صحيحة' });
      if (password.length < 6) return sendJson(res, 400, { error: 'كلمة المرور يجب ألا تقل عن 6 أحرف' });
      if (role !== 'user') {
        const need = role === 'admin' ? (process.env.ADMIN_CODE || 'PHX-ADMIN-2026') : (process.env.THERAPIST_CODE || 'PHX-THERAPIST-2026');
        if (clean(b.accessCode) !== need) return sendJson(res, 403, { error: `رمز التفعيل غير صحيح، لا يمكن إنشاء حساب ${role === 'admin' ? 'أدمن' : 'معالج نفسي'} بدونه` });
      }
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return sendJson(res, 409, { error: 'هذا البريد الإلكتروني مسجل بالفعل' });
      const r = db.prepare('INSERT INTO users (name, email, password, role, therapist_id) VALUES (?, ?, ?, ?, ?)').run(name, email, hashPassword(password), role, role === 'user' ? pickTherapist() : null);
      const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(r.lastInsertRowid);
      return sendJson(res, 201, { message: 'تم إنشاء الحساب بنجاح', user, token: newSession(user.id) });
    }

    // 2. LOGIN (role comes from the account itself, not from what the client claims)
    if (pathname === '/api/login' && req.method === 'POST') {
      const b = await parseBody(req);
      const email = clean(b.email).toLowerCase(), password = String(b.password || '');
      if (!email || !password) return sendJson(res, 400, { error: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور' });
      const f = failedLogins.get(email);
      if (f && f.count >= 5 && Date.now() - f.last < 10 * 60 * 1000) return sendJson(res, 429, { error: 'محاولات كثيرة خاطئة، حاول بعد 10 دقائق' });
      const row = db.prepare('SELECT id, name, email, password, role, created_at FROM users WHERE email = ?').get(email);
      if (!row || !verifyPassword(password, row.password)) {
        failedLogins.set(email, { count: (f && Date.now() - f.last < 10 * 60 * 1000 ? f.count : 0) + 1, last: Date.now() });
        return sendJson(res, 401, { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
      }
      failedLogins.delete(email);
      const { password: _, ...user } = row;
      return sendJson(res, 200, { message: 'تم تسجيل الدخول بنجاح', user, token: newSession(user.id) });
    }

    if (pathname === '/api/me' && req.method === 'GET') {
      const me = requireRole(req, res); if (!me) return;
      return sendJson(res, 200, { user: me });
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      sessions.delete((req.headers.authorization || '').slice(7));
      return sendJson(res, 200, { message: 'تم تسجيل الخروج' });
    }

    // 2b. FORGOT PASSWORD: step 1 -> make sure the email is registered, then email a 6-digit code (valid 15 min)
    if (pathname === '/api/forgot-password' && req.method === 'POST') {
      const email = clean((await parseBody(req)).email).toLowerCase();
      if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: 'اكتب بريداً إلكترونياً صحيحاً' });
      const u = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
      if (!u) return sendJson(res, 404, { error: 'هذا البريد الإلكتروني غير مسجل في المنصة' });
      const old = db.prepare('SELECT expires_at FROM password_resets WHERE user_id = ?').get(u.id);
      if (old && old.expires_at > Date.now() + 14 * 60 * 1000) return sendJson(res, 429, { error: 'تم إرسال رمز للتو، انتظر دقيقة ثم حاول مرة أخرى' });
      const code = String(crypto.randomInt(100000, 1000000));
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(u.id);
      db.prepare('INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES (?, ?, ?)').run(u.id, sha256(code), Date.now() + 15 * 60 * 1000);
      if (mailReady()) {
        try {
          await sendMail(email, 'رمز استعادة كلمة المرور - منصة فينيكس', resetEmailHtml(u.name, code));
          return sendJson(res, 200, { message: 'تم إرسال رمز الاستعادة إلى بريدك الإلكتروني (صالح 15 دقيقة). افحص البريد المزعج أيضاً.' });
        } catch (e) {
          console.error('❌ فشل إرسال البريد:', e.message);
          db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(u.id);
          return sendJson(res, 502, { error: 'تعذر إرسال البريد الإلكتروني الآن، تأكد من إعدادات SMTP في ملف .env' });
        }
      }
      // SMTP not configured yet -> demo mode: print the code and show it on screen
      console.log(`🔑 [وضع التجربة - لم يتم إعداد البريد] رمز ${email}: ${code}`);
      return sendJson(res, 200, { message: 'لم يتم إعداد خدمة البريد بعد (راجع ملف .env.example).', devCode: code });
    }

    // 2c. FORGOT PASSWORD: step 2 -> verify code + set new password
    if (pathname === '/api/reset-password' && req.method === 'POST') {
      const b = await parseBody(req);
      const email = clean(b.email).toLowerCase(), code = clean(b.code), newPassword = String(b.newPassword || '');
      if (newPassword.length < 6) return sendJson(res, 400, { error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' });
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      const pr = u && db.prepare('SELECT * FROM password_resets WHERE user_id = ?').get(u.id);
      const bad = () => sendJson(res, 400, { error: 'الرمز غير صحيح أو منتهي الصلاحية' });
      if (!pr || pr.expires_at < Date.now() || pr.attempts >= 5) return bad();
      const ok = crypto.timingSafeEqual(Buffer.from(sha256(code)), Buffer.from(pr.code_hash));
      if (!ok) { db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ?').run(u.id); return bad(); }
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(newPassword), u.id);
      db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(u.id);
      for (const [t, s] of sessions) if (s.uid === u.id) sessions.delete(t); // log out old sessions
      return sendJson(res, 200, { message: 'تم تغيير كلمة المرور بنجاح، يمكنك تسجيل الدخول الآن' });
    }

    // 3. ADMIN: list users (never returns passwords)
    if (pathname === '/api/users' && req.method === 'GET') {
      if (!requireRole(req, res, ['admin'])) return;
      return sendJson(res, 200, { users: db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id DESC').all() });
    }

    // 3b. ADMIN: create user with any role
    if (pathname === '/api/users' && req.method === 'POST') {
      if (!requireRole(req, res, ['admin'])) return;
      const b = await parseBody(req);
      const name = clean(b.name), email = clean(b.email).toLowerCase(), password = String(b.password || '');
      if (!name || !EMAIL_RE.test(email) || password.length < 6) return sendJson(res, 400, { error: 'تأكد من الاسم والبريد وكلمة مرور لا تقل عن 6 أحرف' });
      if (!['user', 'therapist', 'admin'].includes(b.role)) return sendJson(res, 400, { error: 'الدور المحدد غير صالح' });
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return sendJson(res, 409, { error: 'هذا البريد الإلكتروني مسجل بالفعل' });
      const r = db.prepare('INSERT INTO users (name, email, password, role, therapist_id) VALUES (?, ?, ?, ?, ?)').run(name, email, hashPassword(password), b.role, b.role === 'user' ? pickTherapist() : null);
      return sendJson(res, 201, { message: 'تمت إضافة المستخدم', id: r.lastInsertRowid });
    }

    // 4. ADMIN: delete user (not yourself)
    if (pathname.startsWith('/api/users/') && req.method === 'DELETE') {
      const me = requireRole(req, res, ['admin']); if (!me) return;
      const id = Number(pathname.split('/').pop());
      if (id === me.id) return sendJson(res, 400, { error: 'لا يمكنك حذف حسابك الحالي' });
      const heir = pickTherapist(id);
      db.prepare('UPDATE users SET therapist_id = ? WHERE therapist_id = ?').run(heir, id);
      db.prepare('UPDATE venting_messages SET therapist_id = ? WHERE therapist_id = ?').run(heir, id);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      for (const [t, s] of sessions) if (s.uid === id) sessions.delete(t);
      return sendJson(res, 200, { message: 'تم حذف المستخدم بنجاح' });
    }

    // 5. ADMIN: stats (counts only, no private content)
    if (pathname === '/api/stats' && req.method === 'GET') {
      if (!requireRole(req, res, ['admin'])) return;
      const n = (sql) => db.prepare(sql).get().count;
      return sendJson(res, 200, { stats: {
        totalUsers: n('SELECT COUNT(*) as count FROM users'),
        totalStudents: n("SELECT COUNT(*) as count FROM users WHERE role = 'user'"),
        totalTherapists: n("SELECT COUNT(*) as count FROM users WHERE role = 'therapist'"),
        totalVenting: n('SELECT COUNT(*) as count FROM venting_messages'),
        totalGoals: n('SELECT COUNT(*) as count FROM goals'),
        totalTests: n('SELECT COUNT(*) as count FROM test_results')
      } });
    }

    // THERAPISTS LIST (names only) so a student can choose who receives his case
    if (pathname === '/api/therapists' && req.method === 'GET') {
      const me = requireRole(req, res, ['user']); if (!me) return;
      return sendJson(res, 200, { therapists: db.prepare("SELECT id, name FROM users WHERE role = 'therapist' ORDER BY id").all(), current: me.therapist_id });
    }

    // 6. VENTING: therapist sees all cases, student sees only his own. Admin has no access to private content.
    if (pathname === '/api/venting' && req.method === 'GET') {
      const me = requireRole(req, res, ['user', 'therapist']); if (!me) return;
      const messages = me.role === 'therapist'
        ? db.prepare('SELECT * FROM venting_messages WHERE therapist_id = ? ORDER BY id DESC').all(me.id)
        : db.prepare('SELECT * FROM venting_messages WHERE user_id = ? ORDER BY id DESC').all(me.id);
      return sendJson(res, 200, { messages });
    }

    // 7. VENTING: student posts (identity comes from the token)
    if (pathname === '/api/venting' && req.method === 'POST') {
      const me = requireRole(req, res, ['user']); if (!me) return;
      const { category, mood, message, therapistId } = await parseBody(req);
      if (!message || !message.trim()) return sendJson(res, 400, { error: 'الرجاء كتابة رسالة الفضفضة' });
      const pack = SPECIALIZED_SOLUTIONS[category] || SPECIALIZED_SOLUTIONS['قلق الامتحانات وضغط المواد'];
      let tid = me.therapist_id;
      if (therapistId && db.prepare("SELECT id FROM users WHERE id = ? AND role = 'therapist'").get(Number(therapistId))) tid = Number(therapistId);
      if (!tid) tid = pickTherapist();
      if (tid !== me.therapist_id) db.prepare('UPDATE users SET therapist_id = ? WHERE id = ?').run(tid, me.id);
      const r = db.prepare('INSERT INTO venting_messages (user_id, user_name, category, mood, message, immediate_advice, therapist_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(me.id, me.name, category || 'عام', mood || 'مرهق', message.trim(), JSON.stringify({ title: pack.title, tips: pack.tips }), tid);
      const data = db.prepare('SELECT * FROM venting_messages WHERE id = ?').get(r.lastInsertRowid);
      return sendJson(res, 201, { message: 'تم إرسال الفضفضة وتوليد الحلول المتخصصة بنجاح', data });
    }

    // 8. THERAPIST ONLY: reply to / edit / delete a reply - and only on his OWN cases
    if (pathname.startsWith('/api/venting/') && pathname.endsWith('/reply') && ['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      const me = requireRole(req, res, ['therapist']); if (!me) return;
      const messageId = Number(pathname.split('/')[3]);
      const row = db.prepare('SELECT * FROM venting_messages WHERE id = ?').get(messageId);
      if (!row || row.therapist_id !== me.id) return sendJson(res, 403, { error: 'هذه الحالة ليست ضمن طلاباتك' });
      if (req.method === 'DELETE') {
        db.prepare('UPDATE venting_messages SET counselor_reply = NULL, replied_by = NULL, replied_by_id = NULL, replied_at = NULL, edited_at = NULL WHERE id = ?').run(messageId);
        return sendJson(res, 200, { message: 'تم حذف الرد، ولن يظهر للطالب بعد الآن' });
      }
      const { replyText } = await parseBody(req);
      if (!replyText || !replyText.trim()) return sendJson(res, 400, { error: 'نص الرد والاستشارة مطلوب' });
      if (req.method === 'PATCH') {
        if (!row.counselor_reply) return sendJson(res, 400, { error: 'لا يوجد رد لتعديله' });
        db.prepare('UPDATE venting_messages SET counselor_reply = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?').run(replyText.trim(), messageId);
        return sendJson(res, 200, { message: 'تم تعديل الرد وسيصل الطالب بالنسخة الجديدة' });
      }
      db.prepare('UPDATE venting_messages SET counselor_reply = ?, replied_by = ?, replied_by_id = ?, replied_at = CURRENT_TIMESTAMP, edited_at = NULL WHERE id = ?').run(replyText.trim(), me.name, me.id, messageId);
      return sendJson(res, 200, { message: 'تم إرسال رد المعالج النفسي بنجاح', data: db.prepare('SELECT * FROM venting_messages WHERE id = ?').get(messageId) });
    }

    // 9-11. GOALS: students only, each on his own goals
    if (pathname === '/api/goals' && req.method === 'GET') {
      const me = requireRole(req, res, ['user']); if (!me) return;
      return sendJson(res, 200, { goals: db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY id DESC').all(me.id) });
    }
    if (pathname === '/api/goals' && req.method === 'POST') {
      const me = requireRole(req, res, ['user']); if (!me) return;
      const { title, type, category, description } = await parseBody(req);
      if (!title || !['short', 'long'].includes(type)) return sendJson(res, 400, { error: 'عنوان الهدف ونوعه (قصير / طويل المدى) مطلوبان' });
      const r = db.prepare('INSERT INTO goals (user_id, title, type, category, description) VALUES (?, ?, ?, ?, ?)').run(me.id, title.trim(), type, category || 'دراسي', description || '');
      return sendJson(res, 201, { message: 'تمت إضافة الهدف بنجاح', goal: db.prepare('SELECT * FROM goals WHERE id = ?').get(r.lastInsertRowid) });
    }
    if (pathname.startsWith('/api/goals/') && req.method === 'PATCH') {
      const me = requireRole(req, res, ['user']); if (!me) return;
      const { completed } = await parseBody(req);
      db.prepare('UPDATE goals SET completed = ? WHERE id = ? AND user_id = ?').run(completed ? 1 : 0, Number(pathname.split('/').pop()), me.id);
      return sendJson(res, 200, { message: 'تم تحديث حالة الهدف' });
    }
    if (pathname.startsWith('/api/goals/') && req.method === 'DELETE') {
      const me = requireRole(req, res, ['user']); if (!me) return;
      db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(Number(pathname.split('/').pop()), me.id);
      return sendJson(res, 200, { message: 'تم حذف الهدف بنجاح' });
    }

    // MOODS: students log how they feel; chart + streak are built from this
    if (pathname === '/api/moods' && req.method === 'POST') {
      const me = requireRole(req, res, ['user']); if (!me) return;
      const { mood, emoji, score } = await parseBody(req);
      const sc = Number(score);
      if (!mood || !(sc >= 1 && sc <= 4)) return sendJson(res, 400, { error: 'بيانات الشعور غير صحيحة' });
      db.prepare('INSERT INTO mood_logs (user_id, mood, emoji, score) VALUES (?, ?, ?, ?)').run(me.id, clean(mood).slice(0, 60), clean(emoji).slice(0, 8), sc);
      return sendJson(res, 201, { message: 'تم تسجيل شعورك' });
    }
    if (pathname === '/api/moods' && req.method === 'GET') {
      const me = requireRole(req, res, ['user']); if (!me) return;
      return sendJson(res, 200, { moods: db.prepare('SELECT mood, emoji, score, created_at FROM mood_logs WHERE user_id = ? ORDER BY id DESC LIMIT 60').all(me.id) });
    }

    // 12. RORSCHACH: students save results; 13. therapist sees all, student sees his own
    if (pathname === '/api/test-results' && req.method === 'POST') {
      const me = requireRole(req, res, ['user']); if (!me) return;
      const { responses, primaryTrait, insights } = await parseBody(req);
      const r = db.prepare('INSERT INTO test_results (user_id, user_name, responses_json, primary_trait, insights) VALUES (?, ?, ?, ?, ?)')
        .run(me.id, me.name, JSON.stringify(responses || []), clean(primaryTrait).slice(0, 300), clean(insights).slice(0, 4000));
      return sendJson(res, 201, { message: 'تم حفظ نتيجة اختبار رورشاخ بنجاح', testId: r.lastInsertRowid });
    }
    if (pathname === '/api/test-results' && req.method === 'GET') {
      const me = requireRole(req, res, ['user', 'therapist']); if (!me) return;
      const results = me.role === 'therapist'
        ? db.prepare('SELECT t.* FROM test_results t JOIN users u ON u.id = t.user_id WHERE u.therapist_id = ? ORDER BY t.id DESC LIMIT 100').all(me.id)
        : db.prepare('SELECT * FROM test_results WHERE user_id = ? ORDER BY id DESC').all(me.id);
      return sendJson(res, 200, { results });
    }

    // ----------------- STATIC FILE SERVING ----------------- //
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
      safePath = '/index.html';
    }

    const filePath = path.join(PUBLIC_DIR, safePath);

    // Check if file exists inside PUBLIC_DIR
    if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return;
    }

    // Fallback to index.html for SPA-style routing
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');

  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: 'حدث خطأ في الخادم', details: err.message });
  }
});

function startServer(portToTry) {
  server.listen(portToTry, () => {
    console.log(`====================================================`);
    console.log(`🦅 منصة فينيكس للدعم النفسي الجامعي تعمل بنجاح!`);
    console.log(`🌐 الرابط المحلي: http://localhost:${portToTry}`);
    console.log(`📁 قاعدة البيانات: SQLite (${DB_FILE})`);
    console.log(`====================================================`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️ المنفذ ${PORT} مشغول، جاري تجربة المنفذ ${PORT + 1}...`);
    PORT++;
    startServer(PORT);
  } else {
    console.error('Server error:', err);
  }
});

startServer(PORT);
