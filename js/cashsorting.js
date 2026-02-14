const db = firebase.database();

const currencyConfig = [
    { value: 500, label: '€500', type: 'note', color: 'text-purple-700', id: '500' },
    { value: 200, label: '€200', type: 'note', color: 'text-yellow-600', id: '200' },
    { value: 100, label: '€100', type: 'note', color: 'text-green-600', id: '100' },
    { value: 50, label: '€50', type: 'note', color: 'text-orange-600', id: '50' },
    { value: 20, label: '€20', type: 'note', color: 'text-blue-600', id: '20' },
    { value: 10, label: '€10', type: 'note', color: 'text-red-500', id: '10' },
    { value: 5, label: '€5', type: 'note', color: 'text-gray-500', id: '5' },
    { value: 2, label: '€2', type: 'coin', color: 'text-gray-700', id: '2' },
    { value: 1, label: '€1', type: 'coin', color: 'text-gray-700', id: '1' },
    { value: 0.50, label: '50c', type: 'coin', color: 'text-yellow-600', id: '0_50' },
    { value: 0.20, label: '20c', type: 'coin', color: 'text-yellow-600', id: '0_20' },
    { value: 0.10, label: '10c', type: 'coin', color: 'text-yellow-600', id: '0_10' },
    { value: 0.05, label: '5c', type: 'coin', color: 'text-red-700', id: '0_05' },
    { value: 0.02, label: '2c', type: 'coin', color: 'text-red-700', id: '0_02' },
    { value: 0.01, label: '1c', type: 'coin', color: 'text-red-700', id: '0_01' }
];

let saveTimeout;
let isTyping = false;

function initCashSort() {
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-IE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    renderInputs();
    listenForUpdates();
}

function renderInputs() {
    const notesDiv = document.getElementById('notes-container');
    const coinsDiv = document.getElementById('coins-container');
    notesDiv.innerHTML = '';
    coinsDiv.innerHTML = '';

    currencyConfig.forEach(item => {
        const html = `
            <div class="flex items-center gap-3 py-1">
                <div class="w-14 font-bold ${item.color} text-right text-lg shrink-0 select-none">${item.label}</div>
                <div class="flex-1 flex items-center h-12 shadow-sm rounded-lg border border-gray-300 overflow-hidden bg-white transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                    <button onclick="adjustQty('${item.id}', -1)" class="w-12 h-full bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-red-500 font-bold text-xl active:bg-gray-200 transition border-r border-gray-200 shrink-0 touch-manipulation">-</button>
                    <input type="number" id="qty-${item.id}" oninput="handleInput('${item.id}')" onfocus="isTyping=true" onblur="isTyping=false" placeholder="0" class="flex-1 w-full h-full text-center bg-white text-gray-900 font-bold text-xl focus:outline-none min-w-0 appearance-none m-0 p-0" min="0" inputmode="numeric" pattern="[0-9]*">
                    <button onclick="adjustQty('${item.id}', 1)" class="w-12 h-full bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-green-600 font-bold text-xl active:bg-gray-200 transition border-l border-gray-200 shrink-0 touch-manipulation">+</button>
                </div>
                <div class="w-20 text-right font-mono text-gray-500 font-bold text-sm md:text-base shrink-0 select-none transition-colors duration-300" id="total-${item.id}">€0.00</div>
            </div>
        `;
        if (item.type === 'note') notesDiv.innerHTML += html;
        else coinsDiv.innerHTML += html;
    });
}

// --- NEW: INTELLIGENT SYNCING ---
function listenForUpdates() {
    const statusEl = document.getElementById('sync-status');

    // Listen to LIVE DRAFT first
    db.ref('system/cash_draft').on('value', (snapshot) => {
        const data = snapshot.val();

        if (data) {
            // DRAFT EXISTS: Use it (someone is typing or just typed)
            statusEl.innerText = "ONLINE";
            statusEl.classList.remove('text-gray-500', 'bg-gray-800');
            statusEl.classList.add('text-green-400', 'bg-green-900/30');
            if (!isTyping) updateInputs(data);
        } else {
            // DRAFT EMPTY: Fallback to TODAY'S REPORT
            fetchTodaysReport();
        }
    });
}

function fetchTodaysReport() {
    const statusEl = document.getElementById('sync-status');
    statusEl.innerText = "CHECKING SAVED...";

    const now = new Date();
    const dateKey = now.toLocaleDateString('en-GB').split('/').join('-');
    const reportId = `report_${dateKey}`;

    db.ref('cash_reports/' + reportId).once('value').then(snap => {
        const report = snap.val();
        if (report && report.breakdown) {
            statusEl.innerText = "LOADED FROM SAVED";
            // Map Labels back to IDs
            const mappedData = {};
            for (let label in report.breakdown) {
                const configItem = currencyConfig.find(c => c.label === label);
                if (configItem) mappedData[configItem.id] = report.breakdown[label];
            }
            updateInputs(mappedData);
        } else {
            statusEl.innerText = "NO DATA";
        }
    });
}

function updateInputs(data) {
    for (let item of currencyConfig) {
        const el = document.getElementById(`qty-${item.id}`);
        const val = data[item.id] !== undefined ? data[item.id] : '';
        if (el.value != val) el.value = val;
    }
    calcLocal();
}

function handleInput(id) {
    calcLocal();
    debouncedSave();
}

function adjustQty(id, change) {
    const input = document.getElementById(`qty-${id}`);
    let current = parseInt(input.value) || 0;
    let newVal = current + change;
    if (newVal < 0) newVal = 0;
    input.value = newVal === 0 ? '' : newVal;

    calcLocal();
    saveDraftToFirebase();
}

function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveDraftToFirebase, 500);
}

function saveDraftToFirebase() {
    const draftData = {};
    currencyConfig.forEach(item => {
        const val = document.getElementById(`qty-${item.id}`).value;
        if (val !== '') draftData[item.id] = parseInt(val);
    });

    const statusEl = document.getElementById('sync-status');
    statusEl.innerText = "SYNC...";
    statusEl.classList.remove('text-green-400');
    statusEl.classList.add('text-yellow-400');

    db.ref('system/cash_draft').set(draftData).then(() => {
        statusEl.innerText = "SYNCED";
        setTimeout(() => {
            statusEl.innerText = "ONLINE";
            statusEl.classList.remove('text-yellow-400');
            statusEl.classList.add('text-green-400');
        }, 1000);
    });
}

function calcLocal() {
    let grandTotal = 0;
    let totalNotes = 0;
    let totalCoins = 0;

    currencyConfig.forEach(item => {
        const qtyInput = document.getElementById(`qty-${item.id}`);
        const totalDisplay = document.getElementById(`total-${item.id}`);
        const qty = parseInt(qtyInput.value) || 0;
        const lineTotal = qty * item.value;

        totalDisplay.innerText = "€" + lineTotal.toFixed(2);

        if (qty > 0) {
            qtyInput.classList.add('bg-blue-50/50');
            totalDisplay.classList.remove('text-gray-500');
            totalDisplay.classList.add('text-gray-900');
        } else {
            qtyInput.classList.remove('bg-blue-50/50');
            totalDisplay.classList.add('text-gray-500');
            totalDisplay.classList.remove('text-gray-900');
        }

        grandTotal += lineTotal;
        if (item.type === 'note') totalNotes += lineTotal;
        else totalCoins += lineTotal;
    });

    document.getElementById('grand-total').innerText = "€" + grandTotal.toFixed(2);
    document.getElementById('total-notes-display').innerText = "€" + totalNotes.toFixed(2);
    document.getElementById('total-coins-display').innerText = "€" + totalCoins.toFixed(2);
}

function resetForm() {
    if (!confirm("Reset all counts for ALL devices?")) return;
    document.querySelectorAll('input[type="number"]').forEach(input => input.value = '');
    calcLocal();
    db.ref('system/cash_draft').remove();
}

function saveCashReport() {
    const grandTotalText = document.getElementById('grand-total').innerText;
    if (grandTotalText === "€0.00") {
        if (!confirm("The total is zero. Save anyway?")) return;
    }

    const breakdown = {};
    currencyConfig.forEach(item => {
        const qty = parseInt(document.getElementById(`qty-${item.id}`).value) || 0;
        if (qty > 0) breakdown[item.label] = qty;
    });

    const now = new Date();
    const dateKey = now.toLocaleDateString('en-GB').split('/').join('-');
    const reportId = `report_${dateKey}`;

    const reportData = {
        id: reportId,
        timestamp: Date.now(),
        dateString: now.toLocaleString('en-IE'),
        total: grandTotalText,
        breakdown: breakdown,
        type: 'Closing Balance'
    };

    db.ref('cash_reports/' + reportId).set(reportData)
        .then(() => {
            alert("Cash Report Saved Successfully!");
            db.ref('system/cash_draft').remove(); // Clear draft as we are now "Clean"
            closeOrNavigate();
        })
        .catch(err => alert("Error saving: " + err.message));
}

function closeOrNavigate() {
    try { window.close(); if (!window.closed) window.location.href = "landing.html"; }
    catch (e) { window.location.href = "landing.html"; }
}
