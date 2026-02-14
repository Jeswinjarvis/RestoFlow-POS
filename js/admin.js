const token = localStorage.getItem("ich_auth_token");
const role = localStorage.getItem("ich_user_role");
if (!token || role !== 'admin') {
    window.location.href = "index.html";
}

const db = firebase.database();

let globalMenu = [];
let globalOrders = [];
let globalMenuMap = {};
let chartInstances = {};

Chart.defaults.animation.duration = 1500;
Chart.defaults.animation.easing = 'easeOutQuart';
Chart.defaults.font.family = "'Inter', sans-serif";

function initAdmin() {
    document.body.style.display = 'flex';

    const todayISO = new Date().toISOString().split('T')[0];
    const catDate = document.getElementById('catDate');
    const topDate = document.getElementById('topDate');

    if (catDate) catDate.value = todayISO;
    if (topDate) topDate.value = todayISO;

    fetchMenuData();
    loadDashboardData();
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('backdrop');
    if (sb.classList.contains('drawer-closed')) {
        sb.classList.remove('drawer-closed');
        bd.classList.remove('hidden');
    } else {
        sb.classList.add('drawer-closed');
        bd.classList.add('hidden');
    }
}

function toggleSubmenu() {
    document.getElementById('submenu-menu').classList.toggle('open');
    document.getElementById('chevron').classList.toggle('rotate-180');
}

function showSection(id, btn) {
    document.querySelectorAll('.section-view').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('animate-fade-in');
    });

    const section = document.getElementById(id);
    section.classList.remove('hidden');
    void section.offsetWidth;
    section.classList.add('animate-fade-in');

    if (btn) {
        document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
    }
    if (window.innerWidth < 1024) toggleSidebar();

    // Auto-load data for specific sections
    if (id === 'employees') fetchStaffList();
    if (id === 'system-tools') fetchAuditLogs();
}

function logout() {
    if (confirm("Logout from Admin Panel?")) {
        localStorage.clear();
        window.location.href = "index.html";
    }
}


async function loadDashboardData() {
    try {
        // Fetch Orders
        const ordersRes = await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "GET_SHEET_DATA",
                apiKey: API_SECRET,
                sheetName: "Orders"
            })
        });
        const ordersJson = await ordersRes.json();

        // Fetch Menu
        const menuRes = await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "GET_SHEET_DATA",
                apiKey: API_SECRET,
                sheetName: "Menu"
            })
        });
        const menuJson = await menuRes.json();

        if (ordersJson.status === 'SUCCESS' && menuJson.status === 'SUCCESS') {
            // Start from index 1 to skip headers
            globalOrders = ordersJson.data.slice(1);

            const menuData = menuJson.data.slice(1);
            globalMenuMap = {};
            menuData.forEach(row => {
                // row[0]=ID, row[1]=Category, row[2]=Name, row[5]=Price
                if (row[0]) globalMenuMap[row[0]] = { name: row[2], category: row[1], price: parseFloat(row[5]) || 0 };
            });

            processAnalytics();
            updateCategoryChart();
            updateTopItemsChart();
        } else {
            console.error("Data fetch failed:", ordersJson.message || menuJson.message);
        }
    } catch (e) { console.error("Dashboard Load Error", e); }
}


function fetchMenuData() {
    fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
            action: "GET_MENU",
            apiKey: API_SECRET // ADDED
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.status === "SUCCESS") {
                globalMenu = data.menu;
                const dl = document.getElementById('category-list');
                if (dl) dl.innerHTML = data.categories.map(c => `<option value="${c}">`).join('');
                initFilters(); // Initial population
                renderEditTable();
                renderViewGrid();
            }
        });
}

function handleAddMenu(e) {
    e.preventDefault();
    const btn = document.getElementById('addMenuBtn');
    const msg = document.getElementById('menuMsg');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const payload = {
        action: "ADD_MENU_ITEM",
        apiKey: API_SECRET, // ADDED
        category: document.getElementById('menuCat').value,
        name: document.getElementById('menuName').value,
        desc: document.getElementById('menuDesc').value,
        dietary: document.getElementById('menuDiet').value,
        price: document.getElementById('menuPrice').value
    };

    fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
        .then(res => res.json())
        .then(data => {
            btn.disabled = false; btn.innerHTML = '<span>Add to Menu</span> <i class="fas fa-plus"></i>';
            if (data.status === "SUCCESS") {
                msg.className = "text-green-600 font-bold mt-2";
                msg.innerText = "Success!";
                e.target.reset();
                fetchMenuData();
            } else {
                msg.className = "text-red-600 font-bold mt-2"; msg.innerText = data.message;
            }
        });
}

function processAnalytics() {
    let todayRev = 0, todayOrders = 0;
    let salesByHourTotal = new Array(24).fill(0);

    // Generate Today's Date manually to ensure dd/mm/yyyy format matches sheet normalization
    const now = new Date();
    const tDay = String(now.getDate()).padStart(2, '0');
    const tMonth = String(now.getMonth() + 1).padStart(2, '0');
    const tYear = now.getFullYear();
    const todayDate = `${tDay}/${tMonth}/${tYear}`;

    // 1. Determine Current Week (Mon-Sun)
    const curr = new Date();
    const dayOfWeek = curr.getDay() || 7; // 1=Mon ... 7=Sun
    const monday = new Date(curr);
    monday.setDate(curr.getDate() - dayOfWeek + 1);

    // Map full date -> amount, Key: dd/mm/yyyy
    const weekData = {};
    const dateKeys = [];

    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const fullStr = `${dd}/${mm}/${yyyy}`;
        weekData[fullStr] = 0;
        dateKeys.push(fullStr);
    }

    globalOrders.forEach(o => {
        let sheetDate = o[0];
        // normalize sheet date: remove time, pad zero
        if (sheetDate && sheetDate.includes(' ')) sheetDate = sheetDate.split(' ')[0];
        if (sheetDate) {
            const parts = sheetDate.split('/');
            if (parts.length === 3) {
                const d = parts[0].padStart(2, '0');
                const m = parts[1].padStart(2, '0');
                const y = parts[2];
                sheetDate = `${d}/${m}/${y}`;
            }
        }

        const amt = parseFloat(o[5] || 0);

        // If this date is in our current week
        if (weekData.hasOwnProperty(sheetDate)) {
            weekData[sheetDate] += amt;
        }

        if (sheetDate === todayDate) {
            todayRev += amt;
            todayOrders++;

            // Hour logic (Moved inside TODAY check)
            let hour = 0;
            if (o[1]) {
                const timeParts = o[1].split(':');
                if (timeParts.length > 0) {
                    hour = parseInt(timeParts[0]);
                    if (o[1].toLowerCase().includes('pm') && hour < 12) hour += 12;
                    if (o[1].toLowerCase().includes('am') && hour === 12) hour = 0;
                }
            }
            if (hour >= 0 && hour < 24) salesByHourTotal[hour] += amt;
        }
    });

    const todayRevEl = document.getElementById('kpi-today-rev');
    if (todayRevEl) todayRevEl.innerText = "€" + todayRev.toLocaleString('en-IE', { minimumFractionDigits: 2 });

    const todayOrdersEl = document.getElementById('kpi-today-orders');
    if (todayOrdersEl) todayOrdersEl.innerText = todayOrders;

    // Prepare ordered object for chart: { "dd/mm": amount }
    const chartData = {};
    dateKeys.forEach(fullKey => {
        // fullKey = dd/mm/yyyy -> dd/mm
        const shortKey = fullKey.substring(0, 5);
        chartData[shortKey] = weekData[fullKey];
    });

    renderStaticCharts(chartData, salesByHourTotal);
}

function formatDateToMatchSheet(isoDate) {
    if (!isoDate) return null;
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
}

function updateCategoryChart() {
    const rawDate = document.getElementById('catDate').value;
    const selectedDate = formatDateToMatchSheet(rawDate);
    const catAmounts = {};
    let hasData = false;

    globalOrders.forEach(o => {
        let sheetDate = o[0];
        // normalize sheet date: remove time, pad zero
        if (sheetDate && sheetDate.includes(' ')) sheetDate = sheetDate.split(' ')[0];
        if (sheetDate) {
            const parts = sheetDate.split('/');
            if (parts.length === 3) {
                const d = parts[0].padStart(2, '0');
                const m = parts[1].padStart(2, '0');
                const y = parts[2];
                sheetDate = `${d}/${m}/${y}`;
            }
        }

        // Match either normalized DD/MM/YYYY or YYYY-MM-DD
        if (sheetDate === selectedDate || o[0] === rawDate) {
            const ids = (o[7] || "").split(',');
            const counts = (o[8] || "").split(',');
            ids.forEach((id, i) => {
                if (!id) return;
                const qty = parseFloat(counts[i]) || 0;
                const info = globalMenuMap[id] || { category: 'Uncategorized', price: 0 };
                const revenue = qty * info.price;
                catAmounts[info.category] = (catAmounts[info.category] || 0) + revenue;
                hasData = true;
            });
        }
    });

    document.getElementById('no-data-cat').classList.toggle('hidden', hasData);

    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;

    if (chartInstances.cat) chartInstances.cat.destroy();

    chartInstances.cat = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catAmounts),
            datasets: [{
                data: Object.values(catAmounts),
                backgroundColor: (window.ThemeSettings && window.ThemeSettings.chartColors) ? window.ThemeSettings.chartColors.category : ['#F97316', '#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EC4899', '#8B5CF6'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: 10 },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ` ${context.label}: €${context.raw.toLocaleString('en-IE', { minimumFractionDigits: 2 })}`;
                        }
                    }
                }
            }
        }
    });
}

function updateTopItemsChart() {
    const rawDate = document.getElementById('topDate').value;
    const selectedDate = formatDateToMatchSheet(rawDate);
    const itemCounts = {};
    let hasData = false;

    globalOrders.forEach(o => {
        let sheetDate = o[0];
        // normalize sheet date: remove time, pad zero
        if (sheetDate && sheetDate.includes(' ')) sheetDate = sheetDate.split(' ')[0];
        if (sheetDate) {
            const parts = sheetDate.split('/');
            if (parts.length === 3) {
                const d = parts[0].padStart(2, '0');
                const m = parts[1].padStart(2, '0');
                const y = parts[2];
                sheetDate = `${d}/${m}/${y}`;
            }
        }

        if (sheetDate === selectedDate || o[0] === rawDate) {
            const ids = (o[7] || "").split(',');
            const counts = (o[8] || "").split(',');
            ids.forEach((id, i) => {
                if (!id) return;
                const qty = parseFloat(counts[i]) || 0;
                const info = globalMenuMap[id] || { name: id };
                itemCounts[info.name] = (itemCounts[info.name] || 0) + qty;
                hasData = true;
            });
        }
    });

    document.getElementById('no-data-top').classList.toggle('hidden', hasData);

    const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const todayStr = new Date().toLocaleDateString('en-IE');
    const kpiTop = document.getElementById('kpi-today-top');
    if ((selectedDate === todayStr || rawDate === new Date().toISOString().split('T')[0]) && sorted.length > 0) {
        if (kpiTop) kpiTop.innerText = sorted[0][0];
    } else if (selectedDate === todayStr || rawDate === new Date().toISOString().split('T')[0]) {
        if (kpiTop) kpiTop.innerText = "--";
    }

    const ctx = document.getElementById('topItemsChart');
    if (!ctx) return;

    if (chartInstances.top) chartInstances.top.destroy();

    chartInstances.top = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(i => i[0]),
            datasets: [{
                label: 'Qty Sold',
                data: sorted.map(i => i[1]),
                backgroundColor: '#10B981',
                borderRadius: 6,
                barPercentage: 0.6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { beginAtZero: true, grid: { display: false } }, y: { grid: { display: false } } },
            plugins: { legend: { display: false } }
        }
    });
}

function renderStaticCharts(dateData, hourlyData) {
    const ctx1 = document.getElementById('salesChart');
    if (ctx1) {
        if (chartInstances.sales) chartInstances.sales.destroy();
        chartInstances.sales = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: Object.keys(dateData),
                datasets: [{
                    label: 'Revenue',
                    data: Object.values(dateData),
                    borderColor: (window.ThemeSettings && window.ThemeSettings.chartColors) ? window.ThemeSettings.chartColors.revenue : '#EA580C',
                    tension: 0.4,
                    fill: true,
                    backgroundColor: (window.ThemeSettings && window.ThemeSettings.chartColors) ? window.ThemeSettings.chartColors.revenueBg : 'rgba(234, 88, 12, 0.05)',
                    pointBackgroundColor: '#fff',
                    pointBorderColor: (window.ThemeSettings && window.ThemeSettings.chartColors) ? window.ThemeSettings.chartColors.revenue : '#EA580C',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false } } }
            }
        });
    }

    const ctx3 = document.getElementById('hourlyChart');
    if (ctx3) {
        if (chartInstances.hourly) chartInstances.hourly.destroy();

        let max = 0, peakH = -1;
        hourlyData.forEach((v, i) => { if (v > max) { max = v; peakH = i; } });
        const kpiPeak = document.getElementById('kpi-today-peak');
        if (kpiPeak) kpiPeak.innerText = peakH >= 0 ? `${peakH}:00 - ${peakH + 1}:00` : "N/A";

        chartInstances.hourly = new Chart(ctx3, {
            type: 'bar',
            data: {
                labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                datasets: [{
                    label: 'Total Sales (€)',
                    data: hourlyData,
                    backgroundColor: hourlyData.map(v => v > 0 ? ((window.ThemeSettings && window.ThemeSettings.chartColors) ? window.ThemeSettings.chartColors.orders : '#3B82F6') : '#E5E7EB'),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }
            }
        });
    }
}


// Initialize search listeners
document.addEventListener('DOMContentLoaded', () => {
    const editSearch = document.getElementById('editSearchInput');
    if (editSearch) editSearch.addEventListener('keyup', renderEditTable);

    const viewSearch = document.getElementById('viewSearchInput');
    if (viewSearch) viewSearch.addEventListener('keyup', renderViewGrid);
});

// --- FILTERING LOGIC ---

function initFilters() {
    updateDropdownOptions(null);
    renderEditTable();
}

function handleFilterChange(changedSource) {
    updateDropdownOptions(changedSource);
    renderEditTable();
}

function updateDropdownOptions(source) {
    if (!globalMenu) return;

    const selCat = document.getElementById('filter-category').value;
    const selName = document.getElementById('filter-name').value;
    const selDiet = document.getElementById('filter-dietary').value;

    const getOptions = (targetField) => {
        let subset = globalMenu;
        if (targetField !== 'category' && selCat) subset = subset.filter(i => i.category === selCat);
        if (targetField !== 'name' && selName) subset = subset.filter(i => i.name === selName);
        if (targetField !== 'dietary' && selDiet) subset = subset.filter(i => i.dietary === selDiet);
        return [...new Set(subset.map(i => i[targetField]))].sort();
    };

    const updateSelect = (id, options, currentVal, label) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = `<option value="">${label}</option>` + options.map(x => `<option value="${x}">${x}</option>`).join('');
        if (options.includes(currentVal)) el.value = currentVal;
        else if (id === `filter-${source}`) el.value = currentVal;
        else el.value = "";
    };

    updateSelect('filter-category', getOptions('category'), selCat, 'Category ▾');
    updateSelect('filter-name', getOptions('name'), selName, 'Name ▾');
    updateSelect('filter-dietary', getOptions('dietary'), selDiet, 'Dietary ▾');
}

function renderEditTable() {
    const tbody = document.getElementById('edit-table-body');
    if (!tbody) return;

    const searchInput = document.getElementById('editSearchInput');
    const term = (searchInput ? searchInput.value : "").toLowerCase();

    const fCat = document.getElementById('filter-category').value;
    const fName = document.getElementById('filter-name').value;
    const fDiet = document.getElementById('filter-dietary').value;

    const filtered = globalMenu.filter(item => {
        // 1. Text Search
        const matchesSearch = item.name.toLowerCase().includes(term) ||
            item.category.toLowerCase().includes(term) ||
            item.id.toLowerCase().includes(term);

        // 2. Dropdown Filters
        const matchesCat = fCat ? item.category === fCat : true;
        const matchesName = fName ? item.name === fName : true;
        const matchesDiet = fDiet ? item.dietary === fDiet : true;

        return matchesSearch && matchesCat && matchesName && matchesDiet;
    });

    tbody.innerHTML = filtered.map(item => `
        <tr class="hover:bg-gray-50 transition border-b border-gray-100">
            <td class="p-4 text-xs font-mono text-gray-400">${item.id}</td>
            <td class="p-4"><input type="text" value="${item.category}" id="cat-${item.id}" class="border p-1 w-full rounded text-sm"></td>
            <td class="p-4"><input type="text" value="${item.name}" id="name-${item.id}" class="border p-1 w-full rounded text-sm font-bold"></td>
            <td class="p-4">
                <select id="diet-${item.id}" class="border p-1 rounded text-xs">
                    <option value="Non-Veg" ${item.dietary == 'Non-Veg' ? 'selected' : ''}>Non-Veg</option>
                    <option value="Veg" ${item.dietary == 'Veg' ? 'selected' : ''}>Veg</option>
                    <option value="Vegan" ${item.dietary == 'Vegan' ? 'selected' : ''}>Vegan</option>
                    <option value="GF" ${item.dietary == 'GF' ? 'selected' : ''}>GF</option>
                </select>
            </td>
            <td class="p-4"><input type="number" value="${item.price}" id="price-${item.id}" class="border p-1 w-20 rounded text-sm"></td>
            <td class="p-4 text-center">
                <input type="hidden" id="desc-${item.id}" value="${item.desc}">
                <div class="flex justify-center gap-2">
                    <button onclick="updateItem('${item.id}')" class="text-blue-600 hover:text-blue-800"><i class="fas fa-save"></i></button>
                    <button onclick="deleteItem('${item.id}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-400">No matching items found</td></tr>';
    }
}

function updateItem(id) {
    if (!confirm("Update this item?")) return;
    const payload = {
        action: "UPDATE_MENU_ITEM",
        apiKey: API_SECRET, // ADDED
        id: id,
        category: document.getElementById(`cat-${id}`).value,
        name: document.getElementById(`name-${id}`).value,
        desc: document.getElementById(`desc-${id}`).value,
        dietary: document.getElementById(`diet-${id}`).value,
        price: document.getElementById(`price-${id}`).value
    };
    fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
        .then(() => { alert("Updated!"); fetchMenuData(); });
}

function deleteItem(id) {
    if (!confirm("Delete this item?")) return;
    fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "DELETE_MENU_ITEM", apiKey: API_SECRET, id: id }) })
        .then(() => {
            alert("Deleted!");
            logAction("DELETE_ITEM", "Deleted item: " + id);
            fetchMenuData();
        });
}

function renderViewGrid() {
    const container = document.getElementById('view-grid');
    if (!container) return;

    const searchInput = document.getElementById('viewSearchInput');
    const term = (searchInput ? searchInput.value : "").toLowerCase();

    const filtered = globalMenu.filter(item =>
        item.name.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term)
    );

    container.innerHTML = filtered.map(item => `
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <span class="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-500 uppercase">${item.category}</span>
            <h3 class="text-lg font-bold text-gray-800 mt-2">${item.name}</h3>
            <p class="text-xs text-gray-400 italic mb-2">${item.desc}</p>
            <div class="text-xl font-bold text-gray-900">€${Number(item.price).toFixed(2)}</div>
        </div>
    `).join('');

    if (filtered.length === 0) {
        container.innerHTML = '<div class="col-span-3 text-center text-gray-400 py-10">No matching items found</div>';
    }
}

function handleAddEmployee(e) {
    e.preventDefault();
    const btn = document.getElementById('addEmpBtn');
    const msg = document.getElementById('empMsg');
    btn.disabled = true; btn.innerText = "Processing...";

    const p = {
        action: "ADD_EMPLOYEE",
        apiKey: API_SECRET, // ADDED
        name: document.getElementById('empName').value,
        email: document.getElementById('empEmail').value,
        role: document.getElementById('empRole').value,
        pin: document.getElementById('empPin').value
    };

    fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p) })
        .then(r => r.json())
        .then(d => {
            btn.disabled = false; btn.innerText = "Create & Send Email";
            if (d.status === "SUCCESS") {
                msg.className = "text-green-600 mt-2"; msg.innerText = "Success! ID: " + d.newId;
                logAction("CREATE_STAFF", "Created staff: " + p.name);
                e.target.reset();
                fetchStaffList();
            } else {
                msg.className = "text-red-600 mt-2"; msg.innerText = d.message;
            }
        });
}

// --- STAFF MANAGEMENT ---
function fetchStaffList() {
    const tbody = document.getElementById('staff-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-400"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action: "GET_STAFF", apiKey: API_SECRET })
    })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'SUCCESS') {
                if (!data.staff || data.staff.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-400">No staff found.</td></tr>';
                    return;
                }
                // data.staff = [{id, name, email, role}]
                tbody.innerHTML = data.staff.map(u => `
                <tr class="hover:bg-gray-50 border-b border-gray-100 transition">
                    <td class="p-3 font-bold text-gray-800">${u.name}</td>
                    <td class="p-3"><span class="px-2 py-1 rounded text-xs font-bold uppercase ${u.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}">${u.role}</span></td>
                    <td class="p-3 text-gray-500">${u.email}</td>
                    <td class="p-3 text-right">
                        <button onclick="resetPin('${u.id}', '${u.name}')" class="text-orange-500 hover:text-orange-700 text-xs font-bold mr-3"><i class="fas fa-key"></i> PIN</button>
                        <button onclick="deleteStaff('${u.id}', '${u.name}')" class="text-red-500 hover:text-red-700 text-xs font-bold"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
            } else {
                tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-500">Error: ${data.message}</td></tr>`;
            }
        })
        .catch(err => {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-500">Connection Error</td></tr>`;
        });
}

function deleteStaff(id, name) {
    if (!confirm(`Are you sure you want to DELETE ${name}? This cannot be undone.`)) return;
    fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action: "DELETE_STAFF", apiKey: API_SECRET, id: id })
    }).then(r => r.json()).then(d => {
        if (d.status === 'SUCCESS') {
            alert("Staff deleted.");
            logAction("DELETE_STAFF", "Deleted staff: " + name);
            fetchStaffList();
        }
        else alert("Failed: " + d.message);
    });
}

function resetPin(id, name) {
    const newPin = prompt(`Enter new PIN for ${name}:`);
    if (!newPin) return;
    fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({ action: "RESET_PIN", apiKey: API_SECRET, id: id, newPin: newPin })
    }).then(r => r.json()).then(d => {
        if (d.status === 'SUCCESS') alert("PIN Updated.");
        else alert("Failed: " + d.message);
    });
}

// --- AUDIT LOGGING ---
function logAction(action, details) {
    const user = localStorage.getItem('ich_user_name') || 'Admin'; // Fallback
    const timestamp = new Date().toISOString();
    db.ref('logs').push({
        user: user,
        action: action,
        details: details,
        timestamp: timestamp
    });
}

function fetchAuditLogs() {
    const tbody = document.getElementById('audit-log-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">Loading...</td></tr>';

    db.ref('logs').limitToLast(50).once('value').then(snapshot => {
        const logs = [];
        snapshot.forEach(child => logs.push(child.val()));
        logs.reverse(); // Newest first

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400">No logs found.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(l => {
            const time = new Date(l.timestamp).toLocaleString();
            return `
                <tr class="border-b border-gray-100 hover:bg-gray-50 text-xs">
                    <td class="p-3 text-gray-500 font-mono">${time}</td>
                    <td class="p-3 font-bold text-gray-800">${l.user}</td>
                    <td class="p-3"><span class="bg-gray-100 text-gray-600 px-2 py-1 rounded font-bold">${l.action}</span></td>
                    <td class="p-3 text-gray-600 truncate max-w-xs" title="${l.details}">${l.details}</td>
                </tr>
            `;
        }).join('');
    });
}

function resetTables() {
    if (!confirm("Are you sure? This sets all tables to FREE.")) return;
    const defaultTables = {
        "T1": { status: "free" }, "T1_1": { status: "free" }, "T1_2": { status: "free" },
        "T2": { status: "free" }, "T2_1": { status: "free" }, "T2_2": { status: "free" },
        "T3": { status: "free" }, "T4": { status: "free" }, "T5": { status: "free" }, "T6": { status: "free" }
    };
    db.ref('tables').set(defaultTables).catch(err => alert("Reset Failed: " + err.message));
    db.ref('config/layout').set({ splitT1: false, splitT2: false }).catch(err => console.error(err));

    // Log this major action
    logAction("RESET_FLOOR", "Reset all tables to free");

    alert("Floor Plan Reset!");
}
