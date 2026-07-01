    // ==============================================
    // Security & Anti-Inspection
    // ==============================================


    (function initSecurity() {
        document.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('keydown', e => {
            if (e.key === 'F12' || 
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) || 
                (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) || 
                (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) || 
                (e.ctrlKey && (e.key === 'U' || e.key === 'u'))) {
                e.preventDefault();
            }
        });
    })();

    // ==============================================
    // Selective Export Logic
    // ==============================================
    let selectedTickets = new Set();

    window.toggleSelection = function(id) {
        if (selectedTickets.has(id)) {
            selectedTickets.delete(id);
        } else {
            selectedTickets.add(id);
        }
        updateSelectionUI();
    };

    window.clearSelection = function() {
        selectedTickets.clear();
        const checkboxes = document.querySelectorAll('.ticket-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
        updateSelectionUI();
    };

    window.toggleSelectAll = function() {
        const checkboxes = document.querySelectorAll('.ticket-checkbox');
        if (checkboxes.length === 0) return;
        const allChecked = [...checkboxes].every(cb => cb.checked);
        if (allChecked) {
            checkboxes.forEach(cb => { cb.checked = false; selectedTickets.delete(cb.value); });
        } else {
            checkboxes.forEach(cb => { cb.checked = true; selectedTickets.add(cb.value); });
        }
        updateSelectionUI();
    };

    function updateSelectAllCheckbox() {
        const checkboxes = document.querySelectorAll('.ticket-checkbox');
        const el = document.getElementById('selectAllCheckbox');
        const txt = document.getElementById('selectAllText');
        const wrapper = document.getElementById('selectAllWrapper');
        if (!el) return;
        const total = checkboxes.length;
        const checked = [...checkboxes].filter(cb => cb.checked).length;
        el.indeterminate = checked > 0 && checked < total;
        el.checked = total > 0 && checked === total;
        if (txt) txt.textContent = checked > 0 ? `ยกเลิกทั้งหมด (${checked})` : 'เลือกทั้งหมด';
        if (wrapper) wrapper.style.display = total > 0 ? 'flex' : 'none';
    }

    function updateCheckboxes() {
        const checkboxes = document.querySelectorAll('.ticket-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = selectedTickets.has(cb.value);
        });
        updateSelectionUI();
    }

    function updateSelectionUI() {
        const fab = document.getElementById('selectionFAB');
        const countText = document.getElementById('selectionCount');
        if (!fab || !countText) return;
        if (selectedTickets.size > 0) {
            countText.innerText = selectedTickets.size;
            fab.classList.add('visible');
        } else {
            fab.classList.remove('visible');
        }
        updateSelectAllCheckbox();
    }

    window.exportSelectedTickets = function() {
        if (selectedTickets.size === 0) return;
        
        // Use the modal instead for advanced export (Excel/CSV/PDF)
        openExportModal(true);
    };

    // ==============================================
    // Kasira Features: Settings, Default View, Notifications
    // ==============================================
    window.toggleSettingsDrawer = function() {
        const overlay = document.getElementById('settingsOverlay');
        const drawer = document.getElementById('settingsDrawer');
        if (overlay && drawer) {
            overlay.classList.toggle('active');
            drawer.classList.toggle('active');
        }
    };

    window._autoRefreshTimer = null;

    function startAutoRefresh(minutes) {
        if (window._autoRefreshTimer) {
            clearInterval(window._autoRefreshTimer);
            window._autoRefreshTimer = null;
        }
        if (minutes > 0) {
            window._autoRefreshTimer = setInterval(() => {
                fetchLiveTickets(true);
            }, minutes * 60 * 1000);
        }
    }

    window.onAutoRefreshChange = function() {
        const sel = document.getElementById('settingAutoRefresh');
        const customWrap = document.getElementById('autoRefreshCustomWrap');
        if (customWrap) {
            customWrap.style.display = (sel && sel.value === 'custom') ? 'flex' : 'none';
        }
        updateSettings();
    };

    window.updateSettings = function() {
        const notifToggle = document.getElementById('toggleNotifications');
        const defaultViewSelect = document.getElementById('settingDefaultView');
        const autoRefreshSel = document.getElementById('settingAutoRefresh');
        const autoRefreshCustom = document.getElementById('settingAutoRefreshCustom');
        const defaultStatusSel = document.getElementById('settingDefaultStatus');
        const themeSel = document.getElementById('settingTheme');

        const autoRefreshVal = autoRefreshSel ? autoRefreshSel.value : '0';
        const autoRefreshMinutes = autoRefreshVal === 'custom'
            ? Math.max(1, parseInt(autoRefreshCustom ? autoRefreshCustom.value : '10') || 10)
            : parseInt(autoRefreshVal) || 0;

        const settings = {
            notifications: notifToggle ? notifToggle.checked : false,
            defaultView: defaultViewSelect ? defaultViewSelect.value : 'today',
            autoRefresh: autoRefreshVal,
            autoRefreshCustom: autoRefreshCustom ? parseInt(autoRefreshCustom.value) || 10 : 10,
            defaultStatus: defaultStatusSel ? defaultStatusSel.value : '',
            theme: themeSel ? themeSel.value : 'light'
        };
        localStorage.setItem('sysnect_settings', JSON.stringify(settings));

        // Apply auto-refresh immediately
        startAutoRefresh(autoRefreshMinutes);

        // Apply theme immediately (sync with navbar button)
        const newTheme = settings.theme;
        const prevTheme = document.documentElement.getAttribute('data-theme');
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('sysnectTheme', newTheme);
        if (typeof currentTheme !== 'undefined') window.currentTheme = newTheme;
        const themeIcon = document.querySelector('#btnThemeToggle .theme-icon');
        if (themeIcon) themeIcon.textContent = newTheme === 'dark' ? 'light_mode' : 'dark_mode';
        // Rebuild sidebar charts on theme change
        if (newTheme !== prevTheme) {
            if (window._statusBarChart) { window._statusBarChart.destroy(); window._statusBarChart = null; }
            if (window._trendLineChart) { window._trendLineChart.destroy(); window._trendLineChart = null; }
            if (typeof renderProjectSidebar === 'function') renderProjectSidebar();
            if (typeof renderTrendLineChart === 'function') renderTrendLineChart();
        }

        // Apply view immediately if changed
        const dateFilterEl = document.getElementById('dateFilter');
        if (dateFilterEl && dateFilterEl.value !== settings.defaultView && (settings.defaultView === 'today' || settings.defaultView === 'all')) {
            dateFilterEl.value = settings.defaultView;
            if (typeof getFilteredData === 'function' && typeof renderMonthlyBreakdown === 'function') {
                renderMonthlyBreakdown();
                if (window.currentStatus) window.renderTicketList(window.currentStatus);
                else {
                    const activeTab = document.querySelector('.status-btn.active');
                    if (activeTab) activeTab.click();
                }
            }
        }
    };

    function loadSettings() {
        const settingsRaw = localStorage.getItem('sysnect_settings');
        let settings = { notifications: false, defaultView: 'today', autoRefresh: '0', autoRefreshCustom: 10, defaultStatus: '', theme: 'dark' };

        const legacyDefaultView = localStorage.getItem('sysnect_setting_defaultView');
        if (!settingsRaw && legacyDefaultView) {
            settings.defaultView = legacyDefaultView;
            localStorage.setItem('sysnect_settings', JSON.stringify(settings));
        } else if (settingsRaw) {
            try { settings = Object.assign(settings, JSON.parse(settingsRaw)); } catch(e) {}
        }

        // Restore notifications
        const notifToggle = document.getElementById('toggleNotifications');
        if (notifToggle) notifToggle.checked = settings.notifications;

        // Restore default view
        const defaultViewSelect = document.getElementById('settingDefaultView');
        if (defaultViewSelect) defaultViewSelect.value = settings.defaultView || 'today';

        // Restore auto-refresh UI
        const autoRefreshSel = document.getElementById('settingAutoRefresh');
        const autoRefreshCustom = document.getElementById('settingAutoRefreshCustom');
        const customWrap = document.getElementById('autoRefreshCustomWrap');
        if (autoRefreshSel) autoRefreshSel.value = settings.autoRefresh || '0';
        if (autoRefreshCustom) autoRefreshCustom.value = settings.autoRefreshCustom || 10;
        if (customWrap) customWrap.style.display = (settings.autoRefresh === 'custom') ? 'flex' : 'none';

        // Start auto-refresh timer
        const arVal = settings.autoRefresh || '0';
        const arMinutes = arVal === 'custom'
            ? Math.max(1, parseInt(settings.autoRefreshCustom) || 10)
            : parseInt(arVal) || 0;
        startAutoRefresh(arMinutes);

        // Restore default status (applied after data loads via _applyDefaultStatusPending)
        const defaultStatusSel = document.getElementById('settingDefaultStatus');
        if (defaultStatusSel) defaultStatusSel.value = settings.defaultStatus || '';
        if (settings.defaultStatus) window._applyDefaultStatusPending = settings.defaultStatus;

        // Restore theme
        const themeSel = document.getElementById('settingTheme');
        const savedTheme = settings.theme || localStorage.getItem('sysnectTheme') || 'dark';
        if (themeSel) themeSel.value = savedTheme;
        document.documentElement.setAttribute('data-theme', savedTheme);
        localStorage.setItem('sysnectTheme', savedTheme);
        if (typeof currentTheme !== 'undefined') window.currentTheme = savedTheme;
        const themeIcon = document.querySelector('#btnThemeToggle .theme-icon');
        if (themeIcon) themeIcon.textContent = savedTheme === 'dark' ? 'light_mode' : 'dark_mode';

        // Apply default view to actual filter
        const dateFilterEl = document.getElementById('dateFilter') || document.getElementById('filterDateRange');
        if (dateFilterEl) {
            dateFilterEl.value = settings.defaultView || 'today';

            const quickFilter = document.getElementById('chartDateQuickFilter');
            if (quickFilter) quickFilter.value = dateFilterEl.value;

            const timeTitle = document.getElementById('timeDropdownTitle');
            if (timeTitle) {
                const selectedOpt = dateFilterEl.querySelector(`option[value="${dateFilterEl.value}"]`);
                if (selectedOpt) timeTitle.textContent = selectedOpt.textContent;
            }

            const listItems = document.querySelectorAll('#timeDropdownList .custom-dropdown-item');
            listItems.forEach(item => {
                item.classList.toggle('selected', item.getAttribute('data-value') === dateFilterEl.value);
            });

            dateFilterEl.dispatchEvent(new Event('change'));
        }
    }

    window.playNotificationSound = function() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            
            function playTone(freq, time, duration) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, time);
                gain.gain.setValueAtTime(0, time);
                gain.gain.linearRampToValueAtTime(0.5, time + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
                osc.start(time);
                osc.stop(time + duration);
            }

            const now = ctx.currentTime;
            playTone(880.00, now, 0.3);       // A5
            playTone(1046.50, now + 0.15, 0.3); // C6
            playTone(1318.51, now + 0.3, 0.4);  // E6
        } catch(e) {
            console.error("Audio error:", e);
        }
    };

    function showNotificationToast(count) {
        const prev = document.getElementById('notifToast');
        if (prev) prev.remove();
        const toast = document.createElement('div');
        toast.id = 'notifToast';
        toast.style.cssText = [
            'position:fixed', 'top:72px', 'right:24px',
            'background:#2563eb', 'color:#fff',
            'padding:14px 20px', 'border-radius:14px',
            'font-size:14px', 'font-weight:600',
            'box-shadow:0 4px 20px rgba(37,99,235,0.35)',
            'z-index:9999', 'display:flex', 'align-items:center',
            'gap:10px', 'opacity:1', 'transition:opacity 0.4s'
        ].join(';');
        toast.innerHTML = '<span class="material-symbols-outlined"'
            + ' style="font-size:20px">notification_add</span>'
            + 'มี Ticket ใหม่ <strong style="margin-left:4px">'
            + count + ' ใบ</strong>';
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; }, 3600);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
    }

    // Store previous ticket IDs to detect new ones
    let previousNewTicketIds = new Set();

    // จัดการหน้าโหลด (Premium Loader)
    window.addEventListener('load', () => {
        loadSettings();
        renderUserPill();

        // ดึงข้อมูลจริงจาก n8n
        fetchLiveTickets();

    });

    // ==========================================
    // 💡 การเชื่อมต่อกับ n8n Webhook สำหรับใช้งานจริง
    // ==========================================
    async function fetchLiveTickets(isAutoRefresh = false) {


        // Show loader and start simulated progress
        const loader = document.getElementById('sysnectLoader');
        const loaderBar = document.getElementById('progressRing');
        const loaderPercent = document.getElementById('loaderPercent');
        const loaderMessage = document.getElementById('loaderMessage');
        const EL_CIRC = 339.292; // 2π×54
        function setRingProgress(pct) {
            if (!loaderBar) return;
            loaderBar.style.strokeDashoffset = EL_CIRC - (pct / 100) * EL_CIRC;
        }
        if (!isAutoRefresh && loader && loaderBar && loaderPercent) {
            loader.classList.remove('hidden');
            setRingProgress(0);
            loaderPercent.innerText = '0%';
        }
        
        let progress = 0;
        let secondsElapsed = 0;
        const progressInterval = setInterval(() => {
            if (!loaderBar || !loaderPercent) return;
            // Increment progress smoothly up to 98%
            const increment = Math.max(0.2, (98 - progress) / 15);
            progress += increment;
            if (progress > 98) progress = 98;

            setRingProgress(progress);
            loaderPercent.innerText = Math.round(progress) + '%';
            
            if (!isAutoRefresh && loaderMessage) {
                secondsElapsed += 0.2;
                if (secondsElapsed > 120) {
                    loaderMessage.innerText = "ระบบของ n8n กำลังประมวลผลนานกว่าปกติ อาจใช้เวลาหลายนาที...";
                    loaderMessage.style.color = "#ef4444";
                } else if (secondsElapsed > 30) {
                    loaderMessage.innerText = "กำลังดาวน์โหลดชุดข้อมูลขนาดใหญ่ โปรดรอสักครู่...";
                    loaderMessage.style.color = "#f59e0b";
                } else if (secondsElapsed > 10) {
                    loaderMessage.innerText = "กำลังดึงข้อมูลล่าสุดจากฐานข้อมูล n8n...";
                    loaderMessage.style.color = "#2563eb";
                } else if (secondsElapsed > 3) {
                    loaderMessage.innerText = "กำลังเชื่อมต่อเพื่อดึงข้อมูล Tickets...";
                }
            }
        }, 200);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 นาที
        
        try {
            // Helper function for fetching with timeout
            async function fetchWithTimeout(url, timeoutMs, extraHeaders = {}) {
                const abortCtrl = new AbortController();
                const id = setTimeout(() => abortCtrl.abort(), timeoutMs);
                try {
                    const res = await fetch(url, { signal: abortCtrl.signal, headers: extraHeaders });
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

            // 🆕 ระบบเดียวกับ BASE (backend-driven): Node /api/tickets (n8n→PostgreSQL) เป็นหลัก
            //    → ถ้า n8n ล่ม Node ส่งข้อมูลจาก PostgreSQL แทน (_meta.source='postgres')
            //    → ทางสุดท้าย ยิง n8n ตรง (เผื่อ Node server เองล่ม)
            // เสิร์ฟผ่าน Node เอง (localhost:3000 หรือ server จริง) = same-origin
            // หน้าเว็บอยู่ GitHub Pages = ชี้มาที่ backend ในคอมเรา (dev) · ขึ้น server จริงค่อยเปลี่ยนเป็น URL server
            const queryParam = (isAutoRefresh ? '?source=autoRefresh' : '?source=initialLoad') + '&months=4';
            const API_BASE = (location.protocol === 'file:') 
                ? 'http://localhost:3000'
                : (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io') && !location.hostname.endsWith('pages.dev') && !location.hostname.endsWith('workers.dev'))
                    ? location.origin
                    : 'https://sysnect-ticket-main-dashboard-production.up.railway.app';
            const API_URL = `${API_BASE}/api/tickets${queryParam}`;
            const N8N_DIRECT_URL = `https://n8n.sysnect.co.th/webhook/48ec49ee-a4ca-4677-bad7-deb3c3ec341d${queryParam}`;

            let liveData = null;
            window.dataSourceGlobal = null;   // 'n8n' | 'postgres' | 'n8n_direct' | 'none'
            window.isFallbackGlobal = false;

            try {
                if(loaderMessage) loaderMessage.innerText = "กำลังดึงข้อมูลตรงจาก n8n...";
                // ⚡ ยิงตรง n8n ก่อนเสมอ เพื่อให้เร็วที่สุดตามโครงสร้างใหม่
                liveData = await fetchWithTimeout(N8N_DIRECT_URL, 45000);
                window.dataSourceGlobal = 'n8n_direct';
                window.isFallbackGlobal = false;

                // ✅ บันทึกลง Railway PostgreSQL ทุกครั้งที่ดึง n8n สำเร็จ (fire-and-forget)
                (async () => {
                    try {
                        const snapshotUrl = 'https://sysnect-ticket-main-dashboard-production.up.railway.app/api/snapshot';
                        const tok = sessionStorage.getItem('sysnect_sso_token');
                        const r = await fetch(snapshotUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(tok ? { 'Authorization': `Bearer ${tok}` } : {})
                            },
                            body: JSON.stringify(liveData),
                            signal: AbortSignal.timeout(10000)
                        });
                        if (r.ok) {
                            const j = await r.json();
                            console.log(`[SNAPSHOT] 💾 บันทึกลง Railway PG สำเร็จ: ${j.written}/${j.fetched} ตั๋ว`);
                        }
                    } catch (_) { /* ไม่บล็อก UI */ }
                })();
            } catch (n8nError) {
                console.warn("n8n ตอบสนองช้าหรือมีปัญหา → สลับไปใช้ฐานข้อมูลสำรอง (Backend)...", n8nError);
                if(loaderMessage) loaderMessage.innerText = "n8n ไม่พร้อม กำลังดึงข้อมูลจากฐานข้อมูลสำรอง...";

                try {
                    // ⚡ ถ้ายิง n8n ไม่ได้ ให้ลองเรียก Backend (รอแค่ 5 วินาที)
                    liveData = await fetchWithTimeout(API_URL, 5000, authHeaders);
                    window.dataSourceGlobal = (liveData && liveData._meta && liveData._meta.source) || 'postgres';
                    window.isFallbackGlobal = true;
                } catch (fallbackError) {
                    console.error("ดึงข้อมูลล้มเหลวทุกช่องทาง", fallbackError);
                    window.dataSourceGlobal = 'none';
                    if(loaderMessage) {
                        loaderMessage.innerText = "ระบบไม่พร้อม — ไม่สามารถดึงข้อมูลจาก n8n และ Backend สำรองได้";
                        loaderMessage.style.color = "#ef4444";
                    }
                    throw fallbackError;
                }
            }
            
            clearTimeout(timeoutId);
            
            clearInterval(progressInterval);
            if (loaderBar && loaderPercent) {
                setRingProgress(100);
                loaderPercent.innerText = '100%';
                if(loaderMessage) {
                    loaderMessage.innerText = "ดึงข้อมูลสำเร็จ! กำลังแสดงผล...";
                    loaderMessage.style.color = "#10b981";
                }
            }

            try {
                if (Array.isArray(liveData) && liveData.length > 0) {
                    if (liveData[0].data && Array.isArray(liveData[0].data)) {
                        liveData = liveData[0].data;
                    } else if (liveData[0].json) {
                        liveData = liveData[0].json;
                    }
                    
                    if (!liveData.new && (!Array.isArray(liveData) || (liveData.length > 0 && !liveData[0].new))) {
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

                if (liveData && liveData.database_updated_at) {
                    window.dbUpdatedAtGlobal = liveData.database_updated_at;
                }

                // Transform format if needed
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
                
                if (!liveData || typeof liveData !== 'object' || !Array.isArray(liveData["new"])) {
                    throw new Error("Backend ส่งข้อมูลมาผิดรูปแบบ (ไม่ได้ส่งข้อมูลทิกเก็ตที่จัดกลุ่มกลับมา)");
                }

                            } catch (parseError) {
                console.error("Error parsing data:", parseError);
                throw parseError;
            }

            const newDataStr = JSON.stringify({
                "new": liveData["new"] || [],
                "assigned": liveData["assigned"] || [],
                "pending": liveData["pending"] || [],
                "solved": liveData["solved"] || [],
                "closed": liveData["closed"] || []
            });

            const now = new Date();
            const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });

            if (window.lastFetchedDataStr === newDataStr) {
                // ข้อมูลเหมือนเดิม ไม่ต้องวาดกราฟหรือตารางใหม่เพื่อป้องกันการกระพริบ
                const clockEl = document.getElementById('lastUpdateText');
                if (clockEl) clockEl.innerText = `หน้าเว็บซิงค์ล่าสุด: ${dateStr} ${timeStr}`;
                updateConnectionStatus();
                if (loader) loader.classList.add('hidden');
                return;
            }
            window.lastFetchedDataStr = newDataStr;

            // --- Method 3: Notify on Manual Refresh ---
            const currentNewIds = new Set(
                [...(liveData["new"]||[]), ...(liveData["assigned"]||[]), ...(liveData["pending"]||[])]
                .map(t => String(t.id))
            );

            const prevIdsRaw = localStorage.getItem('sysnect_seen_ticket_ids');
            if (prevIdsRaw !== null) {
                const prevIds = new Set(JSON.parse(prevIdsRaw));
                const newOnes = [...currentNewIds].filter(id => !prevIds.has(id));
                if (newOnes.length > 0) {
                    showNotificationToast(newOnes.length);
                    const notifToggle = document.getElementById('toggleNotifications');
                    if (notifToggle && notifToggle.checked) {
                        playNotificationSound();
                    }
                }
            }
            localStorage.setItem('sysnect_seen_ticket_ids', JSON.stringify([...currentNewIds]));
            // ------------------------------------------

            mockDataRaw["new"] = liveData["new"] || [];
            mockDataRaw["assigned"] = liveData["assigned"] || [];
            mockDataRaw["pending"] = liveData["pending"] || [];
            mockDataRaw["solved"] = liveData["solved"] || [];
            mockDataRaw["closed"] = liveData["closed"] || [];
            
            populateProjectFilter();
            
            
            const clockEl = document.getElementById('lastUpdateText');
            if (clockEl) clockEl.innerText = `หน้าเว็บซิงค์ล่าสุด: ${dateStr} ${timeStr}`;
            updateConnectionStatus();

            setTimeout(() => {
                initChart();
                renderMonthlyBreakdown();
                if (currentStatus) renderTicketList(currentStatus);
                if (loader) loader.classList.add('hidden');
                // Auto-open default status tab (first load only)
                if (!isAutoRefresh && window._applyDefaultStatusPending) {
                    const s = window._applyDefaultStatusPending;
                    window._applyDefaultStatusPending = null;
                    if (typeof handleLegendClick === 'function') handleLegendClick(s);
                }
            }, 150); // ⚡ ลดจาก 800ms ให้รู้สึกไวขึ้น
            
        } catch (error) {
            clearInterval(progressInterval);
            console.error("เกิดข้อผิดพลาดในการดึงข้อมูลจาก Backend:", error);
            updateConnectionStatus(); // ไฟสถานะแดงทั้ง n8n + PostgreSQL
            
            if (!isAutoRefresh && loader) loader.classList.add('hidden');
            initChart();
            
            alert("⚠️ ดึงข้อมูลล้มเหลว!\nสาเหตุ: " + error.message + "\n\n(ไม่สามารถเชื่อมต่อกับ Backend ได้)");
        }
    }


    function formatDateTime(dateStr) {
        if (!dateStr || dateStr === '-') return '-';
        if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) return dateStr;
        try {
            const d = new Date(dateStr.replace('T', ' '));
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
        const totalHours  = Math.floor(totalMinutes / 60);
        const totalDays   = Math.floor(totalHours / 24);
        const months = Math.floor(totalDays / 30);
        const days   = totalDays % 30;
        const hours  = totalHours % 24;
        const mins   = totalMinutes % 60;

        if (months > 0) return days  > 0 ? `${months} เดือน ${days} วัน` : `${months} เดือน`;
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
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ข้อมูลจริงจะถูกดึงมาจาก n8n Webhook ด้านบน
    let mockDataRaw = {
        "new": [],
        "assigned": [],
        "pending": [],
        "solved": [],
        "closed": []
    };

    let chartInstance = null;
    let currentStatus = null;
    const GLPI_BASE_URL = 'https://itservicedesk.sysnect.co.th';

    function populateProjectFilter() {
        const projectFilterSelect = document.getElementById('projectFilter');
        const customDropdownList = document.getElementById('customDropdownList');
        const customDropdownHeader = document.getElementById('customDropdownHeader');
        const customDropdownSelected = document.getElementById('customDropdownSelected');
        
        if (!projectFilterSelect) return;
        
        const currentSelection = projectFilterSelect.value || 'all';
        const projectCounts = {};
        let totalTickets = 0;
        
        Object.keys(mockDataRaw).forEach(status => {
            mockDataRaw[status].forEach(t => {
                totalTickets++;
                if (t.project && t.project !== '-') {
                    if (!projectCounts[t.project]) projectCounts[t.project] = 0;
                    projectCounts[t.project]++;
                }
            });
        });
        
        // เรียงจากมากไปน้อยแบบเดียวกับ Top Projects
        const sortedProjects = Object.keys(projectCounts).sort((a, b) => projectCounts[b] - projectCounts[a]);
        const maxCount = sortedProjects.length > 0 ? projectCounts[sortedProjects[0]] : 1;
        
        // 1. สร้างตัวเลือก "ทั้งหมด"
        const dateFilterEl = document.getElementById('dateFilter');
        const isAllTime = !dateFilterEl || dateFilterEl.value === 'all';
        const allLabelText = isAllTime ? `Project: ทั้งหมด (${totalTickets} Tickets - 100%)` : `Project: ทั้งหมด`;
        const allItemCountHtml = isAllTime ? `<div class="di-count">${totalTickets}</div>` : '';

        // ล้างข้อมูลเดิม
        projectFilterSelect.innerHTML = `<option value="all">${allLabelText}</option>`;
        if (customDropdownList) customDropdownList.innerHTML = '';
        
        if (customDropdownList) {
            const allItem = document.createElement('div');
            allItem.className = 'dropdown-item-project' + (currentSelection === 'all' ? ' selected' : '');
            allItem.innerHTML = `
                <div class="di-name" title="Project: ทั้งหมด">Project: ทั้งหมด</div>
                <div class="di-bar-wrapper">
                    <div class="di-bar" style="width: 100%; background: #94a3b8;"></div>
                </div>
                ${allItemCountHtml}
            `;
            allItem.addEventListener('click', () => selectCustomProject('all'));
            customDropdownList.appendChild(allItem);
        }

        // 2. สร้างรายการโปรเจ็กต์แบบ Bar Chart
        sortedProjects.forEach(proj => {
            const count = projectCounts[proj];
            const pct = totalTickets > 0 ? ((count / totalTickets) * 100).toFixed(1) : 0;
            const barWidth = (count / maxCount) * 100; // เทียบสัดส่วนกับอันดับ 1
            
            // Native Option
            const option = document.createElement('option');
            option.value = proj;
            option.textContent = `${proj} (${count} Tickets - ${pct}%)`;
            projectFilterSelect.appendChild(option);
            
            // Custom Item
            if (customDropdownList) {
                const item = document.createElement('div');
                item.className = 'dropdown-item-project' + (currentSelection === proj ? ' selected' : '');
                item.innerHTML = `
                    <div class="di-name" title="${proj}">${proj}</div>
                    <div class="di-bar-wrapper">
                        <div class="di-bar" style="width: ${barWidth}%;"></div>
                    </div>
                    <div class="di-count">${count}</div>
                `;
                item.addEventListener('click', () => selectCustomProject(proj));
                customDropdownList.appendChild(item);
            }
        });
        
        if (projectCounts[currentSelection] !== undefined || currentSelection === 'all') {
            projectFilterSelect.value = currentSelection;
        } else {
            projectFilterSelect.value = 'all';
        }

        // Set Header Text
        const selectedOption = projectFilterSelect.querySelector(`option[value="${projectFilterSelect.value.replace(/"/g, '\\"')}"]`);
        if (selectedOption && customDropdownSelected) {
            customDropdownSelected.textContent = selectedOption.textContent;
        }
    }

    // Toggle Dropdown (Event Listeners attached once)
    if (!window.customDropdownEventsAttached) {
        document.getElementById('customDropdownHeader')?.addEventListener('click', function(e) {
            e.stopPropagation();
            const list = document.getElementById('customDropdownList');
            const header = document.getElementById('customDropdownHeader');
            if (!list || !header) return;
            if (list.style.display === 'none' || !list.style.display) {
                const rect = header.getBoundingClientRect();
                list.style.position = 'fixed';
                list.style.top = (rect.bottom + 4) + 'px';
                list.style.left = rect.left + 'px';
                list.style.minWidth = rect.width + 'px';
                list.style.width = 'auto';
                list.style.zIndex = '9999';
                list.style.display = 'block';
                header.classList.add('active');
            } else {
                list.style.display = 'none';
                header.classList.remove('active');
            }
        });

        // Close when clicking outside
        document.addEventListener('click', function(e) {
            const dropdown = document.getElementById('customProjectDropdown');
            const list = document.getElementById('customDropdownList');
            const header = document.getElementById('customDropdownHeader');
            if (dropdown && !dropdown.contains(e.target)) {
                if(list) list.style.display = 'none';
                if(header) header.classList.remove('active');
            }
        });

        // Handle Select Function
        window.selectCustomProject = function(val) {
            const selectEl = document.getElementById('projectFilter');
            if (selectEl) {
                selectEl.value = val;
                selectEl.dispatchEvent(new Event('change')); // Trigger filters
            }
            const list = document.getElementById('customDropdownList');
            const header = document.getElementById('customDropdownHeader');
            const selectedText = document.getElementById('customDropdownSelected');
            if (list) list.style.display = 'none';
            if (header) header.classList.remove('active');
            
            const selectedOption = selectEl.querySelector(`option[value="${val.replace(/"/g, '\\"')}"]`);
            if(selectedOption && selectedText) selectedText.textContent = selectedOption.textContent;
            
            // Re-render project list styling
            populateProjectFilter();
        };
        window.customDropdownEventsAttached = true;
    }

    // ฟังก์ชันช่วยคัดกรองข้อมูล
    function getFilteredData() {
        const searchInputEl = document.getElementById('searchInput');
        const searchQuery = searchInputEl ? searchInputEl.value.toLowerCase().trim() : '';
        const dateFilterEl = document.getElementById('dateFilter');
        let dateFilter = dateFilterEl ? dateFilterEl.value : 'all';
        const dateStartEl = document.getElementById('filterDateStart');
        const dateEndEl = document.getElementById('filterDateEnd');
        
        if (dateStartEl && dateEndEl && (dateStartEl.value || dateEndEl.value)) {
            dateFilter = 'custom';
        }
        
        const filteredData = {};
        const labels = Object.keys(mockDataRaw);
        const values = [];

        labels.forEach(status => {
            const tickets = mockDataRaw[status].filter(t => {
                // 1. กรองคำค้นหา (ID, Project, Detail, Location)
                const matchSearch = String(t.id || '').toLowerCase().includes(searchQuery) || 
                                    String(t.project || '').toLowerCase().includes(searchQuery) ||
                                    String(t.detail || '').toLowerCase().includes(searchQuery) ||
                                    String(t.location || '').toLowerCase().includes(searchQuery);
                
                // 2. กรองวันที่ (Dynamic Logic อิงตามวันที่ปัจจุบันจริงๆ)
                let matchDate = true;
                
                if (dateFilter !== 'all') {
                    // ใช้ Date แบบไดนามิกเพื่อการคำนวณที่แม่นยำ
                    const ticketDate = new Date(t.date);
                    
                    if (isNaN(ticketDate.getTime())) {
                        matchDate = false; // ถ้าวันที่ไม่ถูกต้อง ให้ข้ามไปเลย
                    } else {
                        // ปรับให้เทียบเฉพาะ ปี-เดือน-วัน (ตัดเรื่องเวลาและ Timezone ทิ้งไป)
                        const tYear = ticketDate.getFullYear();
                        const tMonth = ticketDate.getMonth();
                        const tDay = ticketDate.getDate();
                        const tDateOnly = new Date(tYear, tMonth, tDay).getTime();
                        
                        if (dateFilter === 'custom') {
                            // Custom Date Range
                            const startVal = dateStartEl ? dateStartEl.value : '';
                            const endVal = dateEndEl ? dateEndEl.value : '';
                            
                            if (startVal) {
                                const startDate = new Date(startVal);
                                startDate.setHours(0,0,0,0);
                                if (tDateOnly < startDate.getTime()) matchDate = false;
                            }
                            if (endVal) {
                                const endDate = new Date(endVal);
                                endDate.setHours(23,59,59,999);
                                if (tDateOnly > endDate.getTime()) matchDate = false;
                            }
                        } else {
                            const today = new Date();
                            const cYear = today.getFullYear();
                            const cMonth = today.getMonth();
                            const cDay = today.getDate();
                            const cDateOnly = new Date(cYear, cMonth, cDay).getTime();
                            const ONE_DAY = 24 * 60 * 60 * 1000;
                            
                            if (dateFilter === 'today') {
                                matchDate = (tDateOnly === cDateOnly);
                            } else if (dateFilter === 'yesterday') {
                                matchDate = (tDateOnly === (cDateOnly - ONE_DAY));
                            } else if (dateFilter === 'week') {
                                matchDate = (tDateOnly >= (cDateOnly - 6 * ONE_DAY) && tDateOnly <= cDateOnly);
                            } else if (dateFilter === 'month') {
                                matchDate = (tYear === cYear && tMonth === cMonth);
                            } else if (dateFilter === 'last_month') {
                                let lastMonth = cMonth - 1;
                                let lastYear = cYear;
                                if (lastMonth < 0) { lastMonth = 11; lastYear--; }
                                matchDate = (tYear === lastYear && tMonth === lastMonth);
                            } else if (dateFilter === 'year') {
                                matchDate = (tYear === cYear);
                            }
                        }
                    }
                }

                // Priority Filtering
                let matchPriority = true;
                const priorityFilter = document.getElementById('priorityFilter') ? document.getElementById('priorityFilter').value : 'all';
                if (priorityFilter && priorityFilter !== 'all') {
                    const pRaw = String(t.priority || 'low').toLowerCase().trim();
                    let pEng = 'low';
                    if (pRaw === 'critical' || pRaw === 'เร่งด่วนที่สุด' || pRaw === 'สูงมาก' || pRaw === '6' || pRaw === '5') pEng = 'critical';
                    else if (pRaw === 'high' || pRaw === 'สูง' || pRaw === '4') pEng = 'high';
                    else if (pRaw === 'medium' || pRaw === 'ปานกลาง' || pRaw === '3') pEng = 'medium';
                    else pEng = 'low';

                    matchPriority = pEng === priorityFilter;
                }

                // Project Filtering
                let matchProject = true;
                const projectFilter = document.getElementById('projectFilter') ? document.getElementById('projectFilter').value : 'all';
                if (projectFilter && projectFilter !== 'all') {
                    matchProject = t.project === projectFilter;
                }

                return matchSearch && matchDate && matchPriority && matchProject;
            });

            filteredData[status] = tickets;
            values.push(tickets.length);
        });

        return { labels, values, project_breakdown: filteredData };
    }

    // ==============================================
    // Monthly Breakdown Rendering
    // ==============================================
    function renderMonthlyBreakdown() {
        const container = document.getElementById('monthlyBreakdown');
        if (!container) return;
        
        const data = getFilteredData();
        const dateFilterEl = document.getElementById('dateFilter');
        let dateFilter = dateFilterEl ? dateFilterEl.value : 'all';
        const dateStartEl = document.getElementById('filterDateStart');
        const dateEndEl = document.getElementById('filterDateEnd');
        if (dateStartEl && dateEndEl && (dateStartEl.value || dateEndEl.value)) {
            dateFilter = 'custom';
        }
        
        // รวม ticket ทั้งหมด
        const allTickets = [];
        data.labels.forEach(status => {
            data.project_breakdown[status].forEach(t => allTickets.push(t));
        });
        
        if (allTickets.length === 0 || dateFilter === 'all') {
            container.style.display = 'none';
            return;
        }
        
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
        
        if (sortedKeys.length <= 1 && dateFilter !== 'custom') {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        const totalCount = allTickets.length;
        
        let html = `
            <div style="background: var(--card-bg, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                    <span class="material-symbols-outlined" style="color: #2563eb; font-size: 20px;">calendar_month</span>
                    <span style="font-weight: 700; font-size: 15px; color: var(--text-main, #1e293b);">สรุปรายเดือน (Monthly Breakdown)</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;">
        `;
        
        sortedKeys.forEach(key => {
            const item = monthCounts[key];
            html += `
                <div onclick="applyMonthlyFilter('${key}')" 
                     onmouseenter="this.style.boxShadow='0 4px 12px rgba(37,99,235,0.15)'; this.style.transform='translateY(-2px)'" 
                     onmouseleave="this.style.boxShadow='none'; this.style.transform='translateY(0)'"
                     style="display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, rgba(37,99,235,0.05), rgba(37,99,235,0.02)); border: 1px solid rgba(37,99,235,0.15); border-radius: 10px; padding: 10px 16px; cursor: pointer; transition: all 0.2s;">
                    <span style="font-weight: 600; color: var(--text-main, #1e293b); font-size: 14px;">${item.label}</span>
                    <span style="background: #2563eb; color: white; padding: 2px 10px; border-radius: 20px; font-weight: 700; font-size: 13px; min-width: 32px; text-align: center;">${item.count}</span>
                    <span style="color: #64748b; font-size: 12px;">ใบ</span>
                </div>
            `;
        });
        
        html += `
                </div>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border-color, #e2e8f0); display: flex; justify-content: flex-end; color: var(--text-sub, #64748b); font-size: 13px;">
                    รวมทั้งหมด: <strong style="color: #2563eb; margin-left: 6px;">${totalCount} ใบ</strong>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    }

    window.applyMonthlyFilter = function(key) {
        // 1. key = "YYYY-MM"
        const [yearStr, monthStr] = key.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        
        // 2. คำนวณวันแรกและวันสุดท้าย
        const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDayObj = new Date(year, month, 0);
        const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayObj.getDate()).padStart(2, '0')}`;
        
        // 3. ตั้งค่าวันที่
        const startEl = document.getElementById('filterDateStart');
        const endEl = document.getElementById('filterDateEnd');
        if (startEl) startEl.value = firstDay;
        if (endEl) endEl.value = lastDay;
        
        // 4. รีเซ็ต dropdown
        const dateFilterEl = document.getElementById('dateFilter');
        if (dateFilterEl) dateFilterEl.value = 'all';
        
        const timeTitle = document.getElementById('timeDropdownTitle');
        if (timeTitle) timeTitle.textContent = 'ทุกเวลา';
        
        document.querySelectorAll('.custom-dropdown-item').forEach(el => {
            if (el.dataset.value === 'all') {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });
        
        const quickFilter = document.getElementById('chartDateQuickFilter');
        if (quickFilter) quickFilter.value = 'all';
        
        // 5. อัปเดตกราฟและข้อมูล
        initChart();
        renderMonthlyBreakdown();
        if (typeof currentStatus !== 'undefined' && currentStatus) {
            renderTicketList(currentStatus);
        } else {
            renderTicketList('all');
        }
        
        // 6. Scroll ขึ้นไปหา Ticket List
        document.getElementById('ticketContainer')?.scrollIntoView({ behavior: 'smooth' });
    };

    // อัปเดตไฟสถานะ 2 ดวง: n8n + PostgreSQL (ระบบเดียวกับ BASE)
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

        const source = window.dataSourceGlobal;

        // ── n8n ──
        const n8nUp = (source === 'n8n' || source === 'n8n_direct');
        setDot(n8nDot, n8nUp);
        if (n8nText) n8nText.innerText = 'n8n';

        // ── PostgreSQL (ถาม /api/health) ──
        let pgUp = (source === 'postgres');
        let pgTimeLabel = '';
        try {
            const healthUrl = (location.protocol === 'file:')
                ? 'http://localhost:3000/api/health'
                : (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io') && !location.hostname.endsWith('pages.dev') && !location.hostname.endsWith('workers.dev'))
                    ? `${location.origin}/api/health`
                    : 'https://sysnect-ticket-main-dashboard-production.up.railway.app/api/health';
            const ssoTokenH = sessionStorage.getItem('sysnect_sso_token');
            const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000), headers: ssoTokenH ? { 'Authorization': `Bearer ${ssoTokenH}` } : {} });
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

    function initChart() {
        const data = getFilteredData();
        const ctx = document.getElementById('ticketChart').getContext('2d');


        const hasData = data.values.some(v => v > 0);
        const totalTickets = data.values.reduce((sum, val) => sum + val, 0);
        
        // อัพเดทตัวเลข Total Tickets บนหน้าจอ
        const totalDisplay = document.getElementById('totalTicketsCount');
        if (totalDisplay) {
            totalDisplay.innerText = totalTickets;
        }

        // --- Kasira Feature: Filter Indicators ---
        const dateFilterEl = document.getElementById('dateFilter');
        const currentFilter = dateFilterEl ? dateFilterEl.value : 'all';
        
        // 1. Center Donut Graph Label (Total Tickets Label)
        const totalLabel = document.getElementById('totalTicketsLabel');
        if (totalLabel) {
            if (currentFilter === 'today') totalLabel.innerText = "วันนี้:";
            else if (currentFilter === 'yesterday') totalLabel.innerText = "เมื่อวาน:";
            else if (currentFilter === 'week') totalLabel.innerText = "7 วัน:";
            else totalLabel.innerText = "Total Tickets:";
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

        // ขยาย slice เล็กให้มองเห็นได้ (min 2.5% ของ total) — legend ยังใช้ค่าจริง
        const MIN_ARC = hasData ? totalTickets * 0.025 : 0;
        const chartData = hasData
            ? data.values.map(v => v > 0 ? Math.max(v, MIN_ARC) : 0)
            : [1];
        const chartColors = hasData ? ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#64748b'] : ['#e2e8f0'];
        const chartLabels = hasData ? data.labels.map(l => l.toUpperCase()) : ['NO DATA'];

        if (chartInstance) {
            chartInstance.data.labels = chartLabels;
            chartInstance.data.datasets[0].data = chartData;
            chartInstance.data.datasets[0].backgroundColor = chartColors;
            chartInstance.data.datasets[0].hoverOffset = hasData ? 16 : 0;
            chartInstance.data.datasets[0].borderWidth = hasData ? 5 : 0;
            chartInstance.data.datasets[0].borderRadius = hasData ? 6 : 0;
            chartInstance.update();
        } else {
            chartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        data: chartData,
                        backgroundColor: chartColors,
                        hoverOffset: hasData ? 16 : 0,
                        borderWidth: hasData ? 5 : 0,
                        borderColor: '#ffffff',
                        borderRadius: hasData ? 6 : 0
                    }]
                },
                plugins: [{
                    id: 'customShadow',
                    beforeDatasetsDraw: (chart) => {
                        if (!hasData) return;
                        const ctx = chart.ctx;
                        ctx.save();
                        // เงามิติ 3D แบบนูนลอย
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                        ctx.shadowBlur = 20;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 15;
                    },
                    afterDatasetsDraw: (chart) => {
                        chart.ctx.restore();
                    }
                }],
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '68%',
                    layout: { padding: 12 },
                    animation: {
                        animateScale: true,
                        animateRotate: true,
                        duration: 900,
                        easing: 'easeOutQuart'
                    },
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: false }
                    },
                    onClick: (event, activeElements) => {
                        if (!hasData || activeElements.length === 0) return;

                        if (window.lastChartClick && Date.now() - window.lastChartClick < 300) return;
                        window.lastChartClick = Date.now();

                        const index = activeElements[0].index;
                        currentStatus = chartLabels[index];

                        document.getElementById('dashboardWrapper').classList.add('split-active');
                        document.getElementById('statusName').innerText = currentStatus.toUpperCase();
                        document.querySelector('.center-toggle-btn .btn-text').innerText = 'Close';

                        renderTicketList(currentStatus);
                        updateChartLegendActive();
                    }
                }
            });
        }

        // ⚡ วาด legend ใต้กราฟ (จุดสี + สถานะ + จำนวน + %)
        const legendLabels = data.labels.map(l => l.toUpperCase());
        const legendColors = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#64748b'];
        renderChartLegend(legendLabels, data.values, legendColors, totalTickets);
        if (typeof updateStatBar === 'function') updateStatBar(data.values, data.labels, totalTickets);
        // อัปเดต sidebars (ถ้ามีข้อมูลใหม่)
        if (typeof renderProjectSidebar === 'function') renderProjectSidebar();
        if (typeof renderTrendLineChart === 'function') renderTrendLineChart();
    }

    // ⚡ Legend ใต้กราฟ: จุดสี + สถานะ + progress bar + จำนวน + %
    function renderChartLegend(labels, values, colors, total) {
        const el = document.getElementById('chartLegendDetailed');
        if (!el) return;
        let html = '';
        for (let i = 0; i < labels.length; i++) {
            const count = values[i] || 0;
            const pct = total > 0 ? (count / total * 100) : 0;
            const pctText = count === 0 ? '0%' : (pct < 0.1 ? '<0.1%' : pct.toFixed(1) + '%');
            const active = (currentStatus === labels[i]) ? ' active' : '';
            html += `
                <button type="button" class="cl-row${active}" data-status="${labels[i]}" data-pct="${pct.toFixed(2)}"
                    style="--cl-color:${colors[i]}" onclick="handleLegendClick('${labels[i]}')">
                    <span class="cl-dot" style="background:${colors[i]}"></span>
                    <span class="cl-label">${labels[i]}</span>
                    <div class="cl-bar-wrap">
                        <div class="cl-bar-fill" style="width:0%;background:${colors[i]}" data-pct="${pct.toFixed(2)}"></div>
                    </div>
                    <span class="cl-count">${count}</span>
                    <span class="cl-pct">${pctText}</span>
                </button>`;
        }
        // ALL row
        const allActive = (currentStatus === 'ALL') ? ' active' : '';
        html += `
            <button type="button" class="cl-row${allActive}" data-status="ALL" onclick="handleLegendClick('ALL')"
                style="margin-top:4px; border-top:1px dashed rgba(99,102,241,0.12); padding-top:8px; --cl-color:#6366f1">
                <span class="cl-dot" style="background:conic-gradient(#3b82f6 0% 20%,#f59e0b 20% 40%,#ef4444 40% 60%,#10b981 60% 80%,#64748b 80% 100%);border-radius:50%;"></span>
                <span class="cl-label" style="font-weight:800;">ALL</span>
                <div class="cl-bar-wrap">
                    <div class="cl-bar-fill" style="width:0%;background:linear-gradient(90deg,#3b82f6,#f59e0b,#ef4444,#10b981,#64748b)" data-pct="100"></div>
                </div>
                <span class="cl-count">${total}</span>
                <span class="cl-pct">100%</span>
            </button>`;
        el.innerHTML = html;
        // Animate bars in after paint
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.querySelectorAll('.cl-bar-fill').forEach(bar => {
                    bar.style.width = bar.dataset.pct + '%';
                });
            });
        });
    }

    // อัปเดตสถานะ active ของ legend ใต้กราฟให้ตรงกับ currentStatus
    function updateChartLegendActive() {
        document.querySelectorAll('.cl-row').forEach(row => {
            row.classList.toggle('active', row.dataset.status === currentStatus);
        });
    }

    function handleLegendClick(status) {
        const data = getFilteredData();
        const hasData = data.values.some(v => v > 0);
        if (!hasData) return;

        if (status !== 'ALL') {
            const statusIdx = data.labels.findIndex(l => l.toUpperCase() === status);
            if (statusIdx !== -1 && data.values[statusIdx] === 0) return;
        }

        // ใช้ enterSplitMode ที่รองรับ 3-panel
        if (typeof window._enterSplitMode === 'function') {
            window._enterSplitMode(status);
        } else {
            // fallback
            currentStatus = status;
            document.getElementById('dashboardWrapper').classList.remove('three-panel');
            document.getElementById('dashboardWrapper').classList.add('split-active');
            renderTicketList(currentStatus);
            updateChartLegendActive();
            if (typeof updateStatBarActive === 'function') updateStatBarActive(currentStatus);
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

    function extractShortId(ticket) {
        if (!ticket) return "-";
        const idStr = String(ticket.id || '');
        const match = idStr.match(/(C\d{2}-\d+|\d{8,})/);
        if (match) return match[1];
        
        const num = ticket.ticket_number || ticket.title;
        if (num && String(num).trim()) {
            return String(num).replace(/Ticket\s*#?/gi, '').trim();
        }
        return idStr.substring(0, 10) || "-";
    }

    function toggleDetail(btn) {
        const wrapperDiv = btn.parentElement.nextElementSibling;
        if (!wrapperDiv.classList.contains('show')) {
            wrapperDiv.classList.add('show');
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">expand_less</span> ซ่อนรายละเอียด';
        } else {
            wrapperDiv.classList.remove('show');
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">expand_more</span> ดูรายละเอียด';
        }
    }

    function renderTicketList(status) {
        if (!status) return;
        const data = getFilteredData();
        const container = document.getElementById('ticketContainer');
        container.innerHTML = '';
        selectedTickets.clear();
        
        const colorMap = {
            'new': '#3b82f6',
            'assigned': '#f59e0b',
            'pending': '#ef4444',
            'solved': '#10b981',
            'closed': '#64748b',
            'all': '#2980b9'
        };

        let tickets = [];
        if (status === 'ALL') {
            data.labels.forEach(s => {
                const arr = data.project_breakdown[s].map(t => ({...t, _statusColor: colorMap[s] || '#3b82f6', _statusName: s.toUpperCase()}));
                tickets = tickets.concat(arr);
            });
        } else {
            const sKey = status.toLowerCase();
            tickets = data.project_breakdown[sKey].map(t => ({...t, _statusColor: colorMap[sKey] || '#3b82f6', _statusName: sKey.toUpperCase()}));
        }
        const activeColor = colorMap[status.toLowerCase()] || '#2980b9';
        document.getElementById('statusTitle').style.color = activeColor;
        
        const dateFilterEl = document.getElementById('dateFilter');
        const currentFilter = dateFilterEl ? dateFilterEl.value : 'all';
        let datePrefix = "Ticket ทั้งหมด";
        if (currentFilter === 'today') datePrefix = "Ticket วันนี้";
        else if (currentFilter === 'yesterday') datePrefix = "Ticket เมื่อวาน";
        else if (currentFilter === 'week') datePrefix = "7 วันล่าสุด";
        else if (currentFilter === 'month') datePrefix = "เดือนนี้";
        
        const statusDisplay = status.toUpperCase() === 'ALL' ? 'ทุกสถานะ' : status.toUpperCase();
        const tLen = tickets ? tickets.length : 0;
        
        document.getElementById('statusTitle').innerHTML = `${datePrefix} &middot; <span id="statusName" style="color:inherit;">${statusDisplay} (${tLen} ใบ)</span>`;
        
        if(!tickets || tickets.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 40px;"><span class="material-symbols-outlined" style="font-size: 48px; color: #cbd5e1;">inbox</span><p style="color:#7f8c8d; margin-top: 15px;">ไม่มีข้อมูลที่ตรงกับเงื่อนไข</p></div>';
        } else {
            
            // ⚡ ไม่ใส่ overlay แล้ว — คงเนื้อหาเดิมไว้จนกว่าชุดใหม่จะพร้อม (กันจอกระพริบ/หน่วง)
            // ใช้ Global Variable เพื่อเช็คว่ามีการกดเปลี่ยนสถานะระหว่างรอหรือไม่
            window.currentRenderId = (window.currentRenderId || 0) + 1;
            const myRenderId = window.currentRenderId;

            // ⚡ render ทันที (เลิกหน่วง 400ms) — วาดทีละ chunk ด้วย rAF ไม่ให้ค้าง
            (() => {
                if (window.currentRenderId !== myRenderId) return;

                const fragment = document.createDocumentFragment();
                let currentIndex = 0;
                const chunkSize = 15; // ลดจำนวนทีละ 15 ใบ เพื่อไม่ให้เฟรมเรตตกตอนแอนิเมชันเปิดกล่อง

                function renderChunk() {
                    if (window.currentRenderId !== myRenderId) return;
                    
                    let htmlString = "";
                    const end = Math.min(currentIndex + chunkSize, tickets.length);
                
                    for (let i = currentIndex; i < end; i++) {
                        const ticket = tickets[i];
                        const delay = (i % 50) * 0.02; // Stagger effect เร็วขึ้นนิดนึง
                        const shortId = extractShortId(ticket);
                        
                        const pRaw = String(ticket.priority || 'low').toLowerCase().trim();
                        let pEng = 'low';
                        if (pRaw === 'critical' || pRaw === 'เร่งด่วนที่สุด' || pRaw === 'สูงมาก' || pRaw === '6' || pRaw === '5') pEng = 'critical';
                        else if (pRaw === 'high' || pRaw === 'สูง' || pRaw === '4') pEng = 'high';
                        else if (pRaw === 'medium' || pRaw === 'ปานกลาง' || pRaw === '3') pEng = 'medium';
                        else pEng = 'low';

                        let priorityBadge = '';
                        if (pEng === 'critical') {
                            priorityBadge = `<span class="badge-priority priority-critical" style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #fee2e2; color: #ef4444; border: 1px solid #fca5a5;">Critical</span>`;
                        } else if (pEng === 'high') {
                            priorityBadge = `<span class="badge-priority priority-high" style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #ffedd5; color: #f97316; border: 1px solid #fdba74;">High</span>`;
                        } else if (pEng === 'medium') {
                            priorityBadge = `<span class="badge-priority priority-medium" style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #fef9c3; color: #eab308; border: 1px solid #fde047;">Medium</span>`;
                        } else {
                            priorityBadge = `<span class="badge-priority priority-low" style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #dcfce7; color: #22c55e; border: 1px solid #86efac;">Low</span>`;
                        }
                        
                        const _dur = calculateTicketDuration(ticket.date_open, ticket.date_close, ticket._statusName);
                        const _isResolved = ['CLOSED','SOLVED'].includes(String(ticket._statusName||'').toUpperCase());
                        const _durBadge = _dur ? `<span class="badge-duration ${_isResolved?'resolved':'ongoing'}"><span class="material-symbols-outlined" style="font-size:13px;">${_isResolved?'check_circle':'schedule'}</span>${_dur}</span>` : '';
                        const _closeDisplay = formatDateTime(ticket.date_close||'-');

                        htmlString += `
                            <div class="ticket-item" style="animation-delay: ${delay}s; border-left-color: ${ticket._statusColor};">
                                <div class="ticket-checkbox-container">
                                    <input type="checkbox" class="ticket-checkbox" value="${escapeHtml(ticket.id)}" onchange="toggleSelection('${escapeHtml(ticket.id)}')">
                                </div>

                                <div class="ticket-header-row">
                                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                        <span class="badge badge-id" style="display:inline-flex;align-items:center;gap:4px;">
                                            <span class="material-symbols-outlined" style="font-size:13px;">tag</span>
                                            ID: ${escapeHtml(shortId)}
                                            <button class="btn-copy-id" onclick="copyTicketId('${escapeHtml(shortId)}',this)" title="Copy ID">
                                                <span class="material-symbols-outlined" style="font-size:13px;">content_copy</span>
                                            </button>
                                        </span>
                                        ${priorityBadge}
                                    </div>
                                    ${_durBadge}
                                </div>

                                ${ticket.name ? `<div class="ticket-title-row">${escapeHtml(ticket.name)}</div>` : ''}

                                <div class="ticket-meta-row">
                                    <span class="badge badge-location" style="display:inline-flex;align-items:center;gap:4px;">
                                        <span class="material-symbols-outlined" style="font-size:13px;">location_on</span>${escapeHtml(ticket.location)}
                                    </span>
                                    ${ticket.assignee && ticket.assignee !== '-' ? `<span class="badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(99,102,241,0.08);color:#6366f1;border:1px solid rgba(99,102,241,0.3);"><span class="material-symbols-outlined" style="font-size:13px;">person</span>${escapeHtml(ticket.assignee)}</span>` : ''}
                                    <span class="badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(59,130,246,0.07);color:#2563eb;border:1px solid rgba(59,130,246,0.25);">
                                        <span class="material-symbols-outlined" style="font-size:13px;">calendar_today</span>เปิด: ${formatDateTime(ticket.date_open)}
                                    </span>
                                    <span class="badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(239,68,68,0.07);color:#dc2626;border:1px solid rgba(239,68,68,0.25);">
                                        <span class="material-symbols-outlined" style="font-size:13px;">event_busy</span>ปิด: ${_closeDisplay === '-' ? '<span style="opacity:0.45;">ยังไม่ปิด</span>' : _closeDisplay}
                                    </span>
                                    <span class="badge" style="display:inline-flex;align-items:center;gap:4px;color:${ticket._statusColor};border:1px solid ${ticket._statusColor}40;background:${ticket._statusColor}15;">
                                        <span class="material-symbols-outlined" style="font-size:13px;">label</span>${ticket._statusName}
                                    </span>
                                </div>

                                <div class="ticket-project" style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
                                    <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                                        <span class="material-symbols-outlined" style="font-size:17px;color:#f59e0b;flex-shrink:0;">folder</span>
                                        <span style="color:var(--text-sub,#64748b);font-size:12px;flex-shrink:0;">โครงการ:</span>
                                        <a href="${GLPI_BASE_URL}/index.php?redirect=ticket_${getNumericTicketId(ticket)}" target="_blank" rel="noopener noreferrer"
                                            style="color:#2563eb;text-decoration:none;font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                                            onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
                                            ${escapeHtml(ticket.project)}<span class="material-symbols-outlined" style="font-size:13px;vertical-align:text-bottom;margin-left:3px;">open_in_new</span>
                                        </a>
                                    </div>
                                    <button onclick="toggleDetail(this)" style="flex-shrink:0;background:none;border:1px solid #cbd5e1;padding:4px 12px;border-radius:20px;color:#475569;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;transition:all 0.2s;margin-left:8px;">
                                        <span class="material-symbols-outlined" style="font-size:14px;">expand_more</span>รายละเอียด
                                    </button>
                                </div>

                                <div class="ticket-detail-wrapper">
                                    <div class="ticket-detail">
                                        <span class="material-symbols-outlined" style="font-size:15px;vertical-align:text-bottom;">description</span>
                                        <b>รายละเอียด:</b><br>
                                        <span style="color:var(--text-sub,#64748b);">${cleanHtmlText(ticket.detail)}</span>
                                    </div>
                                </div>
                            </div>
                        `;
                }
                
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlString;
                while(tempDiv.firstChild) {
                    fragment.appendChild(tempDiv.firstChild);
                }
                
                currentIndex = end;
                
                // อัพเดทเปอร์เซ็นต์
                const progressEl = document.getElementById('renderProgress');
                if (progressEl) {
                    const percent = Math.round((currentIndex / tickets.length) * 100);
                    progressEl.innerText = percent + "%";
                }
                
                if (currentIndex < tickets.length) {
                    // ทำต่อใน frame ถัดไป
                    requestAnimationFrame(renderChunk);
                } else {
                    // เสร็จแล้ว นำไปแสดงผล
                    container.innerHTML = '';
                    container.appendChild(fragment);
                    updateCheckboxes();
                }
            }
            
            // เริ่มต้นการวาด chunk แรก (ดีเลย์ 80ms ให้ CSS แอนิเมชันเริ่มสไลด์กล่องออกมาก่อน)
            setTimeout(() => {
                requestAnimationFrame(renderChunk);
            }, 80);
            })();
        }

        updateCheckboxes();
    }

    // ==============================================
    // 3. ผูก Event Listeners ให้ปุ่มทำงานได้จริง
    // ==============================================

    // ระบบค้นหา
    let searchTimeout = null;
    document.getElementById('searchInput')?.addEventListener('input', () => {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
        initChart();
        if (currentStatus) {
            renderTicketList(currentStatus);
        } else {
            // ถ้าพิมพ์ค้นหาแล้วยังไม่เคยกดชิ้นส่วนกราฟ ให้แสดง ALL แบบพิเศษ
            const searchInputEl = document.getElementById('searchInput');
            const searchVal = searchInputEl ? searchInputEl.value : '';
            if(searchVal.trim() !== '') {
                document.getElementById('dashboardWrapper').classList.add('split-active');
                // 📱 โหมดแอป: ค้นหาแล้วสลับไปแท็บ Tickets เพื่อเห็นผลลัพธ์
                if (window.setMobileTab && document.body.classList.contains('mtab-on')) window.setMobileTab('tickets', false);
                document.getElementById('statusTitle').style.color = '#2980b9';
                document.getElementById('statusTitle').innerHTML = `ผลลัพธ์การค้นหา &middot; <span id="statusName" style="color:inherit;">ทั้งหมด</span>`;
                
                const container = document.getElementById('ticketContainer');
                
                // ⚡ ไม่ใส่ overlay — คงผลเดิมไว้จนชุดใหม่พร้อม (กันจอกระพริบ)
                const data = getFilteredData();
                let allTickets = [];
                const colorMap = { 'new': '#3b82f6', 'assigned': '#f59e0b', 'pending': '#ef4444', 'solved': '#10b981', 'closed': '#64748b' };
                data.labels.forEach(s => {
                    const arr = data.project_breakdown[s].map(t => ({...t, _statusColor: colorMap[s] || '#3b82f6', _statusName: s.toUpperCase()}));
                    allTickets = allTickets.concat(arr);
                });
                
                if(allTickets.length === 0) {
                    container.innerHTML = '<div style="text-align:center; padding: 40px;"><span style="font-size: 40px;">📭</span><p style="color:#7f8c8d; margin-top: 15px;">ไม่พบข้อมูลที่ค้นหา</p></div>';
                } else {
                    window.currentRenderId = (window.currentRenderId || 0) + 1;
                    const myRenderId = window.currentRenderId;

                    (() => {
                        if (window.currentRenderId !== myRenderId) return;

                        const fragment = document.createDocumentFragment();
                        let currentIndex = 0;
                        const chunkSize = 15; // ลดเหลือ 15 เพื่อลดอาการกระตุก
                        
                        function renderChunk() {
                            if (window.currentRenderId !== myRenderId) return;
                            
                            let htmlString = "";
                            const end = Math.min(currentIndex + chunkSize, allTickets.length);
                            
                            for (let i = currentIndex; i < end; i++) {
                                const ticket = allTickets[i];
                                const delay = i * 0.05;
                                const shortId = extractShortId(ticket);
                            
                            const pRaw = String(ticket.priority || 'low').toLowerCase().trim();
                            let pEng = 'low';
                            if (pRaw === 'critical' || pRaw === 'เร่งด่วนที่สุด' || pRaw === 'สูงมาก' || pRaw === '6' || pRaw === '5') pEng = 'critical';
                            else if (pRaw === 'high' || pRaw === 'สูง' || pRaw === '4') pEng = 'high';
                            else if (pRaw === 'medium' || pRaw === 'ปานกลาง' || pRaw === '3') pEng = 'medium';
                            else pEng = 'low';

                            let priorityBadge = '';
                            if (pEng === 'critical') {
                                priorityBadge = `<span class="badge-priority priority-critical" style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #fee2e2; color: #ef4444; border: 1px solid #fca5a5;">Critical</span>`;
                            } else if (pEng === 'high') {
                                priorityBadge = `<span class="badge-priority priority-high" style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #ffedd5; color: #f97316; border: 1px solid #fdba74;">High</span>`;
                            } else if (pEng === 'medium') {
                                priorityBadge = `<span class="badge-priority priority-medium" style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #fef9c3; color: #eab308; border: 1px solid #fde047;">Medium</span>`;
                            } else {
                                priorityBadge = `<span class="badge-priority priority-low" style="margin-left: 8px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; background-color: #dcfce7; color: #22c55e; border: 1px solid #86efac;">Low</span>`;
                            }
                            
                            const _dur2 = calculateTicketDuration(ticket.date_open, ticket.date_close, ticket._statusName);
                            const _isResolved2 = ['CLOSED','SOLVED'].includes(String(ticket._statusName||'').toUpperCase());
                            const _durBadge2 = _dur2 ? `<span class="badge-duration ${_isResolved2?'resolved':'ongoing'}"><span class="material-symbols-outlined" style="font-size:13px;">${_isResolved2?'check_circle':'schedule'}</span>${_dur2}</span>` : '';
                            const _closeDisplay2 = formatDateTime(ticket.date_close||'-');

                            htmlString += `
                                <div class="ticket-item" style="animation-delay: ${delay}s; border-left-color: ${ticket._statusColor};">
                                    <div class="ticket-checkbox-container">
                                        <input type="checkbox" class="ticket-checkbox" value="${escapeHtml(ticket.id)}" onchange="toggleSelection('${escapeHtml(ticket.id)}')">
                                    </div>

                                    <div class="ticket-header-row">
                                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                            <span class="badge badge-id" style="display:inline-flex;align-items:center;gap:4px;">
                                                <span class="material-symbols-outlined" style="font-size:13px;">tag</span>
                                                ID: ${escapeHtml(shortId)}
                                                <button class="btn-copy-id" onclick="copyTicketId('${escapeHtml(shortId)}',this)" title="Copy ID">
                                                    <span class="material-symbols-outlined" style="font-size:13px;">content_copy</span>
                                                </button>
                                            </span>
                                            ${priorityBadge}
                                        </div>
                                        ${_durBadge2}
                                    </div>

                                    <div class="ticket-meta-row">
                                        <span class="badge badge-location" style="display:inline-flex;align-items:center;gap:4px;">
                                            <span class="material-symbols-outlined" style="font-size:13px;">location_on</span>${escapeHtml(ticket.location)}
                                        </span>
                                        ${ticket.assignee && ticket.assignee !== '-' ? `<span class="badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(99,102,241,0.08);color:#6366f1;border:1px solid rgba(99,102,241,0.3);"><span class="material-symbols-outlined" style="font-size:13px;">person</span>${escapeHtml(ticket.assignee)}</span>` : ''}
                                        <span class="badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(59,130,246,0.07);color:#2563eb;border:1px solid rgba(59,130,246,0.25);">
                                            <span class="material-symbols-outlined" style="font-size:13px;">calendar_today</span>เปิด: ${formatDateTime(ticket.date_open)}
                                        </span>
                                        <span class="badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(239,68,68,0.07);color:#dc2626;border:1px solid rgba(239,68,68,0.25);">
                                            <span class="material-symbols-outlined" style="font-size:13px;">event_busy</span>ปิด: ${_closeDisplay2 === '-' ? '<span style="opacity:0.45;">ยังไม่ปิด</span>' : _closeDisplay2}
                                        </span>
                                        <span class="badge" style="display:inline-flex;align-items:center;gap:4px;color:${ticket._statusColor};border:1px solid ${ticket._statusColor}40;background:${ticket._statusColor}15;">
                                            <span class="material-symbols-outlined" style="font-size:13px;">label</span>${ticket._statusName}
                                        </span>
                                    </div>

                                    <div class="ticket-project" style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
                                        <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                                            <span class="material-symbols-outlined" style="font-size:17px;color:#f59e0b;flex-shrink:0;">folder</span>
                                            <span style="color:var(--text-sub,#64748b);font-size:12px;flex-shrink:0;">โครงการ:</span>
                                            <a href="${GLPI_BASE_URL}/index.php?redirect=ticket_${getNumericTicketId(ticket)}" target="_blank" rel="noopener noreferrer"
                                                style="color:#2563eb;text-decoration:none;font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                                                onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
                                                ${escapeHtml(ticket.project)}<span class="material-symbols-outlined" style="font-size:13px;vertical-align:text-bottom;margin-left:3px;">open_in_new</span>
                                            </a>
                                        </div>
                                        <button onclick="toggleDetail(this)" style="flex-shrink:0;background:none;border:1px solid #cbd5e1;padding:4px 12px;border-radius:20px;color:#475569;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;transition:all 0.2s;margin-left:8px;">
                                            <span class="material-symbols-outlined" style="font-size:14px;">expand_more</span>รายละเอียด
                                        </button>
                                    </div>

                                    <div class="ticket-detail-wrapper show">
                                        <div class="ticket-detail">
                                            <span class="material-symbols-outlined" style="font-size:15px;vertical-align:text-bottom;">description</span>
                                            <b>รายละเอียด:</b><br>
                                            <span style="color:#64748b;">${cleanHtmlText(ticket.detail)}</span>
                                        </div>
                                    </div>
                                </div>
                            `;
                            }
                            
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = htmlString;
                            while(tempDiv.firstChild) {
                                fragment.appendChild(tempDiv.firstChild);
                            }
                            
                            currentIndex = end;
                            const progressEl = document.getElementById('renderProgress');
                            if (progressEl) {
                                progressEl.innerText = Math.round((currentIndex / allTickets.length) * 100) + "%";
                            }
                            
                            if (currentIndex < allTickets.length) {
                                requestAnimationFrame(renderChunk);
                            } else {
                                container.innerHTML = '';
                                container.appendChild(fragment);
                                updateCheckboxes();
                            }
                        }
                        
                        setTimeout(() => {
                            requestAnimationFrame(renderChunk);
                        }, 80);
                    })();
                }
            } else {
                // ถ้าลบคำค้นหาจนหมด และยังไม่มี currentStatus ก็ปิด split-screen
                document.getElementById('dashboardWrapper').classList.remove('split-active');
            }
        }
        }, 300); // 300ms debounce
    });

    // ระบบ Filter Project (Dropdown)
    document.getElementById('projectFilter')?.addEventListener('change', () => {
        initChart();
        renderMonthlyBreakdown();
        if (currentStatus) renderTicketList(currentStatus);
    });

    // ระบบ Filter Priority (Dropdown)
    document.getElementById('priorityFilter')?.addEventListener('change', () => {
        initChart();
        renderMonthlyBreakdown();
        if (currentStatus) renderTicketList(currentStatus);
    });

    // ระบบ Filter วันที่ (Dropdown)
    document.getElementById('dateFilter')?.addEventListener('change', (e) => {
        const startEl = document.getElementById('filterDateStart');
        const endEl = document.getElementById('filterDateEnd');
        if (startEl) startEl.value = '';
        if (endEl) endEl.value = '';
        
        // Sync back to quick filter
        const quickFilter = document.getElementById('chartDateQuickFilter');
        if (quickFilter && e && e.target) quickFilter.value = e.target.value;
        
        initChart();
        renderMonthlyBreakdown();
        if (currentStatus) renderTicketList(currentStatus);
    });

    // Sync chartDateQuickFilter -> dateFilter
    document.getElementById('chartDateQuickFilter')?.addEventListener('change', function() {
        const dateFilterEl = document.getElementById('dateFilter');
        if (dateFilterEl) {
            dateFilterEl.value = this.value;
            
            // Sync with custom dropdown visual UI
            const timeTitle = document.getElementById('timeDropdownTitle');
            if (timeTitle) {
                const selectedOpt = dateFilterEl.querySelector(`option[value="${dateFilterEl.value}"]`);
                if (selectedOpt) timeTitle.textContent = selectedOpt.textContent;
            }
            
            const listItems = document.querySelectorAll('#timeDropdownList .custom-dropdown-item');
            if (listItems.length > 0) {
                listItems.forEach(item => {
                    if (item.getAttribute('data-value') === dateFilterEl.value) {
                        item.classList.add('selected');
                    } else {
                        item.classList.remove('selected');
                    }
                });
            }
            
            dateFilterEl.dispatchEvent(new Event('change'));
        }
    });

    // Date Range Start/End change
    const handleDateChange = () => {
        const dateFilterEl = document.getElementById('dateFilter');
        if (dateFilterEl) dateFilterEl.value = 'all';
        
        // Sync back to quick filter
        const quickFilter = document.getElementById('chartDateQuickFilter');
        if (quickFilter) quickFilter.value = 'all';
        
        initChart();
        renderMonthlyBreakdown();
        if (currentStatus) renderTicketList(currentStatus);
    };

    document.getElementById('filterDateStart')?.addEventListener('change', handleDateChange);
    document.getElementById('filterDateEnd')?.addEventListener('change', handleDateChange);
    
    // Clear Filters
    document.getElementById('btnClearDateRange')?.addEventListener('click', () => {
        const startEl = document.getElementById('filterDateStart');
        const endEl = document.getElementById('filterDateEnd');
        
        // Clear Date Inputs
        if (startEl) startEl.value = '';
        if (endEl) endEl.value = '';

        // Helper to reset custom dropdowns
        const resetCustomDropdown = (selectId, titleId, defaultText) => {
            const select = document.getElementById(selectId);
            if (select) select.value = 'all';
            
            const title = document.getElementById(titleId);
            if (title) title.textContent = defaultText;
        };

        // Reset all selects to 'all' and update custom UI titles
        resetCustomDropdown('dateFilter', 'timeDropdownTitle', 'ทุกเวลา');
        resetCustomDropdown('priorityFilter', 'priorityDropdownTitle', 'Priority: ทั้งหมด');
        resetCustomDropdown('projectFilter', 'customDropdownSelected', 'Project: ทั้งหมด');
        
        // Sync quick filter
        const quickFilter = document.getElementById('chartDateQuickFilter');
        if (quickFilter) quickFilter.value = 'all';

        // Reset 'selected' class on all custom items
        document.querySelectorAll('.custom-dropdown-item, .dropdown-item-project').forEach(el => {
            if (el.getAttribute('data-value') === 'all') {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });
        
        initChart();
        renderMonthlyBreakdown();
        if (currentStatus) renderTicketList(currentStatus);
    });

    // ปุ่ม Refresh — ดึงข้อมูลจริงจาก n8n
    document.getElementById('btnRefresh')?.addEventListener('click', function() {
        fetchLiveTickets(false);
    });

    // ==============================================
    // Advanced Export System
    // ==============================================
    let currentExportFormat = 'excel';
    window.isExportingSelection = false;

    function computeExportDateRange(dateRange) {
        const today = new Date();
        const fmt = d => d.toISOString().slice(0, 10);
        const shift = n => new Date(today.getTime() + n * 86400000);
        if (dateRange === 'today')
            return { from: fmt(today), to: fmt(today) };
        if (dateRange === 'week')
            return { from: fmt(shift(-6)), to: fmt(today) };
        if (dateRange === 'month30')
            return { from: fmt(shift(-29)), to: fmt(today) };
        if (dateRange === 'month')
            return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) };
        if (dateRange === 'last_month') {
            const y = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
            const m = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
            return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1 > 11 ? 0 : m + 1, 0)) };
        }
        if (dateRange === 'quarter')
            return { from: fmt(shift(-89)), to: fmt(today) };
        if (dateRange === 'year')
            return { from: fmt(new Date(today.getFullYear(), 0, 1)), to: fmt(today) };
        if (dateRange === 'custom')
            return { from: document.getElementById('exportDateFrom').value || '', to: document.getElementById('exportDateTo').value || '' };
        return { from: '', to: '' };
    }
    
    window.openExportModal = function(forSelection = false) {
        window.isExportingSelection = forSelection;
        const dateGroup = document.getElementById('exportDateRange').closest('.export-option-group');
        if (dateGroup) {
            dateGroup.style.display = forSelection ? 'none' : 'block';
        }
        document.getElementById('exportModal').classList.add('active');
        selectDatePreset('today');
    };
    
    window.closeExportModal = function() {
        document.getElementById('exportModal').classList.remove('active');
    };
    
    window.selectExportFormat = function(format) {
        currentExportFormat = format;
        document.querySelectorAll('.format-btn').forEach(btn => btn.classList.remove('selected'));
        document.querySelector(`.format-btn[data-format="${format}"]`).classList.add('selected');
    };
    
    window.executeExport = async function() {
        const dateRange = document.getElementById('exportDateRange').value || 'all';
        const submitBtn = document.querySelector('.btn-export-submit');
        const originalHTML = submitBtn.innerHTML;
        const EXPORT_WEBHOOK = 'https://n8n.sysnect.co.th/webhook/ticket-history';

        const setLoading = msg => {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;animation:spin 1s linear infinite;vertical-align:middle;margin-right:8px;">sync</span> ${msg}`;
        };
        const resetBtn = () => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHTML;
        };

        // ── กรณี Export เฉพาะที่ checkbox เลือก → ใช้ข้อมูลในหน้าเว็บตามเดิม ──
        if (window.isExportingSelection) {
            const dataObj = getFilteredData().project_breakdown;
            let sel = [];
            Object.keys(dataObj).forEach(key => {
                dataObj[key].forEach(t => {
                    if (selectedTickets.has(String(t.id)))
                        sel.push({ ...t, status_name: key.toUpperCase() });
                });
            });
            if (sel.length === 0) { alert('ไม่ได้เลือก ticket'); return; }
            if (currentExportFormat === 'pdf') {
                setLoading('กำลังสร้าง PDF...');
                await exportToPDFReport(sel, 'เฉพาะรายการที่เลือก (Selected Tickets)');
                resetBtn();
            } else {
                exportToSpreadsheet(sel, currentExportFormat);
            }
            closeExportModal();
            return;
        }

        // ── กรณี Export ทั่วไป → call webhook แยก (ไม่จำกัด 120 วัน) ──
        setLoading('กำลังดึงข้อมูล...');
        try {
            const { from, to } = computeExportDateRange(dateRange);
            const params = new URLSearchParams({ source: 'export' });
            if (from) params.append('from', from);
            if (to)   params.append('to', to);

            const res = await fetch(`${EXPORT_WEBHOOK}?${params.toString()}`);
            if (!res.ok) throw new Error('n8n ตอบกลับ HTTP ' + res.status);
            let raw = await res.json();

            if (!Array.isArray(raw) && raw.data) raw = raw.data;
            if (!Array.isArray(raw)) raw = [raw];

            const statusMap = { '1':'NEW','2':'ASSIGNED','3':'ASSIGNED','4':'PENDING','5':'SOLVED','6':'CLOSED' };
            const prioMap   = { '1':'ต่ำมาก','2':'ต่ำ','3':'ปานกลาง','4':'สูง','5':'สูงมาก','6':'สูงมาก' };

            const tickets = raw.map(t => {
                const sc = String(t["12"] || t.status || '1');
                const pc = String(t["3"]  || t.priority || '3');
                return {
                    id:           t["2"]  || t.id    || '-',
                    name:         t["1"]  || t.name  || '-',
                    project:      t["76667"] || t["76666"] || t.project || t.project_name || '-',
                    project_code: t["76666"] || t.project_code || '-',
                    category:     t["7"]  || t.category || '-',
                    detail:       (t["21"] || t.detail || t.description || '-').replace(/<[^>]*>?/gm, '').trim(),
                    location:     t["83"] || t.location || '-',
                    priority:     prioMap[pc] || pc,
                    date:         (t["15"] || t.date_open || t.date_creation || '-').split(' ')[0],
                    date_open:    t["15"] || t.date_open  || t.date_creation || '-',
                    date_close:   t["16"] || t.date_close || t.closedate     || '-',
                    date_creation: t["15"] || t.date_creation || t.date_open || '-',
                    status_name:  statusMap[sc] || (t.status_name || 'NEW').toUpperCase()
                };
            });

            if (tickets.length === 0) {
                alert('ไม่พบข้อมูลในช่วงเวลาที่เลือก');
                return;
            }

            const dateText = (from && to) ? `${from} ถึง ${to}` : 'ข้อมูลทั้งหมด';

            if (currentExportFormat === 'excel' || currentExportFormat === 'csv') {
                exportToSpreadsheet(tickets, currentExportFormat);
                closeExportModal();
            } else if (currentExportFormat === 'pdf') {
                setLoading('กำลังสร้าง PDF...');
                await exportToPDFReport(tickets, dateText);
                closeExportModal();
            }
        } catch (err) {
            console.error('Export webhook error:', err);
            alert('ดึงข้อมูลไม่สำเร็จ\n' + err.message + '\nกรุณาตรวจสอบการเชื่อมต่อ n8n');
        } finally {
            resetBtn();
        }
    };
    
    function exportToSpreadsheet(data, format) {
        const wsData = data.map(t => ({
            "ID": t.id ? '#' + t.id : '',
            "วันที่เปิด": t.date_open || t.date || '',
            "วันที่ปิด": t.date_close || '',
            "รหัสโครงการ": t.project_code || '-',
            "โครงการ": t.project_name || t.project || '-',
            "ชื่อ Ticket": t.name || '',
            "สถานะ": t.status_name || '',
            "ความสำคัญ": t.priority_name || t.priority || ''
        }));

        const ws = XLSX.utils.json_to_sheet(wsData);
        // กำหนดความกว้างคอลัมน์ให้อ่านง่าย
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
        const LOGO_B64 = 'data:image/png;base64,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s/2G3eLGHsNucmenGVPURReN3i0d+JpSj8+NjcB+UH9tmv5ntKQejw/eur3bAjCP+6zDrBlnHM5ajGfLsjwHLHF5P1WfXxHZ9hS4i4iIiIiIyBb6m96tvzqYU698tgT3/73tG18JMXcLqyvr4V63KslaE9XcykTsHP6Eb+Rw7wR+0HvU14H3Xb23IXL9SMnzLI2kHshwD+4hDYEEJ3E86aVJrxa4g1tlRiR6FY3KjAonmntZYiVlVUJVogBdRK5DCtxFRERERERERERERIZAgbuIiIiIiIiIiIiIyBAocBcRERERERERERERGQIF7iIiIiIiIiIiIiIiQ6DAXURERERERERERERkCBS4i4iIiIiIiIiIiIgMgQJ3EREREREREREREZEhUOAuIiIiIiIiIiIiIjIECtxFRERERERERERERIZAgbuIiIiIiIiIiIiIyBAocBcRERERERERERERGQIF7iIiIiIiIiIiIiIiQ6DAXURERERERERERERkCBS4i4iIiIiIiIiIiIgMgQJ3EREREREREREREZEhUOAuIiIiIiIiIiIiIjIECtxFRERERERERERERIZAgbuIiIiIiIiIiIiIyBAocBcRERERERERERERGQIF7iIiIiIiIiIiIiIiQ6DAXURERERERERERERkCBS4i4iIiIiIiIiIiIgMgQJ3EREREREREREREZEhUOAuIiIiIiIiIiIiIjIECtxFRERERERERERERIZAgbuIiIiIiIiIiIiIyBAocBcRERERERERERERGQIF7iIiIiIiIiIiIiIiQ6DAXURERERERERERERkCBS4i4iIiIiIiIiIiIgMgQJ3EREREREREREREZEhUOAuIiIiIiIiIiIiIjIECtxFRERERERERERERIZAgbuIiIiIiIiIiIiIyBAocBcRERERERERERERGQIF7iIiIiIiIiIiIiIiQ6DAXURERERERERERERkCBS4i4iIiIiIiIiIiIgMgQJ3EREREREREREREZEh+H9KExNkPoYBUQAAAABJRU5ErkJggg==';
        try {
            doc.addImage(LOGO_B64, 'PNG', MARGIN, 8, 47, 12);
        } catch (e) {
            console.warn('Could not add logo to PDF', e);
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
                projCode,
                projName,
                name,
                statusName,
                priorityTh
            ];
        });

        doc.autoTable({
            startY: 47,
            head: [['ID', 'วันที่เปิด', 'วันที่ปิด', 'รหัสโครงการ', 'โครงการ', 'ชื่อ Ticket', 'สถานะ', 'ความสำคัญ']],
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
                0: { cellWidth: 18, halign: 'center' },  // ID
                1: { cellWidth: 26, halign: 'center' },  // วันที่เปิด
                2: { cellWidth: 26, halign: 'center' },  // วันที่ปิด
                3: { cellWidth: 22, halign: 'center' },  // รหัสโครงการ
                4: { cellWidth: 60, halign: 'left'   },  // โครงการ
                5: { cellWidth: 70, halign: 'left'   },  // ชื่อ Ticket
                6: { cellWidth: 23, halign: 'center' },  // สถานะ
                7: { cellWidth: 20, halign: 'center' }   // ความสำคัญ
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

    // ไม่ต้องเรียก initChart() ตรงนี้แล้ว เพราะเราเรียกใน fetchLiveTickets()
    // initChart();

    // ดึง Element ปุ่มและกรอบใหญ่มาใช้งาน
    const toggleBtn = document.getElementById('centerToggleBtn');
    const dashboardWrapper = document.getElementById('dashboardWrapper');
    const btnText = toggleBtn?.querySelector('.btn-text');

    // ─── ฟังก์ชัน Switch Mode ─────────────────────────────
    function enterSplitMode(status) {
        dashboardWrapper.classList.remove('three-panel');
        dashboardWrapper.classList.add('split-active');
        if (btnText) btnText.innerText = 'Close';
        currentStatus = status || 'ALL';
        renderTicketList(currentStatus);
        updateChartLegendActive();
        if (typeof updateStatBarActive === 'function') updateStatBarActive(currentStatus);
        // 📱 โหมดแอป (มือถือ): สลับไปแท็บ Tickets อัตโนมัติเมื่อเลือกสถานะ/กดปุ่ม
        if (window.setMobileTab && document.body.classList.contains('mtab-on')
            && window.matchMedia('(max-width: 1024px)').matches) {
            window.setMobileTab('tickets', false);
        }
        // 📱 มือถือเท่านั้น: เลือกสถานะแล้วเลื่อนลงมาที่ ticket list อัตโนมัติ
        scrollToTicketListOnMobile();
    }

    // เลื่อนหน้าจอลงมาที่ ticket list (เฉพาะจอ ≤1024px) ชดเชยความสูง sticky navbar
    function scrollToTicketListOnMobile() {
        if (!window.matchMedia('(max-width: 1024px)').matches) return;
        if (document.body.classList.contains('mtab-on')) return; // โหมดแอป: tab จัดการ scroll เอง
        const rp = document.getElementById('rightPanel');
        if (!rp) return;
        setTimeout(() => {
            const navbar = document.querySelector('.top-navbar');
            const navH = navbar ? navbar.offsetHeight : 0;
            const top = rp.getBoundingClientRect().top + window.pageYOffset - navH - 8;
            window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
        }, 150);
    }

    function exitSplitMode() {
        dashboardWrapper.classList.remove('split-active');
        dashboardWrapper.classList.add('three-panel');
        if (btnText) btnText.innerText = 'Open';
        currentStatus = null;
        updateChartLegendActive();
        if (typeof updateStatBarActive === 'function') updateStatBarActive('');
        window.currentRenderId = (window.currentRenderId || 0) + 1;
        const ticketContainerEl = document.getElementById('ticketContainer');
        if (ticketContainerEl) ticketContainerEl.innerHTML = '';
    }

    // เมื่อคลิกปุ่มตรงกลาง
    if (toggleBtn && dashboardWrapper && btnText) {
        toggleBtn.addEventListener('click', function() {
            this.classList.add('spin-active');
            setTimeout(() => this.classList.remove('spin-active'), 800);
            if (dashboardWrapper.classList.contains('split-active')) {
                exitSplitMode();
            } else {
                enterSplitMode('ALL');
            }
        });
    }

    // Expose enterSplitMode ให้ handleLegendClick ใช้ได้
    window._enterSplitMode = enterSplitMode;

    window.copyTicketId = function(id, btn) {
        navigator.clipboard.writeText(id).then(() => {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 14px; color: #10b981;">check</span>';
            btn.style.borderColor = '#10b981';
            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.style.borderColor = '';
            }, 2000);
        });
    };

    // ==============================================
    // 4. สคริปต์จัดการ Account Dropdown & Theme & Clock
    // ==============================================
    

    
    let currentTheme = localStorage.getItem('sysnectTheme') || 'light';

    // ─── Sidebar Left: Status Bar Chart (vertical cylinders) ────
    function renderStatusBarChart(values, labels) {
        const canvas = document.getElementById('statusBarCanvas');
        if (!canvas || typeof Chart === 'undefined') return;

        const statLabels = (labels || ['new','assigned','pending','solved','closed']).map(l => l.toUpperCase());
        const statValues = values || [0, 0, 0, 0, 0];
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const colorMap = {
            'NEW': isDark ? '#60a5fa' : '#3b82f6',
            'ASSIGNED': isDark ? '#fbbf24' : '#f59e0b',
            'PENDING': isDark ? '#f87171' : '#ef4444',
            'SOLVED': isDark ? '#34d399' : '#10b981',
            'CLOSED': isDark ? '#94a3b8' : '#64748b'
        };
        const shortMap = { 'NEW': 'New', 'ASSIGNED': 'Assgn', 'PENDING': 'Pend', 'SOLVED': 'Solv', 'CLOSED': 'Clsd' };
        const colors = statLabels.map(l => colorMap[l] || '#6366f1');
        const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        const tickColor = isDark ? '#94a3b8' : '#64748b';

        if (window._statusBarChart) {
            window._statusBarChart.data.datasets[0].data = statValues;
            window._statusBarChart.data.datasets[0].backgroundColor = colors.map(c => c + 'bb');
            window._statusBarChart.data.datasets[0].borderColor = colors;
            window._statusBarChart.update('active');
            return;
        }

        window._statusBarChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: statLabels.map(l => shortMap[l] || l),
                datasets: [{
                    data: statValues,
                    backgroundColor: colors.map(c => c + 'bb'),
                    borderColor: colors,
                    borderWidth: 2,
                    borderRadius: { topLeft: 7, topRight: 7 },
                    borderSkipped: false,
                    minBarLength: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 700, easing: 'easeInOutQuart' },
                layout: { padding: { top: 20, right: 4, left: 4, bottom: 0 } },
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        offset: -1,
                        color: (ctx) => colors[ctx.dataIndex] || (isDark ? '#a78bfa' : '#6366f1'),
                        font: { weight: '800', size: 10, family: 'JetBrains Mono' },
                        formatter: (val) => val > 0 ? val : '0',
                        clamp: true
                    },
                    tooltip: {
                        callbacks: {
                            title: (items) => statLabels[items[0].dataIndex] || '',
                            label: ctx => ` ${ctx.parsed.y} ใบ`
                        }
                    }
                },
                scales: {
                    y: {
                        display: false,
                        beginAtZero: true,
                    },
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            color: tickColor,
                            font: { size: 9.5, weight: '600' }
                        }
                    }
                }
            }
        });
    }

    // ─── Sidebar Left: Project List (display only) ────────────
    function renderProjectSidebar() {
        const el = document.getElementById('projectSidebarList');
        const badge = document.getElementById('projSidebarCount');
        if (!el) return;

        // Use ALL raw data — independent of center panel filters
        const breakdown = mockDataRaw || {};
        const statusOrder = ['new', 'assigned', 'pending', 'solved', 'closed'];
        const rawValues = statusOrder.map(s => (breakdown[s] || []).length);

        const projMap = {};
        Object.keys(breakdown).forEach(status => {
            (breakdown[status] || []).forEach(ticket => {
                const proj = ticket.project || 'ไม่ระบุ';
                projMap[proj] = (projMap[proj] || 0) + 1;
            });
        });

        const entries = Object.entries(projMap).sort((a, b) => b[1] - a[1]);
        if (badge) badge.textContent = entries.length;

        // Render status bar chart at top of left sidebar (raw counts, not filtered)
        renderStatusBarChart(rawValues, statusOrder);

        if (entries.length === 0) {
            el.innerHTML = '<div style="text-align:center;padding:20px 10px;color:var(--text-sub,#94a3b8);font-size:12px;"><span class="material-symbols-outlined" style="font-size:28px;display:block;margin-bottom:6px;opacity:0.35;">folder_open</span>ไม่มีข้อมูล</div>';
            return;
        }

        const maxCount = entries[0][1];
        let html = '';
        entries.forEach(([name, count]) => {
            const pct = (count / maxCount * 100).toFixed(1);
            html += `
            <div class="proj-row" title="${escapeHtml(name)} — ${count} ใบ">
                <span class="proj-name">${escapeHtml(name)}</span>
                <div class="proj-bar-wrap"><div class="proj-bar-fill" data-pct="${pct}" style="width:0%"></div></div>
                <span class="proj-count">${count}</span>
            </div>`;
        });
        el.innerHTML = html;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            el.querySelectorAll('.proj-bar-fill').forEach(bar => {
                bar.style.width = bar.dataset.pct + '%';
            });
        }));
    }

    window.filterByProject = function(name) {
        const sel = document.getElementById('projectFilter');
        const customSel = document.getElementById('customDropdownSelected');
        if (!sel) return;
        // Toggle: click same project again → reset to all
        if (sel.value === name) {
            sel.value = 'all';
            if (customSel) customSel.textContent = 'Project: ทั้งหมด';
        } else {
            sel.value = name;
            if (customSel) customSel.textContent = name;
        }
        sel.dispatchEvent(new Event('change'));
        renderProjectSidebar();
    };

    // ─── Sidebar Right: Trend Line Chart ─────────────────
    let currentTrendPeriod = 'week';

    function aggregateByPeriod(period) {
        // Use ALL raw data — independent of center panel filters
        let tickets = [];
        Object.values(mockDataRaw || {}).forEach(arr => {
            (arr || []).forEach(t => tickets.push(t));
        });

        const now = new Date();
        const buckets = {};

        if (period === 'week') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(now.getDate() - i);
                const key = d.toISOString().slice(0, 10);
                buckets[key] = { label: `${d.getDate()}/${d.getMonth()+1}`, count: 0 };
            }
            tickets.forEach(t => {
                const key = (t.date_open || '').slice(0, 10);
                if (buckets[key]) buckets[key].count++;
            });
        } else if (period === 'month') {
            for (let i = 29; i >= 0; i--) {
                const d = new Date(now);
                d.setDate(now.getDate() - i);
                const key = d.toISOString().slice(0, 10);
                buckets[key] = { label: (i % 5 === 0 || i === 0) ? `${d.getDate()}/${d.getMonth()+1}` : '', count: 0 };
            }
            tickets.forEach(t => {
                const key = (t.date_open || '').slice(0, 10);
                if (buckets[key]) buckets[key].count++;
            });
        } else if (period === '3month') {
            for (let i = 12; i >= 0; i--) {
                const wEnd = new Date(now);
                wEnd.setDate(now.getDate() - i * 7);
                const wStart = new Date(wEnd);
                wStart.setDate(wEnd.getDate() - 6);
                const key = `w${i}`;
                buckets[key] = {
                    label: `${wStart.getDate()}/${wStart.getMonth()+1}`,
                    count: 0, start: new Date(wStart.setHours(0,0,0,0)), end: new Date(wEnd.setHours(23,59,59,999))
                };
            }
            tickets.forEach(t => {
                const d = t.date_open ? new Date(t.date_open) : null;
                if (!d || isNaN(d)) return;
                Object.values(buckets).forEach(b => { if (d >= b.start && d <= b.end) b.count++; });
            });
        } else if (period === '6month') {
            for (let i = 12; i >= 0; i--) {
                const wEnd = new Date(now);
                wEnd.setDate(now.getDate() - i * 14);
                const wStart = new Date(wEnd);
                wStart.setDate(wEnd.getDate() - 13);
                const key = `b${i}`;
                buckets[key] = {
                    label: `${wStart.getDate()}/${wStart.getMonth()+1}`,
                    count: 0, start: new Date(wStart.setHours(0,0,0,0)), end: new Date(wEnd.setHours(23,59,59,999))
                };
            }
            tickets.forEach(t => {
                const d = t.date_open ? new Date(t.date_open) : null;
                if (!d || isNaN(d)) return;
                Object.values(buckets).forEach(b => { if (d >= b.start && d <= b.end) b.count++; });
            });
        } else if (period === 'year') {
            const curYear = now.getFullYear();
            const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
            for (let m = 0; m <= now.getMonth(); m++) {
                const key = `${curYear}-${String(m+1).padStart(2,'0')}`;
                buckets[key] = { label: thaiMonths[m], count: 0 };
            }
            tickets.forEach(t => {
                const d = t.date_open ? new Date(t.date_open) : null;
                if (!d || isNaN(d) || d.getFullYear() !== curYear) return;
                const key = `${curYear}-${String(d.getMonth()+1).padStart(2,'0')}`;
                if (buckets[key]) buckets[key].count++;
            });
        }

        const entries = Object.values(buckets);
        return {
            labels: entries.map(b => b.label),
            counts: entries.map(b => b.count),
            total: entries.reduce((s, b) => s + b.count, 0)
        };
    }

    function renderTrendList(labels, counts, period) {
        const el = document.getElementById('trendList');
        if (!el) return;
        let listData;
        if (period === 'month' && labels.length >= 28) {
            // 30-day data → group into 6 buckets of 5 days
            listData = [];
            for (let g = 0; g < 6; g++) {
                const startIdx = g * 5;
                const grpCounts = counts.slice(startIdx, startIdx + 5);
                const grpLabel = labels[startIdx + 4] || labels.slice(startIdx, startIdx + 5).find(function(l){return l;}) || '';
                const tot = grpCounts.reduce(function(s,c){return s+c;}, 0);
                if (grpLabel) listData.push({ label: grpLabel, count: tot });
            }
        } else {
            listData = labels.map(function(l,i){ return { label:l, count: counts[i]||0 }; })
                             .filter(function(p){ return p.label !== ''; });
        }
        if (!listData || listData.length === 0) { el.innerHTML = ''; return; }
        const maxCount = Math.max.apply(null, listData.map(function(p){return p.count;})) || 1;
        let html = '';
        listData.forEach(function(p) {
            const pct = ((p.count / maxCount) * 100).toFixed(1);
            const safeLabel = String(p.label).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            html += '<div class="tl-row">' +
                '<span class="tl-period">' + safeLabel + '</span>' +
                '<div class="tl-bar-wrap"><div class="tl-bar-fill" data-pct="' + pct + '" style="width:0%"></div></div>' +
                '<span class="tl-count">' + p.count + '</span>' +
            '</div>';
        });
        el.innerHTML = html;
        requestAnimationFrame(function(){ requestAnimationFrame(function(){
            el.querySelectorAll('.tl-bar-fill').forEach(function(bar){
                bar.style.width = bar.dataset.pct + '%';
            });
        }); });
    }

    function renderTrendLineChart() {
        const canvas = document.getElementById('trendLineCanvas');
        const totalEl = document.getElementById('trendTotal');
        if (!canvas || typeof Chart === 'undefined') return;

        const { labels, counts, total } = aggregateByPeriod(currentTrendPeriod);
        if (totalEl) totalEl.textContent = total;
        renderTrendList(labels, counts, currentTrendPeriod);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const lineColor = isDark ? '#a78bfa' : '#6366f1';
        const fillColor = isDark ? 'rgba(167,139,250,0.1)' : 'rgba(99,102,241,0.07)';
        const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        const tickColor = isDark ? '#64748b' : '#94a3b8';

        if (window._trendLineChart) {
            window._trendLineChart.data.labels = labels;
            window._trendLineChart.data.datasets[0].data = counts;
            if (totalEl) totalEl.textContent = total;
            window._trendLineChart.update('active');
            return;
        }

        window._trendLineChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'ทิกเก็ต',
                    data: counts,
                    borderColor: lineColor,
                    backgroundColor: fillColor,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.4,
                    pointRadius: labels.length <= 8 ? 4 : 2,
                    pointHoverRadius: 6,
                    pointBackgroundColor: lineColor,
                    pointBorderColor: isDark ? '#060612' : '#ffffff',
                    pointBorderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    datalabels: { display: false },
                    tooltip: {
                        callbacks: { label: ctx => ` ${ctx.parsed.y} ใบ` }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        border: { display: false },
                        ticks: {
                            color: tickColor,
                            font: { size: 10, family: 'JetBrains Mono' },
                            stepSize: 1,
                            maxTicksLimit: 5
                        }
                    },
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            color: tickColor,
                            font: { size: 9.5 },
                            maxRotation: 45,
                            minRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 8
                        }
                    }
                }
            }
        });
    }

    window.onPeriodChange = function(period) {
        currentTrendPeriod = period;
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });
        if (window._trendLineChart) {
            window._trendLineChart.destroy();
            window._trendLineChart = null;
        }
        renderTrendLineChart();
    };

    function renderUserPill() {
        const token = sessionStorage.getItem('sysnect_sso_token') || window.ssoToken || '';
        if (!token) return;
        try {
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
            const name = payload.name || payload.preferred_username || payload.email || payload.sub || '';
            if (!name) return;
            const pill = document.getElementById('userPill');
            const nameEl = document.getElementById('userPillName');
            const avatarEl = document.getElementById('userPillAvatar');
            if (!pill || !nameEl || !avatarEl) return;
            nameEl.textContent = name.split('@')[0].split(' ')[0];
            avatarEl.textContent = name.charAt(0).toUpperCase();
            pill.style.display = 'flex';
        } catch(e) { /* JWT parse failed — no pill */ }
    }

    function updateStatBar(values, labels, total) {
        const idMap = { new: 'statNew', assigned: 'statAssigned', pending: 'statPending', solved: 'statSolved', closed: 'statClosed' };
        const totalEl = document.getElementById('statTotal');
        if (totalEl) totalEl.textContent = total ?? 0;
        if (!labels || !values) return;
        labels.forEach((lbl, i) => {
            const key = lbl.toLowerCase();
            const el = document.getElementById(idMap[key]);
            if (el) el.textContent = values[i] ?? 0;
        });
    }

    function updateStatBarActive(status) {
        document.querySelectorAll('.stat-card').forEach(card => {
            const s = card.dataset.status;
            const match = status === 'ALL' ? s === 'total' : s === status.toLowerCase();
            card.classList.toggle('active', match);
        });
    }

    function initTheme() {
        document.documentElement.setAttribute('data-theme', currentTheme);
        const icon = document.querySelector('#btnThemeToggle .theme-icon');
        if (icon) icon.textContent = currentTheme === 'dark' ? 'light_mode' : 'dark_mode';
    }

    document.getElementById('btnThemeToggle')?.addEventListener('click', function() {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', currentTheme);
        localStorage.setItem('sysnectTheme', currentTheme);
        // sync settings drawer
        const themeSel = document.getElementById('settingTheme');
        if (themeSel) themeSel.value = currentTheme;
        const settingsObj = JSON.parse(localStorage.getItem('sysnect_settings') || '{}');
        settingsObj.theme = currentTheme;
        localStorage.setItem('sysnect_settings', JSON.stringify(settingsObj));
        const icon = this.querySelector('.theme-icon');
        if (icon) icon.textContent = currentTheme === 'dark' ? 'light_mode' : 'dark_mode';
        // Rebuild sidebar charts so colors match new theme
        if (window._statusBarChart) { window._statusBarChart.destroy(); window._statusBarChart = null; }
        if (window._trendLineChart) { window._trendLineChart.destroy(); window._trendLineChart = null; }
        if (typeof renderProjectSidebar === 'function') renderProjectSidebar();
        if (typeof renderTrendLineChart === 'function') renderTrendLineChart();
    });

    document.addEventListener('DOMContentLoaded', () => {
        initTheme();

        // Initialize Custom Dropdowns for Priority and Date
        function setupCustomDropdown(containerId, headerId, titleId, listId, selectId) {
            const container = document.getElementById(containerId);
            const header = document.getElementById(headerId);
            const title = document.getElementById(titleId);
            const list = document.getElementById(listId);
            const select = document.getElementById(selectId);
            if (!container || !header || !title || !list || !select) return;

            header.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = list.style.display === 'block';
                document.querySelectorAll('.custom-dropdown-list').forEach(l => l.style.display = 'none');
                if (!isVisible) {
                    const rect = header.getBoundingClientRect();
                    list.style.position = 'fixed';
                    list.style.top = (rect.bottom + 4) + 'px';
                    list.style.left = rect.left + 'px';
                    list.style.minWidth = rect.width + 'px';
                    list.style.width = 'auto';
                    list.style.zIndex = '9999';
                    list.style.display = 'block';
                }
            });

            const items = list.querySelectorAll('.custom-dropdown-item');
            items.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    items.forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    title.textContent = item.textContent;
                    select.value = item.getAttribute('data-value');
                    list.style.display = 'none';
                    select.dispatchEvent(new Event('change'));
                });
            });

            document.addEventListener('click', (e) => {
                if (!container.contains(e.target)) {
                    list.style.display = 'none';
                }
            });
        }

        setupCustomDropdown('priorityDropdownContainer', 'priorityDropdownHeader', 'priorityDropdownTitle', 'priorityDropdownList', 'priorityFilter');
        setupCustomDropdown('timeDropdownContainer', 'timeDropdownHeader', 'timeDropdownTitle', 'timeDropdownList', 'dateFilter');
    });

window.selectDatePreset = function(preset) {
    // อัปเดต hidden field
    document.getElementById('exportDateRange').value = preset;

    // อัปเดต pill highlight
    document.querySelectorAll('.date-preset-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === preset);
    });

    // แสดง/ซ่อน custom date section
    const section = document.getElementById('customDateRangeSection');
    if (!section) return;
    if (preset === 'custom') {
        section.style.display = 'block';
        const today = new Date();
        const from = new Date(today);
        from.setDate(today.getDate() - 30);
        const fmt = d => d.toISOString().slice(0, 10);
        const fromEl = document.getElementById('exportDateFrom');
        const toEl = document.getElementById('exportDateTo');
        if (fromEl && !fromEl.value) fromEl.value = fmt(from);
        if (toEl && !toEl.value) toEl.value = fmt(today);
    } else {
        section.style.display = 'none';
    }
};
