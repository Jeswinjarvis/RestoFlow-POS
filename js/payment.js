const token = localStorage.getItem("ich_auth_token");
if (!token) window.location.href = "index.html";

const db = firebase.database();

let orderId = sessionStorage.getItem("ich_payment_order_id");
let orderData = null;
let selectedMethod = null;
let receivedItems = {};
let returnItems = {};
let currentStock = {};

// CONFIG: matchKey is critical to link Saved Reports to this page
const currencyConfig = [
    { id: '500', val: 500, matchKey: '€500', lbl: '€500 Note' },
    { id: '200', val: 200, matchKey: '€200', lbl: '€200 Note' },
    { id: '100', val: 100, matchKey: '€100', lbl: '€100 Note' },
    { id: '50', val: 50, matchKey: '€50', lbl: '€50 Note' },
    { id: '20', val: 20, matchKey: '€20', lbl: '€20 Note' },
    { id: '10', val: 10, matchKey: '€10', lbl: '€10 Note' },
    { id: '5', val: 5, matchKey: '€5', lbl: '€5 Note' },
    { id: '2', val: 2, matchKey: '€2', lbl: '€2 Coin' },
    { id: '1', val: 1, matchKey: '€1', lbl: '€1 Coin' },
    { id: '0_50', val: 0.50, matchKey: '50c', lbl: '50c Coin' },
    { id: '0_20', val: 0.20, matchKey: '20c', lbl: '20c Coin' },
    { id: '0_10', val: 0.10, matchKey: '10c', lbl: '10c Coin' },
    { id: '0_05', val: 0.05, matchKey: '5c', lbl: '5c Coin' },
    { id: '0_02', val: 0.02, matchKey: '2c', lbl: '2c Coin' },
    { id: '0_01', val: 0.01, matchKey: '1c', lbl: '1c Coin' }
];

if (!orderId) window.location.href = "landing.html";

db.ref('orders/' + orderId).once('value').then(snap => {
    orderData = snap.val();
    if (orderData) { renderBill(); loadInventory(); }
    else { alert("Error: Order not found."); window.location.href = "landing.html"; }
});

// --- INVENTORY LOADING (Draft -> Report Fallback) ---
function loadInventory() {
    const drawerStatus = document.getElementById('drawer-status');

    db.ref('system/cash_draft').once('value').then(snap => {
        if (snap.exists() && snap.val()) {
            currentStock = snap.val();
            drawerStatus.innerText = "Drawer: Live";
            drawerStatus.classList.add('text-green-500');
        } else {
            const now = new Date();
            const dateKey = now.toLocaleDateString('en-GB').split('/').join('-');
            const reportId = `report_${dateKey}`;

            db.ref('cash_reports/' + reportId + '/breakdown').once('value').then(rsnap => {
                const reportData = rsnap.val();
                if (reportData) {
                    currentStock = {};
                    for (let label in reportData) {
                        const conf = currencyConfig.find(c => c.matchKey === label);
                        if (conf) {
                            currentStock[conf.id] = reportData[label];
                        }
                    }
                    drawerStatus.innerText = "Drawer: From Saved";
                    drawerStatus.classList.add('text-blue-500');
                } else {
                    drawerStatus.innerText = "Drawer: Unknown (0)";
                    currentStock = {};
                }
            });
        }
    });
}

function renderBill() {
    const container = document.getElementById('order-details');
    const displayTable = orderData.table === 'Takeaway' ? 'Takeaway' : 'Table ' + orderData.table.replace('_', '.');
    const itemsHtml = Object.values(orderData.items).map(i => `<div class="flex justify-between items-center py-1"><span class="text-gray-700 text-sm"><span class="font-bold text-gray-900">${i.count}x</span> ${i.name}</span><span class="font-medium text-sm">€${(i.price * i.count).toFixed(2)}</span></div>`).join('');

    container.innerHTML = `<div class="text-center mb-4"><span class="bg-gray-100 px-4 py-1.5 rounded-full text-sm font-bold uppercase text-gray-700 tracking-wide border border-gray-200">${displayTable}</span></div><div class="space-y-1 border-b border-dashed border-gray-300 pb-4 max-h-48 overflow-y-auto pr-2 custom-scrollbar">${itemsHtml}</div>`;
    document.getElementById('bill-total').innerText = "€" + orderData.total.toFixed(2);
    document.getElementById('final-total').innerText = "€" + orderData.total.toFixed(2);
}

function selectMethod(method) {
    selectedMethod = method;
    document.querySelectorAll('.pay-btn').forEach(b => {
        b.classList.remove('bg-gray-800', 'text-white', 'border-gray-800');
        b.classList.add('text-gray-700');
    });
    document.getElementById('btn-' + method.toLowerCase()).classList.add('bg-gray-800', 'text-white', 'border-gray-800');

    const cashCalc = document.getElementById('cash-calculator');
    if (method === 'Cash') {
        cashCalc.classList.remove('hidden');
        document.getElementById('pay-btn').disabled = true;
        loadInventory(); // Refresh stock immediately
    } else {
        cashCalc.classList.add('hidden');
        document.getElementById('pay-btn').disabled = false;
    }
}

function addReceived(amount, label, id) {
    receivedItems[id] = (receivedItems[id] || 0) + 1;
    renderReceived();
    updateTotalInput();
}

function removeReceived(id) {
    if (receivedItems[id]) {
        receivedItems[id]--;
        if (receivedItems[id] <= 0) delete receivedItems[id];
        renderReceived();
        updateTotalInput();
    }
}

function renderReceived() {
    const container = document.getElementById('received-denominations');
    container.innerHTML = '';

    if (Object.keys(receivedItems).length === 0) {
        container.innerHTML = '<span class="text-xs text-gray-400 italic">Tap denominations below...</span>';
        return;
    }

    // Sort by value desc (using config)
    const sortedIds = Object.keys(receivedItems).sort((a, b) => {
        const valA = currencyConfig.find(c => c.id === a).val;
        const valB = currencyConfig.find(c => c.id === b).val;
        return valB - valA; // Descending
    });

    sortedIds.forEach(id => {
        const count = receivedItems[id];
        const conf = currencyConfig.find(c => c.id === id);
        const displayVal = conf.val < 1 ? (conf.val * 100) + 'c' : '€' + conf.val;

        const badge = document.createElement('button');
        badge.onclick = () => removeReceived(id);
        badge.className = "bg-green-100 text-green-800 text-xs px-3 py-1.5 rounded-full font-bold border border-green-200 flex items-center gap-2 hover:bg-red-100 hover:text-red-800 hover:border-red-200 transition group";
        badge.innerHTML = `<span>${count} <span class="text-green-600 font-normal">x</span> ${displayVal}</span> <i class="fas fa-times opacity-50 group-hover:opacity-100"></i>`;
        container.appendChild(badge);
    });
}

function updateTotalInput() {
    let total = 0;
    for (let id in receivedItems) {
        const conf = currencyConfig.find(c => c.id === id);
        total += (receivedItems[id] * conf.val);
    }
    document.getElementById('cash-given').value = total.toFixed(2);
    calculateChange();
}

function clearCash() {
    receivedItems = {};
    returnItems = {};
    renderReceived();
    updateTotalInput();
}

function calculateChange() {
    const given = parseFloat(document.getElementById('cash-given').value) || 0;
    const total = orderData.total;
    const changeBox = document.getElementById('change-box');
    const payBtn = document.getElementById('pay-btn');

    if (given >= total) {
        const change = given - total;
        document.getElementById('change-amount').innerText = "€" + change.toFixed(2);
        changeBox.classList.remove('hidden');
        payBtn.disabled = false;
        suggestChange(change);
    } else {
        changeBox.classList.add('hidden');
        payBtn.disabled = true;
    }
}

function suggestChange(changeAmount) {
    let remaining = Math.round(changeAmount * 100);
    returnItems = {};
    let suggestions = [];
    let tempStock = { ...currentStock };

    // Add what we just received to virtual stock
    for (let id in receivedItems) {
        tempStock[id] = (tempStock[id] || 0) + receivedItems[id];
    }

    for (let d of currencyConfig) {
        let coinValCents = Math.round(d.val * 100);
        let available = tempStock[d.id] || 0;

        if (remaining >= coinValCents && available > 0) {
            let needed = Math.floor(remaining / coinValCents);
            let take = Math.min(needed, available);
            if (take > 0) {
                remaining -= (take * coinValCents);
                returnItems[d.id] = take;
                suggestions.push(`<div class="flex justify-between border-b border-gray-100 py-1 last:border-0"><span>${d.lbl}</span><span class="font-bold">x${take}</span></div>`);
            }
        }
    }

    const container = document.getElementById('change-breakdown');
    if (remaining > 0) {
        container.innerHTML = `<span class="text-red-600 font-bold block mb-1"><i class="fas fa-exclamation-triangle"></i> Not enough small change!</span>Missing: €${(remaining / 100).toFixed(2)}`;
        container.classList.add('bg-red-50', 'border-red-200');
    } else if (suggestions.length > 0) {
        container.innerHTML = `<div class="font-bold text-gray-500 mb-1 uppercase text-[10px]">Return to Customer:</div>` + suggestions.join("");
        container.classList.remove('bg-red-50', 'border-red-200');
        container.classList.add('bg-blue-50', 'border-blue-200');
    } else {
        container.innerHTML = "Exact Amount Given";
        container.classList.remove('bg-red-50', 'border-red-200', 'bg-blue-50');
    }
}

function toggleReceiptInput() {
    const type = document.getElementById('receipt-type').value;
    document.getElementById('input-whatsapp').classList.toggle('hidden', type !== 'whatsapp');
    document.getElementById('input-email').classList.toggle('hidden', type !== 'email');
}

// --- FINAL PAYMENT PROCESS ---
async function processPayment() {
    const btn = document.getElementById('pay-btn');
    const receiptType = document.getElementById('receipt-type').value;

    btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Processing...';
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    btn.disabled = true;

    try {
        // 1. UPDATE CASH INVENTORY
        if (selectedMethod === 'Cash') {
            let finalStock = { ...currentStock };

            // Logic to ensure we don't start from empty if we loaded from report
            if (Object.keys(finalStock).length === 0) {
                const now = new Date();
                const dateKey = now.toLocaleDateString('en-GB').split('/').join('-');
                const snap = await db.ref(`cash_reports/report_${dateKey}/breakdown`).once('value');
                const reportData = snap.val();
                if (reportData) {
                    for (let label in reportData) {
                        const conf = currencyConfig.find(c => c.matchKey === label);
                        if (conf) finalStock[conf.id] = reportData[label];
                    }
                }
            }

            // Add Received
            for (let id in receivedItems) {
                finalStock[id] = (finalStock[id] || 0) + receivedItems[id];
            }
            // Subtract Returned
            for (let id in returnItems) {
                finalStock[id] = (finalStock[id] || 0) - returnItems[id];
                if (finalStock[id] < 0) finalStock[id] = 0;
            }

            // Save to Draft (Live Update)
            await db.ref('system/cash_draft').set(finalStock);
        }

        // 2. LOG TO SHEETS
        const contact = receiptType === 'whatsapp' ? document.getElementById('customer-phone').value : (receiptType === 'email' ? document.getElementById('customer-email').value : 'No Receipt');
        fetch(APPS_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "SAVE_ORDER",
                apiKey: API_SECRET, // Ensure this line is present
                orderData: { ...orderData, method: selectedMethod, contact: contact }
            })
        }).catch(e => console.error(e));

        // 3. WHATSAPP
        if (receiptType === 'whatsapp' && document.getElementById('customer-phone').value) {
            let cleanPhone = document.getElementById('customer-phone').value.replace(/\D/g, '');
            if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
            if (!cleanPhone.startsWith('353')) cleanPhone = '353' + cleanPhone;

            const dateStr = new Date().toLocaleString('en-IE', { dateStyle: 'short', timeStyle: 'short' });

            let message = `🧾 *RECEIPT #${orderData.id.slice(-6)}*\n`;
            message += `🇮🇳☕ *INDIAN COFFEE HOUSE*\n`;
            message += `📍 Tallaght, Dublin\n\n`;
            message += `🗓️ ${dateStr}\n`;
            message += `💳 Method: ${selectedMethod.toUpperCase()}\n`;
            message += `━━━━━━━━━━━━━━━━━━━\n\n`;
            message += `*ORDER ITEMS:*\n`;

            Object.values(orderData.items).forEach(i => {
                message += `▪️ ${i.count}x ${i.name}  -  €${(i.price * i.count).toFixed(2)}\n`;
            });

            message += `\n━━━━━━━━━━━━━━━━━━━\n`;
            message += `💰 *TOTAL PAYMENT: €${orderData.total.toFixed(2)}*\n`;
            message += `━━━━━━━━━━━━━━━━━━━\n\n`;
            message += `✅ *PAID SUCCESSFULLY*\n\n`;
            message += `🙏 _Thank you for dining with us!_\n`;
            message += `👋 See you soon!`;

            window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
        }

        // 4. CLOSE ORDER
        await db.ref('orders/' + orderId).update({ status: 'paid', method: selectedMethod, closedAt: firebase.database.ServerValue.TIMESTAMP });

        if (orderData.table && orderData.table !== 'Takeaway') {
            await db.ref('tables/' + orderData.table).set({ status: "free" });
        }

        // Success UI
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Done!';
        btn.classList.remove('bg-gray-800'); btn.classList.add('bg-green-600');
        setTimeout(() => { closeOrNavigate(); }, 1500);

    } catch (error) {
        alert("Error: " + error.message);
        btn.disabled = false;
        btn.innerHTML = 'Try Again';
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}

function closeOrNavigate() {
    try { window.close(); if (!window.closed) window.location.href = "landing.html"; }
    catch (e) { window.location.href = "landing.html"; }
}
