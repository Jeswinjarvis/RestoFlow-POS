const token = localStorage.getItem("ich_auth_token");
const role = localStorage.getItem("ich_user_role");
if (!token || role !== 'admin') window.location.href = "index.html";

let rawData = { orders: [], details: [], menu: [] };
let menuMap = {};
let currentView = 'orders';
let currentTableData = [];
let masterTableData = [];
let activeOrderId = null;

function initHistory() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('date-from').valueAsDate = firstDay;
    document.getElementById('date-to').valueAsDate = today;
    loadAllData();
}

async function loadAllData() {
    document.getElementById('loading-state').classList.remove('hidden');
    document.getElementById('sync-status').innerText = "Syncing...";

    try {
        const [ordersRes, detailsRes, menuRes] = await Promise.all([
            fetchSheet('Orders'),
            fetchSheet('Order List'),
            fetchSheet('Menu')
        ]);

        if (ordersRes && detailsRes && menuRes) {
            rawData.orders = ordersRes.slice(1);
            rawData.details = detailsRes.slice(1);
            rawData.menu = menuRes.slice(1);

            menuMap = {};
            rawData.menu.forEach(row => { if (row[0] && row[2]) menuMap[row[0]] = row[2]; });

            document.getElementById('sync-status').innerText = "Synced: " + new Date().toLocaleTimeString();
            switchView('orders');
        }
    } catch (e) {
        console.error(e);
        alert("Connection Error. Please refresh.");
    } finally {
        document.getElementById('loading-state').classList.add('hidden');
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

function switchView(viewName, orderId = null) {
    currentView = viewName;
    const btnOrders = document.getElementById('btn-orders');
    const btnDetails = document.getElementById('btn-details');
    const footer = document.getElementById('table-foot');

    if (viewName === 'orders') {
        btnOrders.className = "px-4 py-2 rounded-md text-sm font-bold shadow-sm active-tab transition";
        btnDetails.className = "px-4 py-2 rounded-md text-sm font-bold inactive-tab transition opacity-50 cursor-not-allowed";
        btnDetails.onclick = () => alert('Select an Order ID first.');
        footer.classList.add('hidden');
        document.getElementById('view-indicator').innerText = "View: Master List";

        masterTableData = rawData.orders.map((row, index) => ({
            sl: index + 1, date: row[0], time: row[1], id: row[2], table: row[3], method: row[4], total: row[5], contact: row[6]
        })).reverse();

        // NOTE: 'Contact Info' included in Table Header
        renderTable(['SL', 'Date', 'Time', 'Order ID', 'Table', 'Method', 'Total', 'Contact Info']);
    }
    else if (viewName === 'details') {
        if (!orderId) return;
        activeOrderId = orderId;

        btnDetails.className = "px-4 py-2 rounded-md text-sm font-bold shadow-sm active-tab transition opacity-100 cursor-pointer";
        btnDetails.onclick = () => { };
        btnOrders.className = "px-4 py-2 rounded-md text-sm font-bold inactive-tab transition";
        footer.classList.remove('hidden');
        document.getElementById('view-indicator').innerText = "View: Details for " + orderId;

        const orderRow = rawData.details.find(r => r[0] === orderId);
        masterTableData = [];

        if (orderRow) {
            const parseGroup = (ids, counts, prices, type) => {
                const idArr = (ids || "").split(',');
                const countArr = (counts || "").split(',');
                const priceArr = (prices || "").split(',');
                idArr.forEach((id, i) => {
                    if (!id) return;
                    const count = parseFloat(countArr[i]) || 0;
                    const price = parseFloat(priceArr[i]) || 0;
                    masterTableData.push({
                        sl: 0, date: orderRow[3], pid: id, name: menuMap[id] || id, count: count, price: price.toFixed(2), type: type, total: (count * price).toFixed(2)
                    });
                });
            };
            parseGroup(orderRow[4], orderRow[5], orderRow[6], 'Dining');
            parseGroup(orderRow[7], orderRow[8], orderRow[9], 'Takeaway');
            masterTableData.forEach((row, i) => row.sl = i + 1);
        }
        renderTable(['SL', 'Product ID', 'Product Name', 'Count', 'Unit Price', 'Type', 'Total']);
        document.getElementById('search-input').value = ""; // Clear Search when entering details
    }
    populateSearchDropdown();
    filterCurrentTable();
}

function filterCurrentTable() {
    const term = document.getElementById('search-input').value.toLowerCase();
    const col = document.getElementById('search-column').value;
    const fromDateStr = document.getElementById('date-from').value;
    const toDateStr = document.getElementById('date-to').value;

    const fromDate = fromDateStr ? new Date(fromDateStr) : null;
    const toDate = toDateStr ? new Date(toDateStr) : null;
    if (fromDate) fromDate.setHours(0, 0, 0, 0);
    if (toDate) toDate.setHours(23, 59, 59, 999);

    currentTableData = masterTableData.filter(row => {
        let dateValid = true;
        if (row.date && (fromDate || toDate)) {
            const parts = row.date.split('/');
            if (parts.length === 3) {
                const rowDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                if (fromDate && rowDate < fromDate) dateValid = false;
                if (toDate && rowDate > toDate) dateValid = false;
            }
        }
        let textMatch = false;
        if (!term) textMatch = true;
        else if (col === 'all') textMatch = Object.values(row).some(val => String(val).toLowerCase().includes(term));
        else textMatch = String(row[col]).toLowerCase().includes(term);

        return dateValid && textMatch;
    });

    renderTableBody();
    updateFooterTotal();
}

function renderTable(headers) {
    document.getElementById('table-head').innerHTML = headers.map(h => `<th class="px-6 py-3 whitespace-nowrap">${h}</th>`).join('');
    filterCurrentTable();
}

function renderTableBody() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    if (currentTableData.length === 0) {
        document.getElementById('empty-state').classList.remove('hidden');
        document.getElementById('record-count').innerText = "0 Records";
        return;
    }
    document.getElementById('empty-state').classList.add('hidden');

    currentTableData.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.className = "bg-white border-b hover:bg-gray-50 transition border-gray-100";

        if (currentView === 'orders') {
            tr.innerHTML = `
                <td class="px-6 py-4 font-mono text-gray-400">${index + 1}</td>
                <td class="px-6 py-4">${row.date}</td>
                <td class="px-6 py-4">${row.time}</td>
                <td class="px-6 py-4"><button onclick="switchView('details', '${row.id}')" class="text-blue-600 font-bold hover:underline">${row.id}</button></td>
                <td class="px-6 py-4"><span class="bg-gray-100 text-gray-800 text-xs font-bold px-2 py-1 rounded">${row.table}</span></td>
                <td class="px-6 py-4">${row.method}</td>
                <td class="px-6 py-4 font-bold text-gray-800">€${parseFloat(row.total).toFixed(2)}</td>
                <td class="px-6 py-4 text-xs text-blue-600 font-medium truncate max-w-[150px]">${row.contact}</td>
            `;
        } else {
            const typeColor = row.type === 'Dining' ? 'text-blue-600 bg-blue-50' : 'text-orange-600 bg-orange-50';
            tr.innerHTML = `
                <td class="px-6 py-4 font-mono text-gray-400">${index + 1}</td>
                <td class="px-6 py-4 font-mono text-xs">${row.pid}</td>
                <td class="px-6 py-4 font-bold text-gray-700">${row.name}</td>
                <td class="px-6 py-4 text-center font-bold">${row.count}</td>
                <td class="px-6 py-4">€${row.price}</td>
                <td class="px-6 py-4"><span class="text-xs font-bold px-2 py-1 rounded ${typeColor}">${row.type}</span></td>
                <td class="px-6 py-4 font-bold text-gray-900">€${row.total}</td>
            `;
        }
        tbody.appendChild(tr);
    });
    document.getElementById('record-count').innerText = `${currentTableData.length} Records`;
}

function updateFooterTotal() {
    const foot = document.getElementById('table-foot');
    if (currentView === 'orders') {
        const total = currentTableData.reduce((sum, row) => sum + parseFloat(row.total || 0), 0);
        foot.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-right text-gray-500 uppercase tracking-wider text-xs">Total Sales</td><td class="px-6 py-4 text-xl font-bold text-green-600">€${total.toFixed(2)}</td><td></td></tr>`;
        foot.classList.remove('hidden');
    } else {
        const total = currentTableData.reduce((sum, row) => sum + parseFloat(row.total || 0), 0);
        foot.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-right text-gray-500 uppercase tracking-wider text-xs">Order Total</td><td class="px-6 py-4 text-xl font-bold text-green-600">€${total.toFixed(2)}</td></tr>`;
        foot.classList.remove('hidden');
    }
}

function populateSearchDropdown() {
    const select = document.getElementById('search-column');
    select.innerHTML = '<option value="all">All Columns</option>';
    if (masterTableData.length > 0) {
        Object.keys(masterTableData[0]).forEach(k => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.innerText = k.charAt(0).toUpperCase() + k.slice(1);
            select.appendChild(opt);
        });
    }
}

// --- PDF GENERATION (NO CONTACT INFO) ---
function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    const today = new Date().toLocaleDateString();
    const title = currentView === 'orders' ? "Sales Report (" + today + ")" : "Order Details - " + activeOrderId;

    // NOTE: Headers DO NOT include 'Contact Info'
    const headers = [['Date', 'Time', 'Order ID', 'Table', 'Method', 'Type', 'Item Name', 'Qty', 'Price', 'Total']];
    const rows = [];
    let grandTotal = 0;

    let targetOrders = [];
    if (currentView === 'orders') {
        targetOrders = currentTableData;
    } else {
        const originalOrder = rawData.orders.find(r => r[2] === activeOrderId);
        if (originalOrder) targetOrders = [{ date: originalOrder[0], time: originalOrder[1], id: originalOrder[2], table: originalOrder[3], method: originalOrder[4] }];
    }

    targetOrders.forEach(order => {
        const detailRow = rawData.details.find(d => d[0] === order.id);
        if (detailRow) {
            let isFirstItem = true;
            const processItems = (ids, counts, prices, type) => {
                const idArr = (ids || "").split(',');
                const countArr = (counts || "").split(',');
                const priceArr = (prices || "").split(',');

                idArr.forEach((pid, i) => {
                    if (!pid) return;
                    const name = menuMap[pid] || pid;
                    const count = parseFloat(countArr[i]);
                    const price = parseFloat(priceArr[i]);
                    const total = count * price;
                    grandTotal += total;

                    rows.push([
                        isFirstItem ? order.date : '',
                        isFirstItem ? order.time : '',
                        isFirstItem ? order.id : '',
                        isFirstItem ? order.table : '',
                        isFirstItem ? order.method : '',
                        type,
                        name,
                        count,
                        price.toFixed(2),
                        total.toFixed(2)
                    ]);
                    isFirstItem = false;
                });
            };
            processItems(detailRow[4], detailRow[5], detailRow[6], 'Dining');
            processItems(detailRow[7], detailRow[8], detailRow[9], 'Takeaway');
            rows.push(['', '', '', '', '', '', '', '', '', '']);
        }
    });

    rows.push(['', '', '', '', '', '', '', '', 'GRAND TOTAL:', grandTotal.toFixed(2)]);

    doc.text(title, 14, 15);
    doc.autoTable({
        head: headers,
        body: rows,
        startY: 20,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [234, 88, 12] },
        columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 20 }, 2: { cellWidth: 30 } },
        didParseCell: function (data) {
            if (data.row.index === rows.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = [0, 100, 0];
            }
        }
    });

    doc.save("Admin_Report.pdf");
}
