const token = localStorage.getItem("ich_auth_token");
const role = localStorage.getItem("ich_user_role");
if (!token || role !== 'admin') window.location.href = "index.html";

let rawData = { orders: [], details: [], menu: [] };
let currentPeriod = 'week';
let charts = {};

async function initReports() {
    document.getElementById('sync-status').innerText = "Fetching Data...";
    try {
        const [ordersRes, detailsRes, menuRes] = await Promise.all([
            fetchSheet('Orders'),
            fetchSheet('Order List'),
            fetchSheet('Menu')
        ]);

        if (ordersRes && detailsRes) {
            rawData.orders = ordersRes.slice(1);
            rawData.details = detailsRes.slice(1);
            rawData.menu = menuRes ? menuRes.slice(1) : [];

            document.getElementById('sync-status').innerText = "Data Synced";
            setPeriod('week');
        }
    } catch (e) {
        alert("Error loading data.");
        console.error(e);
    }
}

async function fetchSheet(name) {
    const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "GET_SHEET_DATA", sheetName: name, apiKey: API_SECRET })
    });
    const json = await res.json();
    return json.status === 'SUCCESS' ? json.data : null;
}

function setPeriod(p) {
    currentPeriod = p;

    ['week', 'month', 'year', '5year'].forEach(k => {
        const btn = document.getElementById('btn-' + k);
        if (btn) {
            if (k === p) {
                btn.className = "px-4 py-2 rounded-md text-sm font-bold bg-white shadow-sm text-purple-700 border border-purple-100";
            } else {
                btn.className = "px-4 py-2 rounded-md text-sm font-bold transition hover:bg-white hover:shadow-sm text-gray-500";
            }
        }
    });

    processData();
}

function parseDate(str) {
    const parts = str.split('/');
    if (parts.length !== 3) return new Date();
    return new Date(parts[2], parts[1] - 1, parts[0]);
}


let currentReportData = null;

function processData() {
    const today = new Date();
    let start = new Date();
    let end = new Date(today);
    end.setHours(23, 59, 59, 999);

    if (currentPeriod === 'week') {
        const day = today.getDay() || 7;
        start.setDate(today.getDate() - day + 1);
        start.setHours(0, 0, 0, 0);
    } else if (currentPeriod === 'month') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (currentPeriod === 'year') {
        start = new Date(today.getFullYear(), 0, 1);
    } else if (currentPeriod === '5year') {
        start = new Date(today.getFullYear() - 4, 0, 1); // Current year - 4 = 5 years total
    }

    const activeOrders = rawData.orders.filter(r => {
        const d = parseDate(r[0]);
        return d >= start && d <= end;
    });

    let totalRev = 0;
    let totalOrders = activeOrders.length;

    let trendData = {};
    let periodStats = {};
    let salesByItem = {};
    let salesByHour = new Array(24).fill(0);
    let orderType = { 'Dining': 0, 'Takeaway': 0 };
    let payMethod = {};

    const ensureStat = (key) => {
        if (!periodStats[key]) periodStats[key] = { orders: 0, revenue: 0, dining: 0, takeaway: 0 };
    };

    activeOrders.forEach(o => {
        const dateRaw = o[0];
        const dateObj = parseDate(dateRaw);
        const timeRaw = o[1];
        const type = o[3] === 'Takeaway' ? 'Takeaway' : 'Dining';
        const pay = o[4];
        const total = parseFloat(o[5]) || 0;

        totalRev += total;

        // --- AGGREGATION LOGIC ---
        let groupKey = "";

        if (currentPeriod === 'week') {
            groupKey = dateRaw;
        } else if (currentPeriod === 'month') {
            const dom = dateObj.getDate();
            const weekNum = Math.ceil(dom / 7);
            groupKey = "Week " + weekNum;
        } else if (currentPeriod === 'year') {
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            groupKey = monthNames[dateObj.getMonth()];
        } else if (currentPeriod === '5year') {
            groupKey = dateObj.getFullYear().toString();
        }

        trendData[groupKey] = (trendData[groupKey] || 0) + total;
        ensureStat(groupKey);
        periodStats[groupKey].orders++;
        periodStats[groupKey].revenue += total;
        if (type === 'Takeaway') periodStats[groupKey].takeaway++; else periodStats[groupKey].dining++;

        // Robust Time Parsing (Handles "14:30:00" and "2:30:00 PM")
        let hour = parseInt(timeRaw.split(':')[0]);
        if (timeRaw.toLowerCase().includes('pm') && hour < 12) hour += 12;
        if (timeRaw.toLowerCase().includes('am') && hour === 12) hour = 0;

        if (!isNaN(hour)) salesByHour[hour] += 1;

        orderType[type]++;
        payMethod[pay] = (payMethod[pay] || 0) + 1;
    });

    activeOrders.forEach(o => {
        const detail = rawData.details.find(d => d[0] === o[2]);
        if (detail) {
            const processIds = (ids, qtys) => {
                const idArr = (ids || "").split(',');
                const qtyArr = (qtys || "").split(',');
                idArr.forEach((id, i) => {
                    if (!id) return;
                    const menu = rawData.menu.find(m => m[0] === id);
                    const count = parseFloat(qtyArr[i]) || 0;
                    if (menu) {
                        const name = menu[2];
                        salesByItem[name] = (salesByItem[name] || 0) + count;
                    }
                });
            };
            processIds(detail[4], detail[5]);
            processIds(detail[7], detail[8]);
        }
    });

    document.getElementById('kpi-revenue').innerText = "€" + totalRev.toFixed(2);
    document.getElementById('kpi-orders').innerText = totalOrders;
    document.getElementById('kpi-avg').innerText = totalOrders ? "€" + (totalRev / totalOrders).toFixed(2) : "€0.00";

    const sortedItems = Object.entries(salesByItem).sort((a, b) => b[1] - a[1]);
    document.getElementById('kpi-top-cat').innerText = sortedItems.length > 0 ? sortedItems[0][0] : "-";

    updateCharts(trendData, salesByItem, salesByHour, orderType, payMethod);
    updateTable(periodStats);

    // Store data for export
    currentReportData = {
        summary: {
            totalRevenue: totalRev,
            totalOrders: totalOrders,
            averageOrderValue: totalOrders ? (totalRev / totalOrders) : 0,
            topItem: sortedItems.length > 0 ? sortedItems[0][0] : "-"
        },
        periodStats: periodStats,
        salesByItem: salesByItem,
        salesByHour: salesByHour,
        orderType: orderType,
        payMethod: payMethod
    };
}

// Shared Sorter to ensure Charts and Table match
function getSortedKeys(dataKeys) {
    let keys = [...dataKeys];
    if (currentPeriod === 'week') {
        // Sort Mon -> Sun
        // Map DateString to Day Index (1-7, where Mon=1... Sun=7 for sorting)
        // JS getDay(): 0=Sun, 1=Mon...
        // Custom Order: Mon(1), Tue(2), Wed(3), Thu(4), Fri(5), Sat(6), Sun(7)
        const getInd = (dStr) => {
            const d = parseDate(dStr).getDay();
            return d === 0 ? 7 : d;
        };
        keys.sort((a, b) => getInd(a) - getInd(b));
    } else if (currentPeriod === 'month') {
        keys.sort(); // Week 1, Week 2...
    } else if (currentPeriod === 'year') {
        const mOrder = { "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12 };
        keys.sort((a, b) => mOrder[a] - mOrder[b]);
    } else if (currentPeriod === '5year') {
        keys.sort((a, b) => parseInt(a) - parseInt(b));
    }
    return keys;
}

function updateCharts(trendData, itemData, hours, types, payments) {
    // 1. Trend Chart
    const ctxTrend = document.getElementById('chart-trend').getContext('2d');
    if (charts.trend) charts.trend.destroy();

    const sortedKeys = getSortedKeys(Object.keys(trendData));

    charts.trend = new Chart(ctxTrend, {
        type: 'bar',
        data: {
            labels: sortedKeys.map(k => {
                if (currentPeriod === 'week') {
                    const d = parseDate(k);
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    return days[d.getDay()]; // Just Day Name
                }
                return k;
            }),
            datasets: [{
                label: 'Revenue (€)',
                data: sortedKeys.map(k => trendData[k]),
                backgroundColor: '#8b5cf6',
                borderRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 2. Items Chart (Top 5 ONLY)
    const ctxCat = document.getElementById('chart-category').getContext('2d');
    if (charts.cat) charts.cat.destroy();

    const sortedItems = Object.entries(itemData).sort((a, b) => b[1] - a[1]).slice(0, 5); // Limit 5

    charts.cat = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: sortedItems.map(i => i[0]),
            datasets: [{
                data: sortedItems.map(i => i[1]),
                backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });

    // 3. Hours
    const ctxHour = document.getElementById('chart-hours').getContext('2d');
    if (charts.hour) charts.hour.destroy();
    charts.hour = new Chart(ctxHour, {
        type: 'bar',
        data: {
            labels: hours.map((_, i) => i + ":00"),
            datasets: [{
                label: 'Orders',
                data: hours,
                backgroundColor: 'rgba(245, 158, 11, 0.6)',
                borderRadius: 2
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 4. Type
    const ctxType = document.getElementById('chart-type').getContext('2d');
    if (charts.type) charts.type.destroy();
    charts.type = new Chart(ctxType, {
        type: 'pie',
        data: {
            labels: Object.keys(types),
            datasets: [{
                data: Object.values(types),
                backgroundColor: ['#10b981', '#3b82f6']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 5. Payment
    const ctxPay = document.getElementById('chart-payment').getContext('2d');
    if (charts.pay) charts.pay.destroy();
    charts.pay = new Chart(ctxPay, {
        type: 'bar',
        data: {
            labels: Object.keys(payments),
            datasets: [{
                label: 'Count',
                data: Object.values(payments),
                backgroundColor: '#94a3b8'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
    });
}

function updateTable(stats) {
    const tbody = document.getElementById('summary-body');
    tbody.innerHTML = '';

    const sortedKeys = getSortedKeys(Object.keys(stats));

    sortedKeys.forEach(key => {
        const s = stats[key];
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50";

        let label = key;
        if (currentPeriod === 'week') {
            const d = parseDate(key);
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            label = `${days[d.getDay()]}`; // Changed to just Day Name
        }

        tr.innerHTML = `
            <td class="px-4 py-3 text-left font-bold text-gray-700">${label}</td>
            <td class="px-4 py-3">${s.orders}</td>
            <td class="px-4 py-3 font-bold text-green-600">€${s.revenue.toFixed(2)}</td>
            <td class="px-4 py-3"><span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">${s.dining}</span></td>
            <td class="px-4 py-3"><span class="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">${s.takeaway}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function downloadReport(type) {
    if (type === 'pdf') {
        alert("PDF Download feature requires server-side generation for updated layout. Please export data instead.");
        return;
    }

    if (!currentReportData) {
        alert("No data to export. Please wait for data to sync.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    const nl = "\n";

    // 1. REPORT HEADER
    csvContent += "INDIAN COFFEE HOUSE - SALES REPORT" + nl;
    csvContent += "Generated on," + new Date().toLocaleString() + nl;
    csvContent += "Period," + currentPeriod.toUpperCase() + nl + nl;

    // 2. EXECUTIVE SUMMARY
    csvContent += "EXECUTIVE SUMMARY" + nl;
    csvContent += "Total Revenue,€" + currentReportData.summary.totalRevenue.toFixed(2) + nl;
    csvContent += "Total Orders," + currentReportData.summary.totalOrders + nl;
    csvContent += "Avg Order Value,€" + currentReportData.summary.averageOrderValue.toFixed(2) + nl;
    csvContent += "Top Selling Item," + currentReportData.summary.topItem + nl + nl;

    // 3. SALES BREAKDOWN (By Period)
    csvContent += "SALES BREAKDOWN (" + currentPeriod.toUpperCase() + ")" + nl;
    csvContent += "Time Frame,Orders,Revenue,Dining,Takeaway" + nl;

    // Use the helper to sort keys:
    const sortedKeys = getSortedKeys(Object.keys(currentReportData.periodStats));

    sortedKeys.forEach(key => {
        let label = key;
        // Apply label formatting if 'week' (optional, to match UI)
        if (currentPeriod === 'week') {
            const d = parseDate(key);
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            label = `${days[d.getDay()]} (${key})`;
        }

        const s = currentReportData.periodStats[key];
        csvContent += `${label},${s.orders},${s.revenue.toFixed(2)},${s.dining},${s.takeaway}` + nl;
    });
    csvContent += nl;

    // 4. TOP SELLING ITEMS
    csvContent += "TOP SELLING ITEMS" + nl;
    csvContent += "Item Name,Quantity Sold" + nl;
    const sortedItems = Object.entries(currentReportData.salesByItem).sort((a, b) => b[1] - a[1]);
    sortedItems.forEach(([item, qty]) => {
        csvContent += `${item.replace(/,/g, '')},${qty}` + nl; // Remove commas from names to valid CSV
    });
    csvContent += nl;

    // 5. HOURLY PERFORMANCE
    csvContent += "HOURLY PERFORMANCE" + nl;
    csvContent += "Hour,Orders" + nl;
    currentReportData.salesByHour.forEach((orders, hour) => {
        if (orders > 0) {
            csvContent += `${hour}:00 - ${hour + 1}:00,${orders}` + nl;
        }
    });
    csvContent += nl;

    // 6. PAYMENT METHODS
    csvContent += "PAYMENT METHODS" + nl;
    csvContent += "Method,Count" + nl;
    Object.entries(currentReportData.payMethod).forEach(([method, count]) => {
        csvContent += `${method},${count}` + nl;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ICH_Report_${currentPeriod}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
