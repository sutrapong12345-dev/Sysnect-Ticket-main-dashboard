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
    }

    window.exportSelectedTickets = function() {
        if (selectedTickets.size === 0) return;
        
        // Use the modal instead for advanced export (Excel/CSV/PDF)
        openExportModal(true);
    };

    // จัดการหน้าโหลด (Premium Loader)
    window.addEventListener('load', () => {
        // ดึงข้อมูลจริงจาก n8n
        fetchLiveTickets();
        
        // อัปเดตข้อมูลอัตโนมัติทุกๆ 30 วินาที (แบบเงียบ)
        setInterval(() => {
            fetchLiveTickets(true);
        }, 30000);
    });

    // ==========================================
    // 💡 การเชื่อมต่อกับ n8n Webhook สำหรับใช้งานจริง
    // ==========================================
    async function fetchLiveTickets(isAutoRefresh = false) {


        // Show loader and start simulated progress
        const loader = document.getElementById('sysnectLoader');
        const loaderBar = document.querySelector('.cyber-progress-bar');
        const loaderPercent = document.getElementById('loaderPercent');
        const loaderMessage = document.getElementById('loaderMessage');
        
        if (!isAutoRefresh && loader && loaderBar && loaderPercent) {
            loader.classList.remove('hidden');
            loaderBar.style.width = '0%';
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
            
            loaderBar.style.width = progress + '%';
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
            const queryParam = isAutoRefresh ? '?source=autoRefresh' : '?source=initialLoad';
            const API_BASE = (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io') && !location.hostname.endsWith('pages.dev') && !location.hostname.endsWith('workers.dev'))
                ? location.origin
                : 'https://healing-recipes-stable-vision.trycloudflare.com'; // 🔧 Cloudflare tunnel (quick tunnel = เปลี่ยนทุกครั้งที่รีสตาร์ท)
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
                loaderBar.style.width = '100%';
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
        
        // ล้างข้อมูลเดิม
        projectFilterSelect.innerHTML = `<option value="all">Project: ทั้งหมด (${totalTickets} Tickets - 100%)</option>`;
        if (customDropdownList) customDropdownList.innerHTML = '';
        
        // 1. สร้างตัวเลือก "ทั้งหมด"
        if (customDropdownList) {
            const allItem = document.createElement('div');
            allItem.className = 'dropdown-item-project' + (currentSelection === 'all' ? ' selected' : '');
            allItem.innerHTML = `
                <div class="di-name" title="Project: ทั้งหมด">Project: ทั้งหมด</div>
                <div class="di-bar-wrapper">
                    <div class="di-bar" style="width: 100%; background: #94a3b8;"></div>
                </div>
                <div class="di-count">${totalTickets}</div>
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
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                    <span class="material-symbols-outlined" style="color: #2563eb; font-size: 20px;">calendar_month</span>
                    <span style="font-weight: 700; font-size: 15px; color: var(--text-main, #1e293b);">สรุปรายเดือน (Monthly Breakdown)</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
        `;
        
        sortedKeys.forEach(key => {
            const item = monthCounts[key];
            html += `
                <div style="display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, rgba(37,99,235,0.05), rgba(37,99,235,0.02)); border: 1px solid rgba(37,99,235,0.15); border-radius: 10px; padding: 10px 16px;">
                    <span style="font-weight: 600; color: var(--text-main, #1e293b); font-size: 14px;">${item.label}</span>
                    <span style="background: #2563eb; color: white; padding: 2px 10px; border-radius: 20px; font-weight: 700; font-size: 13px; min-width: 32px; text-align: center;">${item.count}</span>
                    <span style="color: #64748b; font-size: 12px;">ใบ</span>
                </div>
            `;
        });
        
        html += `
                </div>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e2e8f0; display: flex; justify-content: flex-end; color: #64748b; font-size: 13px;">
                    รวมทั้งหมด: <strong style="color: #2563eb; margin-left: 6px;">${totalCount} ใบ</strong>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    }

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
            const healthUrl = (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io') && !location.hostname.endsWith('pages.dev') && !location.hostname.endsWith('workers.dev'))
                ? `${location.origin}/api/health`
                : 'https://healing-recipes-stable-vision.trycloudflare.com/api/health';
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
    }

    // ⚡ Legend ใต้กราฟ: จุดสี + สถานะ + จำนวน + % (คลิกเพื่อกรองได้)
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
                <button type="button" class="cl-row${active}" data-status="${labels[i]}" onclick="handleLegendClick('${labels[i]}')">
                    <span class="cl-dot" style="background:${colors[i]}"></span>
                    <span class="cl-label">${labels[i]}</span>
                    <span class="cl-count">${count}</span>
                    <span class="cl-pct">${pctText}</span>
                </button>`;
        }
        // ALL — สถานะที่ 6 แสดงทุก ticket รวมกัน
        const allActive = (currentStatus === 'ALL') ? ' active' : '';
        html += `
            <button type="button" class="cl-row${allActive}" data-status="ALL" onclick="handleLegendClick('ALL')"
                style="margin-top:4px; border-top: 1px dashed #e2e8f0; padding-top:8px;">
                <span class="cl-dot" style="background: conic-gradient(#3b82f6 0% 20%, #f59e0b 20% 40%, #ef4444 40% 60%, #10b981 60% 80%, #64748b 80% 100%); border-radius:50%;"></span>
                <span class="cl-label" style="font-weight:700;">ALL</span>
                <span class="cl-count">${total}</span>
                <span class="cl-pct">100%</span>
            </button>`;
        el.innerHTML = html;
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

        // ถ้าไม่ใช่ ALL ให้ตรวจว่า status นั้นมีข้อมูลหรือไม่
        if (status !== 'ALL') {
            const statusIdx = data.labels.findIndex(l => l.toUpperCase() === status);
            if (statusIdx !== -1 && data.values[statusIdx] === 0) return;
        }

        currentStatus = status;
        document.getElementById('dashboardWrapper').classList.add('split-active');
        document.getElementById('statusName').innerText = currentStatus.toUpperCase();
        const centerBtnText = document.querySelector('.center-toggle-btn .btn-text');
        if (centerBtnText) centerBtnText.innerText = 'Close';

        renderTicketList(currentStatus);
        updateChartLegendActive();
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
        
        if(!tickets || tickets.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 40px;"><span class="material-symbols-outlined" style="font-size: 48px; color: #cbd5e1;">inbox</span><p style="color:#7f8c8d; margin-top: 15px;">ไม่มีข้อมูลที่ตรงกับเงื่อนไข</p></div>';
            document.getElementById('statusName').innerText = `${status.toUpperCase()} (0)`;
        } else {
            document.getElementById('statusName').innerText = `${status.toUpperCase()} (${tickets.length})`;
            
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

                                <div class="ticket-meta-row">
                                    <span class="badge badge-location" style="display:inline-flex;align-items:center;gap:4px;">
                                        <span class="material-symbols-outlined" style="font-size:13px;">location_on</span>${escapeHtml(ticket.location)}
                                    </span>
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
                document.getElementById('statusTitle').style.color = '#2980b9';
                document.getElementById('statusName').innerText = "ผลลัพธ์การค้นหาทั้งหมด";
                
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
    document.getElementById('dateFilter')?.addEventListener('change', () => {
        const startEl = document.getElementById('filterDateStart');
        const endEl = document.getElementById('filterDateEnd');
        if (startEl) startEl.value = '';
        if (endEl) endEl.value = '';
        
        initChart();
        renderMonthlyBreakdown();
        if (currentStatus) renderTicketList(currentStatus);
    });

    // Date Range Start/End change
    const handleDateChange = () => {
        const dateFilterEl = document.getElementById('dateFilter');
        if (dateFilterEl) dateFilterEl.value = 'all';
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

    // ปุ่ม Refresh
    document.getElementById('btnRefresh')?.addEventListener('click', function() {
        const btn = this;
        btn.classList.add('spin-active');
        const originalText = '<span class="material-symbols-outlined" style="vertical-align: text-bottom; font-size: 18px;">sync</span> Refresh';
        btn.innerHTML = '<span class="material-symbols-outlined" style="vertical-align: text-bottom; font-size: 18px;">sync</span> Loading...';
        btn.style.opacity = '0.7';
        
        // จำลองโหลด API 1 วินาที
        setTimeout(() => {
            initChart();
            if (currentStatus) renderTicketList(currentStatus);
            btn.innerHTML = originalText;
            btn.style.opacity = '1';
            btn.classList.remove('spin-active');
        }, 800);
    });

    // ==============================================
    // Advanced Export System
    // ==============================================
    let currentExportFormat = 'excel';
    window.isExportingSelection = false;
    
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
        const dataObj = getFilteredData().project_breakdown;
        let ticketsToExport = [];
        
        if (window.isExportingSelection) {
            // ดึงเฉพาะ ticket ที่เลือก
            Object.keys(dataObj).forEach(key => {
                dataObj[key].forEach(t => {
                    if (selectedTickets.has(String(t.id))) {
                        ticketsToExport.push({ ...t, status_name: key.toUpperCase() });
                    }
                });
            });
        } else {
            if (currentStatus && currentStatus !== 'ALL') {
                const statusKey = currentStatus.toLowerCase();
                if (dataObj[statusKey]) {
                    ticketsToExport = dataObj[statusKey].map(t => ({ ...t, status_name: statusKey.toUpperCase() }));
                }
            } else {
                Object.keys(dataObj).forEach(key => {
                    const arr = dataObj[key].map(t => ({ ...t, status_name: key.toUpperCase() }));
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
            "Ticket ID": t.id || '',
            "Title": t.name || t.project || '',
            "Detail": t.detail || t.description || '-',
            "Status": t.status_name || '',
            "Priority": t.priority_name || t.priority || '',
            "Created Date": t.date_open || t.date || '',
            "Closed Date": t.date_close || '',
            "Requester": t.requester || '-',
            "Technician": t.technician || '-',
            "Location": t.location_name || t.location || '-'
        }));
        
        const ws = XLSX.utils.json_to_sheet(wsData);
        // กำหนดความกว้างคอลัมน์ให้อ่านง่าย
        const wscols = [
            {wch: 15}, {wch: 25}, {wch: 40}, {wch: 15}, {wch: 15}, 
            {wch: 20}, {wch: 20}, {wch: 20}, {wch: 20}, {wch: 20}
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
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const PAGE_W = 210;
        const MARGIN = 14;

        const loaded = await loadThaiFonts();
        if (loaded && regularFontBase64 && boldFontBase64) {
            doc.addFileToVFS('Sarabun-Regular.ttf', regularFontBase64);
            doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
            doc.addFileToVFS('Sarabun-Bold.ttf', boldFontBase64);
            doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
            doc.setFont('Sarabun', 'normal');
        }

        // ─── Colored header band ────────────────────────────────
        doc.setFillColor(26, 54, 93);
        doc.rect(0, 0, PAGE_W, 26, 'F');

        doc.setFont('Sarabun', 'bold');
        doc.setFontSize(15);
        doc.setTextColor(255, 255, 255);
        doc.text('SYSNECT Enterprise Ticket Dashboard', MARGIN, 11);

        doc.setFont('Sarabun', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(180, 210, 255);
        doc.text(
            'รายงานสรุปผู้บริหาร (Executive Summary Report)  —  ' + new Date().toLocaleDateString('th-TH'),
            MARGIN, 20
        );

        // ─── Summary box ─────────────────────────────────────────
        const statusCounts = { NEW: 0, ASSIGNED: 0, PENDING: 0, SOLVED: 0, CLOSED: 0 };
        data.forEach(t => {
            const s = String(t.status_name || '').toUpperCase();
            if (statusCounts[s] !== undefined) statusCounts[s]++;
            else statusCounts.NEW++;
        });

        const dateRangeText = window.isExportingSelection ? 'เฉพาะรายการที่เลือก (Selected Tickets)' :
            (document.getElementById('exportDateRange') ?
            document.getElementById('exportDateRange').options[document.getElementById('exportDateRange').selectedIndex].text :
            dateRangeLabel);

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.roundedRect(MARGIN, 30, PAGE_W - MARGIN * 2, 30, 2, 2, 'FD');

        doc.setFont('Sarabun', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        doc.text('สรุปข้อมูล (Summary)', MARGIN + 4, 38);

        doc.setFont('Sarabun', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        doc.text('จำนวนตั๋วทั้งหมด: ' + data.length + ' รายการ', MARGIN + 4, 45);
        doc.text('ช่วงเวลาข้อมูล: ' + dateRangeText, MARGIN + 65, 45);

        // Status summary chips
        const chips = [
            { label: 'NEW',      count: statusCounts.NEW,      r: 59,  g: 130, b: 246 },
            { label: 'ASSIGNED', count: statusCounts.ASSIGNED, r: 245, g: 158, b: 11  },
            { label: 'PENDING',  count: statusCounts.PENDING,  r: 239, g: 68,  b: 68  },
            { label: 'SOLVED',   count: statusCounts.SOLVED,   r: 16,  g: 185, b: 129 },
            { label: 'CLOSED',   count: statusCounts.CLOSED,   r: 100, g: 116, b: 139 }
        ];
        let chipX = MARGIN + 4;
        doc.setFontSize(7);
        chips.forEach(chip => {
            const text = chip.label + ': ' + chip.count;
            const w = doc.getTextWidth(text) + 7;
            doc.setFillColor(chip.r, chip.g, chip.b);
            doc.roundedRect(chipX, 50, w, 6, 1, 1, 'F');
            doc.setFont('Sarabun', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(text, chipX + 3.5, 54.5);
            chipX += w + 4;
        });

        // ─── Table ───────────────────────────────────────────────
        const STATUS_COLORS = {
            'NEW':      [59,  130, 246],
            'ASSIGNED': [245, 158, 11 ],
            'PENDING':  [239, 68,  68 ],
            'SOLVED':   [16,  185, 129],
            'CLOSED':   [100, 116, 139]
        };

        const tableRows = data.slice(0, 500).map(t => {
            let plainDetail = '-';
            if (t.detail || t.description) {
                // cleanHtmlText ใช้ textarea decode entities + strip tags + ตัด signature
                plainDetail = cleanHtmlText(t.detail || t.description)
                    .replace(/<[^>]*>?/gm, '')   // strip <hr> ที่ cleanHtmlText อาจเพิ่มกลับ
                    .replace(/\n/g, ' ')
                    .replace(/\s+/g, ' ').trim();
                if (plainDetail.length > 200) plainDetail = plainDetail.substring(0, 200) + '…';
            }
            const rawId = String(t.id || '-');
            const statusLabel = String(t.status_name || '-').toUpperCase();
            return [
                rawId,
                String(t.name || t.project || '-').replace(/\s+/g, ' ').trim(),
                plainDetail,
                statusLabel,
                formatDateTime(t.date_open || t.date || '-'),
                formatDateTime(t.date_close || '-')
            ];
        });

        doc.autoTable({
            startY: 64,
            head: [['ID', 'โครงการ/ชื่องาน', 'รายละเอียด', 'สถานะ', 'วันที่เปิด', 'วันที่ปิด']],
            body: tableRows,
            theme: 'grid',
            styles: {
                font: 'Sarabun',
                fontStyle: 'normal',
                fontSize: 7,
                textColor: [30, 41, 59],
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
                0: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
                1: { cellWidth: 42 },
                2: { cellWidth: 56 },
                3: { cellWidth: 20, halign: 'center' },
                4: { cellWidth: 26, halign: 'center' },
                5: { cellWidth: 26, halign: 'center' }
            },
            margin: { left: MARGIN, right: MARGIN },
            didParseCell: function(data) {
                if (data.column.index === 3 && data.section === 'body') {
                    const color = STATUS_COLORS[String(data.cell.raw || '').toUpperCase()];
                    if (color) {
                        data.cell.styles.textColor = color;
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            },
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

        doc.save('SYSNECT_Executive_Report_' + new Date().getTime() + '.pdf');
    }

    // ไม่ต้องเรียก initChart() ตรงนี้แล้ว เพราะเราเรียกใน fetchLiveTickets()
    // initChart();

    // ดึง Element ปุ่มและกรอบใหญ่มาใช้งาน
    const toggleBtn = document.getElementById('centerToggleBtn');
    const dashboardWrapper = document.getElementById('dashboardWrapper');
    const btnText = toggleBtn?.querySelector('.btn-text');

    // เมื่อคลิกปุ่มตรงกลาง
    if (toggleBtn && dashboardWrapper && btnText) {
        toggleBtn.addEventListener('click', function() {
            // เพิ่มเอฟเฟกต์หมุน
            this.classList.add('spin-active');
            setTimeout(() => this.classList.remove('spin-active'), 800);

            // สั่งสลับ Class
            dashboardWrapper.classList.toggle('split-active');
            
            if (dashboardWrapper.classList.contains('split-active')) {
                // ถ้าเปิดอยู่ ให้ปุ่มเปลี่ยนเป็นคำว่า Closed
                btnText.innerText = 'Closed';
                currentStatus = 'ALL';
                renderTicketList('ALL');
                updateChartLegendActive();
            } else {
                // ถ้าปิดอยู่ ให้ปุ่มกลับมาเป็นคำว่า Open
                btnText.innerText = 'Open';
                currentStatus = null;
                updateChartLegendActive();

                // อัปเดต ID เพื่อหยุดการวาด (ถ้ายังวาดไม่เสร็จ)
                window.currentRenderId = (window.currentRenderId || 0) + 1;

                // เคลียร์เนื้อหาทิ้งทันที เพื่อไม่ให้เบราว์เซอร์ต้องคำนวณ Layout ของการ์ด 400+ ใบ
                // ในขณะที่กล่องกำลังหดตัว (แก้ปัญหาแอนิเมชันตอนปิดกระตุก)
                const ticketContainerEl = document.getElementById('ticketContainer');
                if (ticketContainerEl) ticketContainerEl.innerHTML = '';
            }
        });
    }

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
    function initTheme() {
        document.documentElement.setAttribute('data-theme', currentTheme);
        const icon = document.querySelector('.theme-icon');
        if (icon) {
            icon.innerText = currentTheme === 'dark' ? 'light_mode' : 'dark_mode';
        }
    }
    
    document.getElementById('btnThemeToggle')?.addEventListener('click', () => {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem('sysnectTheme', currentTheme);
        initTheme();
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
                list.style.display = isVisible ? 'none' : 'block';
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
