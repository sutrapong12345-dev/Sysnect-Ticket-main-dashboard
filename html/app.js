// ==============================================
// State & Configuration
// ==============================================
const STATE = {
    theme: localStorage.getItem('theme') || 'light',
    viewMode: 'list', // 'list' or 'table'
    currentStatus: null,
    searchQuery: '',
    dateFilter: 'all',
    priorityFilter: 'all',
    projectFilter: 'all',
    isLoading: true,
    data: {
        new: [],
        assigned: [],
        pending: [],
        solved: [],
        closed: []
    },
    selectedTickets: new Set(),
    seenTicketIds: new Set()   // ใช้ตรวจ ticket ใหม่เพื่อแจ้งเตือน
};

function updateSelectionUI() {
    const fab = document.getElementById('selectionFAB');
    const countText = document.getElementById('selectionCount');
    if (!fab || !countText) return;
    
    if (STATE.selectedTickets.size > 0) {
        countText.innerText = `${STATE.selectedTickets.size} Ticket${STATE.selectedTickets.size > 1 ? 's' : ''} Selected`;
        fab.classList.remove('hidden');
        // ให้เวลา display ทำงานก่อนใส่คลาสแอนิเมชัน
        setTimeout(() => fab.classList.add('visible'), 10);
    } else {
        fab.classList.remove('visible');
        // รอให้แอนิเมชันเลื่อนลงทำงานเสร็จก่อนซ่อน element
        setTimeout(() => fab.classList.add('hidden'), 400); 
    }
}

window.exportSelectedTickets = function() {
    if (STATE.selectedTickets.size === 0) return;
    openExportModal(true);
};

const GLPI_BASE_URL = 'https://itservicedesk.sysnect.co.th';
let chartInstance = null;

// ==============================================
// App Version
// ==============================================
const APP_VERSION = 'v2.1.0-BASE';
const APP_BUILD = '2026-06-23';

// ==============================================
// Settings
// ==============================================
const SETTING_KEYS = {
    defaultView:         'sysnect_setting_defaultView',
    notifications:       'sysnect_setting_notifications',
    autoRefresh:         'sysnect_setting_autoRefresh',
    autoRefreshCustom:   'sysnect_setting_autoRefreshCustom',
    defaultStatus:       'sysnect_setting_defaultStatus',
    theme:               'theme'
};

function loadSettings() {
    return {
        defaultView:       localStorage.getItem(SETTING_KEYS.defaultView)       || 'today',
        notifications:     localStorage.getItem(SETTING_KEYS.notifications)     === 'true',
        autoRefresh:       localStorage.getItem(SETTING_KEYS.autoRefresh)       || '0.5',
        autoRefreshCustom: parseInt(localStorage.getItem(SETTING_KEYS.autoRefreshCustom)) || 10,
        defaultStatus:     localStorage.getItem(SETTING_KEYS.defaultStatus)     || '',
        theme:             localStorage.getItem(SETTING_KEYS.theme)             || 'light'
    };
}

function saveSettings(patch) {
    Object.entries(patch).forEach(([k, v]) => {
        if (SETTING_KEYS[k]) localStorage.setItem(SETTING_KEYS[k], v);
    });
}

let autoRefreshTimer = null;

function startAutoRefresh(minutes) {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
    if (minutes > 0) {
        autoRefreshTimer = setInterval(() => {
            if (!STATE.isLoading) fetchData(true);
        }, minutes * 60 * 1000);
    }
}

// ─── Sound Notification ───────────────────────
function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        function tone(freq, start, dur, vol = 0.28) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(vol, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
            osc.start(start);
            osc.stop(start + dur);
        }
        const t = ctx.currentTime;
        tone(880,    t,        0.25);   // A5
        tone(1046.5, t + 0.14, 0.3);   // C6
        tone(1318.5, t + 0.28, 0.45);  // E6
    } catch (e) {
        console.warn('Notification sound error:', e);
    }
}

function showNotificationToast(count) {
    const prev = document.getElementById('notifToast');
    if (prev) prev.remove();
    const toast = document.createElement('div');
    toast.id = 'notifToast';
    toast.className = 'notif-toast';
    toast.innerHTML = `<span class="material-symbols-outlined" style="font-size:20px;">notification_add</span> มีตั๋วใหม่เพิ่มขึ้น <strong>${count} ใบ</strong>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 350);
    }, 4500);
}

window.openSettingsPanel = function() {
    syncSettingsUI();
    document.getElementById('settingsPanel').classList.add('active');
    document.getElementById('settingsPanelOverlay').classList.add('active');
};

window.closeSettingsPanel = function() {
    document.getElementById('settingsPanel').classList.remove('active');
    document.getElementById('settingsPanelOverlay').classList.remove('active');
};

window.showVersionInfo = function() {
    openSettingsPanel();
};

function syncSettingsUI() {
    const s = loadSettings();

    // Default view buttons
    document.querySelectorAll('[data-setting="defaultView"]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === s.defaultView);
    });

    // Notifications toggle
    const toggle = document.getElementById('settingNotifToggle');
    const toggleText = document.getElementById('settingNotifText');
    if (toggle) toggle.checked = s.notifications;
    if (toggleText) toggleText.textContent = s.notifications ? 'เปิดอยู่' : 'ปิดอยู่';

    // Auto-refresh
    const arSel = document.getElementById('settingAutoRefresh');
    const arCustom = document.getElementById('settingAutoRefreshCustom');
    const arWrap = document.getElementById('autoRefreshCustomWrap');
    if (arSel) arSel.value = s.autoRefresh;
    if (arCustom) arCustom.value = s.autoRefreshCustom;
    if (arWrap) arWrap.style.display = (s.autoRefresh === 'custom') ? 'flex' : 'none';

    // Default status
    const dsSel = document.getElementById('settingDefaultStatus');
    if (dsSel) dsSel.value = s.defaultStatus;

    // Theme
    const themeSel = document.getElementById('settingTheme');
    if (themeSel) themeSel.value = s.theme || STATE.theme;

    // Version info
    const vEl = document.getElementById('appVersionDisplay');
    const bEl = document.getElementById('appBuildDisplay');
    if (vEl) vEl.textContent = APP_VERSION;
    if (bEl) bEl.textContent = APP_BUILD;
}

window.onSettingDefaultViewChange = function(value) {
    saveSettings({ defaultView: value });
    syncSettingsUI();
    applyDefaultView();
};

window.onSettingNotifChange = function(checkbox) {
    saveSettings({ notifications: checkbox.checked });
    const toggleText = document.getElementById('settingNotifText');
    if (toggleText) toggleText.textContent = checkbox.checked ? 'เปิดอยู่' : 'ปิดอยู่';
};

window.onAutoRefreshChange = function() {
    const sel = document.getElementById('settingAutoRefresh');
    const wrap = document.getElementById('autoRefreshCustomWrap');
    const isCustom = sel && sel.value === 'custom';
    if (wrap) wrap.style.display = isCustom ? 'flex' : 'none';
    if (sel) saveSettings({ autoRefresh: sel.value });
    applyAutoRefreshSetting();
};

window.onSettingAutoRefreshCustomChange = function() {
    const el = document.getElementById('settingAutoRefreshCustom');
    if (el) saveSettings({ autoRefreshCustom: parseInt(el.value) || 10 });
    applyAutoRefreshSetting();
};

function applyAutoRefreshSetting() {
    const s = loadSettings();
    const minutes = s.autoRefresh === 'custom'
        ? Math.max(1, s.autoRefreshCustom)
        : parseFloat(s.autoRefresh) || 0;
    startAutoRefresh(minutes);
}

window.onSettingDefaultStatusChange = function(value) {
    saveSettings({ defaultStatus: value });
};

window.onSettingThemeChange = function(value) {
    saveSettings({ theme: value });
    STATE.theme = value;
    document.documentElement.setAttribute('data-theme', value);
    localStorage.setItem('theme', value);
    updateThemeIcon();
    if (chartInstance) initChart();
};

function applyDefaultView() {
    const { defaultView } = loadSettings();
    STATE.dateFilter = defaultView;
    STATE.currentStatus = 'all';

    const rangeSelect = document.getElementById('filterDateRange');
    if (rangeSelect) rangeSelect.value = defaultView;

    if (!STATE.isLoading) {
        updateDashboardLayout();
        initChart();
        renderTickets();
        renderMonthlyBreakdown();
    }
}



function collectTicketIds(data) {
    const ids = new Set();
    Object.values(data).forEach(arr => {
        if (Array.isArray(arr)) arr.forEach(t => { if (t.id) ids.add(String(t.id)); });
    });
    return ids;
}

function formatDateTime(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) return dateStr;
    try {
        const d = new Date(String(dateStr).replace('T', ' '));
        if (isNaN(d.getTime())) return '-';
        const pad = (n) => String(n).padStart(2, '0');
        const day = pad(d.getDate());
        const month = pad(d.getMonth() + 1);
        const year = d.getFullYear();
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        const seconds = pad(d.getSeconds());

        const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
        if (hasTime) {
            return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
        }
        return `${day}/${month}/${year}`;
    } catch (e) {
        return '-';
    }
}

function calculateTicketDuration(dateOpen, dateClose, statusName) {
    if (!dateOpen || dateOpen === '-') return null;
    const open = new Date(String(dateOpen).replace('T', ' '));
    if (isNaN(open.getTime())) return null;
    const isResolved = ['CLOSED', 'SOLVED'].includes(String(statusName || '').toUpperCase());
    let end;
    if (isResolved && dateClose && dateClose !== '-' && dateClose !== '=') {
        end = new Date(String(dateClose).replace('T', ' '));
        if (isNaN(end.getTime())) end = new Date();
    } else {
        end = new Date();
    }
    const diffMs = end - open;
    if (diffMs < 0) return null;
    const totalMinutes = Math.floor(diffMs / 60000);
    const totalHours = Math.floor(totalMinutes / 60);
    const totalDays = Math.floor(totalHours / 24);
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;
    const hours = totalHours % 24;
    const mins = totalMinutes % 60;
    if (months > 0) return days > 0 ? `${months} เดือน ${days} วัน` : `${months} เดือน`;
    if (totalDays > 0) return hours > 0 ? `${totalDays} วัน ${hours} ชม.` : `${totalDays} วัน`;
    if (totalHours > 0) return mins > 0 ? `${totalHours} ชม. ${mins} นาที` : `${totalHours} ชั่วโมง`;
    return `${totalMinutes} นาที`;
}

function getNumericTicketId(ticket) {
    if (!ticket) return '';
    if (ticket.ticket_number) return ticket.ticket_number;
    if (ticket.title && /^\d+$/.test(String(ticket.title))) return ticket.title;
    if (ticket.title) {
        const m = String(ticket.title).match(/(\d+)/);
        if (m) return m[1];
    }
    if (ticket.id) {
        const parts = String(ticket.id).split('-');
        if (parts.length > 1) {
            return parts[parts.length - 1].replace(/\D/g, '');
        }
        const m = String(ticket.id).match(/(\d+)/);
        if (m) return m[1];
    }
    return '';
}

// 🔐 escapeHtml — ป้องกัน XSS ตอนนำค่าดิบไปแทรกใน HTML/attribute
// (ใช้กับฟิลด์ที่ไม่ผ่าน cleanHtmlText เช่น project, location, id, ชื่อหัวข้อ)
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}



// ==============================================
// Initialization
// ==============================================
document.addEventListener('DOMContentLoaded', () => {
    const _s = loadSettings();

    // Apply saved theme (overrides STATE default)
    if (_s.theme) {
        STATE.theme = _s.theme;
    }
    initTheme();
    applyDefaultView();
    setupEventListeners();

    // Sync version tag in navbar with APP_VERSION constant
    const vTag = document.getElementById('appVersionTag');
    if (vTag) vTag.textContent = APP_VERSION;

    // Set pending default status (applied after data loads)
    if (_s.defaultStatus) window._applyDefaultStatusPending = _s.defaultStatus;

    fetchData();
    applyAutoRefreshSetting();
});

// ==============================================
// Last Updated Time Management
// ==============================================
function updateLastUpdatedTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
    const fullText = `หน้าเว็บอัปเดตล่าสุด: ${dateStr} ${timeStr}`;

    // Update bottom container under chart
    const textEl = document.getElementById('lastUpdateText');
    const container = document.getElementById('lastUpdateContainer');
    
    if (textEl) textEl.innerText = fullText;

    if (container) {
        container.classList.remove('updating');
        container.classList.add('updated');
        setTimeout(() => container.classList.remove('updated'), 2000);
    }

    updateConnectionStatus();
}

// อัปเดตไฟสถานะ 2 ดวง: n8n + PostgreSQL
//   n8n  : เขียวถ้าข้อมูลรอบนี้มาจาก n8n (ผ่าน Node หรือยิงตรง)
//   PG   : เขียวถ้า /api/health บอกว่า DB connected หรือ source=='postgres'
async function updateConnectionStatus() {
    const n8nDot  = document.getElementById('n8nDot');
    const n8nText = document.getElementById('n8nStatusText');
    const pgDot   = document.getElementById('pgDot');
    const pgText  = document.getElementById('pgStatusText');

    const setDot = (dot, up) => {
        if (!dot) return;
        dot.style.background = up ? '#10b981' : '#ef4444';
        dot.style.boxShadow  = `0 0 6px ${up ? 'rgba(16,185,129,.7)' : 'rgba(239,68,68,.7)'}`;
    };

    const source = STATE.dataSource;

    // ── n8n ──
    const n8nUp = (source === 'n8n' || source === 'n8n_direct');
    setDot(n8nDot, n8nUp);
    if (n8nText) n8nText.innerText = 'n8n';

    // ── PostgreSQL (ถาม /api/health) ──
    let pgUp = (source === 'postgres');
    let pgTimeLabel = '';
    try {
        const healthUrl = (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io') && !location.hostname.endsWith('pages.dev') && !location.hostname.endsWith('workers.dev'))
            ? `${location.origin}/api/health`
            : 'https://bubbly-solace-production-904b.up.railway.app/api/health';
        const ssoToken = sessionStorage.getItem('sysnect_sso_token');
        const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000), headers: ssoToken ? { 'Authorization': `Bearer ${ssoToken}` } : {} });
        if (res.ok) {
            const json = await res.json();
            if (json?.database?.connected) pgUp = true;
            const rawTime = json?.last_sync_result?.at || json?.database?.sync_state?.last_sync;
            if (rawTime) {
                const d = new Date(rawTime);
                pgTimeLabel = d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
                            + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            }
        }
    } catch (_) { /* Node ไม่ตอบ → ถ้า source ไม่ใช่ postgres ก็ถือว่า PG เข้าไม่ถึง */ }

    setDot(pgDot, pgUp);
    if (pgText) pgText.innerText = pgUp && pgTimeLabel
        ? ('PostgreSQL · ' + pgTimeLabel)
        : 'PostgreSQL';

    // ── จัดการ Banner ออฟไลน์ ──
    let banner = document.getElementById('offlineBanner');
    
    if (!n8nUp && !pgUp) {
        if (!window.sysnectOfflineSince) {
            const now = new Date();
            window.sysnectOfflineSince = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        }
    } else {
        window.sysnectOfflineSince = null;
    }

    if (!n8nUp || !pgUp) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'offlineBanner';
            banner.style.cssText = 'padding: 10px; text-align: center; font-family: sans-serif; font-size: 14px; position: relative; z-index: 1000; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';
            const header = document.querySelector('.top-navbar');
            if (header) {
                header.parentNode.insertBefore(banner, header.nextSibling);
            } else {
                document.body.prepend(banner);
            }
        }
        banner.style.display = 'flex';
        
        if (!n8nUp && !pgUp) {
            banner.style.backgroundColor = '#ef4444'; // สีแดง
            banner.style.color = '#fff';
            banner.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px;">error</span> ระบบออฟไลน์: ไม่สามารถเชื่อมต่อฐานข้อมูลสำรองและ n8n ได้ (ขาดการเชื่อมต่อตั้งแต่เวลา ${window.sysnectOfflineSince} น.)`;
        } else if (!pgUp && n8nUp) {
            banner.style.backgroundColor = '#f59e0b'; // สีเหลือง
            banner.style.color = '#fff';
            banner.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px;">cloud_off</span> ฐานข้อมูลสำรองกำลังออฟไลน์อยู่ ขณะนี้กำลังแสดงข้อมูลตรงจาก n8n`;
        } else if (pgUp && !n8nUp) {
            banner.style.backgroundColor = '#f59e0b'; // สีเหลือง
            banner.style.color = '#fff';
            let timeText = pgTimeLabel ? ` (อัปเดตล่าสุด: ${pgTimeLabel})` : '';
            banner.innerHTML = `<span class="material-symbols-outlined" style="font-size: 18px;">cloud_off</span> n8n ขัดข้อง ขณะนี้กำลังแสดงข้อมูลล่าสุดจากฐานข้อมูลสำรอง${timeText}`;
        }
    } else if (n8nUp && pgUp && banner) {
        banner.style.display = 'none';
    }
}

// ==============================================
// Theme Management
// ==============================================
function initTheme() {
    document.documentElement.setAttribute('data-theme', STATE.theme);
    updateThemeIcon();
}

function toggleTheme() {
    STATE.theme = STATE.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', STATE.theme);
    localStorage.setItem('theme', STATE.theme);
    updateThemeIcon();
    
    // Update chart colors if it exists
    if (chartInstance) {
        initChart();
    }
}

function updateThemeIcon() {
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.innerText = STATE.theme === 'light' ? 'dark_mode' : 'light_mode';
    }
}

// ==============================================
// Data Fetching & Processing
// ==============================================
async function fetchData(isAutoRefresh = false) {
    // Show loader and start simulated progress
    const loader = document.getElementById('sysnectLoader');
    const loaderBar = document.getElementById('loaderBar');
    const loaderPercent = document.getElementById('loaderPercent');
    const lastUpdateContainer = document.getElementById('lastUpdateContainer');
    
    if (lastUpdateContainer) {
        lastUpdateContainer.classList.add('updating');
        document.getElementById('lastUpdateText').innerText = 'กำลังดึงข้อมูล...';
    }
    

    
    if (!isAutoRefresh && loader && loaderBar && loaderPercent) {
        loader.classList.remove('hidden');
        loaderBar.style.width = '0%';
        loaderPercent.innerText = '0%';
    }
    
    let progress = 0;
    let secondsElapsed = 0;
    const progressInterval = setInterval(() => {
        if (!loaderBar || !loaderPercent) return;
        // Increment progress smoothly up to 98% over a longer period
        const increment = Math.max(0.2, (98 - progress) / 15);
        progress += increment;
        if (progress > 98) progress = 98;
        
        loaderBar.style.width = progress + '%';
        loaderPercent.innerText = Math.round(progress) + '%';
        
        if (!isAutoRefresh && loaderMessage) {
            secondsElapsed += 0.2; // setInterval is 200ms
            
            if (secondsElapsed > 120) {
                loaderMessage.innerText = "ระบบกำลังโหลดข้อมูลนานกว่าปกติ อาจใช้เวลาหลายนาที...";
                loaderMessage.style.color = "#ef4444";
            } else if (secondsElapsed > 30) {
                loaderMessage.innerText = "กำลังดาวน์โหลดชุดข้อมูลขนาดใหญ่ โปรดรอสักครู่...";
                loaderMessage.style.color = "#f59e0b";
            } else if (secondsElapsed > 10) {
                loaderMessage.innerText = "กำลังดึงข้อมูลจากฐานข้อมูล...";
                loaderMessage.style.color = "#2563eb";
            } else if (secondsElapsed > 3) {
                loaderMessage.innerText = "กำลังเชื่อมต่อเพื่อดึงข้อมูล Tickets...";
            }
        }
    }, 200);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);
    
    try {
        // Helper function for fetching with timeout
        async function fetchWithTimeout(url, timeoutMs, extraHeaders = {}) {
            const abortCtrl = new AbortController();
            const id = setTimeout(() => abortCtrl.abort(), timeoutMs);
            try {
                const res = await fetch(url, {
                    signal: abortCtrl.signal,
                    headers: extraHeaders
                });
                clearTimeout(id);
                if (!res.ok) throw new Error(`HTTP error ${res.status}`);
                return await res.json();
            } catch (err) {
                clearTimeout(id);
                throw err;
            }
        }

        // แนบ SSO token (จาก sessionStorage) ไปกับการเรียก Node API เพื่อผ่าน guard ฝั่ง backend
        const ssoToken = sessionStorage.getItem('sysnect_sso_token');
        const authHeaders = ssoToken ? { 'Authorization': `Bearer ${ssoToken}` } : {};

        // 🆕 ระบบดึงข้อมูล (เลือกระบบดีสุด — backend-driven):
        //    หลัก = Node API /api/tickets ซึ่งจะลอง n8n ก่อน (พร้อม upsert ลง PostgreSQL ให้)
        //           ถ้า n8n ล่ม Node จะส่งข้อมูลจาก PostgreSQL แทน (_meta.source='postgres')
        //    ทางสุดท้าย = ยิง n8n ตรง (เผื่อ Node server เองล่ม จะได้ยังเห็นข้อมูล)
        // เสิร์ฟผ่าน Node เอง (localhost:3000 หรือ server จริง) = same-origin
        // หน้าเว็บอยู่ GitHub Pages = ชี้มาที่ backend ในคอมเรา (dev) · ขึ้น server จริงค่อยเปลี่ยนเป็น URL server
        const API_BASE = (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io') && !location.hostname.endsWith('pages.dev') && !location.hostname.endsWith('workers.dev'))
            ? location.origin
            : 'https://bubbly-solace-production-904b.up.railway.app'; // 🔧 Cloudflare tunnel (quick tunnel = เปลี่ยนทุกครั้งที่รีสตาร์ท)
        const queryParam = isAutoRefresh ? '?source=autoRefresh' : '?source=initialLoad';
        const API_URL = `${API_BASE}/api/tickets${queryParam}`;
        const N8N_DIRECT_URL = `https://n8n.sysnect.co.th/webhook/48ec49ee-a4ca-4677-bad7-deb3c3ec341d${queryParam}`;

        let liveData = null;
        STATE.dataSource = null;     // 'n8n' | 'postgres' | 'n8n_direct' | 'none'
        STATE.isFallback = false;

        try {
            const loaderMessage = document.getElementById('loaderMessage');
            if (loaderMessage) loaderMessage.innerText = "กำลังดึงข้อมูลจาก n8n...";
            liveData = await fetchWithTimeout(API_URL, 45000, authHeaders);
            STATE.dataSource = (liveData && liveData._meta && liveData._meta.source) || 'n8n';
            if (STATE.dataSource === 'postgres') {
                STATE.isFallback = true; // n8n ล่ม → ใช้ข้อมูลล่าสุดจาก PostgreSQL
                if (loaderMessage) loaderMessage.innerText = "n8n ไม่พร้อม กำลังใช้ข้อมูลล่าสุดจากฐานข้อมูล...";
            }
        } catch (apiError) {
            console.warn("Node API ใช้ไม่ได้ → ลองยิง n8n ตรง...", apiError);
            const loaderMessage = document.getElementById('loaderMessage');
            if (loaderMessage) loaderMessage.innerText = "เซิร์ฟเวอร์หลักไม่พร้อม กำลังดึงตรงจาก n8n...";

            try {
                liveData = await fetchWithTimeout(N8N_DIRECT_URL, 45000);
                STATE.dataSource = 'n8n_direct';
                STATE.isFallback = true;
            } catch (fallbackError) {
                console.error("ดึงข้อมูลล้มเหลวทุกช่องทาง", fallbackError);
                STATE.dataSource = 'none';
                const loaderMsg = document.getElementById('loaderMessage');
                if (loaderMsg) {
                    loaderMsg.innerText = "ฐานข้อมูลไม่พร้อม — เชื่อมต่อ n8n และ PostgreSQL ไม่ได้";
                    loaderMsg.style.color = "#ef4444";
                }
                throw fallbackError;
            }
        }
        
        clearTimeout(timeoutId);
        
        // Stop simulated progress and snap to 100%
        clearInterval(progressInterval);
        if (loaderBar && loaderPercent) {
            loaderBar.style.width = '100%';
            loaderPercent.innerText = '100%';
        }
        
        // Extract data if wrapped in n8n format
        try {
            if (Array.isArray(liveData) && liveData.length > 0) {
                // If the first element is an array or object but missing "new" key, it might be a flat array
                if (liveData[0].data && Array.isArray(liveData[0].data)) {
                    liveData = liveData[0].data;
                } else if (liveData[0].json) {
                    liveData = liveData[0].json;
                }
                
                if (!liveData.new && (!Array.isArray(liveData) || (liveData.length > 0 && !liveData[0].new))) {
                    // It's a flat array, we need to group it
                    const flatArray = Array.isArray(liveData) ? liveData : [liveData];
                    const transformed = { "new": [], "assigned": [], "pending": [], "solved": [], "closed": [] };
                    flatArray.forEach(t => {
                        const statusStr = String(t["12"] || t.status || t.status_name || 'new').toLowerCase();
                        let mappedStatus = 'new';
                        if (statusStr.includes("assign") || statusStr === "2" || statusStr === "3") mappedStatus = "assigned";
                        else if (statusStr.includes("pending") || statusStr === "4") mappedStatus = "pending";
                        else if (statusStr.includes("solve") || statusStr === "5") mappedStatus = "solved";
                        else if (statusStr.includes("close") || statusStr === "6") mappedStatus = "closed";
                        
                        transformed[mappedStatus].push({
                            id: t["2"] || t.id || t.ticket_id || "-",
                            name: t["1"] || t.name || t.title || "-",
                            project: t["76667"] || t["76666"] || t.project || t.project_name || "-",
                            detail: t["21"] || t.detail || t.description || "-",
                            location: t["83"] || t.location || "-",
                            date: (t["15"] || t.date_creation || t.date || new Date().toISOString().split('T')[0]).replace(" ", "T"),
                            date_open: t["15"] || t.date_creation || t.date || "-",
                            date_close: t["16"] || t.closedate || "-",
                            priority: String(t["3"] || t.priority || "low"),
                            category: t["7"] || t.category || "-"
                        });
                    });
                    liveData = transformed;
                } else if (Array.isArray(liveData) && liveData[0].new) {
                    liveData = liveData[0];
                }
            }

            // Capture DB update time before transformation
            if (liveData && liveData.database_updated_at) {
                STATE.dbUpdatedAt = liveData.database_updated_at;
            }

            // Transform format if needed (for other fallback DBs)
            if (liveData && liveData.tickets && Array.isArray(liveData.tickets)) {
                const transformed = { "new": [], "assigned": [], "pending": [], "solved": [], "closed": [] };
                liveData.tickets.forEach(t => {
                    const status = (t.status || 'new').toLowerCase();
                    const mappedStatus = transformed[status] ? status : 'new';
                    transformed[mappedStatus].push({
                        id: t.title || t.ticket_id || "-",
                        project: t.project_name || "-",
                        detail: t.description || "-",
                        location: "-",
                        date: new Date().toISOString().split('T')[0],
                        date_open: t.date_creation || "-",
                        date_close: t.closedate || "-",
                        priority: t.priority || "low"
                    });
                });
                liveData = transformed;
            }

            // ตรวจสอบโครงสร้างข้อมูลที่ Backend ส่งมา
            if (!liveData || typeof liveData !== 'object' || !Array.isArray(liveData["new"])) {
                console.error("รูปแบบ JSON จาก Backend ไม่ถูกต้อง:", liveData);
                throw new Error("Backend ส่งข้อมูลมาผิดรูปแบบ หรือไม่มีข้อมูลทิกเก็ต");
            }
        } catch (parseError) {
            console.error("Error parsing data:", parseError);
            const loaderMessage = document.getElementById('loaderMessage');
            if (loaderMessage) {
                loaderMessage.innerText = "เกิดข้อผิดพลาดในการประมวลผลข้อมูล โปรดตรวจสอบรูปแบบข้อมูลจากเซิร์ฟเวอร์";
                loaderMessage.style.color = "#ef4444";
            }
            alert("ประมวลผลข้อมูลล้มเหลว! ข้อมูลจากเซิร์ฟเวอร์ไม่ตรงกับรูปแบบที่หน้าเว็บต้องการ");
            return;
        }
        
        const newDataStr = JSON.stringify({
            new: liveData["new"] || [],
            assigned: liveData["assigned"] || [],
            pending: liveData["pending"] || [],
            solved: liveData["solved"] || [],
            closed: liveData["closed"] || []
        });

        if (STATE.lastFetchedDataStr === newDataStr) {
            // ข้อมูลเหมือนเดิมเป๊ะ ไม่ต้อง redraw กราฟหรือตารางใหม่เพื่อป้องกันการกระพริบ
            STATE.isLoading = false;
            updateLastUpdatedTime();
            if (!isAutoRefresh && loader) loader.classList.add('hidden');
            return;
        }
        STATE.lastFetchedDataStr = newDataStr;

        // ── Sound Notification: เปรียบเทียบจำนวน ticket ก่อน/หลัง refresh ──
        const prevTotal = STATE.prevTotalCount;
        const incomingNew   = (liveData["new"]      || []).length;
        const incomingTotal = incomingNew
            + (liveData["assigned"] || []).length
            + (liveData["pending"]  || []).length
            + (liveData["solved"]   || []).length
            + (liveData["closed"]   || []).length;

        // นำข้อมูลจริงมาเก็บใน STATE อย่างปลอดภัย
        STATE.data = {
            new: liveData["new"] || [],
            assigned: liveData["assigned"] || [],
            pending: liveData["pending"] || [],
            solved: liveData["solved"] || [],
            closed: liveData["closed"] || []
        };

        // แจ้งเตือนเสียงเฉพาะเมื่อ auto-refresh เจอ ticket ใหม่ และ setting เปิดอยู่
        if (isAutoRefresh && prevTotal !== undefined && incomingTotal > prevTotal) {
            const diff = incomingTotal - prevTotal;
            if (loadSettings().notifications) {
                playNotificationSound();
                showNotificationToast(diff);
            }
        }
        STATE.prevTotalCount = incomingTotal;

        STATE.isLoading = false; // ปิดสถานะกำลังโหลด
        populateProjectFilter();
        
        // ซ่อน Loader เมื่อเสร็จสิ้น
        setTimeout(() => {
            if (!isAutoRefresh && loader) loader.classList.add('hidden');
            updateDashboardLayout();
            initChart();
            renderTickets();
            renderMonthlyBreakdown();
            updateLastUpdatedTime();
            // Auto-open default status tab (first load only)
            if (!isAutoRefresh && window._applyDefaultStatusPending) {
                const s = window._applyDefaultStatusPending;
                window._applyDefaultStatusPending = null;
                if (typeof toggleStatusFilter === 'function') toggleStatusFilter(s, true);
            }
        }, 150);
        
    } catch (error) {
        clearInterval(progressInterval);
        console.error("เกิดข้อผิดพลาดในการดึงข้อมูลจาก Backend:", error);
        updateConnectionStatus(); // ไฟสถานะแดงทั้ง n8n + PostgreSQL

        // แสดงข้อความ error ใน Loader (ไม่ซ่อน ไม่ popup)
        if (!isAutoRefresh && loader) {
            const loaderMessage = document.getElementById('loaderMessage');
            const loaderBar = document.getElementById('loaderBar');
            const loaderPercent = document.getElementById('loaderPercent');
            if (loaderMessage) {
                loaderMessage.innerText = "⚠️ ดึงข้อมูลล้มเหลว: " + error.message;
                loaderMessage.style.color = "#ef4444";
            }
            if (loaderBar) loaderBar.style.background = "#ef4444";
            if (loaderPercent) loaderPercent.innerText = "Error";
        }
        
        // วาดกราฟเปล่าเพื่อไม่ให้จอขาว
        initChart();
    }
}

function populateProjectFilter() {
    const projectFilterSelect = document.getElementById('projectFilter');
    if (!projectFilterSelect) return;
    
    const currentSelection = STATE.projectFilter || 'all';
    const projectCounts = {};
    let totalTickets = 0;
    
    Object.keys(STATE.data).forEach(status => {
        STATE.data[status].forEach(t => {
            totalTickets++;
            if (t.project && t.project !== '-') {
                if (!projectCounts[t.project]) projectCounts[t.project] = 0;
                projectCounts[t.project]++;
            }
        });
    });
    
    const sortedProjects = Object.keys(projectCounts).sort((a, b) => a.localeCompare(b, 'th'));
    
    const isAllTime = STATE.dateFilter === 'all';
    const allLabelText = isAllTime ? `Project: ทั้งหมด (${totalTickets} Tickets - 100%)` : `Project: ทั้งหมด`;
    
    projectFilterSelect.innerHTML = `<option value="all">${allLabelText}</option>`;
    sortedProjects.forEach(proj => {
        const count = projectCounts[proj];
        const pct = totalTickets > 0 ? ((count / totalTickets) * 100).toFixed(1) : 0;
        const option = document.createElement('option');
        option.value = proj;
        option.textContent = `${proj} (${count} Tickets - ${pct}%)`;
        projectFilterSelect.appendChild(option);
    });
    
    if (projectCounts[currentSelection] !== undefined || currentSelection === 'all') {
        projectFilterSelect.value = currentSelection;
        STATE.projectFilter = currentSelection;
    } else {
        projectFilterSelect.value = 'all';
        STATE.projectFilter = 'all';
    }
}

function getFilteredData() {
    const filtered = { new: [], assigned: [], pending: [], solved: [], closed: [] };
    const query = STATE.searchQuery.toLowerCase();
    let totalCount = 0;
    
    Object.keys(STATE.data).forEach(status => {
        filtered[status] = STATE.data[status].filter(t => {
            const matchSearch = String(t.id || '').toLowerCase().includes(query) || 
                                String(t.project || '').toLowerCase().includes(query) ||
                                String(t.location || '').toLowerCase().includes(query) ||
                                (t.detail && String(t.detail).toLowerCase().includes(query));
                                
            // Date Filtering
            let matchDate = true;
            if (STATE.dateFilter && STATE.dateFilter !== 'all' && t.date) {
                const ticketDate = new Date(t.date);
                if (!isNaN(ticketDate.getTime())) {
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    ticketDate.setHours(0,0,0,0);
                    
                    if (STATE.dateFilter === 'custom') {
                        // Custom Date Range
                        const startEl = document.getElementById('filterDateStart');
                        const endEl = document.getElementById('filterDateEnd');
                        const startVal = startEl ? startEl.value : '';
                        const endVal = endEl ? endEl.value : '';
                        
                        if (startVal) {
                            const startDate = new Date(startVal);
                            startDate.setHours(0,0,0,0);
                            if (ticketDate < startDate) matchDate = false;
                        }
                        if (endVal) {
                            const endDate = new Date(endVal);
                            endDate.setHours(23,59,59,999);
                            if (ticketDate > endDate) matchDate = false;
                        }
                    } else if (STATE.dateFilter === 'today') {
                        matchDate = ticketDate.getTime() === today.getTime();
                    } else if (STATE.dateFilter === 'yesterday') {
                        const yesterday = new Date(today);
                        yesterday.setDate(yesterday.getDate() - 1);
                        matchDate = ticketDate.getTime() === yesterday.getTime();
                    } else if (STATE.dateFilter === 'week') {
                        const lastWeek = new Date(today);
                        lastWeek.setDate(lastWeek.getDate() - 7);
                        matchDate = ticketDate >= lastWeek;
                    } else if (STATE.dateFilter === 'last30') {
                        const last30 = new Date(today);
                        last30.setDate(last30.getDate() - 30);
                        matchDate = ticketDate >= last30;
                    } else if (STATE.dateFilter === 'month') {
                        matchDate = ticketDate.getMonth() === today.getMonth() && ticketDate.getFullYear() === today.getFullYear();
                    } else if (STATE.dateFilter === 'lastMonth') {
                        const lastMonth = new Date(today);
                        lastMonth.setMonth(lastMonth.getMonth() - 1);
                        matchDate = ticketDate.getMonth() === lastMonth.getMonth() && ticketDate.getFullYear() === lastMonth.getFullYear();
                    } else if (STATE.dateFilter === 'year') {
                        matchDate = ticketDate.getFullYear() === today.getFullYear();
                    }
                }
            }
            
            // Priority Filtering
            let matchPriority = true;
            if (STATE.priorityFilter && STATE.priorityFilter !== 'all') {
                const pRaw = String(t.priority || 'low').toLowerCase().trim();
                let p = 'low';
                if (['critical', 'วิกฤต', 'เร่งด่วนที่สุด', '5', '6'].some(kw => pRaw.includes(kw))) p = 'critical';
                else if (['high', 'สูง', 'สูงมาก', '4'].some(kw => pRaw.includes(kw))) p = 'high';
                else if (['medium', 'ปานกลาง', 'ปกติ', '3'].some(kw => pRaw.includes(kw))) p = 'medium';
                
                matchPriority = p === STATE.priorityFilter;
            }
            
            // Project Filtering
            let matchProject = true;
            if (STATE.projectFilter && STATE.projectFilter !== 'all') {
                matchProject = t.project === STATE.projectFilter;
            }
            
            return matchSearch && matchDate && matchPriority && matchProject;
        });
        totalCount += filtered[status].length;
    });
    
    return { filtered, totalCount };
}

// ==============================================
// Monthly Breakdown
// ==============================================
function renderMonthlyBreakdown() {
    const container = document.getElementById('monthlyBreakdown');
    if (!container) return;
    
    const { filtered, totalCount } = getFilteredData();
    
    // รวม ticket ทั้งหมดเพื่อนับแยกเดือน
    const allTickets = [];
    Object.keys(filtered).forEach(status => {
        filtered[status].forEach(t => allTickets.push(t));
    });
    
    if (allTickets.length === 0 || STATE.dateFilter === 'all') {
        container.style.display = 'none';
        return;
    }
    
    // นับจำนวนตั๋วแต่ละเดือน
    const monthCounts = {};
    const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                        'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    
    allTickets.forEach(t => {
        if (!t.date) return;
        const d = new Date(t.date);
        if (isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
        if (!monthCounts[key]) monthCounts[key] = { label, count: 0 };
        monthCounts[key].count++;
    });
    
    const sortedKeys = Object.keys(monthCounts).sort();
    
    // ถ้ามีแค่ 1 เดือนและไม่ได้เลือก custom range ก็ไม่ต้องแสดง
    if (sortedKeys.length <= 1 && STATE.dateFilter !== 'custom') {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    let html = `
        <div style="background: var(--bg-card-solid); border: 1px solid var(--border-solid); border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm);">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                <span class="material-symbols-outlined" style="color: var(--primary); font-size: 20px;">calendar_month</span>
                <span style="font-weight: 700; font-size: 15px; color: var(--text-main);">สรุปรายเดือน (Monthly Breakdown)</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
    `;
    
    sortedKeys.forEach(key => {
        const item = monthCounts[key];
        html += `
            <div onclick="showMonthDetail('${key}', '${item.label}')" title="คลิกเพื่อดูรายละเอียดรายเดือน" style="display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, rgba(37,99,235,0.05), rgba(37,99,235,0.02)); border: 1px solid rgba(37,99,235,0.15); border-radius: 10px; padding: 10px 16px; transition: all 0.2s; cursor: pointer;" onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-sm)';" onmouseout="this.style.borderColor='rgba(37,99,235,0.15)'; this.style.transform='translateY(0)'; this.style.boxShadow='none';">
                <span style="font-weight: 600; color: var(--text-main); font-size: 14px;">${item.label}</span>
                <span style="background: var(--primary); color: white; padding: 2px 10px; border-radius: 20px; font-weight: 700; font-size: 13px; min-width: 32px; text-align: center;">${item.count}</span>
                <span style="color: var(--text-muted); font-size: 12px;">ใบ</span>
            </div>
        `;
    });
    
    html += `
            </div>
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-solid); display: flex; justify-content: flex-end; color: var(--text-muted); font-size: 13px;">
                รวมทั้งหมด: <strong style="color: var(--primary); margin-left: 6px;">${totalCount} ใบ</strong>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

window.showMonthDetail = function(monthKey, monthLabel) {
    const { filtered } = getFilteredData();
    const allTickets = [];
    Object.keys(filtered).forEach(status => {
        filtered[status].forEach(t => allTickets.push(t));
    });
    
    // Filter tickets for this month
    const monthTickets = allTickets.filter(t => {
        if (!t.date) return false;
        const d = new Date(t.date);
        if (isNaN(d.getTime())) return false;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return key === monthKey;
    });
    
    // Group by project
    const projectGroups = {};
    monthTickets.forEach(t => {
        const proj = t.project || 'ไม่ระบุโครงการ';
        if (!projectGroups[proj]) projectGroups[proj] = [];
        projectGroups[proj].push(t);
    });
    
    // Render HTML
    let html = '';
    const sortedProjects = Object.keys(projectGroups).sort((a, b) => projectGroups[b].length - projectGroups[a].length); // เรียงตามจำนวน Ticket มากไปน้อย
    
    sortedProjects.forEach(proj => {
        const tickets = projectGroups[proj];
        html += `
            <div style="margin-bottom: 20px; background: var(--bg-main, #f8fafc); border: 1px solid var(--border-solid, #e2e8f0); border-radius: 12px; overflow: hidden;">
                <div style="background: rgba(37, 99, 235, 0.05); padding: 12px 16px; border-bottom: 1px solid var(--border-solid, #e2e8f0); display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-weight: 700; color: var(--sysnect-blue, #1e293b); display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="font-size: 18px; color: var(--accent, #f59e0b);">folder</span>
                        ${escapeHtml(proj)}
                    </div>
                    <span style="background: var(--primary, #2563eb); color: white; padding: 2px 10px; border-radius: 20px; font-size: 12px; font-weight: 700;">${tickets.length} รายการ</span>
                </div>
                <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
        `;
        
        tickets.forEach(t => {
            const idStr = String(t.id || '');
            let shortId = '';
            const m = idStr.match(/(C\\d{2}-\\d+|\\d{8,})/);
            if (m) {
                shortId = m[1];
            } else {
                const num = t.ticket_number || t.title;
                if (num && String(num).trim()) {
                    shortId = String(num).replace(/Ticket\\s*#?/gi, '').trim();
                } else {
                    shortId = idStr.substring(0, 10);
                }
            }
            
            const title = t.name || '-';
            const statusLabel = t._statusData ? t._statusData.label : (t.status_name || '-');
            const statusColor = t._statusData ? t._statusData.color : '#64748b';
            
            html += `
                <div style="display: flex; flex-direction: column; gap: 6px; border-bottom: 1px dashed var(--border-color, #e2e8f0); padding-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                        <div style="font-weight: 600; font-size: 14px; color: var(--text-main, #0f172a);"><a href="${GLPI_BASE_URL}/index.php?redirect=ticket_${getNumericTicketId(t)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary, #2563eb); text-decoration: none; font-family: 'JetBrains Mono', monospace;">${escapeHtml(shortId)}</a> - ${escapeHtml(title)}</div>
                        <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: ${statusColor}15; color: ${statusColor}; border: 1px solid ${statusColor}40; white-space: nowrap;">${escapeHtml(statusLabel)}</span>
                    </div>
                    <div style="font-size: 13px; color: var(--text-muted, #64748b); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${cleanHtmlText(t.detail || '-').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>?/gm, '')}
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    document.getElementById('monthDetailTitle').innerText = `สรุปตั๋วเดือน ${monthLabel}`;
    document.getElementById('monthDetailBody').innerHTML = html;
    document.getElementById('monthDetailModal').classList.add('active');
};

window.closeMonthDetailModal = function() {
    document.getElementById('monthDetailModal').classList.remove('active');
};

// ==============================================
// Chart Management
// ==============================================
function initChart() {
    const ctx = document.getElementById('ticketChart');
    if (!ctx) return;
    
    const { filtered, totalCount } = getFilteredData();
    
    // Update Total Counter
    document.getElementById('totalTicketsCount').innerText = totalCount;
    
    // --- Kasira Feature: Filter Indicators ---
    const currentFilter = STATE.dateFilter || 'all';
    
    // 1. Center Donut Graph Label
    const totalLabel = document.getElementById('totalTicketsLabel');
    if (totalLabel) {
        if (currentFilter === 'today') totalLabel.innerText = "วันนี้";
        else if (currentFilter === 'yesterday') totalLabel.innerText = "เมื่อวาน";
        else if (currentFilter === 'week') totalLabel.innerText = "7 วัน";
        else totalLabel.innerText = "Total";
    }
    
    // 2. Right Panel Header Chip
    const panelChip = document.getElementById('panelFilterChip');
    if (panelChip) {
        if (currentFilter === 'today') {
            panelChip.style.display = 'inline-block';
            panelChip.innerText = "วันนี้";
        } else {
            panelChip.style.display = 'none';
        }
    }
    
    // 3. Chart Subtitle
    const chartSub = document.getElementById('chartSubtitle');
    if (chartSub) {
        if (currentFilter === 'today') {
            const now = new Date();
            const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
            const d = now.getDate();
            const m = thaiMonths[now.getMonth()];
            const y = now.getFullYear() + 543;
            chartSub.innerText = `แสดงเฉพาะวันนี้: ${d} ${m} ${y}`;
        } else {
            chartSub.innerText = "Real-time Ticket Tracking & Analysis";
        }
    }
    // -----------------------------------------
    
    const hasData = totalCount > 0;
    const labels = ['NEW', 'ASSIGNED', 'PENDING', 'SOLVED', 'CLOSED'];
    const values = [
        filtered.new.length,
        filtered.assigned.length,
        filtered.pending.length,
        filtered.solved.length,
        filtered.closed.length
    ];
    
    // Get colors from CSS Variables based on theme
    const style = getComputedStyle(document.documentElement);
    const colors = [
        style.getPropertyValue('--status-new').trim() || '#3b82f6',
        style.getPropertyValue('--status-assigned').trim() || '#f59e0b',
        style.getPropertyValue('--status-pending').trim() || '#ef4444',
        style.getPropertyValue('--status-solved').trim() || '#10b981',
        style.getPropertyValue('--status-closed').trim() || '#64748b'
    ];
    
    const emptyColor = style.getPropertyValue('--border-solid').trim() || '#e2e8f0';

    // ขยาย slice เล็กให้มองเห็นได้ (min 2.5% ของ total) — legend ยังใช้ค่าจริง
    const MIN_ARC = hasData ? totalCount * 0.025 : 0;
    const displayValues = hasData
        ? values.map(v => v > 0 ? Math.max(v, MIN_ARC) : 0)
        : [1];

    if (chartInstance) {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = displayValues;
        chartInstance.data.datasets[0].backgroundColor = hasData ? colors : [emptyColor];
        chartInstance.data.datasets[0].borderWidth = hasData ? 4 : 0;
        chartInstance.data.datasets[0].borderColor = getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#ffffff';
        chartInstance.data.datasets[0].borderRadius = hasData ? 6 : 0;
        chartInstance.data.datasets[0].hoverOffset = hasData ? 10 : 0;
        chartInstance.update();
    } else {
        chartInstance = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: displayValues,
                    backgroundColor: hasData ? colors : [emptyColor],
                    borderWidth: hasData ? 4 : 0,
                    borderColor: getComputedStyle(document.body).getPropertyValue('--bg-card').trim() || '#ffffff',
                    borderRadius: hasData ? 6 : 0,
                    hoverOffset: hasData ? 10 : 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                resizeDelay: 200,
                cutout: '68%',
                layout: { padding: 12 },
                animation: { animateScale: true, animateRotate: true, duration: 700 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: hasData,
                        displayColors: false,
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                return ' จำนวน: ' + context.formattedValue + ' รายการ';
                            }
                        }
                    },
                    datalabels: {
                        display: false
                    }
                },
                onClick: (_e, elements) => {
                    if (!hasData || elements.length === 0) return;
                    if (window.lastChartClick && Date.now() - window.lastChartClick < 300) return;
                    window.lastChartClick = Date.now();
                    const index = elements[0].index;
                    const statusKey = Object.keys(STATE.data)[index];
                    toggleStatusFilter(statusKey);
                }
            }
        });
    }

    // วาด legend ใต้กราฟ (จุดสี + สถานะ + จำนวน + %)
    renderChartLegend(labels, values, colors, totalCount);
}

// ⚡ Legend ใต้กราฟ: จุดสี + สถานะ + จำนวน + % (คลิกเพื่อกรองได้)
function renderChartLegend(labels, values, colors, totalCount) {
    const el = document.getElementById('chartLegendDetailed');
    if (!el) return;
    const statusKeys = ['new', 'assigned', 'pending', 'solved', 'closed'];
    let html = '';
    for (let i = 0; i < labels.length; i++) {
        const count = values[i] || 0;
        const pct = totalCount > 0 ? (count / totalCount * 100) : 0;
        const pctText = count === 0 ? '0%' : (pct < 0.1 ? '<0.1%' : pct.toFixed(1) + '%');
        const active = STATE.currentStatus === statusKeys[i] ? ' active' : '';
        html += `
            <button type="button" class="cl-row${active}" data-status="${statusKeys[i]}" onclick="toggleStatusFilter('${statusKeys[i]}')">
                <span class="cl-dot" style="background:${colors[i]}"></span>
                <span class="cl-label">${labels[i]}</span>
                <span class="cl-count">${count}</span>
                <span class="cl-pct">${pctText}</span>
            </button>`;
    }
    // ALL — สถานะที่ 6 แสดงทุก ticket รวมกัน
    const allActive = STATE.currentStatus === 'all' ? ' active' : '';
    html += `
        <button type="button" class="cl-row${allActive}" data-status="all" onclick="toggleStatusFilter('all')"
            style="margin-top:4px; border-top: 1px dashed var(--border-solid); padding-top:8px;">
            <span class="cl-dot" style="background: conic-gradient(#3b82f6 0% 20%, #f59e0b 20% 40%, #ef4444 40% 60%, #10b981 60% 80%, #64748b 80% 100%); border-radius:50%;"></span>
            <span class="cl-label" style="font-weight:700;">ALL</span>
            <span class="cl-count">${totalCount}</span>
            <span class="cl-pct">100%</span>
        </button>`;
    el.innerHTML = html;
}

function toggleStatusFilter(statusKey, forceOpen = false) {
    if (statusKey === 'all') {
        STATE.currentStatus = 'all'; // ALL เปิดเสมอ
    } else if (STATE.currentStatus === statusKey && !forceOpen) {
        STATE.currentStatus = null; // Toggle off
    } else {
        STATE.currentStatus = statusKey; // เปิด
    }

    // Update legend UI (เดิม)
    document.querySelectorAll('.legend-item').forEach(item => {
        if (item.innerText.trim().toLowerCase() === STATE.currentStatus) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // ⚡ อัปเดตสถานะ active ของ legend ใต้กราฟ
    document.querySelectorAll('.cl-row').forEach(row => {
        row.classList.toggle('active', row.dataset.status === STATE.currentStatus);
    });

    updateDashboardLayout();
    renderTickets();
}

function updateDashboardLayout() {
    const container = document.getElementById('dashboardContainer');
    const panelTitle = document.getElementById('panelTitle');
    
    if (STATE.currentStatus || STATE.searchQuery) {
        container.classList.add('split-active');
        
        let titleText = 'All Tickets';
        if (STATE.currentStatus && STATE.currentStatus !== 'all') {
            titleText = STATE.currentStatus.toUpperCase() + ' Tickets';
        } else if (STATE.currentStatus === 'all' && STATE.dateFilter === 'today') {
            titleText = 'Tickets Today';
        }
        if (STATE.searchQuery) titleText = 'Search Results';
        
        panelTitle.innerHTML = `<span class="material-symbols-outlined">dataset</span> ${titleText}`;
    } else {
        container.classList.remove('split-active');
    }
}

// ==============================================
// Rendering Logic
// ==============================================
function renderTickets() {
    const container = document.getElementById('ticketContainer');
    if (!container) return;
    
    if (!STATE.currentStatus && !STATE.searchQuery) {
        // อัปเดต ID เพื่อหยุดการวาดเก่า
        window.currentRenderId = (window.currentRenderId || 0) + 1;
        // เคลียร์เนื้อหาทิ้งทันที เพื่อให้ตอนปิดกล่องลื่นไหล 100%
        container.innerHTML = '';
        return;
    }

    if (STATE.isLoading) {
        container.innerHTML = generateSkeleton();
        return;
    }
    
    const { filtered } = getFilteredData();
    let ticketsToRender = [];
    
    const statusMap = {
        'new': { label: 'NEW', color: 'var(--status-new)' },
        'assigned': { label: 'ASSIGNED', color: 'var(--status-assigned)' },
        'pending': { label: 'PENDING', color: 'var(--status-pending)' },
        'solved': { label: 'SOLVED', color: 'var(--status-solved)' },
        'closed': { label: 'CLOSED', color: 'var(--status-closed)' }
    };
    
    if (STATE.currentStatus && STATE.currentStatus !== 'all') {
        ticketsToRender = filtered[STATE.currentStatus].map(t => ({...t, _statusData: statusMap[STATE.currentStatus]}));
    } else {
        // Show all — ทั้งเมื่อค้นหา และเมื่อกด ALL
        Object.keys(filtered).forEach(key => {
            const mapped = filtered[key].map(t => ({...t, _statusData: statusMap[key]}));
            ticketsToRender = ticketsToRender.concat(mapped);
        });
    }
    
    const panelTitleSpan = document.getElementById('statusName');
    if (panelTitleSpan) {
        const baseText = panelTitleSpan.innerText.split(' (')[0];
        panelTitleSpan.innerText = `${baseText} (${ticketsToRender.length} ใบ)`;
    }
    
    if (ticketsToRender.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding: 60px 20px; color: var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.5;">inbox</span>
                <p style="margin-top: 16px; font-weight: 500;">No tickets found matching your criteria.</p>
            </div>
        `;
        return;
    }
    
    window.currentRenderId = (window.currentRenderId || 0) + 1;
    const myRenderId = window.currentRenderId;
    
    if (STATE.viewMode === 'list') {
        // ⚡ render ทันทีแบบทยอย (chunk) — ไม่มี overlay/หน่วงเวลา; การ์ดนอกจอถูก virtualize ด้วย content-visibility
        container.innerHTML = '';
        const listDiv = document.createElement('div');
        listDiv.className = 'ticket-list';
        container.appendChild(listDiv);

        let currentIndex = 0;
        const chunkSize = 40;

        function renderChunk() {
            if (window.currentRenderId !== myRenderId) return;

            const end = Math.min(currentIndex + chunkSize, ticketsToRender.length);
            const tempDiv = document.createElement('div');
            let chunkHtml = '';
            for (let i = currentIndex; i < end; i++) {
                chunkHtml += generateListItem(ticketsToRender[i]);
            }
            tempDiv.innerHTML = chunkHtml;

            const fragment = document.createDocumentFragment();
            while (tempDiv.firstChild) fragment.appendChild(tempDiv.firstChild);
            listDiv.appendChild(fragment);

            currentIndex = end;
            if (currentIndex < ticketsToRender.length) {
                requestAnimationFrame(renderChunk);
            } else {
                updateCheckboxes();
            }
        }
        renderChunk(); // เฟรมแรกแสดงทันที แล้วทยอยต่อ
    } else {
        container.innerHTML = generateTableContainer();
        const tbody = container.querySelector('tbody');
        
        let currentIndex = 0;
        const chunkSize = 50;
        
        function renderTableChunk() {
            if (window.currentRenderId !== myRenderId) return;
            
            const end = Math.min(currentIndex + chunkSize, ticketsToRender.length);
            const fragment = document.createDocumentFragment();
            const tempTable = document.createElement('tbody');
            let chunkHtml = '';
            
            for (let i = currentIndex; i < end; i++) {
                chunkHtml += generateTableRow(ticketsToRender[i]);
            }
            
            tempTable.innerHTML = chunkHtml;
            while(tempTable.firstChild) {
                fragment.appendChild(tempTable.firstChild);
            }
            
            tbody.appendChild(fragment);
            currentIndex = end;
            
            if (currentIndex < ticketsToRender.length) {
                requestAnimationFrame(renderTableChunk);
            } else {
                updateCheckboxes();
            }
        }
        
        requestAnimationFrame(renderTableChunk);
    }
}

function cleanHtmlText(htmlStr) {
    if (!htmlStr) return "-";
    
    // 0. Sanitize input using DOMPurify to prevent XSS
    let sanitizedHtml = window.DOMPurify ? DOMPurify.sanitize(htmlStr) : htmlStr;
    
    // สร้าง DOM ชั่วคราวเพื่อแปลง &lt; ให้กลายเป็น <
    const txt = document.createElement("textarea");
    txt.innerHTML = sanitizedHtml;
    let decoded = txt.value;
    
    // 1. แปลง Tag ขึ้นบรรทัดใหม่ให้เป็น \n ก่อนลบ Tag ทิ้ง
    decoded = decoded.replace(/<br\s*\/?>/gi, '\n');
    decoded = decoded.replace(/<\/p>|<\/div>|<li[^>]*>/gi, '\n');
    
    // 2. ลบ Tag HTML ที่เหลือทิ้งทั้งหมด
    decoded = decoded.replace(/<[^>]*>?/gm, '');
    
    // 3. ตัดลายเซ็นและข้อมูลติดต่อที่ไม่จำเป็นทิ้งทั้งหมด
    const signatureIndex = decoded.toLowerCase().indexOf("best regards");
    if (signatureIndex !== -1) {
        decoded = decoded.substring(0, signatureIndex);
    }
    
    decoded = decoded.replace(/^รายละเอียด:?\s*/g, '');
    
    // 4. จัดการช่องว่าง: ยุบ space แต่เก็บ \n ไว้
    decoded = decoded.replace(/[ \t]+/g, ' '); // ยุบ space และ tab
    decoded = decoded.replace(/\n\s*\n+/g, '\n\n'); // ยุบ \n ที่ติดกันเยอะๆ
    
    // กำจัดคำว่า nbsp; ที่หลุดรอดมาจาก Node-RED
    decoded = decoded.replace(/nbsp;/gi, ' ');
    
    // เปลี่ยนเส้นประยาวๆ ให้เป็นตัวคั่น HTML สวยๆ
    decoded = decoded.replace(/-{10,}/g, '\n\n<hr style="border-top: 1px dashed var(--border-solid, #cbd5e1); margin: 12px 0;">\n\n');
    
    // 5. Smart Formatting: ขึ้นบรรทัดใหม่ให้ประโยค/หัวข้อสำคัญถ้ายาวติดกัน
    decoded = decoded.replace(/ (เรียนผู้รับบริการ|เรียนผู้ใช้บริการ|ขออนุญาตนำส่ง|ในส่วนของ Report|เหตุการณ์ อ้างอิง)/gi, '\n\n$1');
    
    const headerPatterns = [
        "ประเภทของภัยคุกคาม:", "ความหมายของภัยคุกคาม:", "ชื่อบัญชีที่ถูกเปลี่ยนรหัสผ่าน:",
        "บัญชีผู้ดำเนินการ:", "หมายเลข IP เครื่องเป้าหมาย:", "ตรวจพบพบวัน/เวลา:", "ตรวจสอบพบวัน/เวลา:", "Criteria:",
        "Incident Id :", "รายละเอียด:"
    ];
    headerPatterns.forEach(hp => {
        // ขึ้นบรรทัดใหม่หน้าหัวข้อเหล่านี้
        const regex = new RegExp(` (${hp})`, 'gi');
        decoded = decoded.replace(regex, '\n$1');
    });
    
    // 6. ไฮไลต์ Keyword ให้อ่านง่าย (ตัวหนาและสีน้ำเงิน)
    const highlightKeywords = [
        "Incident Report", "อ้างอิง Ticket:", "อ้างอิง TK :", 
        "วันที่ตรวจสอบ:", "Rule :", "Ticket:", "TK :", "อ้างอิง",
        ...headerPatterns
    ];
    
    highlightKeywords.forEach(kw => {
        // หลีกเลี่ยงการแทนที่ซ้ำซ้อนโดยจับคู่คำตรงๆ
        const regex = new RegExp(`(${kw})`, 'gi');
        decoded = decoded.replace(regex, '||$1||'); // มาร์คไว้ก่อน
    });
    
    // เปลี่ยนมาร์คเป็น HTML tag (สีเข้มและตัวหนา)
    decoded = decoded.replace(/\|\|(.*?)\|\|/g, '<span style="color:var(--sysnect-blue, #1e3a8a); font-weight:700;">$1</span>');
    
    // 7. แปลง \n กลับเป็น <br> สำหรับแสดงบนเว็บ
    decoded = decoded.trim().replace(/\n/g, '<br>');
    
    return decoded;
}

window.toggleDetail = function(btn) {
    const item = btn.closest('.ticket-item');
    const wrapper = item.querySelector('.ticket-detail-wrapper');
    const fullDiv = item.querySelector('.ticket-detail-full');
    
    if (!wrapper.classList.contains('show')) {
        wrapper.classList.add('show');
        wrapper.style.gridTemplateRows = '1fr';
        fullDiv.style.opacity = '1';
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom;">expand_less</span> ซ่อนรายละเอียด';
    } else {
        wrapper.classList.remove('show');
        wrapper.style.gridTemplateRows = '0fr';
        fullDiv.style.opacity = '0';
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px; vertical-align: text-bottom;">expand_more</span> ดูรายละเอียด';
    }
};

window.copyTicketId = function(id, btn) {
    navigator.clipboard.writeText(id).then(() => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 14px; color: #10b981;">check</span>';
        btn.style.background = '#dcfce7';
        btn.style.borderColor = '#86efac';
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.style.background = '';
            btn.style.borderColor = '';
        }, 2000);
    });
};

function generateListItem(ticket) {
    const idStr = String(ticket.id || '');
    let shortId = '';
    const m = idStr.match(/(C\d{2}-\d+|\d{8,})/);
    if (m) {
        shortId = m[1];
    } else {
        const num = ticket.ticket_number || ticket.title;
        if (num && String(num).trim()) {
            shortId = String(num).replace(/Ticket\s*#?/gi, '').trim();
        } else {
            shortId = idStr.substring(0, 10);
        }
    }
    const cleanedText = cleanHtmlText(ticket.detail);
    
    const pRaw = String(ticket.priority || 'low').toLowerCase().trim();
    let priority = 'low';
    if (['critical', 'วิกฤต', 'เร่งด่วนที่สุด', '5', '6'].some(kw => pRaw.includes(kw))) priority = 'critical';
    else if (['high', 'สูง', 'สูงมาก', '4'].some(kw => pRaw.includes(kw))) priority = 'high';
    else if (['medium', 'ปานกลาง', 'ปกติ', '3'].some(kw => pRaw.includes(kw))) priority = 'medium';
    
    let priorityBadge = '';
    if (priority === 'critical') {
        priorityBadge = `<span class="badge-priority priority-critical" style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #fee2e2; color: #ef4444; border: 1px solid #fca5a5;">Critical</span>`;
    } else if (priority === 'high') {
        priorityBadge = `<span class="badge-priority priority-high" style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #ffedd5; color: #f97316; border: 1px solid #fdba74;">High</span>`;
    } else if (priority === 'medium') {
        priorityBadge = `<span class="badge-priority priority-medium" style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #fef9c3; color: #eab308; border: 1px solid #fde047;">Medium</span>`;
    } else {
        priorityBadge = `<span class="badge-priority priority-low" style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #dcfce7; color: #22c55e; border: 1px solid #86efac;">Low</span>`;
    }
    
    const duration = calculateTicketDuration(ticket.date_open, ticket.date_close, ticket._statusData.label);
    const isResolved = ['CLOSED', 'SOLVED'].includes(ticket._statusData.label);
    const durationBadge = duration
        ? `<span class="badge-duration ${isResolved ? 'resolved' : 'ongoing'}">
               <span class="material-symbols-outlined" style="font-size:12px;">schedule</span> ${duration}
           </span>`
        : '';

    const closeDateDisplay = formatDateTime(ticket.date_close);
    const locationDisplay = escapeHtml(ticket.location || '-');

    return `
        <div class="ticket-item" style="--item-color: ${ticket._statusData.color};">
            <div class="ticket-checkbox-container">
                <input type="checkbox" class="ticket-checkbox" value="${escapeHtml(ticket.id)}" onchange="toggleSelection('${escapeHtml(ticket.id)}')">
            </div>

            <!-- แถว 1: ID + copy + priority | duration -->
            <div class="ticket-header-row">
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span class="badge badge-id" style="display:flex; align-items:center; gap:4px;">
                        <span class="material-symbols-outlined" style="font-size:13px;">tag</span>
                        ${escapeHtml(shortId)}
                        <button class="btn-copy-id" onclick="copyTicketId('${escapeHtml(shortId)}', this)" title="Copy Ticket ID">
                            <span class="material-symbols-outlined" style="font-size:13px;">content_copy</span>
                        </button>
                    </span>
                    ${priorityBadge}
                </div>
                ${durationBadge}
            </div>

            ${ticket.name ? `<div class="ticket-title-row">${escapeHtml(ticket.name)}</div>` : ''}

            <!-- แถว 2: location | open | close | status -->
            <div class="ticket-meta-row">
                <span class="badge" style="font-size:11px; background: rgba(93,64,55,0.07); color:#795548; border:1px solid rgba(93,64,55,0.2); padding:3px 8px; border-radius:6px;">
                    <span class="material-symbols-outlined" style="font-size:12px; vertical-align:text-bottom;">location_on</span> ${locationDisplay}
                </span>
                <span class="badge badge-date" style="font-size:11px; border-color:rgba(59,130,246,0.3); background:rgba(59,130,246,0.05); color:#2563eb;">
                    <span class="material-symbols-outlined" style="font-size:12px; vertical-align:text-bottom;">calendar_today</span> เปิด: ${formatDateTime(ticket.date_open)}
                </span>
                <span class="badge" style="font-size:11px; border:1px solid rgba(239,68,68,0.3); background:rgba(239,68,68,0.05); color:#ef4444; padding:3px 8px; border-radius:6px;">
                    <span class="material-symbols-outlined" style="font-size:12px; vertical-align:text-bottom;">event_busy</span> ปิด: ${closeDateDisplay === '-' ? 'ยังไม่ปิด' : closeDateDisplay}
                </span>
                <span class="badge badge-status" style="font-size:11px; color:${ticket._statusData.color}; border:1px solid ${ticket._statusData.color}40; background:${ticket._statusData.color}15; padding:3px 8px; border-radius:6px;">
                    <span class="material-symbols-outlined" style="font-size:12px; vertical-align:text-bottom;">label</span> ${ticket._statusData.label}
                </span>
            </div>

            <!-- แถว 3: project | detail btn -->
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); border:1px solid var(--border-solid); border-radius:8px; padding:9px 12px;">
                <div style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:var(--text-main); min-width:0; overflow:hidden;">
                    <span class="material-symbols-outlined" style="font-size:16px; color:var(--accent); flex-shrink:0;">folder</span>
                    <a href="${GLPI_BASE_URL}/index.php?redirect=ticket_${getNumericTicketId(ticket)}" target="_blank" rel="noopener noreferrer"
                       style="color:var(--primary); text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
                       onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
                        ${escapeHtml(ticket.project || '-')}
                        <span class="material-symbols-outlined" style="font-size:13px; vertical-align:text-bottom;">open_in_new</span>
                    </a>
                </div>
                <button onclick="toggleDetail(this)" style="flex-shrink:0; background:var(--bg-card-solid); border:1px solid var(--border-solid); padding:5px 12px; border-radius:20px; color:var(--text-muted); font-size:12px; font-weight:500; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all 0.2s;">
                    <span class="material-symbols-outlined" style="font-size:15px; vertical-align:text-bottom;">expand_more</span> รายละเอียด
                </button>
            </div>

            <!-- Detail (slide-down) -->
            <div class="ticket-detail-wrapper" style="display:grid; grid-template-rows:0fr; transition:grid-template-rows 0.4s cubic-bezier(0.4,0,0.2,1);">
                <div class="ticket-detail-full" style="overflow:hidden; opacity:0; transition:opacity 0.4s cubic-bezier(0.4,0,0.2,1); color:var(--text-muted); line-height:1.6;">
                    <div style="padding-top:12px; margin-top:4px; border-top:1px dashed var(--border-solid);">
                        <span class="material-symbols-outlined" style="font-size:15px; vertical-align:text-bottom; color:var(--primary);">description</span>
                        <strong>รายละเอียด:</strong><br>
                        ${cleanedText}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function generateTableRow(t) {
    const idStr = String(t.id || '');
    let shortId = '';
    const m = idStr.match(/(C\d{2}-\d+|\d{8,})/);
    if (m) {
        shortId = m[1];
    } else {
        const num = t.ticket_number || t.title;
        if (num && String(num).trim()) {
            shortId = String(num).replace(/Ticket\s*#?/gi, '').trim();
        } else {
            shortId = idStr.substring(0, 10);
        }
    }
    
    const pRaw = String(t.priority || 'low').toLowerCase().trim();
    let priority = 'low';
    if (['critical', 'วิกฤต', 'เร่งด่วนที่สุด', '5', '6'].some(kw => pRaw.includes(kw))) priority = 'critical';
    else if (['high', 'สูง', 'สูงมาก', '4'].some(kw => pRaw.includes(kw))) priority = 'high';
    else if (['medium', 'ปานกลาง', 'ปกติ', '3'].some(kw => pRaw.includes(kw))) priority = 'medium';
    
    let priorityBadge = '';
    if (priority === 'critical') {
        priorityBadge = `<span style="padding: 2px 6px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #fee2e2; color: #ef4444; border: 1px solid #fca5a5;">Critical</span>`;
    } else if (priority === 'high') {
        priorityBadge = `<span style="padding: 2px 6px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #ffedd5; color: #f97316; border: 1px solid #fdba74;">High</span>`;
    } else if (priority === 'medium') {
        priorityBadge = `<span style="padding: 2px 6px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #fef9c3; color: #eab308; border: 1px solid #fde047;">Medium</span>`;
    } else {
        priorityBadge = `<span style="padding: 2px 6px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #dcfce7; color: #22c55e; border: 1px solid #86efac;">Low</span>`;
    }

    return `
        <tr>
            <td style="width: 40px; text-align: center;">
                <input type="checkbox" class="ticket-checkbox" value="${escapeHtml(t.id)}" onchange="toggleSelection('${escapeHtml(t.id)}')">
            </td>
            <td class="table-id"><a href="${GLPI_BASE_URL}/index.php?redirect=ticket_${getNumericTicketId(t)}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: none; font-weight: 600;">${escapeHtml(shortId)}</a></td>
            <td style="font-weight: 500;"><a href="${GLPI_BASE_URL}/index.php?redirect=ticket_${getNumericTicketId(t)}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${escapeHtml(t.project || '-')}</a></td>
            <td style="font-weight: 500; color: var(--text-muted);">${escapeHtml(t.location || '-')}</td>
            <td>${priorityBadge}</td>
            <td style="color: var(--text-muted);">${formatDateTime(t.date_open)}</td>
            <td style="color: var(--text-muted);">${formatDateTime(t.date_close)}</td>
            <td>
                <span class="table-status" style="background: ${t._statusData.color}20; color: ${t._statusData.color}; border: 1px solid ${t._statusData.color}40;">
                    ${t._statusData.label}
                </span>
            </td>
        </tr>
    `;
}

function generateTableContainer() {
    return `
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 40px; text-align: center;">
                            <input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll(this)">
                        </th>
                        <th>ID</th>
                        <th>Project Name</th>
                        <th>Location</th>
                        <th>Priority</th>
                        <th>วันที่เปิด</th>
                        <th>วันที่ปิด</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    `;
}

function generateSkeleton() {
    return `
        <div class="ticket-list">
            ${[1,2,3].map(() => `
                <div class="ticket-item" style="border-left: 4px solid var(--border-solid);">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text short"></div>
                </div>
            `).join('')}
        </div>
    `;
}

function setLoading(isLoading) {
    STATE.isLoading = isLoading;
    const loader = document.getElementById('sysnectLoader');
    if (loader) {
        if (isLoading) {
            loader.classList.remove('hidden');
        } else {
            loader.classList.add('hidden');
        }
    }
}

// ==============================================
// Selection & Export Logic
// ==============================================
window.toggleSelection = function(id) {
    if (STATE.selectedTickets.has(id)) {
        STATE.selectedTickets.delete(id);
    } else {
        STATE.selectedTickets.add(id);
    }
    updateSelectionUI();
};

window.toggleSelectAll = function(checkbox) {
    const checkboxes = document.querySelectorAll('.ticket-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        if (checkbox.checked) {
            STATE.selectedTickets.add(cb.value);
        } else {
            STATE.selectedTickets.delete(cb.value);
        }
    });
    updateSelectionUI();
};

window.clearSelection = function() {
    STATE.selectedTickets.clear();
    const checkboxes = document.querySelectorAll('.ticket-checkbox, #selectAllCheckbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateSelectionUI();
};

function updateCheckboxes() {
    const checkboxes = document.querySelectorAll('.ticket-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = STATE.selectedTickets.has(cb.value);
    });
    updateSelectionUI();
}



// ==============================================
// Event Listeners
// ==============================================
function setupEventListeners() {
    // Export Handlers
    document.getElementById('btnExportSelected')?.addEventListener('click', exportSelectedTickets);
    document.getElementById('btnCancelSelection')?.addEventListener('click', clearSelection);

    // Settings Panel
    document.getElementById('btnSettings')?.addEventListener('click', openSettingsPanel);

    // Theme Toggle
    document.getElementById('btnThemeToggle')?.addEventListener('click', toggleTheme);
    
    // View Mode Toggle
    document.getElementById('btnListView')?.addEventListener('click', (e) => {
        STATE.viewMode = 'list';
        e.currentTarget.classList.add('active');
        document.getElementById('btnTableView').classList.remove('active');
        renderTickets();
    });
    
    document.getElementById('btnTableView')?.addEventListener('click', (e) => {
        STATE.viewMode = 'table';
        e.currentTarget.classList.add('active');
        document.getElementById('btnListView').classList.remove('active');
        renderTickets();
    });
    
    // Search
    let searchTimeout = null;
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            STATE.searchQuery = e.target.value;
            updateDashboardLayout();
            initChart();
            renderTickets();
        }, 300);
    });
    
    // Custom Legend Clicks
    const legendItems = document.querySelectorAll('.legend-item');
    legendItems.forEach(item => {
        item.addEventListener('click', () => {
            const statusText = item.innerText.trim().toLowerCase();
            if (Object.keys(STATE.data).includes(statusText)) {
                toggleStatusFilter(statusText);
            }
        });
    });
    
    // Dropdown Filters
    document.getElementById('projectFilter')?.addEventListener('change', (e) => {
        STATE.projectFilter = e.target.value;
        initChart(); // Update chart
        renderTickets(); // Update list
    });
    
    document.getElementById('priorityFilter')?.addEventListener('change', (e) => {
        STATE.priorityFilter = e.target.value;
        initChart(); // Update chart
        renderTickets(); // Update list
    });
    
    // Update native date input display (dd/mm/yyyy hack)
    const updateDateDisplay = (el) => {
        if (!el) return;
        if (el.value) {
            const parts = el.value.split('-'); // YYYY-MM-DD
            if (parts.length === 3) {
                el.setAttribute('data-date', `${parts[2]}/${parts[1]}/${parts[0]}`); // DD/MM/YYYY
            }
        } else {
            el.setAttribute('data-date', 'วัน/เดือน/ปี');
        }
    };
    
    // Initialize date placeholders
    const startEl = document.getElementById('filterDateStart');
    const endEl = document.getElementById('filterDateEnd');
    updateDateDisplay(startEl);
    updateDateDisplay(endEl);

    const handleDateChange = (e) => {
        if (e && e.target) updateDateDisplay(e.target);
        STATE.dateFilter = 'custom';
        const rangeSelect = document.getElementById('filterDateRange');
        if (rangeSelect) rangeSelect.value = 'all'; // Reset dropdown visually
        initChart();
        renderTickets();
        renderMonthlyBreakdown();
    };

    document.getElementById('filterDateStart')?.addEventListener('change', handleDateChange);
    document.getElementById('filterDateEnd')?.addEventListener('change', handleDateChange);

    document.getElementById('filterDateRange')?.addEventListener('change', (e) => {
        STATE.dateFilter = e.target.value;
        
        // Clear custom inputs when selecting a predefined range
        const startEl = document.getElementById('filterDateStart');
        const endEl = document.getElementById('filterDateEnd');
        if (startEl) {
            startEl.value = '';
            updateDateDisplay(startEl);
        }
        if (endEl) {
            endEl.value = '';
            updateDateDisplay(endEl);
        }
        
        updateDashboardLayout();
        initChart();
        renderTickets();
        renderMonthlyBreakdown();
    });

    // Clear Date Range
    document.getElementById('btnClearDateRange')?.addEventListener('click', () => {
        const startEl = document.getElementById('filterDateStart');
        const endEl = document.getElementById('filterDateEnd');
        const rangeSelect = document.getElementById('filterDateRange');

        if (startEl) {
            startEl.value = '';
            updateDateDisplay(startEl);
        }
        if (endEl) {
            endEl.value = '';
            updateDateDisplay(endEl);
        }
        if (rangeSelect) rangeSelect.value = 'all';

        STATE.dateFilter = 'all';
        updateDashboardLayout();
        initChart();
        renderTickets();
        renderMonthlyBreakdown();
    });

    
    // Refresh
    document.getElementById('btnRefresh')?.addEventListener('click', () => {
        fetchData();
    });
}
// ==============================================
// Anti-Inspection & UI Protection
// ==============================================
(function initSecurity() {
    // 1. Disable Right-Click (Context Menu)
    document.addEventListener('contextmenu', event => event.preventDefault());

    // 2. Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
    document.addEventListener('keydown', event => {
        if (event.key === 'F12' || 
            (event.ctrlKey && event.shiftKey && (event.key === 'I' || event.key === 'i')) || 
            (event.ctrlKey && event.shiftKey && (event.key === 'J' || event.key === 'j')) || 
            (event.ctrlKey && event.shiftKey && (event.key === 'C' || event.key === 'c')) || 
            (event.ctrlKey && (event.key === 'U' || event.key === 'u'))) {
            event.preventDefault();
        }
    });
})();

// ==============================================
// Advanced Export System
// ==============================================
let currentExportFormat = 'excel';

window.openExportModal = function(forSelection = false) {
    window.isExportingSelection = forSelection;
    const dateGroup = document.getElementById('exportDateRange').closest('.export-option-group');
    if (dateGroup) {
        dateGroup.style.display = forSelection ? 'none' : 'block';
    }
    document.getElementById('exportModal').classList.add('active');
};

window.closeExportModal = function() {
    document.getElementById('exportModal').classList.remove('active');
};

window.selectExportFormat = function(format) {
    currentExportFormat = format;
    document.querySelectorAll('.format-btn').forEach(btn => btn.classList.remove('selected'));
    document.querySelector(`.format-btn[data-format="${format}"]`).classList.add('selected');
};

window.executeExport = function() {
    const dateRange = document.getElementById('exportDateRange').value;
    let ticketsToExport = [];
    
    if (window.isExportingSelection) {
        const allTickets = [];
        Object.keys(STATE.data).forEach(key => {
            STATE.data[key].forEach(t => allTickets.push({ ...t, status_name: key.toUpperCase() }));
        });
        ticketsToExport = allTickets.filter(t => STATE.selectedTickets.has(String(t.id)));
    } else {
        const originalDateFilter = STATE.dateFilter;
        STATE.dateFilter = 'all'; // temporarily bypass dashboard date filter
        const filteredResult = getFilteredData().filtered;
        STATE.dateFilter = originalDateFilter; // restore
        
        const currentStatus = STATE.currentStatus || 'ALL';
        
        if (currentStatus && currentStatus !== 'ALL') {
            const statusKey = currentStatus.toLowerCase();
            if (filteredResult[statusKey]) {
                ticketsToExport = filteredResult[statusKey].map(t => ({ ...t, status_name: statusKey.toUpperCase() }));
            }
        } else {
            Object.keys(filteredResult).forEach(key => {
                const arr = filteredResult[key].map(t => ({ ...t, status_name: key.toUpperCase() }));
                ticketsToExport = ticketsToExport.concat(arr);
            });
        }
        
        // Filter by selected date range if not 'all'
        if (dateRange !== 'all') {
            const today = new Date();
            const cYear = today.getFullYear();
            const cMonth = today.getMonth();
            const cDay = today.getDate();
            const cDateOnly = new Date(cYear, cMonth, cDay).getTime();
            const ONE_DAY = 24 * 60 * 60 * 1000;
            
            ticketsToExport = ticketsToExport.filter(ticket => {
                if (!ticket.date_creation && !ticket.date) return false;
                const createdDate = new Date(ticket.date_creation || ticket.date);
                if (isNaN(createdDate.getTime())) return false;
                
                const tYear = createdDate.getFullYear();
                const tMonth = createdDate.getMonth();
                const tDay = createdDate.getDate();
                const tDateOnly = new Date(tYear, tMonth, tDay).getTime();
                
                if (dateRange === 'today') {
                    return tDateOnly === cDateOnly;
                } else if (dateRange === 'week') {
                    return tDateOnly >= (cDateOnly - 6 * ONE_DAY) && tDateOnly <= cDateOnly;
                } else if (dateRange === 'month') {
                    return tYear === cYear && tMonth === cMonth;
                } else if (dateRange === 'last_month') {
                    let lastMonth = cMonth - 1;
                    let lastYear = cYear;
                    if (lastMonth < 0) { lastMonth = 11; lastYear--; }
                    return tYear === lastYear && tMonth === lastMonth;
                }
                return true;
            });
        }
    }
    
    if (ticketsToExport.length === 0) {
        alert('ไม่พบข้อมูลในช่วงเวลาหรือเงื่อนไขที่เลือก');
        return;
    }

    if (currentExportFormat === 'excel' || currentExportFormat === 'csv') {
        exportToSpreadsheet(ticketsToExport, currentExportFormat);
        closeExportModal();
    } else if (currentExportFormat === 'pdf') {
        const submitBtn = document.querySelector('.btn-export-submit');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px; animation: spin 1s linear infinite; vertical-align: middle; margin-right: 8px;">sync</span> กำลังสร้าง PDF...';
        
        setTimeout(async () => {
            const dateText = window.isExportingSelection ? 'เฉพาะรายการที่เลือก (Selected Tickets)' : document.getElementById('exportDateRange').options[document.getElementById('exportDateRange').selectedIndex].text;
            await exportToPDFReport(ticketsToExport, dateText);
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
            closeExportModal();
        }, 100);
    }
};

function exportToSpreadsheet(data, format) {
    const wsData = data.map(t => ({
        "ID":          t.id ? '#' + t.id : '',
        "วันที่เปิด":  t.date_open || t.date || '',
        "วันที่ปิด":   t.date_close || '',
        "รหัสโครงการ": t.project_code || '-',
        "โครงการ":     t.project_name || t.project || '-',
        "ชื่อ Ticket": t.name || '',
        "สถานะ":       t.status_name || '',
        "ความสำคัญ":   t.priority_name || t.priority || ''
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wscols = [
        {wch: 12}, {wch: 22}, {wch: 22}, {wch: 18}, {wch: 45},
        {wch: 50}, {wch: 18}, {wch: 16}
    ];
    ws['!cols'] = wscols;
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tickets");
    
    const fileName = `SYSNECT_Tickets_Report_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : 'csv'}`;
    if (format === 'excel') {
        XLSX.writeFile(wb, fileName);
    } else {
        XLSX.writeFile(wb, fileName, { bookType: "csv" });
    }
}

let thaiFontLoaded = false;
let regularFontBase64 = null;
let boldFontBase64 = null;

async function loadThaiFonts() {
    if (thaiFontLoaded) return true;
    try {
        if (typeof sarabunRegularBase64 !== 'undefined' && typeof sarabunBoldBase64 !== 'undefined') {
            regularFontBase64 = sarabunRegularBase64;
            boldFontBase64 = sarabunBoldBase64;
            thaiFontLoaded = true;
            return true;
        }
        const resReg = await fetch('Sarabun-Regular.ttf');
        if (!resReg.ok) throw new Error('Failed to load Sarabun-Regular.ttf');
        const bufferReg = await resReg.arrayBuffer();
        
        const resBold = await fetch('Sarabun-Bold.ttf');
        if (!resBold.ok) throw new Error('Failed to load Sarabun-Bold.ttf');
        const bufferBold = await resBold.arrayBuffer();
        
        regularFontBase64 = arrayBufferToBase64(bufferReg);
        boldFontBase64 = arrayBufferToBase64(bufferBold);
        
        thaiFontLoaded = true;
        return true;
    } catch (err) {
        console.error('Error loading Thai fonts:', err);
        return false;
    }
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

    async function exportToPDFReport(data, dateRangeLabel) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const PAGE_W = 297;
        const PAGE_H = 210;
        const MARGIN = 14;

        const loaded = await loadThaiFonts();
        if (loaded && regularFontBase64 && boldFontBase64) {
            doc.addFileToVFS('Sarabun-Regular.ttf', regularFontBase64);
            doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
            doc.addFileToVFS('Sarabun-Bold.ttf', boldFontBase64);
            doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
            doc.setFont('Sarabun', 'normal');
        }

        // ─── 1. Header ใหม่ ────────────────────────────────────────
        const logoImg = new Image();
        logoImg.src = 'sysnect-logo.png';
        
        const isImgLoaded = await new Promise((resolve) => {
            logoImg.onload = () => resolve(true);
            logoImg.onerror = () => resolve(false);
        });

        if (isImgLoaded) {
            try {
                doc.addImage(logoImg, 'PNG', MARGIN, 8, 45, 16);
            } catch (e) {
                console.warn("Could not load logo image for PDF", e);
            }
        }

        doc.setFont('Sarabun', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text('บริษัท ซิสเนค อินฟอร์เมชัน จำกัด', PAGE_W - MARGIN, 11, { align: 'right' });
        
        doc.setFontSize(8);
        doc.text('111 หมู่ ดิจิทัล พาร์ค เวสต์ อาคารรูนิคอมวัน ชั้น 9 ยูนิต 917 ถนนสุขุมวิท', PAGE_W - MARGIN, 16, { align: 'right' });
        doc.text('แขวงบางจาก เขตพระโขนง กรุงเทพมหานคร 10260 โทรศัพท์: 091-964-9642', PAGE_W - MARGIN, 21, { align: 'right' });

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(MARGIN, 27, PAGE_W - MARGIN, 27);

        // ─── 2. Title section ──────────────────────────
        doc.setFontSize(14);
        doc.setTextColor(70, 70, 70);
        doc.text('Ticket History Report', MARGIN, 36);

        doc.setFontSize(9);
        doc.setTextColor(140, 140, 140);
        const thDate = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        
        let dateRangeText = dateRangeLabel;

        doc.text(`ช่วงวันที่: ${dateRangeText}  |  ${data.length} รายการ  |  ส่งออก: ${thDate}`, MARGIN, 42);

        // ─── 3. Table ───────────────────────────────────────────────
        const tableRows = data.slice(0, 500).map(t => {
            let rawId = String(t.id || '-');
            if (rawId.length >= 10 && /^\d+$/.test(rawId)) {
                rawId = rawId.substring(0, 6) + '\n' + rawId.substring(6);
            }

            const dateOpen = formatDateTime(t.date_open || t.date || '-').replace(' ', '\n');
            const dateClose = formatDateTime(t.date_close || '-').replace(' ', '\n');
            const name = String(t.name || '-').replace(/\s+/g, ' ').trim();
            const projCode = String(t.project_code || t["76666"] || '-');
            const projName = String(t.project || t.project_name || '-');
            
            let priorityTh = String(t.priority || '-');
            const p = String(t.priority);
            if (p === "1") priorityTh = "ต่ำมาก";
            else if (p === "2") priorityTh = "ต่ำ";
            else if (p === "3") priorityTh = "ปานกลาง";
            else if (p === "4") priorityTh = "สูง";
            else if (p === "5") priorityTh = "สูงมาก";

            const statusName = String(t.status_name || '-').toUpperCase();

            return [
                '#' + rawId,
                dateOpen,
                dateClose,
                name,
                projCode,
                projName,
                priorityTh,
                statusName
            ];
        });

        doc.autoTable({
            startY: 47,
            head: [['ID', 'วันที่เปิด', 'วันที่ปิด', 'ชื่อ Ticket', 'รหัสโครงการ', 'โครงการ', 'ความสำคัญ', 'สถานะ']],
            body: tableRows,
            theme: 'grid',
            styles: {
                font: 'Sarabun',
                fontStyle: 'normal',
                fontSize: 8,
                textColor: [80, 80, 80],
                cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
                valign: 'middle',
                overflow: 'linebreak',
                lineColor: [100, 100, 100],
                lineWidth: 0.3
            },
            headStyles: {
                font: 'Sarabun',
                fontStyle: 'normal',
                fillColor: [255, 255, 255],
                textColor: [50, 50, 50],
                fontSize: 8,
                halign: 'center',
                valign: 'middle'
            },
            alternateRowStyles: { fillColor: [255, 255, 255] },
            columnStyles: {
                0: { cellWidth: 18, halign: 'center' },
                1: { cellWidth: 26, halign: 'center' },
                2: { cellWidth: 26, halign: 'center' },
                3: { cellWidth: 70, halign: 'left' },
                4: { cellWidth: 22, halign: 'center' },
                5: { cellWidth: 60, halign: 'left' },
                6: { cellWidth: 20, halign: 'center' },
                7: { cellWidth: 23, halign: 'center' }
            },
            margin: { left: MARGIN, right: MARGIN },
            didParseCell: function(data) {
                if (data.column.index === 0 && data.section === 'body') {
                    data.cell.styles.textColor = [99, 102, 241];
                }
            },
            didDrawPage: function(hookData) {
                const totalPages = doc.internal.getNumberOfPages();
                const currentPage = hookData.pageNumber;

                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.3);
                doc.line(MARGIN, PAGE_H - 12, PAGE_W - MARGIN, PAGE_H - 12);

                doc.setFont('Sarabun', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(
                    'หน้า ' + currentPage + ' / ' + totalPages,
                    PAGE_W - MARGIN, PAGE_H - 7,
                    { align: 'right' }
                );
            }
        });

        doc.save('Ticket_History_' + new Date().toISOString().slice(0,10) + '.pdf');
    }

            // ─── 1. Header ใหม่ ────────────────────────────────────────
        const logoImg = new Image();
        logoImg.src = 'sysnect-logo.png';
        
        // ต้องรอให้รูปภาพโหลดเสร็จก่อน ไม่งั้น jsPDF จะค้าง
        const isImgLoaded = await new Promise((resolve) => {
            logoImg.onload = () => resolve(true);
            logoImg.onerror = () => resolve(false);
        });

        if (isImgLoaded) {
            try {
                doc.addImage(logoImg, 'PNG', MARGIN, 8, 45, 16);
            } catch (e) {
                console.warn("Could not load logo image for PDF", e);
            }
        }

    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text('บริษัท ซิสเนค อินฟอร์เมชัน จำกัด', PAGE_W - MARGIN, 10, { align: 'right' });
    
    doc.setFont('Sarabun', 'normal');
    doc.text('111 หมู่ ดิจิทัล พาร์ค เวสต์ อาคารรูนิคอมวัน ชั้น 9 ยูนิต 917', PAGE_W - MARGIN, 14, { align: 'right' });
    doc.text('ถนนสุขุมวิท แขวงบางจาก เขตพระโขนง กรุงเทพมหานคร 10260', PAGE_W - MARGIN, 18, { align: 'right' });
    doc.text('โทรศัพท์: 091-964-9642', PAGE_W - MARGIN, 22, { align: 'right' });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, 28, PAGE_W - MARGIN, 28);

    // ─── 2. Title section (y ≈ 34) ──────────────────────────
    doc.setFont('Sarabun', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('Ticket History Report', MARGIN, 34);

    doc.setFont('Sarabun', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const thDate = new Date().toLocaleDateString('th-TH');
    
    let dateRangeText = dateRangeLabel;

    doc.text('ช่วงวันที่: ' + dateRangeText + '  |  ' + data.length + ' รายการ  |  ส่งออก: ' + thDate, MARGIN, 40);

    // ─── 3. Table ───────────────────────────────────────────────
    const tableRows = data.slice(0, 500).map(t => {
        const rawId = String(t.id || '-');
        const dateOpen = formatDateTime(t.date_open || t.date || '-');
        const dateClose = formatDateTime(t.date_close || '-');
        const name = String(t.name || '-').replace(/\s+/g, ' ').trim();
        const projCode = String(t.project_code || t["76666"] || '-');
        const projName = String(t.project || t.project_name || '-');
        
        let priorityTh = String(t.priority || '-');
        const p = String(t.priority);
        if (p === "1") priorityTh = "ต่ำมาก";
        else if (p === "2") priorityTh = "ต่ำ";
        else if (p === "3") priorityTh = "ปานกลาง";
        else if (p === "4") priorityTh = "สูง";
        else if (p === "5") priorityTh = "สูงมาก";

        const statusName = String(t.status_name || '-').toUpperCase();

        return [
            '#' + rawId,
            dateOpen,
            dateClose,
            name,
            projCode,
            projName,
            priorityTh,
            statusName
        ];
    });

    doc.autoTable({
        startY: 46,
        head: [['ID', 'วันที่เปิด', 'วันที่ปิด', 'ชื่อ Ticket', 'รหัสโครงการ', 'โครงการ', 'ความสำคัญ', 'สถานะ']],
        body: tableRows,
        theme: 'grid',
        styles: {
            font: 'Sarabun',
            fontStyle: 'normal',
            fontSize: 7,
            textColor: [20, 20, 20],
            cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
            overflow: 'linebreak',
            lineColor: [226, 232, 240],
            lineWidth: 0.2
        },
        headStyles: {
            font: 'Sarabun',
            fontStyle: 'bold',
            fillColor: [30, 41, 59],
            textColor: [255, 255, 255],
            fontSize: 7.5,
            halign: 'center',
            cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { cellWidth: 20, halign: 'center' },
            1: { cellWidth: 22, halign: 'center' },
            2: { cellWidth: 22, halign: 'center' },
            3: { cellWidth: 44 },
            4: { cellWidth: 18, halign: 'center' },
            5: { cellWidth: 34 },
            6: { cellWidth: 14, halign: 'center' },
            7: { cellWidth: 18, halign: 'center' }
        },
        margin: { left: MARGIN, right: MARGIN },
        didDrawPage: function(hookData) {
            const totalPages = doc.internal.getNumberOfPages();
            const currentPage = hookData.pageNumber;
            const pageH = doc.internal.pageSize.height;

            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.line(MARGIN, pageH - 12, PAGE_W - MARGIN, pageH - 12);

            doc.setFont('Sarabun', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text(
                'SYSNECT Enterprise Dashboard  |  สร้างเมื่อ ' + new Date().toLocaleString('th-TH'),
                MARGIN, pageH - 7
            );
            doc.text(
                'หน้าที่ ' + currentPage + ' / ' + totalPages,
                PAGE_W - MARGIN, pageH - 7,
                { align: 'right' }
            );
        }
    });

    if (data.length > 500) {
        const finalY = doc.lastAutoTable.finalY + 5;
        doc.setFont('Sarabun', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
            '* แสดงข้อมูลเฉพาะ 500 รายการแรก หากต้องการข้อมูลทั้งหมดโปรดดาวน์โหลดเป็นไฟล์ Excel',
            MARGIN, finalY
        );
    }

    doc.save('Ticket_History_' + new Date().toISOString().slice(0,10) + '.pdf');
}

