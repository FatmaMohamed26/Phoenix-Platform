/* ===================================================================
   مَنَصَّة فِينِيكْس لِلدَّعْمِ النَّفْسِي الجَامِعِي - FRONTEND SCRIPT (app.js)
   =================================================================== */

// Global State
let currentUser = null;
let currentAuthMode = 'login'; // 'login' or 'register'
let authToken = localStorage.getItem('phoenix_token');

// Which screens each role is allowed to open (enforced again on the server for every API call)
const VIEW_ACCESS = {
  user: ['viewEmergency', 'viewOverview', 'viewVenting', 'viewGoals', 'viewBreathing', 'viewRorschach'],
  therapist: ['viewTherapistHome', 'viewTherapistHub', 'viewTherapistTests'],
  admin: ['viewAdminHome', 'viewAdminDb', 'viewAdminStats']
};

// Attach the session token to every /api call, and log out automatically if the session expired
const PUBLIC_API = ['/api/login', '/api/register', '/api/logout', '/api/forgot-password', '/api/reset-password'];
const _nativeFetch = window.fetch.bind(window);
window.fetch = async (url, opts = {}) => {
  const isApi = typeof url === 'string' && url.startsWith('/api/');
  if (isApi && authToken) opts = { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + authToken } };
  const res = await _nativeFetch(url, opts);
  if (isApi && res.status === 401 && authToken && !PUBLIC_API.includes(url)) logout();
  return res;
};
let currentGoalsFilter = 'all';

// Breathing Exercise State
let breathingTimer = null;
let breathingActive = false;
let breathingPhase = 'idle'; // 'inhale', 'hold', 'exhale'
let breathingCount = 0;

// Rorschach Test State
let rorschachStep = 0;
let rorschachAnswers = [];

// Rorschach Inkblot SVG Cards & Presets
const RORSCHACH_CARDS = [
  {
    id: 1,
    title: 'البطاقة الأولى: التكيف المبدئي ورد الفعل الأول',
    svg: `<svg viewBox="0 0 400 240" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M200 40 C170 30 110 50 80 80 C50 110 40 160 70 190 C100 210 140 180 160 170 C180 160 190 180 200 190 C210 180 220 160 240 170 C260 180 300 210 330 190 C360 160 350 110 320 80 C290 50 230 30 200 40 Z" fill="#133E48" opacity="0.85"/>
      <path d="M200 50 C185 70 160 90 140 110 C120 130 130 160 150 160 C170 160 185 140 200 130 C215 140 230 160 250 160 C270 160 280 130 260 110 C240 90 215 70 200 50 Z" fill="#0c2e36"/>
      <circle cx="200" cy="110" r="14" fill="#d99a2c" opacity="0.9"/>
      <path d="M200 80 Q150 40 110 50 Q160 75 190 95 Q240 75 290 50 Q250 40 200 80 Z" fill="#d99a2c" opacity="0.6"/>
    </svg>`,
    options: [
      'طائر أو كائن محلق بأجنحة ممتدة',
      'فراشة أو خفاش يتنقل في الظلام',
      'قناع واقٍ أو درع حماية',
      'شخصان ينظران لبعضهما أو كفان داعمان'
    ]
  },
  {
    id: 2,
    title: 'البطاقة الثانية: التفاعل الاجتماعي والدعم الإنساني',
    svg: `<svg viewBox="0 0 400 240" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M120 60 C90 80 70 130 100 170 C120 190 150 170 160 140 C170 110 150 80 120 60 Z" fill="#133E48" opacity="0.85"/>
      <path d="M280 60 C310 80 330 130 300 170 C280 190 250 170 240 140 C230 110 250 80 280 60 Z" fill="#133E48" opacity="0.85"/>
      <circle cx="140" cy="90" r="12" fill="#d99a2c"/>
      <circle cx="260" cy="90" r="12" fill="#d99a2c"/>
      <path d="M180 180 C190 170 210 170 220 180 C230 195 210 210 200 210 C190 210 170 195 180 180 Z" fill="#ef4444" opacity="0.75"/>
      <path d="M200 40 C185 55 185 70 200 80 C215 70 215 55 200 40 Z" fill="#d99a2c" opacity="0.8"/>
    </svg>`,
    options: [
      'شخصان يتبادلان التحية أو يرقصان معاً',
      'أيادٍ متشابكة تقدم مساندة ودعم',
      'لهب مشتعل أو طاقة داخلية متفجرة',
      'كائنان متقابلان في مرآة'
    ]
  },
  {
    id: 3,
    title: 'البطاقة الثالثة: التوازن العاطفي والضغط الداخلي',
    svg: `<svg viewBox="0 0 400 240" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M130 90 C110 100 90 140 120 180 C140 190 170 180 160 150 C155 130 145 110 130 90 Z" fill="#0c2e36"/>
      <path d="M270 90 C290 100 310 140 280 180 C260 190 230 180 240 150 C245 130 255 110 270 90 Z" fill="#0c2e36"/>
      <path d="M185 130 C175 115 175 95 190 95 C195 105 205 105 210 95 C225 95 225 115 215 130 C208 140 192 140 185 130 Z" fill="#d99a2c"/>
      <path d="M200 150 C180 170 180 190 200 205 C220 190 220 170 200 150 Z" fill="#206d7e" opacity="0.7"/>
    </svg>`,
    options: [
      'فراشة ذهبية متزنة في المنتصف',
      'طبيبان أو باحثان يجريان تجربة',
      'آلة موسيقية أو نغمات متناغمة',
      'وجه عميق الملامح يفكر بهدوء'
    ]
  },
  {
    id: 4,
    title: 'البطاقة الرابعة: النظرة للمستقبل والنهوض من التحديات',
    svg: `<svg viewBox="0 0 400 240" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M200 30 C150 50 80 100 110 170 C130 210 180 200 200 180 C220 200 270 210 290 170 C320 100 250 50 200 30 Z" fill="#133E48" opacity="0.9"/>
      <path d="M200 60 C175 80 160 120 180 150 C190 160 210 160 220 150 C240 120 225 80 200 60 Z" fill="#d99a2c" opacity="0.75"/>
      <path d="M200 100 C190 110 190 130 200 140 C210 130 210 110 200 100 Z" fill="#ffffff" opacity="0.8"/>
    </svg>`,
    options: [
      'طائر الفينيق وهو ينهض بجناحين قويين',
      'شجرة عملاقة ذات جذور متينة وأغصان مورقة',
      'جبل شامخ أو قمة يصل إليها المتسلق',
      'بوابة مضيئة تفتح نحو أفق رحب'
    ]
  }
];


// ---- Rorschach scoring: every option adds points to personality dimensions ----
const DIMS = {
  E: { label: 'حساسية وجدانية', hint: 'تتأثر بمشاعرك ومشاعر الآخرين بعمق وتلاحظ التفاصيل الوجدانية', grow: 'جرّب تسمية مشاعرك وتفريغها أولاً بأول في ركن الفضفضة' },
  S: { label: 'ميل اجتماعي تعاوني', hint: 'تبحث عن الدعم والتواصل مع الآخرين وقت الضغط', grow: 'جرّب بناء دائرة دعم صغيرة تشاركها ما تمر به' },
  A: { label: 'توتر داخلي وحذر', hint: 'تحمل قدراً من التوتر أو الحذر الداخلي في مواجهة الضغوط', grow: 'خصص وقتاً يومياً للراحة والتنفس بدل كتمان الضغط' },
  R: { label: 'مرونة وقدرة على التعافي', hint: 'تميل لرؤية الأمل والنهوض بعد التحديات', grow: 'ثق بقدرتك على النهوض واحتفل بإنجازاتك الصغيرة' },
  C: { label: 'تفكير تحليلي هادئ', hint: 'تعتمد على المنطق والملاحظة الدقيقة في فهم المواقف', grow: 'اسمح لنفسك أحياناً بالتعبير عن مشاعرك لا بتحليلها فقط' },
  V: { label: 'خيال وإبداع', hint: 'تعبّر عن نفسك بصور وأفكار مبتكرة', grow: 'حوّل خيالك إلى نشاط منظم مثل الكتابة أو الرسم' }
};

const OPTION_SCORES = {
  'طائر أو كائن محلق بأجنحة ممتدة': { R: 2, V: 1 },
  'فراشة أو خفاش يتنقل في الظلام': { A: 2, E: 1, V: 1 },
  'قناع واقٍ أو درع حماية': { A: 1, C: 1 },
  'شخصان ينظران لبعضهما أو كفان داعمان': { S: 2, E: 1 },
  'شخصان يتبادلان التحية أو يرقصان معاً': { S: 2, R: 1 },
  'أيادٍ متشابكة تقدم مساندة ودعم': { E: 2, S: 1 },
  'لهب مشتعل أو طاقة داخلية متفجرة': { A: 2, V: 1 },
  'كائنان متقابلان في مرآة': { C: 2 },
  'فراشة ذهبية متزنة في المنتصف': { R: 1, V: 1, C: 1 },
  'طبيبان أو باحثان يجريان تجربة': { C: 2, S: 1 },
  'آلة موسيقية أو نغمات متناغمة': { V: 2, E: 1 },
  'وجه عميق الملامح يفكر بهدوء': { C: 1, E: 1, A: 1 },
  'طائر الفينيق وهو ينهض بجناحين قويين': { R: 2, E: 1 },
  'شجرة عملاقة ذات جذور متينة وأغصان مورقة': { R: 1, C: 1, S: 1 },
  'جبل شامخ أو قمة يصل إليها المتسلق': { R: 1, C: 1, A: 1 },
  'بوابة مضيئة تفتح نحو أفق رحب': { V: 1, R: 1, E: 1 }
};

// Free-text answers are matched by keywords (each dimension counts once per card)
const KEYWORDS = {
  E: /حزن|بكاء|دموع|قلب|الحب|وحدة|وحيد|ألم|شوق|حنين/,
  S: /صديق|أصدقاء|عائلة|أمي|أبي|ناس|شخص|أيدي|معاً|مع بعض/,
  A: /خوف|ظلام|وحش|دم|نار|غضب|ضغط|قلق|ثعبان|عنكبوت|رعب|حرب|كابوس/,
  R: /أمل|نور|فينيق|طير|جبل|نهوض|قوة|شمس|فجر|ضوء|نجاح/,
  C: /عقل|خريطة|تشريح|آلة|علم|عظام|خلية|تجربة|دماغ/,
  V: /فن|لون|زهرة|زهور|موسيقى|خيال|فراش|حلم|لوحة|سحاب|غيم/
};

function scoreAnswer(text) {
  if (OPTION_SCORES[text]) return OPTION_SCORES[text];
  const s = {};
  for (const k in KEYWORDS) if (KEYWORDS[k].test(text)) s[k] = 1;
  return Object.keys(s).length ? s : { V: 1 }; // free expression with no clear keyword
}

const DIM_TIPS = {
  E: ['اكتب مشاعرك يومياً في <strong>ركن الفضفضة</strong> قبل أن تتراكم.', 'شارك ما يؤلمك مع شخص تثق به؛ حساسيتك نقطة قوة عندما تجد من يسمعها.'],
  S: ['حافظ على تواصلك مع الأصدقاء والعائلة خصوصاً وقت الامتحانات.', 'يمكنك طلب رأي معالج المنصة عبر <strong>ركن الفضفضة</strong> لتدعيم شبكة دعمك.'],
  A: ['مارس <strong>تمرين التنفس 4-7-8</strong> عند الشعور بالتوتر أو قبل الامتحان.', 'قسّم المهام الكبيرة إلى خطوات صغيرة في <strong>مذكرة الأهداف</strong> لتخفيف الضغط.'],
  R: ['استثمر مرونتك بوضع هدف طويل المدى في <strong>مذكرة الأهداف</strong>.', 'شارك تجربتك في النهوض مع زملائك فقد تلهمهم.'],
  C: ['استخدم تحليلك لوضع جدول مذاكرة واقعي ومتابعته.', 'خصص وقتاً للتعبير عن مشاعرك بالكتابة الحرة وليس بالتحليل فقط.'],
  V: ['حوّل خيالك إلى كتابة أو رسم يخفف عنك التوتر.', 'اربط إبداعك بأهدافك الدراسية في <strong>مذكرة الأهداف</strong>.']
};

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', async () => {
  // Restore the session only if the server still accepts the saved token
  if (!authToken) return;
  try {
    const res = await fetch('/api/me');
    if (!res.ok) throw new Error('expired');
    currentUser = (await res.json()).user;
    localStorage.setItem('phoenix_user', JSON.stringify(currentUser));
    launchAppForUser(currentUser);
  } catch (e) {
    clearSession();
  }
});

// ================= AUTHENTICATION LOGIC =================
function switchAuthTab(mode) {
  currentAuthMode = mode;
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const nameGroup = document.getElementById('nameGroup');
  const authBtnText = document.getElementById('authBtnText');
  const authAlert = document.getElementById('authAlert');

  authAlert.style.display = 'none';
  if (mode !== 'register') { document.getElementById('roleGroup').style.display = 'none'; document.getElementById('codeGroup').style.display = 'none'; }
  document.getElementById('forgotLinkRow').style.display = mode === 'register' ? 'none' : 'block';

  if (mode === 'register') {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    nameGroup.style.display = 'block';
    document.getElementById('roleGroup').style.display = 'block';
    onRegRoleChange();
    authBtnText.innerText = 'إنشاء الحساب والانضمام';
  } else {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    nameGroup.style.display = 'none';
    authBtnText.innerText = 'تسجيل الدخول';
  }
}


function togglePasswordVisibility() {
  const pwdInput = document.getElementById('userPasswordInput');
  const icon = document.getElementById('pwdToggleIcon');
  if (pwdInput.type === 'password') {
    pwdInput.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    pwdInput.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

function fillDemo(email, pwd, role) {
  switchAuthTab('login');
  document.getElementById('userEmailInput').value = email;
  document.getElementById('userPasswordInput').value = pwd;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const alertBox = document.getElementById('authAlert');
  alertBox.style.display = 'none';

  const email = document.getElementById('userEmailInput').value.trim();
  const password = document.getElementById('userPasswordInput').value;
  const name = document.getElementById('userNameInput').value.trim();

  const endpoint = currentAuthMode === 'register' ? '/api/register' : '/api/login';
  const payload = {
    email,
    password
  };

  if (currentAuthMode === 'register') {
    if (!name) {
      showAuthAlert('الرجاء كتابة اسمك الكامل', 'error');
      return;
    }
    payload.name = name;
    payload.role = document.getElementById('regRole').value;
    if (payload.role !== 'user') payload.accessCode = document.getElementById('regCode').value.trim();
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      showAuthAlert(data.error || 'حدث خطأ أثناء المعالجة', 'error');
      return;
    }

    // Success
    currentUser = data.user;
    authToken = data.token;
    localStorage.setItem('phoenix_token', authToken);
    localStorage.setItem('phoenix_user', JSON.stringify(currentUser));
    showAuthAlert(data.message || 'تمت العملية بنجاح! جاري التوجيه...', 'success');

    setTimeout(() => {
      launchAppForUser(currentUser);
    }, 700);

  } catch (err) {
    showAuthAlert('تعذر الاتصال بالخادم، يرجى التأكد من تشغيل الخادم.', 'error');
  }
}

function showAuthAlert(msg, type) {
  const alertBox = document.getElementById('authAlert');
  alertBox.className = `alert-box alert-${type}`;
  alertBox.innerText = msg;
  alertBox.style.display = 'block';
}

function clearSession() {
  currentUser = null;
  authToken = null;
  localStorage.removeItem('phoenix_user');
  localStorage.removeItem('phoenix_token');
}

function logout() {
  if (authToken) _nativeFetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + authToken } }).catch(() => {});
  clearSession();
  rorschachStep = 0;
  rorschachAnswers = [];
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('authAlert').style.display = 'none';
  document.getElementById('authForm').reset();
}

// ================= APP SHELL & ROUTING =================
function launchAppForUser(user) {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';

  // Set user info in header
  document.getElementById('headerUserName').innerText = user.name;
  document.querySelectorAll('.hero-greet').forEach(h => { h.innerText = greetingFor(user); });
  document.getElementById('userAvatarChar').innerText = user.name.charAt(0);

  const roleBadge = document.getElementById('headerUserRoleBadge');
  roleBadge.className = `badge-role role-${user.role}`;

  const roleTitles = {
    user: 'طالب / مستخدم',
    therapist: 'معالج نفسي',
    admin: 'أدمن / مدير النظام'
  };
  roleBadge.innerText = roleTitles[user.role] || user.role;

  // Setup navigation visibility based on role
  applyRoleNavigation(user.role);

  // Load only the data this role is allowed to use
  if (user.role === 'user') {
    loadTherapistChoices();
    loadVentingFeed();
    loadGoals();
    renderRorschachStep();
    refreshProgress();
  }
}

function applyRoleNavigation(role) {
  // Each role sees ONLY its own menu group
  document.getElementById('navGroupUser').style.display = role === 'user' ? 'block' : 'none';
  document.getElementById('navGroupTherapist').style.display = role === 'therapist' ? 'block' : 'none';
  document.getElementById('navGroupAdmin').style.display = role === 'admin' ? 'block' : 'none';

  if (role === 'admin') {
    navigateTo('viewAdminHome');
  } else if (role === 'therapist') {
    navigateTo('viewTherapistHome');
  } else {
    navigateTo('viewOverview');
  }
}

function switchDashboardView(roleTarget) {
  if (!currentUser || currentUser.role !== roleTarget) return;
  applyRoleNavigation(roleTarget);
}

function navigateTo(viewId) {
  // Block screens that don't belong to the current role
  if (currentUser && !(VIEW_ACCESS[currentUser.role] || []).includes(viewId)) return;

  // Hide all content views
  const views = document.querySelectorAll('.content-view');
  views.forEach(v => v.classList.remove('active'));

  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active');
  }

  // Update active sidebar nav item
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(viewId)) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Close mobile sidebar if open
  const sidebar = document.getElementById('appSidebar');
  if (sidebar) sidebar.classList.remove('open');

  // Trigger specific view loaders
  if (viewId === 'viewVenting') loadVentingFeed();
  if (viewId === 'viewGoals') loadGoals();
  if (viewId === 'viewTherapistHub') loadTherapistCases();
  if (viewId === 'viewTherapistTests') loadTherapistTests();
  if (viewId === 'viewAdminDb') loadAdminUsers();
  if (viewId === 'viewAdminStats') loadAdminStats();
}

function toggleSidebar() {
  const sidebar = document.getElementById('appSidebar');
  sidebar.classList.toggle('open');
}

// ================= DAILY WELLNESS / MOOD CHECK-IN =================
function selectMoodCheckin(moodName, tip, emoji) {
  const box = document.getElementById('moodFeedback');
  box.innerHTML = `
    <div style="display:flex; align-items:flex-start; gap:10px;">
      <span style="font-size:1.8rem;">${emoji}</span>
      <div>
        <strong>شعورك المسجل: ${moodName}</strong>
        <p style="margin-top:4px; font-weight:normal; font-size:0.92rem;">${tip}</p>
      </div>
    </div>
  `;
  box.style.display = 'block';
}

// ================= VENTING & SPECIALIZED SOLUTIONS =================
async function handleVentingSubmit(event) {
  event.preventDefault();

  const category = document.getElementById('ventingCategory').value;
  const mood = document.getElementById('ventingMood').value;
  const message = document.getElementById('ventingText').value.trim();

  if (!message) return;

  const payload = {
    userId: currentUser ? currentUser.id : 0,
    userName: currentUser ? currentUser.name : 'طالب جامعي',
    category,
    mood,
    message,
    therapistId: document.getElementById('ventingTherapist').value
  };

  try {
    const res = await fetch('/api/venting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      document.getElementById('ventingForm').reset();
      await loadVentingFeed();
      loadTherapistChoices();
    }
  } catch (err) {
    console.error('Error submitting venting:', err);
  }
}

async function loadVentingFeed() {
  const container = document.getElementById('ventingFeedList');
  if (!container) return;

  try {
    const userId = currentUser ? currentUser.id : '';
    const role = currentUser ? currentUser.role : 'user';
    const res = await fetch(`/api/venting?userId=${userId}&role=${role}`);
    const data = await res.json();
    const messages = data.messages || [];

    if (messages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-light);">
          <i class="fa-regular fa-comment-dots" style="font-size: 2.5rem; margin-bottom: 0.5rem; display: block;"></i>
          لا توجد رسائل فضفضة سابقة. شاركنا ما تشعر به لتبدأ رحلة التعافي!
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(msg => {
      let adviceData = null;
      try {
        adviceData = msg.immediate_advice ? JSON.parse(msg.immediate_advice) : null;
      } catch (e) {}

      return `
        <div class="vent-card">
          <div class="vent-card-header">
            <span class="vent-category-chip"><i class="fa-solid fa-tag"></i> ${msg.category || 'عام'}</span>
            <span class="vent-date">${formatDate(msg.created_at)}</span>
          </div>

          <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:6px;">
            <i class="fa-solid fa-user"></i> ${msg.user_name || 'طالب'} | الحالة: <strong>${msg.mood || 'طبيعي'}</strong>
          </div>

          <div class="vent-msg-body">
            «${escapeHtml(msg.message)}»
          </div>

          ${adviceData ? `
            <div class="specialized-guidance-box">
              <div class="guidance-title">
                <i class="fa-solid fa-lightbulb"></i> ${adviceData.title || 'إرشادات وحلول تخصصية:'}
              </div>
              <ul class="guidance-list">
                ${adviceData.tips ? adviceData.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('') : ''}
              </ul>
            </div>
          ` : ''}

          ${msg.counselor_reply ? `
            <div class="counselor-reply-box">
              <div class="counselor-header">
                <span class="counselor-name">
                  <i class="fa-solid fa-user-doctor"></i> استشارة: ${escapeHtml(msg.replied_by || 'المعالج النفسي')}
                </span>
                <span style="font-size:0.75rem; color:#047857;">${formatDate(msg.replied_at)}</span>
              </div>
              <p>${escapeHtml(msg.counselor_reply)}</p>
            </div>
          ` : `
            <div style="font-size:0.8rem; color:var(--text-light); text-align:left; margin-top:8px;">
              <i class="fa-regular fa-clock"></i> في انتظار مراجعة المعالج النفسي...
            </div>
          `}
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load venting messages:', err);
  }
}

// ================= GOALS & THOUGHTS JOURNAL =================
function openNewGoalModal() {
  document.getElementById('modalNewGoal').style.display = 'flex';
}

function closeNewGoalModal() {
  document.getElementById('modalNewGoal').style.display = 'none';
}

async function handleCreateGoalSubmit(event) {
  event.preventDefault();
  const type = document.querySelector('input[name="goalType"]:checked').value;
  const category = document.getElementById('goalCategory').value;
  const title = document.getElementById('goalTitle').value.trim();
  const description = document.getElementById('goalDescription').value.trim();

  if (!title) return;

  const payload = {
    userId: currentUser ? currentUser.id : 0,
    title,
    type,
    category,
    description
  };

  try {
    const res = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      closeNewGoalModal();
      document.getElementById('goalTitle').value = '';
      document.getElementById('goalDescription').value = '';
      loadGoals(currentGoalsFilter);
    }
  } catch (err) {
    console.error('Error creating goal:', err);
  }
}

function filterGoals(type) {
  currentGoalsFilter = type;
  const tabs = document.querySelectorAll('.goals-tabs .tab-btn');
  tabs.forEach(btn => {
    if (btn.getAttribute('onclick').includes(type)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  loadGoals(type);
}

async function loadGoals(filter = 'all') {
  const container = document.getElementById('goalsContainer');
  if (!container) return;

  try {
    const userId = currentUser ? currentUser.id : '';
    const res = await fetch(`/api/goals?userId=${userId}`);
    const data = await res.json();
    let goals = data.goals || [];

    if (filter !== 'all') {
      goals = goals.filter(g => g.type === filter);
    }

    if (goals.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-light);">
          <i class="fa-solid fa-bullseye" style="font-size: 2.5rem; margin-bottom: 0.5rem; display: block;"></i>
          لا توجد أهداف مسجلة في هذا القسم حالياً. أضف هدفك الأول الآن!
        </div>
      `;
      return;
    }

    container.innerHTML = goals.map(g => `
      <div class="goal-card ${g.completed ? 'completed' : ''}">
        <div>
          <div class="goal-header">
            <span class="goal-badge ${g.type === 'short' ? 'badge-short' : 'badge-long'}">
              ${g.type === 'short' ? '🎯 قصير المدى' : '🚀 طويل المدى'}
            </span>
            <span style="font-size:0.75rem; color:var(--text-light);">${g.category || 'دراسي'}</span>
          </div>

          <h4>${escapeHtml(g.title)}</h4>
          ${g.description ? `<p class="goal-desc">${escapeHtml(g.description)}</p>` : ''}
        </div>

        <div class="goal-footer">
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.85rem; font-weight:600;">
            <input type="checkbox" ${g.completed ? 'checked' : ''} onchange="toggleGoalComplete(${g.id}, ${g.completed})">
            <span>${g.completed ? 'مُنجز بحمد الله' : 'قيد الإنجاز'}</span>
          </label>

          <button class="btn-icon btn-delete" onclick="deleteGoal(${g.id})" title="حذف الهدف">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error('Failed to load goals:', err);
  }
}

async function toggleGoalComplete(id, currentStatus) {
  try {
    await fetch(`/api/goals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !currentStatus })
    });
    loadGoals(currentGoalsFilter);
  } catch (err) {
    console.error(err);
  }
}

async function deleteGoal(id) {
  if (!confirm('هل أنت متأكد من حذف هذا الهدف؟')) return;
  try {
    await fetch(`/api/goals/${id}`, { method: 'DELETE' });
    loadGoals(currentGoalsFilter);
  } catch (err) {
    console.error(err);
  }
}

// ================= BREATHING EXERCISE (4-7-8) =================
function toggleBreathingExercise() {
  const btn = document.getElementById('btnStartBreath');
  if (breathingActive) {
    pauseBreathingExercise();
    btn.innerHTML = '<i class="fa-solid fa-play"></i> استئناف التمرين';
  } else {
    startBreathingExercise();
    btn.innerHTML = '<i class="fa-solid fa-pause"></i> إيقاف مؤقت';
  }
}

function startBreathingExercise() {
  breathingActive = true;
  runBreathingCycle();
}

function pauseBreathingExercise() {
  breathingActive = false;
  clearInterval(breathingTimer);
}

function resetBreathingExercise() {
  pauseBreathingExercise();
  const circle = document.getElementById('breathingCircle');
  circle.className = 'breathing-circle';
  document.getElementById('breathPhaseText').innerText = 'استعد';
  document.getElementById('breathCounter').innerText = '0';
  document.getElementById('breathInstruction').innerText = 'اضغط زر البدء لتصفية ذهنك';
  document.getElementById('btnStartBreath').innerHTML = '<i class="fa-solid fa-play"></i> ابدأ التمرين الآن';
}

function runBreathingCycle() {
  if (!breathingActive) return;

  const circle = document.getElementById('breathingCircle');
  const phaseText = document.getElementById('breathPhaseText');
  const counterEl = document.getElementById('breathCounter');
  const instructionEl = document.getElementById('breathInstruction');

  // PHASE 1: INHALE (4 Seconds)
  breathingPhase = 'inhale';
  circle.className = 'breathing-circle inhale';
  phaseText.innerText = 'شَـهِـيـق';
  instructionEl.innerText = 'استنشق بعمق وهدوء عبر الأنف';
  breathingCount = 4;
  counterEl.innerText = breathingCount;

  breathingTimer = setInterval(() => {
    breathingCount--;
    counterEl.innerText = breathingCount;

    if (breathingCount <= 0) {
      clearInterval(breathingTimer);

      // PHASE 2: HOLD (7 Seconds)
      breathingPhase = 'hold';
      circle.className = 'breathing-circle hold';
      phaseText.innerText = 'احْـبِـسْ';
      instructionEl.innerText = 'احتفظ بالهواء بلطف واسترخِ';
      breathingCount = 7;
      counterEl.innerText = breathingCount;

      breathingTimer = setInterval(() => {
        breathingCount--;
        counterEl.innerText = breathingCount;

        if (breathingCount <= 0) {
          clearInterval(breathingTimer);

          // PHASE 3: EXHALE (8 Seconds)
          breathingPhase = 'exhale';
          circle.className = 'breathing-circle exhale';
          phaseText.innerText = 'زَفِـيـر';
          instructionEl.innerText = 'أخرج الهواء ببطء واطرد كل التوتر';
          breathingCount = 8;
          counterEl.innerText = breathingCount;

          breathingTimer = setInterval(() => {
            breathingCount--;
            counterEl.innerText = breathingCount;

            if (breathingCount <= 0) {
              clearInterval(breathingTimer);
              // Restart next cycle smoothly
              if (breathingActive) {
                runBreathingCycle();
              }
            }
          }, 1000);
        }
      }, 1000);
    }
  }, 1000);
}

// ================= RORSCHACH INKBLOT TEST =================
function renderRorschachStep() {
  const cardData = RORSCHACH_CARDS[rorschachStep];
  if (!cardData) return;

  document.getElementById('rorschachStepIndicator').innerText = `البطاقة ${rorschachStep + 1} من ${RORSCHACH_CARDS.length}`;
  document.getElementById('rorschachProgressFill').style.width = `${((rorschachStep + 1) / RORSCHACH_CARDS.length) * 100}%`;
  document.getElementById('inkblotGraphic').innerHTML = cardData.svg;
  document.getElementById('rorschachPrompt').innerText = cardData.title;

  const optContainer = document.getElementById('rorschachOptionsContainer');
  optContainer.innerHTML = cardData.options.map(opt => `
    <button type="button" class="inkblot-opt-btn" onclick="selectInkblotOption(this, '${opt}')">
      <i class="fa-regular fa-circle-dot"></i> ${opt}
    </button>
  `).join('');

  const saved = rorschachAnswers[rorschachStep] || '';
  document.getElementById('customPerceptionInput').value = saved;
  optContainer.querySelectorAll('.inkblot-opt-btn').forEach(b => { if (b.textContent.trim() === saved) b.classList.add('active'); });
  document.getElementById('btnPrevInkblot').style.display = rorschachStep > 0 ? 'inline-flex' : 'none';

  const nextBtn = document.getElementById('btnNextInkblot');
  if (rorschachStep === RORSCHACH_CARDS.length - 1) {
    nextBtn.innerHTML = '<span>عرض وتحليل النتيجة</span> <i class="fa-solid fa-wand-magic-sparkles"></i>';
  } else {
    nextBtn.innerHTML = '<span>التالي</span> <i class="fa-solid fa-arrow-left"></i>';
  }
}

function selectInkblotOption(btn, text) {
  const buttons = document.querySelectorAll('.inkblot-opt-btn');
  buttons.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('customPerceptionInput').value = text;
}

async function nextInkblotCard() {
  const answer = document.getElementById('customPerceptionInput').value.trim();
  if (!answer) { alert('اختر أحد الاختيارات أو اكتب ما تراه في البقعة أولاً'); return; }
  rorschachAnswers[rorschachStep] = answer;

  if (rorschachStep < RORSCHACH_CARDS.length - 1) {
    rorschachStep++;
    renderRorschachStep();
  } else {
    // Finished all 4 cards -> calculate results & save
    finishRorschachTest();
  }
}

function prevInkblotCard() {
  if (rorschachStep > 0) {
    rorschachStep--;
    renderRorschachStep();
  }
}

async function finishRorschachTest() {
  const resultBox = document.getElementById('rorschachResultBox');
  document.querySelector('.rorschach-interaction').style.display = 'none';
  document.querySelector('.inkblot-stage').style.display = 'none';

  // 1) add up the points of every answer
  const totals = { E: 0, S: 0, A: 0, R: 0, C: 0, V: 0 };
  const perCard = rorschachAnswers.map((ans, i) => {
    const sc = scoreAnswer(ans);
    for (const k in sc) totals[k] += sc[k];
    const dom = Object.keys(sc).sort((a, b) => sc[b] - sc[a])[0];
    return { theme: RORSCHACH_CARDS[i].title.split(':')[1].trim(), ans, dom };
  });

  // 2) rank dimensions and build a result from the actual profile
  const ranked = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const [d1, d2] = ranked, lowest = ranked[ranked.length - 1];
  const close = totals[d2] >= totals[d1] * 0.7 && totals[d2] > 0;
  const primaryTrait = close ? `${DIMS[d1].label} مع ${DIMS[d2].label}` : `${DIMS[d1].label} بشكل واضح`;

  let insights = `تُظهر استجاباتك أنك ${DIMS[d1].hint}`;
  if (close) insights += `، كما أنك ${DIMS[d2].hint}`;
  insights += '. ';
  if (totals.A >= 3 && d1 !== 'A') insights += 'ظهرت بعض علامات التوتر الداخلي في اختياراتك، وهذا شائع جداً في فترات الضغط الدراسي. ';
  if (totals[lowest] < totals[d1]) insights += `أقل ما ظهر في استجاباتك: ${DIMS[lowest].label}، ويمكن تقويته بهذه الخطوة: ${DIMS[lowest].grow}. `;
  insights += 'هذه نتيجة إرشادية مبدئية وليست تشخيصاً طبياً.';

  document.getElementById('resultTraitTitle').innerText = primaryTrait;
  document.getElementById('resultTraitDetails').innerText = insights;

  // 3) show what the student chose, score bars, and tips matching the profile
  const tips = [...DIM_TIPS[d1], ...(totals.A >= 3 && d1 !== 'A' ? [DIM_TIPS.A[0]] : [])];
  document.getElementById('resultTipsList').innerHTML = `
    <h4 style="color:var(--primary-teal); margin-bottom:8px;"><i class="fa-solid fa-eye"></i> ما اخترته في كل بطاقة:</h4>
    <ul class="rorschach-seen">${perCard.map(c => `<li>${escapeHtml(c.theme)}: «${escapeHtml(c.ans)}» ← ${DIMS[c.dom].label}</li>`).join('')}</ul>
    <h4 style="color:var(--primary-teal); margin-bottom:8px;"><i class="fa-solid fa-chart-simple"></i> ملف شخصيتك في هذا الاختبار:</h4>
    ${ranked.map(k => `<div class="dim-row"><span class="dim-label">${DIMS[k].label}</span><div class="dim-track"><div class="dim-fill" style="width:${Math.min(100, totals[k] / 8 * 100)}%"></div></div></div>`).join('')}
    <h4 style="color:var(--primary-teal); margin:12px 0 8px;"><i class="fa-solid fa-circle-check"></i> توصيات مخصصة لك:</h4>
    <ul style="padding-right:20px; font-size:0.92rem; color:var(--text-main); line-height:1.6;">${tips.map(t => `<li>${t}</li>`).join('')}</ul>
  `;
  resultBox.style.display = 'block';
  setTimeout(refreshProgress, 800);

  // 4) save to the database (identity comes from the session token on the server)
  try {
    await fetch('/api/test-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses: rorschachAnswers, primaryTrait, insights })
    });
  } catch (e) {
    console.error('Failed to save test result:', e);
  }
}

function restartRorschach() {
  rorschachStep = 0;
  rorschachAnswers = [];
  document.getElementById('rorschachResultBox').style.display = 'none';
  document.querySelector('.rorschach-interaction').style.display = 'block';
  document.querySelector('.inkblot-stage').style.display = 'flex';
  renderRorschachStep();
}

// ================= THERAPIST HUB =================
async function loadTherapistCases() {
  const container = document.getElementById('therapistCasesList');
  if (!container) return;

  try {
    const res = await fetch('/api/venting?role=therapist');
    const data = await res.json();
    const cases = data.messages || [];
    therapistCasesCache = cases;

    if (cases.length === 0) {
      container.innerHTML = '<p style="color:var(--text-light); text-align:center; padding:2rem;">لا توجد طلبات استشارة واردة حالياً.</p>';
      return;
    }

    container.innerHTML = cases.map(c => `
      <div class="case-card">
        <div class="case-meta">
          <div class="case-student-info">
            <i class="fa-solid fa-circle-user"></i>
            <span>${escapeHtml(c.user_name || 'طالب')}</span>
            <span class="badge-role role-user">${escapeHtml(c.category || 'عام')}</span>
          </div>
          <span style="font-size:0.75rem; color:var(--text-light);">${formatDate(c.created_at)}</span>
        </div>

        <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:8px;">
          الحالة النفسية المبلغ عنها: <strong>${escapeHtml(c.mood || 'غير محدد')}</strong>
        </div>

        <div class="quote-box" style="margin-bottom:12px;">
          «${escapeHtml(c.message)}»
        </div>

        ${c.counselor_reply ? `
          <div style="background:#ecfdf5; padding:10px; border-radius:6px; font-size:0.88rem; color:#065f46; border:1px solid #a7f3d0;">
            <strong><i class="fa-solid fa-check"></i> ردك المرسل (${escapeHtml(c.replied_by)}):</strong>
            <p style="margin-top:4px;">${escapeHtml(c.counselor_reply)}${c.edited_at ? ' <small style="opacity:.7">(معدّل)</small>' : ''}</p>
            <div class="reply-actions">
              <button class="btn btn-outline btn-sm" onclick="editTherapistReply(${c.id})"><i class="fa-solid fa-pen"></i> تعديل الرد</button>
              <button class="btn btn-outline btn-sm btn-danger-outline" onclick="deleteTherapistReply(${c.id})"><i class="fa-solid fa-trash-can"></i> حذف الرد</button>
            </div>
          </div>
        ` : `
          <button class="btn btn-primary" onclick="openTherapistReplyModal(${c.id}, '${escapeHtml(c.user_name || 'طالب')}', '${escapeHtml(c.category || '')}', '${escapeHtml(c.message)}')">
            <i class="fa-solid fa-reply"></i> كتابة استشارة وحل متخصص لهذا الطالب
          </button>
        `}
      </div>
    `).join('');

  } catch (err) {
    console.error('Failed to load therapist cases:', err);
  }
}

function openTherapistReplyModal(id, studentName, category, msg) {
  replyEditMode = false;
  document.getElementById('replyTargetMsgId').value = id;
  document.getElementById('replyModalStudentName').innerText = studentName;
  document.getElementById('replyModalCategory').innerText = category;
  document.getElementById('replyModalStudentMsg').innerText = `«${msg}»`;
  document.getElementById('therapistReplyContent').value = '';
  document.getElementById('modalTherapistReply').style.display = 'flex';
}

function closeTherapistReplyModal() {
  document.getElementById('modalTherapistReply').style.display = 'none';
}

async function handleTherapistReplySubmit(event) {
  event.preventDefault();
  const id = document.getElementById('replyTargetMsgId').value;
  const replyText = document.getElementById('therapistReplyContent').value.trim();

  if (!replyText) return;

  try {
    const res = await fetch(`/api/venting/${id}/reply`, {
      method: replyEditMode ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replyText,
        therapistName: currentUser ? currentUser.name : 'أخصائي نفسي'
      })
    });

    const out = await res.json().catch(() => ({}));
    if (res.ok) {
      closeTherapistReplyModal();
      toast(out.message || 'تم الحفظ', 'success');
      loadTherapistCases();
    } else {
      toast(out.error || 'تعذر الحفظ', 'error');
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadTherapistTests() {
  const container = document.getElementById('therapistTestResultsList');
  if (!container) return;

  try {
    const res = await fetch('/api/test-results');
    const data = await res.json();
    const results = data.results || [];

    if (results.length === 0) {
      container.innerHTML = '<p style="color:var(--text-light); text-align:center; padding:2rem;">لا توجد اختبارات مسجلة بعد.</p>';
      return;
    }

    container.innerHTML = `
      <table class="db-table">
        <thead>
          <tr>
            <th>اسم الطالب</th>
            <th>السمة النفسية المكتشفة</th>
            <th>التحليل الإرشادي</th>
            <th>تاريخ الاختبار</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.user_name || 'طالب')}</strong></td>
              <td><span class="badge-role role-therapist">${escapeHtml(r.primary_trait)}</span></td>
              <td style="max-width:350px;">${escapeHtml(r.insights)}</td>
              <td>${formatDate(r.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    console.error(e);
  }
}

// ================= ADMIN DATABASE MANAGEMENT =================
let allAdminUsers = [];

async function loadAdminUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    allAdminUsers = data.users || [];
    renderAdminUsersTable(allAdminUsers);
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

function renderAdminUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-light);">لا توجد سجلات مطابقة.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>#${u.id}</strong></td>
      <td><strong>${escapeHtml(u.name)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="badge-role role-${u.role}">${u.role === 'admin' ? 'أدمن' : u.role === 'therapist' ? 'معالج نفسي' : 'طالب/مستخدم'}</span></td>
      <td>${formatDate(u.created_at)}</td>
      <td>
        ${currentUser && u.id === currentUser.id ? '<span style="color:var(--text-light);font-size:0.8rem;">حسابك الحالي</span>' : `<button class="btn-icon btn-delete" onclick="adminDeleteUser(${u.id})" title="حذف من قاعدة البيانات">
          <i class="fa-solid fa-trash-can"></i>
        </button>`}
      </td>
    </tr>
  `).join('');
}

function filterAdminUserTable() {
  const query = document.getElementById('adminUserSearchInput').value.toLowerCase().trim();
  if (!query) {
    renderAdminUsersTable(allAdminUsers);
    return;
  }
  const filtered = allAdminUsers.filter(u =>
    u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query) || u.role.includes(query)
  );
  renderAdminUsersTable(filtered);
}

function openAddUserModal() {
  document.getElementById('modalAdminAddUser').style.display = 'flex';
}

function closeAddUserModal() {
  document.getElementById('modalAdminAddUser').style.display = 'none';
}

async function handleAdminAddUserSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('adminNewName').value.trim();
  const email = document.getElementById('adminNewEmail').value.trim();
  const password = document.getElementById('adminNewPassword').value;
  const role = document.getElementById('adminNewRole').value;

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'حدث خطأ');
      return;
    }

    closeAddUserModal();
    document.getElementById('adminNewName').value = '';
    document.getElementById('adminNewEmail').value = '';
    document.getElementById('adminNewPassword').value = '';
    loadAdminUsers();
  } catch (e) {
    console.error(e);
  }
}

async function adminDeleteUser(id) {
  const u = (allAdminUsers || []).find(x => x.id === id);
  const who = u ? `«${u.name}» (${u.email})` : 'هذا المستخدم';
  if (!confirm(`هل أنت متأكد من حذف الحساب ${who} نهائياً من قاعدة بيانات منصة فينيكس؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;
  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast(`تم حذف ${who} من قاعدة البيانات`, 'success');
      loadAdminUsers();
    }
  } catch (e) {
    console.error(e);
  }
}

async function loadAdminStats() {
  const container = document.getElementById('adminStatsGrid');
  if (!container) return;

  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    const s = data.stats || {};

    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon icon-goals"><i class="fa-solid fa-users"></i></div>
        <div class="stat-info">
          <h3>${s.totalUsers || 0}</h3>
          <span>إجمالي الحسابات المسجلة</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon icon-test"><i class="fa-solid fa-graduation-cap"></i></div>
        <div class="stat-info">
          <h3>${s.totalStudents || 0}</h3>
          <span>الطلاب المستفيدون</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon icon-breath"><i class="fa-solid fa-user-doctor"></i></div>
        <div class="stat-info">
          <h3>${s.totalTherapists || 0}</h3>
          <span>المعالجون المعتمدون</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon icon-venting"><i class="fa-solid fa-comments"></i></div>
        <div class="stat-info">
          <h3>${s.totalVenting || 0}</h3>
          <span>جلسات واستشارات الفضفضة</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background:#fee2e2; color:#ef4444;"><i class="fa-solid fa-bullseye"></i></div>
        <div class="stat-info">
          <h3>${s.totalGoals || 0}</h3>
          <span>الأهداف والأفكار المدونة</span>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon" style="background:#fef3c7; color:#d97706;"><i class="fa-solid fa-eye"></i></div>
        <div class="stat-info">
          <h3>${s.totalTests || 0}</h3>
          <span>اختبارات رورشاخ المنجزة</span>
        </div>
      </div>
    `;
  } catch (e) {
    console.error(e);
  }
}

// ================= UTILITIES =================
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return dateStr;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// ================= FORGOT PASSWORD =================
function forgotAlert(msg, type) {
  const b = document.getElementById('forgotAlert');
  b.className = `alert-box alert-${type}`;
  b.innerText = msg;
  b.style.display = 'block';
}

function openForgotModal(e) {
  if (e) e.preventDefault();
  document.getElementById('forgotStep1').style.display = 'block';
  document.getElementById('forgotStep2').style.display = 'none';
  document.getElementById('forgotAlert').style.display = 'none';
  document.getElementById('forgotEmail').value = document.getElementById('userEmailInput').value;
  document.getElementById('modalForgot').style.display = 'flex';
}

function closeForgotModal() {
  document.getElementById('modalForgot').style.display = 'none';
}

async function submitForgotEmail(event) {
  event.preventDefault();
  const email = document.getElementById('forgotEmail').value.trim();
  try {
    const res = await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) return forgotAlert(data.error || 'حدث خطأ', 'error');
    document.getElementById('forgotStep1').style.display = 'none';
    document.getElementById('forgotStep2').style.display = 'block';
    // devCode is only returned when the server runs with RESET_DEV_MODE=1 (demo, no email service)
    forgotAlert(data.devCode ? `${data.message}\n(وضع التجربة) رمزك: ${data.devCode}` : data.message, 'success');
  } catch (e) {
    forgotAlert('تعذر الاتصال بالخادم', 'error');
  }
}

async function submitResetPassword(event) {
  event.preventDefault();
  const email = document.getElementById('forgotEmail').value.trim();
  const code = document.getElementById('forgotCode').value.trim();
  const newPassword = document.getElementById('forgotNewPwd').value;
  if (newPassword !== document.getElementById('forgotNewPwd2').value) return forgotAlert('كلمتا المرور غير متطابقتين', 'error');
  try {
    const res = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword })
    });
    const data = await res.json();
    if (!res.ok) return forgotAlert(data.error || 'حدث خطأ', 'error');
    closeForgotModal();
    document.getElementById('userEmailInput').value = email;
    document.getElementById('userPasswordInput').value = '';
    showAuthAlert(data.message, 'success');
  } catch (e) {
    forgotAlert('تعذر الاتصال بالخادم', 'error');
  }
}


// ================= REGISTER ROLE =================
function onRegRoleChange() {
  document.getElementById('codeGroup').style.display = document.getElementById('regRole').value === 'user' ? 'none' : 'block';
}

// ================= TOAST (replaces alert popups) =================
function toast(msg, type) {
  const box = document.getElementById('toastBox');
  const t = document.createElement('div');
  t.className = 'toast ' + (type || 'info');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3800);
}
window.alert = (m) => toast(String(m), 'error');

// ================= DARK MODE =================
function toggleTheme() {
  const d = document.documentElement;
  d.dataset.theme = d.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('phoenix_theme', d.dataset.theme);
  syncThemeIcon();
}
function syncThemeIcon() {
  const i = document.querySelector('#themeToggle i');
  if (i) i.className = 'fa-solid ' + (document.documentElement.dataset.theme === 'dark' ? 'fa-sun' : 'fa-moon');
}
document.addEventListener('DOMContentLoaded', syncThemeIcon);

// ================= SPLASH =================
window.addEventListener('load', () => setTimeout(() => {
  const s = document.getElementById('splash');
  if (s) { s.classList.add('hide'); setTimeout(() => s.remove(), 600); }
}, 700));

// ================= MOOD CHART + STREAK + BADGES =================
const _origMood = selectMoodCheckin;
selectMoodCheckin = function (name, tip, emoji) {
  _origMood(name, tip, emoji);
  const score = /مرتاح|سعيد/.test(name) ? 4 : /مشتت/.test(name) ? 3 : /متوتر|قلق/.test(name) ? 2 : 1;
  fetch('/api/moods', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mood: name, emoji, score }) })
    .then(() => refreshProgress()).catch(() => {});
};

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toLocalDay = (sqlUtc) => dayKey(new Date(sqlUtc.replace(' ', 'T') + 'Z'));

async function refreshProgress() {
  if (!currentUser || currentUser.role !== 'user') return;
  try {
    const get = async (u, k) => (await (await fetch(u)).json())[k] || [];
    const [moods, goals, venting, tests] = await Promise.all([get('/api/moods', 'moods'), get('/api/goals', 'goals'), get('/api/venting', 'messages'), get('/api/test-results', 'results')]);

    // chart: last 14 days, last mood of each day
    const byDay = {};
    [...moods].reverse().forEach(m => { byDay[toLocalDay(m.created_at)] = m; });
    const chart = document.getElementById('moodChart');
    let html = '';
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const m = byDay[dayKey(d)];
      html += `<div class="mood-col" title="${m ? escapeHtml(m.mood) : 'لا يوجد تسجيل'}"><span class="mood-emoji">${m ? m.emoji : ''}</span><div class="mood-bar-wrap"><div class="mood-bar s${m ? m.score : 0}" style="height:${m ? m.score * 25 : 6}%"></div></div><small>${d.getDate()}</small></div>`;
    }
    chart.innerHTML = html;

    // streak = consecutive days (ending today or yesterday) with any activity
    const days = new Set([...moods, ...goals, ...venting, ...tests].map(x => toLocalDay(x.created_at)));
    let streak = 0; const c = new Date();
    if (!days.has(dayKey(c))) c.setDate(c.getDate() - 1);
    while (days.has(dayKey(c))) { streak++; c.setDate(c.getDate() - 1); }
    document.getElementById('streakCount').innerText = streak;

    const badges = [
      ['🌱', 'أول خطوة', 'سجّلت شعورك لأول مرة', moods.length >= 1],
      ['🔥', '3 أيام متتالية', 'نشاط 3 أيام متتالية', streak >= 3],
      ['🏆', 'أسبوع كامل', 'نشاط 7 أيام متتالية', streak >= 7],
      ['🎯', 'صاحب هدف', 'أضفت هدفاً', goals.length >= 1],
      ['✅', 'منجِز', 'أنجزت هدفاً', goals.some(g => g.completed)],
      ['💬', 'شجاع', 'فضفضت وطلبت الدعم', venting.length >= 1],
      ['👁️', 'مستكشف', 'أنهيت اختبار رورشاخ', tests.length >= 1]
    ];
    document.getElementById('badgesGrid').innerHTML = badges.map(b => `<div class="badge-item ${b[3] ? 'earned' : 'locked'}" title="${b[2]}"><span>${b[0]}</span><small>${b[1]}</small></div>`).join('');
  } catch (e) { console.error(e); }
}


// ================= HOME PAGES FOR EVERY ROLE =================
let therapistCasesCache = [];
let replyEditMode = false;

function greetingFor(u) {
  const h = new Date().getHours();
  const hello = h < 5 ? 'مساء الخير' : h < 12 ? 'صباح الخير' : h < 18 ? 'نهارك سعيد' : 'مساء الخير';
  const first = String(u.name || '').replace(/\(.*?\)/g, '').replace(/^\s*د\.?\s*/, '').trim().split(/\s+/)[0] || '';
  return `${hello} يا ${u.role === 'therapist' ? 'د. ' : ''}${first}!`;
}

const _navBase = navigateTo;
navigateTo = function (viewId) {
  _navBase(viewId);
  if (window.innerWidth <= 992) closeSidebarMobile();
  if (viewId === 'viewTherapistHome') loadTherapistHome();
  if (viewId === 'viewAdminHome') loadAdminHome();
};

async function loadTherapistHome() {
  try {
    const cases = (await (await fetch('/api/venting')).json()).messages || [];
    const tests = (await (await fetch('/api/test-results')).json()).results || [];
    const set = (id, v) => { document.getElementById(id).innerText = v; };
    set('thCases', cases.length);
    set('thPending', cases.filter(c => !c.counselor_reply).length);
    set('thReplied', cases.filter(c => c.counselor_reply).length);
    set('thTests', tests.length);
  } catch (e) { console.error(e); }
}

async function loadAdminHome() {
  try {
    const s = (await (await fetch('/api/stats')).json()).stats || {};
    const set = (id, v) => { document.getElementById(id).innerText = v ?? 0; };
    set('adUsers', s.totalUsers); set('adStudents', s.totalStudents); set('adTherapists', s.totalTherapists); set('adVenting', s.totalVenting);
  } catch (e) { console.error(e); }
}

function editTherapistReply(id) {
  const c = therapistCasesCache.find(x => x.id === id);
  if (!c) return;
  openTherapistReplyModal(c.id, c.user_name || 'طالب', c.category || '', c.message);
  replyEditMode = true;
  document.getElementById('therapistReplyContent').value = c.counselor_reply || '';
}

async function deleteTherapistReply(id) {
  const c = therapistCasesCache.find(x => x.id === id);
  if (!confirm(`حذف ردك على الطالب «${c ? c.user_name : ''}»؟ لن يظهر الرد في حسابه بعد الآن.`)) return;
  const res = await fetch(`/api/venting/${id}/reply`, { method: 'DELETE' });
  const out = await res.json().catch(() => ({}));
  toast(out.message || out.error || 'تم', res.ok ? 'success' : 'error');
  if (res.ok) loadTherapistCases();
}

async function loadTherapistChoices() {
  const sel = document.getElementById('ventingTherapist');
  if (!sel) return;
  try {
    const d = await (await fetch('/api/therapists')).json();
    sel.innerHTML = (d.therapists || []).map(t => `<option value="${t.id}" ${t.id === d.current ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('');
  } catch (e) { console.error(e); }
}

// ================= SIDEBAR (desktop collapse + mobile drawer) =================
function closeSidebarMobile() {
  document.getElementById('appSidebar').classList.remove('open');
  const bd = document.getElementById('sidebarBackdrop'); if (bd) bd.classList.remove('show');
}
toggleSidebar = function () {
  const sb = document.getElementById('appSidebar');
  if (window.innerWidth > 992) {
    sb.classList.toggle('collapsed');
    localStorage.setItem('phoenix_sidebar', sb.classList.contains('collapsed') ? 'collapsed' : 'open');
  } else {
    const open = sb.classList.toggle('open');
    document.getElementById('sidebarBackdrop').classList.toggle('show', open);
  }
};
document.addEventListener('DOMContentLoaded', () => {
  const bd = document.createElement('div'); bd.id = 'sidebarBackdrop'; bd.onclick = closeSidebarMobile; document.body.appendChild(bd);
  if (localStorage.getItem('phoenix_sidebar') === 'collapsed') document.getElementById('appSidebar').classList.add('collapsed');
});
