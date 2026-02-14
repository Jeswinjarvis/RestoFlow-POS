const db = firebase.database();

let currentOrderMode = 'table', currentTable = null;
let cartTable = {}, cartTakeaway = {};
let isManagerMode = false, tableConfig = { splitT1: false, splitT2: false }, tableData = {};
let globalSettings = [], liveOrders = [];

let openAccordionId = null;
let kdsFilter = 'all';
let orderViewMode = 'table';
let currentPosCategory = 'All';

let editContext = { oid: null, key: null, qty: 0 };
let serveContext = { oid: null, key: null, max: 0, count: 1 };
let returnContext = { oid: null, key: null, count: 1, max: 0 };
let addContext = { oid: null, key: null, count: 1 };
let payContext = { oid: null, amount: 0 };

let lastTotalItemCount = 0;
let isFirstLoad = true;
let clickTimer = null;
let serveClickTimer = null;

let isMobileCartOpen = false;


function escapeId(str) {
    return str ? str.replace(/'/g, "\\'") : '';
}

function initPOS() {
    document.body.style.display = 'flex';
    const savedRing = localStorage.getItem("ich_ring_sound") || "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";
    const audio = document.getElementById('notification-sound');
    audio.src = savedRing;

    document.addEventListener('click', enableAudio, { once: true });
}

window.onload = initPOS;

db.ref(".info/connected").on("value", snap => {
    const el = document.getElementById('connection-status');
    if (snap.val()) {
        el.innerText = 'ONLINE';
        el.className = "hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30";
    } else {
        el.innerText = 'OFFLINE';
        el.className = "hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30";
    }
});
db.ref('config/layout').on('value', snap => { tableConfig = snap.val() || { splitT1: false, splitT2: false }; renderGrid(); }, err => console.error("Layout Read Error:", err));
db.ref('tables').on('value', snap => { tableData = snap.val() || {}; document.getElementById('loading-overlay').classList.add('hidden'); renderGrid(); }, err => {
    console.error("Tables Read Error:", err);
    document.getElementById('loading-overlay').innerHTML = `<div class="text-center text-red-500 font-bold"><i class="fas fa-exclamation-triangle text-3xl mb-2"></i><br>Database Error:<br>${err.message}</div>`;
});
db.ref('menu_settings').on('value', snap => {
    globalSettings = snap.val() ? Object.values(snap.val()) : [];
    filterMenuConfig(); // Fixed: Re-apply current filter instead of resetting to all
    renderDailyList();
    renderPOSMenu('All');
    renderCategoryTabs();
    renderDailyCategoryTabs();
    renderConfigCategoryTabs();
}, err => console.error("Menu Read Error:", err));

db.ref('orders').on('value', snap => {
    const data = snap.val() || {};
    liveOrders = Object.values(data).filter(o => o.status !== 'closed' && o.status !== 'paid');
    liveOrders.sort((a, b) => a.timestamp - b.timestamp);

    let currentTotalItemCount = 0;
    liveOrders.forEach(order => {
        if (order.status === 'active') {
            Object.values(order.items || {}).forEach(item => {
                currentTotalItemCount += (item.count || 0);
            });
        }
    });

    const isRingEnabled = localStorage.getItem("ich_ring_enabled") !== 'false';
    if (isRingEnabled && currentTotalItemCount > lastTotalItemCount && !isFirstLoad) {
        const audio = document.getElementById('notification-sound');
        audio.currentTime = 0;
        audio.play().catch(e => {
            document.getElementById('sound-warning').classList.remove('hidden');
        });
    }

    lastTotalItemCount = currentTotalItemCount;
    isFirstLoad = false;

    let pendingCount = 0;
    liveOrders.forEach(order => { Object.values(order.items || {}).forEach(i => pendingCount += (i.count - (i.served || 0))); });
    document.getElementById('pending-count').innerText = pendingCount > 99 ? '99+' : pendingCount;
    renderLiveOrders(); renderCompletedOrders();
}, err => {
    console.error("Orders Read Error:", err);
    alert("Failed to load orders: " + err.message + "\nCheck Firebase Console Rules.");
});

document.getElementById('current-date-display').innerText = new Date().toLocaleDateString('en-IE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
checkDailyReset(true);

// --- MOBILE CART TOGGLE ---
function toggleMobileCart() {
    isMobileCartOpen = !isMobileCartOpen;
    const cart = document.getElementById('mini-cart');
    const arrow = document.getElementById('mobile-cart-arrow');
    const label = document.getElementById('mobile-cart-label');

    if (isMobileCartOpen) {
        cart.classList.remove('hidden');
        arrow.classList.add('rotate-180');
        label.innerText = "Hide Items";
    } else {
        cart.classList.add('hidden');
        arrow.classList.remove('rotate-180');
        label.innerText = "View Items";
    }
}

// --- SMART TABLE CLICKS ---
function handleTableClick(tableId) {
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
        const status = tableData[tableId]?.status || 'free';
        if (status === 'occupied') openLiveOrdersForTable(tableId);
        else openOrderPanel(tableId);
    }, 220);
}

function handleTableDoubleClick(tableId) {
    if (clickTimer) clearTimeout(clickTimer);
    const status = tableData[tableId]?.status || 'free';
    if (status === 'occupied') {
        document.getElementById('live-orders-modal').classList.add('hidden');
        openOrderPanel(tableId);
    }
}

function openLiveOrdersForTable(tableId) {
    setOrderViewMode('table');
    setKdsFilter('all');
    const modal = document.getElementById('live-orders-modal');
    modal.classList.remove('hidden');
    const order = liveOrders.find(o => o.table === tableId && o.status === 'active');
    if (order) {
        openAccordionId = order.id;
        renderLiveOrders();
        setTimeout(() => {
            const el = document.getElementById(`acc-${order.id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    } else {
        renderLiveOrders();
    }
}

// --- ORDER PANEL & SEARCH ---
function openOrderPanel(tableId) {
    currentTable = tableId;
    document.getElementById('current-table-display').innerText = tableId ? tableId.replace('_', '.') : "None (Select)";
    if (tableId) switchCartMode('table'); else { renderPOSMenu(); updateCartSummary(); }
    toggleOrderPanel(true);
}

function switchCartMode(mode) {
    currentOrderMode = mode;
    const btnTable = document.getElementById('btn-mode-table'), btnTake = document.getElementById('btn-mode-takeaway'), area = document.getElementById('table-selector-area');
    if (mode === 'table') { btnTable.className = "flex-1 py-2 rounded-md text-sm font-bold shadow-sm bg-white text-gray-800 transition"; btnTake.className = "flex-1 py-2 rounded-md text-sm font-bold text-gray-500 hover:text-gray-800 transition"; area.classList.remove('hidden'); }
    else { btnTake.className = "flex-1 py-2 rounded-md text-sm font-bold shadow-sm bg-white text-gray-800 transition"; btnTable.className = "flex-1 py-2 rounded-md text-sm font-bold text-gray-500 hover:text-gray-800 transition"; area.classList.add('hidden'); }
    renderPOSMenu(); updateCartSummary();
}

function togglePOSSearch() {
    const bar = document.getElementById('pos-search-bar');
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) {
        document.getElementById('pos-search-input').focus();
    } else {
        document.getElementById('pos-search-input').value = "";
        renderPOSMenu(currentPosCategory);
    }
}

function renderCategoryTabs() {
    const tabs = document.getElementById('category-tabs');
    const categories = ['All', ...new Set(globalSettings.map(i => i.category))];
    tabs.innerHTML = categories.map(cat => `<button onclick="renderPOSMenu('${cat}')" class="px-4 py-2 rounded-full bg-white border border-gray-200 text-sm font-bold whitespace-nowrap hover:bg-orange-50 focus:bg-orange-500 focus:text-white transition">${cat}</button>`).join('');
}

function renderPOSMenu(category) {
    if (category) currentPosCategory = category;
    const searchTerm = document.getElementById('pos-search-input').value.toLowerCase();
    const container = document.getElementById('pos-menu-grid');
    const activeCart = currentOrderMode === 'table' ? cartTable : cartTakeaway;
    const today = String(new Date().getDay());

    let items = globalSettings.filter(item => {
        const count = parseInt(item.count);
        const isActiveDay = String(item.days || "").split(',').includes(today);
        const isAvailable = (count === -1 || count > 0);
        const isNotNone = item.type !== 'None';
        return isNotNone && isActiveDay && isAvailable;
    });

    if (searchTerm) { items = items.filter(i => i.name.toLowerCase().includes(searchTerm)); }
    else if (currentPosCategory && currentPosCategory !== 'All') { items = items.filter(i => i.category === currentPosCategory); }

    container.innerHTML = items.map(item => {
        const inCart = activeCart[item.id] ? activeCart[item.id].count : 0;
        const activeClass = inCart > 0 ? "border-orange-500 bg-orange-50" : "border-gray-100 bg-white";
        const heldTotal = (cartTable[item.id]?.count || 0) + (cartTakeaway[item.id]?.count || 0);
        const remaining = item.count === -1 ? '∞' : (item.count - heldTotal);
        const safeId = escapeId(item.id);

        return `
        <div class="p-3 rounded-xl border ${activeClass} shadow-sm transition relative select-none">
            <div onclick="modifyCart('${safeId}', 1)" class="cursor-pointer">
                <div class="font-bold text-gray-700 text-sm leading-tight">${item.name}</div>
                <div class="text-xs text-gray-400 mt-1">€${Number(item.price).toFixed(2)}</div>
                <div class="text-[10px] mt-1 font-bold ${remaining <= 0 ? 'text-red-500' : 'text-gray-400'}">${item.count === -1 ? 'Unlimited' : remaining + ' Left'}</div>
            </div>
            ${inCart > 0 ? `<div class="absolute top-2 right-2 flex flex-col items-center gap-1"><button onclick="modifyCart('${safeId}', 1)" class="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs shadow"><i class="fas fa-plus"></i></button><span class="font-bold text-gray-800 text-sm">${inCart}</span><button onclick="modifyCart('${safeId}', -1)" class="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs hover:bg-gray-300"><i class="fas fa-minus"></i></button></div>` : ''}
        </div>`;
    }).join('');
}

function modifyCart(id, change) {
    let activeCart = currentOrderMode === 'table' ? cartTable : cartTakeaway;
    const item = globalSettings.find(i => i.id === id);
    const heldTotal = (cartTable[id]?.count || 0) + (cartTakeaway[id]?.count || 0);

    const currentStock = parseInt(item.count);

    if (!activeCart[id]) activeCart[id] = { ...item, count: 0, served: 0, orderType: currentOrderMode };

    if (change > 0 && currentStock !== -1 && heldTotal >= currentStock) { return; }

    activeCart[id].count += change;
    if (activeCart[id].count <= 0) delete activeCart[id];
    renderPOSMenu(); updateCartSummary();
}

// --- UPDATED CART SUMMARY ---
function updateCartSummary() {
    const activeCart = currentOrderMode === 'table' ? cartTable : cartTakeaway;
    const cartDiv = document.getElementById('mini-cart');

    const totalItems = Object.values(activeCart).reduce((acc, item) => acc + item.count, 0);

    const badge = document.getElementById('mobile-cart-count-badge');
    if (badge) {
        badge.innerText = totalItems;
        if (totalItems > 0) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
    }

    const deskCount = document.getElementById('cart-item-count-desktop');
    if (deskCount) deskCount.innerText = totalItems + " Items";

    let total = 0;
    let html = "";

    if (Object.keys(activeCart).length === 0) {
        cartDiv.innerHTML = '<div class="flex flex-col items-center justify-center h-40 text-gray-400 italic"><i class="fas fa-basket-shopping text-3xl mb-2 opacity-20"></i><span class="text-xs">Cart is empty</span></div>';
        document.getElementById('clear-cart-btn').classList.add('hidden');
    } else {
        document.getElementById('clear-cart-btn').classList.remove('hidden');
        for (let id in activeCart) {
            const item = activeCart[id];
            total += item.price * item.count;
            const safeId = escapeId(item.id);

            html += `
            <div class="flex justify-between items-center py-3 text-sm border-b border-gray-50 last:border-0 group">
                <div class="flex items-center gap-3 overflow-hidden">
                        <div class="flex items-center border border-gray-200 rounded-lg bg-gray-50">
                        <button onclick="modifyCart('${safeId}', -1)" class="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-l-lg transition">-</button>
                        <span class="font-bold text-gray-800 text-xs w-6 text-center">${item.count}</span>
                        <button onclick="modifyCart('${safeId}', 1)" class="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-r-lg transition">+</button>
                        </div>
                    <span class="text-gray-700 font-medium truncate">${item.name}</span>
                </div>
                <span class="font-mono font-bold text-gray-800 whitespace-nowrap ml-2">€${(item.price * item.count).toFixed(2)}</span>
            </div>`;
        }
        cartDiv.innerHTML = html;
    }

    document.getElementById('total-price').innerText = "€" + total.toFixed(2);
    const btn = document.getElementById('place-order-btn');
    const valid = currentOrderMode === 'takeaway' || (currentOrderMode === 'table' && currentTable);
    btn.disabled = !(Object.keys(activeCart).length > 0 && valid);
    btn.innerHTML = !valid ? 'Select Table' : `Place Order <i class="fas fa-arrow-right ml-2"></i>`;
}

function clearCurrentCart() {
    if (!confirm("Clear current order?")) return;
    if (currentOrderMode === 'table') cartTable = {};
    else cartTakeaway = {};
    renderPOSMenu();
    updateCartSummary();
}

function placeOrder() {
    const existingOrder = liveOrders.find(o => o.table === currentTable && o.status === 'active');
    let updates = {};
    let addedTotal = 0;
    const timestamp = Date.now();

    const processCart = (cart, type) => {
        for (let id in cart) {
            const cartItem = cart[id];
            addedTotal += (cartItem.price * cartItem.count);
            const safeKey = (id + "_" + (type === 'dining' ? 'tbl' : 'tky')).replace(/[.#$/[\]]/g, "_");

            let currentCount = 0;
            if (existingOrder && existingOrder.items && existingOrder.items[safeKey]) { currentCount = existingOrder.items[safeKey].count; }

            if (existingOrder) {
                const currentServed = (existingOrder.items[safeKey] && existingOrder.items[safeKey].served) ? existingOrder.items[safeKey].served : 0;
                updates[`orders/${existingOrder.id}/items/${safeKey}`] = { ...cartItem, count: currentCount + cartItem.count, orderType: type, served: currentServed };
            }

            const settingItem = globalSettings.find(i => i.id === id);
            if (settingItem) {
                const currentStock = parseInt(settingItem.count);
                if (currentStock !== -1) {
                    let newStock = currentStock - cartItem.count;
                    if (newStock < 0) newStock = 0;
                    db.ref(`menu_settings/${id}/count`).set(newStock);
                }
            }
        }
    };

    let newItemsForFreshOrder = {};

    if (existingOrder) {
        processCart(cartTable, 'dining');
        processCart(cartTakeaway, 'takeaway');
        updates[`orders/${existingOrder.id}/total`] = existingOrder.total + addedTotal;
        if (Object.keys(updates).length > 0) db.ref().update(updates);
    } else {
        let freshId = "ORD-" + timestamp;

        const buildItems = (cart, type) => {
            for (let id in cart) {
                const cartItem = cart[id];
                addedTotal += (cartItem.price * cartItem.count);
                const safeKey = (id + "_" + (type === 'dining' ? 'tbl' : 'tky')).replace(/[.#$/[\]]/g, "_");
                newItemsForFreshOrder[safeKey] = { ...cartItem, orderType: type };

                const settingItem = globalSettings.find(i => i.id === id);
                if (settingItem) {
                    const currentStock = parseInt(settingItem.count);
                    if (currentStock !== -1) {
                        let newStock = currentStock - cartItem.count;
                        if (newStock < 0) newStock = 0;
                        db.ref(`menu_settings/${id}/count`).set(newStock);
                    }
                }
            }
        };

        buildItems(cartTable, 'dining');
        buildItems(cartTakeaway, 'takeaway');
        if (Object.keys(newItemsForFreshOrder).length > 0) {
            const now = new Date();
            const time24h = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            db.ref(`orders/${freshId}`).set({ id: freshId, table: currentTable || 'Takeaway', items: newItemsForFreshOrder, total: addedTotal, timestamp: timestamp, time: time24h, status: 'active' });
        }
    }
    if (currentTable) db.ref('tables/' + currentTable).update({ status: "occupied" });
    cartTable = {}; cartTakeaway = {}; toggleOrderPanel(false); openLiveOrders();
}

// --- SIDEBAR TOGGLE ---
function toggleSidebar() {
    const sb = document.getElementById('left-sidebar');
    const body = document.body;

    // Mobile: Standard drawer toggle
    if (window.innerWidth < 768) {
        sb.classList.toggle('drawer-closed-left');
    }
    // Desktop: Expand/Collapse logic
    else {
        sb.classList.toggle('sidebar-expanded');
        body.classList.toggle('sidebar-open');
    }
}

// --- NEW: Handle Nav Click on Desktop (Auto-Collapse) ---
function handleNavClick(viewId) {
    showView(viewId);
    // If on desktop and expanded, collapse sidebar after click
    if (window.innerWidth >= 768) {
        const sb = document.getElementById('left-sidebar');
        if (sb.classList.contains('sidebar-expanded')) {
            toggleSidebar();
        }
    }
}

// --- NEW: ORDER VIEW MODES ---
function setOrderViewMode(mode) {
    orderViewMode = mode;
    const btnTable = document.getElementById('view-mode-table');
    const btnItem = document.getElementById('view-mode-item');
    if (mode === 'table') {
        btnTable.className = "px-4 py-1.5 text-xs font-bold rounded bg-white text-gray-900 shadow transition";
        btnItem.className = "px-4 py-1.5 text-xs font-bold rounded text-gray-400 hover:text-white transition";
    } else {
        btnItem.className = "px-4 py-1.5 text-xs font-bold rounded bg-white text-gray-900 shadow transition";
        btnTable.className = "px-4 py-1.5 text-xs font-bold rounded text-gray-400 hover:text-white transition";
    }
    renderLiveOrders();
}

function setKdsFilter(filter) {
    kdsFilter = filter;
    ['all', 'table', 'takeaway'].forEach(type => {
        const btn = document.getElementById('kds-filter-' + type);
        if (type === filter) { btn.className = "px-3 py-1 rounded text-xs font-bold bg-orange-500 text-white shadow transition"; }
        else { btn.className = "px-3 py-1 rounded text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-700 transition"; }
    });
    renderLiveOrders();
}

function openLiveOrders() { document.getElementById('live-orders-modal').classList.remove('hidden'); renderLiveOrders(); }

function renderLiveOrders() {
    if (orderViewMode === 'item') { renderOrdersByItem(); return; }
    const container = document.getElementById('live-orders-container');
    const activeOrders = liveOrders.filter(order => {
        const hasPending = Object.values(order.items || {}).some(i => (i.count - (i.served || 0)) > 0);
        if (order.status !== 'active') return false;
        if (order.table === 'Takeaway' && !hasPending) return false;
        if (kdsFilter === 'all') return true;
        if (kdsFilter === 'table') return order.table !== 'Takeaway';
        if (kdsFilter === 'takeaway') return order.table === 'Takeaway';
        return true;
    });

    if (activeOrders.length === 0) { container.innerHTML = '<div class="text-center text-gray-400 py-10 italic">No pending orders.</div>'; return; }

    container.innerHTML = activeOrders.map(order => {
        const totalPending = Object.values(order.items || {}).reduce((acc, i) => acc + (i.count - (i.served || 0)), 0);
        const isOpen = (order.id === openAccordionId);
        const isTableOrder = order.table !== 'Takeaway';
        const sortedItems = Object.entries(order.items || {}).sort(([, a], [, b]) => {
            const pendingA = a.count - (a.served || 0);
            const pendingB = b.count - (b.served || 0);
            if (pendingA === 0 && pendingB > 0) return 1;
            if (pendingA > 0 && pendingB === 0) return -1;
            return 0;
        });

        // const safeOrderId = escapeId(order.id); // USE RAW ID FOR LOGIC

        const itemsHtml = sortedItems.map(([key, item]) => {
            const pending = item.count - (item.served || 0);
            const isFullyServed = pending <= 0;
            const typeBadge = item.orderType === 'takeaway' ? '<span class="text-xs bg-blue-100 text-blue-800 px-1 rounded ml-2">Takeaway</span>' : '';
            // const safeKey = escapeId(key); // USE RAW KEY FOR LOGIC

            return `
            <div class="flex justify-between items-center py-4 border-b border-gray-100 last:border-0 ${isFullyServed ? 'opacity-50 bg-gray-50' : ''}">
                <div>
                    <div class="font-bold text-gray-800 flex items-center gap-2 text-lg">
                        ${item.name} ${typeBadge}
                        ${isFullyServed ? '<span class="text-[10px] bg-green-100 text-green-700 px-2 rounded-full">SERVED</span>' : ''}
                    </div>
                    <div class="flex items-center gap-2 mt-1.5 text-sm text-gray-500">
                        <span>Ordered: <strong class="text-gray-900">${item.count}</strong></span>
                        ${!isFullyServed ? `<button onclick="openEditModal('${order.id}', '${key}')" class="text-blue-500 hover:text-blue-700"><i class="fas fa-pen text-xs"></i></button>` : ''}
                        <span class="text-gray-300">|</span>
                        <span>Served: <strong>${item.served || 0}</strong></span>
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    <button onclick="deleteLiveItem('${order.id}', '${key}')" class="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-500 transition rounded-full hover:bg-red-50"><i class="fas fa-trash"></i></button>
                    ${!isFullyServed ? `<button onclick="handleServeClick('${order.id}', '${key}')" class="bg-green-600 text-white h-9 px-4 rounded-lg text-xs font-bold shadow hover:bg-green-700 transition tracking-wide select-none active:scale-95">SERVE</button>` : ''}
                </div>
            </div>`;
        }).join('');

        let footer = '';
        if (isTableOrder && totalPending === 0) {
            footer = `<div class="p-3 bg-blue-50 border-t border-blue-100 text-center"><div class="text-green-600 font-bold text-sm mb-2"><i class="fas fa-check-circle"></i> Service Complete</div><button onclick="finishTableOrder('${order.id}', '${order.table}')" class="w-full bg-blue-600 text-white py-2 rounded-lg font-bold shadow hover:bg-blue-700 transition">Finished</button></div>`;
        }

        return `
        <div id="card-${order.id}" class="bg-white rounded-xl shadow-sm border border-gray-200 mb-4 overflow-hidden">
            <div onclick="toggleAccordion('${order.id}')" class="p-4 bg-gray-50 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition">
                <div class="flex items-center gap-4">
                    <div class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-gray-800 text-white">${order.table.replace('_', '.')}</div>
                    <div class="text-sm text-gray-500">ID: ${order.id.slice(-6)}</div>
                </div>
                <div class="text-sm font-bold ${totalPending === 0 ? 'text-green-600' : 'text-red-500'}">
                    ${totalPending === 0 ? 'All Served' : totalPending + ' Pending'} 
                    <i id="icon-${order.id}" class="fas fa-chevron-down ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}"></i>
                </div>
            </div>
            <div id="acc-${order.id}" class="accordion-content bg-white ${isOpen ? 'accordion-open' : ''}">
                ${(isOpen && totalPending > 0) ? `<div class="px-4 py-2 bg-green-50 border-b border-green-100 flex justify-end"><button onclick="serveAllItems('${order.id}')" class="text-xs font-bold text-green-700 border border-green-600 rounded px-3 py-1.5 hover:bg-green-600 hover:text-white transition flex items-center gap-2 shadow-sm"><i class="fas fa-check-double"></i> Serve All Remaining</button></div>` : ''}
                <div class="px-4">${itemsHtml}</div>
                ${footer}
            </div>
        </div>`;
    }).join('');
}

function renderOrdersByItem() {
    const container = document.getElementById('live-orders-container');
    const summary = {};
    liveOrders.forEach(order => {
        if (order.status !== 'active') return;
        if (kdsFilter === 'table' && order.table === 'Takeaway') return;
        if (kdsFilter === 'takeaway' && order.table !== 'Takeaway') return;
        Object.values(order.items || {}).forEach(item => {
            const pending = item.count - (item.served || 0);
            if (pending > 0) {
                if (!summary[item.name]) summary[item.name] = { name: item.name, total: 0, locations: [] };
                summary[item.name].total += pending;
                let locLabel = order.table.replace('_', '.');
                if (order.table !== 'Takeaway' && item.orderType === 'takeaway') { locLabel += ' (Takeaway)'; }
                summary[item.name].locations.push(`${locLabel} <span class="text-gray-400 text-[10px]">x${pending}</span>`);
            }
        });
    });
    if (Object.keys(summary).length === 0) { container.innerHTML = '<div class="text-center text-gray-400 py-10 italic">No pending items found.</div>'; return; }
    container.innerHTML = Object.values(summary).map(item => `
        <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-3 flex flex-col md:flex-row justify-between items-center gap-3">
            <div class="flex-1">
                <div class="font-bold text-gray-800 text-lg">${item.name}</div>
                <div class="text-xs text-gray-500 mt-1 leading-relaxed">${item.locations.join('<span class="mx-1.5 text-gray-300">|</span>')}</div>
            </div>
            <div class="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
                <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Total</span>
                <span class="text-2xl font-bold text-orange-600">${item.total}</span>
            </div>
        </div>
    `).join('');
}

function toggleAccordion(id) { if (openAccordionId === id) { openAccordionId = null; } else { openAccordionId = id; } renderLiveOrders(); }

// --- FILTERING FOR MENUS (SET & DAILY) ---
let currentDailyCategory = 'All';
let currentConfigCategory = 'All';

function renderDailyCategoryTabs() {
    const tabs = document.getElementById('daily-category-tabs');
    if (!tabs) return;
    // Get categories from today's available items only? or all? 
    // Better to show all categories present in settings to be consistent, or arguably only active ones.
    // Let's show all for now to match Set Menu.
    const categories = ['All', ...new Set(globalSettings.map(i => i.category))].filter(Boolean);

    tabs.innerHTML = categories.map(cat =>
        `<button onclick="setDailyCategory('${cat}')" 
            class="px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${currentDailyCategory === cat ? 'bg-orange-500 text-white border-orange-600 shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:bg-orange-50'}">
            ${cat}
        </button>`
    ).join('');
}

function setDailyCategory(cat) {
    currentDailyCategory = cat;
    renderDailyCategoryTabs();
    renderDailyList();
}

function renderConfigCategoryTabs() {
    const tabs = document.getElementById('config-category-tabs');
    if (!tabs) return;
    const categories = ['All', ...new Set(globalSettings.map(i => i.category))].filter(Boolean);
    tabs.innerHTML = categories.map(cat =>
        `<button onclick="setConfigCategory('${cat}')" 
            class="px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${currentConfigCategory === cat ? 'bg-orange-500 text-white border-orange-600 shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:bg-orange-50'}">
            ${cat}
        </button>`
    ).join('');
}

function setConfigCategory(cat) {
    currentConfigCategory = cat;
    renderConfigCategoryTabs();
    filterMenuConfig();
}

function filterMenuConfig() {
    const term = document.getElementById('config-search').value.toLowerCase();
    let items = globalSettings;
    if (currentConfigCategory !== 'All') {
        items = items.filter(i => i.category === currentConfigCategory);
    }
    const filtered = items.filter(item => item.name.toLowerCase().includes(term));
    renderConfigTable(filtered);
}
function renderDailyList() {
    const term = document.getElementById('daily-search') ? document.getElementById('daily-search').value.toLowerCase() : "";
    const container = document.getElementById('daily-list');
    const today = String(new Date().getDay());
    let items = globalSettings.filter(i => i.type !== 'None' && String(i.days || "").split(',').includes(today));

    if (currentDailyCategory !== 'All') {
        items = items.filter(i => i.category === currentDailyCategory);
    }
    const filteredItems = items.filter(i => i.name.toLowerCase().includes(term));
    container.innerHTML = filteredItems.map(i => {
        const safeId = escapeId(i.id);
        return `<div class="flex justify-between items-center bg-white p-3 rounded border border-gray-200 shadow-sm"><div class="font-bold text-gray-700 text-sm">${i.name}</div><div class="flex items-center gap-2"><span class="text-xs text-gray-400">Qty:</span><input type="number" min="-1" onchange="updateStock('${safeId}',this.value)" value="${i.count}" class="w-16 border rounded text-center text-sm font-bold"></div></div>`
    }).join('');
}

// --- ADD/RETURN ITEMS LOGIC (FOR SERVED ORDERS) ---
function openAddModal(oid, key) {
    addContext.oid = oid; addContext.key = key;
    const order = liveOrders.find(o => o.id === oid);
    const item = order.items[key];
    addContext.count = 1;
    document.getElementById('add-item-name').innerText = item.name;
    document.getElementById('add-modal-qty').innerText = 1;
    document.getElementById('add-reason').value = "";
    document.getElementById('add-item-modal').classList.remove('hidden');
    document.getElementById('add-item-modal').classList.add('flex');
}
function closeAddModal() { document.getElementById('add-item-modal').classList.add('hidden'); document.getElementById('add-item-modal').classList.remove('flex'); }
function adjustAddModalQty(c) { let newQty = addContext.count + c; if (newQty < 1) newQty = 1; addContext.count = newQty; document.getElementById('add-modal-qty').innerText = newQty; }

function confirmAdd() {
    const reason = document.getElementById('add-reason').value;
    if (!reason) { alert("Please select a reason."); return; }
    const order = liveOrders.find(o => o.id === addContext.oid);
    const item = order.items[addContext.key];
    const qtyToAdd = addContext.count;

    // FIX: Parse stock safely
    const settingItem = globalSettings.find(i => i.id === item.id);
    const stock = settingItem ? parseInt(settingItem.count) : 0;

    if (stock !== -1 && stock < qtyToAdd) { alert("Insufficient Stock"); return; }
    if (stock !== -1) db.ref(`menu_settings/${item.id}/count`).set(stock - qtyToAdd);

    db.ref(`additions/${Date.now()}`).set({ orderId: addContext.oid, itemName: item.name, qty: qtyToAdd, reason: reason, timestamp: Date.now(), time: new Date().toLocaleString() });

    const newCount = item.count + qtyToAdd;
    const newServed = (item.served || item.count) + qtyToAdd;
    const priceIncrease = item.price * qtyToAdd;

    db.ref(`orders/${addContext.oid}/items/${addContext.key}/count`).set(newCount);
    db.ref(`orders/${addContext.oid}/items/${addContext.key}/served`).set(newServed);
    db.ref(`orders/${addContext.oid}/total`).set(order.total + priceIncrease);
    closeAddModal();
}

function openReturnModal(oid, key) {
    returnContext.oid = oid; returnContext.key = key;
    const order = liveOrders.find(o => o.id === oid);
    const item = order.items[key];
    returnContext.max = item.count; returnContext.count = 1;
    document.getElementById('return-item-name').innerText = item.name;
    document.getElementById('return-modal-qty').innerText = 1;
    document.getElementById('return-reason').value = "";
    document.getElementById('return-item-modal').classList.remove('hidden');
    document.getElementById('return-item-modal').classList.add('flex');
}
function closeReturnModal() { document.getElementById('return-item-modal').classList.add('hidden'); document.getElementById('return-item-modal').classList.remove('flex'); }
function adjustReturnQty(c) { let newQty = returnContext.count + c; if (newQty < 1) newQty = 1; if (newQty > returnContext.max) newQty = returnContext.max; returnContext.count = newQty; document.getElementById('return-modal-qty').innerText = newQty; }

function confirmReturn() {
    const reason = document.getElementById('return-reason').value;
    if (!reason) { alert("Please select a reason."); return; }
    const order = liveOrders.find(o => o.id === returnContext.oid);
    const item = order.items[returnContext.key];
    const qtyToReturn = returnContext.count;
    const newCount = item.count - qtyToReturn;
    const priceDeduction = item.price * qtyToReturn;

    db.ref(`returns/${Date.now()}`).set({ orderId: returnContext.oid, itemName: item.name, qty: qtyToReturn, reason: reason, timestamp: Date.now(), time: new Date().toLocaleString() });

    if (newCount <= 0) { db.ref(`orders/${returnContext.oid}/items/${returnContext.key}`).remove(); }
    else {
        db.ref(`orders/${returnContext.oid}/items/${returnContext.key}/count`).set(newCount);
        let currentServed = (item.served !== undefined) ? item.served : 0;
        let newServed = currentServed - qtyToReturn;
        if (newServed < 0) newServed = 0;
        db.ref(`orders/${returnContext.oid}/items/${returnContext.key}/served`).set(newServed);
    }
    db.ref(`orders/${returnContext.oid}/total`).set(order.total - priceDeduction);
    closeReturnModal();
}

// --- STANDARD MODALS ---
function openEditModal(oid, key) { editContext.oid = oid; editContext.key = key; const order = liveOrders.find(o => o.id === oid); const item = order.items[key]; editContext.qty = item.count; document.getElementById('edit-item-name').innerText = item.name; document.getElementById('edit-item-qty').innerText = editContext.qty; document.getElementById('edit-item-modal').classList.remove('hidden'); document.getElementById('edit-item-modal').classList.add('flex'); }
function closeEditModal() { document.getElementById('edit-item-modal').classList.add('hidden'); document.getElementById('edit-item-modal').classList.remove('flex'); }
function adjustEditQty(change) { const order = liveOrders.find(o => o.id === editContext.oid); const item = order.items[editContext.key]; const currentServed = item.served || 0; let newQty = editContext.qty + change; if (newQty < currentServed) { alert("Cannot reduce below served amount"); return; } if (newQty <= 0) return; editContext.qty = newQty; document.getElementById('edit-item-qty').innerText = newQty; }

// FIX: The core issue was checking item.count instead of global setting
function saveEditOrder() {
    const order = liveOrders.find(o => o.id === editContext.oid);
    const item = order.items[editContext.key];
    const diff = editContext.qty - item.count;

    // Get Global Stock Setting to see if unlimited
    const settingItem = globalSettings.find(i => i.id === item.id);
    const currentStock = settingItem ? parseInt(settingItem.count) : 0; // Force int

    // Only check/update stock if the item is NOT unlimited in global settings
    if (settingItem && currentStock !== -1 && diff !== 0) {
        const newStock = currentStock - diff;
        if (newStock < 0) {
            alert("Insufficient Stock");
            return;
        }
        db.ref(`menu_settings/${item.id}/count`).set(newStock);
    }

    const priceDiff = item.price * diff;
    db.ref(`orders/${editContext.oid}/items/${editContext.key}/count`).set(editContext.qty);
    db.ref(`orders/${editContext.oid}/total`).set(order.total + priceDiff);
    closeEditModal();
}

function openServeModal(oid, key) { serveContext.oid = oid; serveContext.key = key; const order = liveOrders.find(o => o.id === oid); const item = order.items[key]; const pending = item.count - (item.served || 0); serveContext.max = pending; serveContext.count = pending; document.getElementById('serve-item-name').innerText = item.name; document.getElementById('serve-info-ordered').innerText = item.count; document.getElementById('serve-info-pending').innerText = pending; document.getElementById('serve-modal-qty').innerText = serveContext.count; document.getElementById('serve-item-modal').classList.remove('hidden'); document.getElementById('serve-item-modal').classList.add('flex'); }
function handleServeClick(oid, key) {
    if (serveClickTimer) {
        clearTimeout(serveClickTimer);
        serveClickTimer = null;
        quickServeItem(oid, key); // Double Click Action
    } else {
        serveClickTimer = setTimeout(() => {
            serveClickTimer = null;
            openServeModal(oid, key); // Single Click Action
        }, 250);
    }
}
function quickServeItem(oid, key) {
    const order = liveOrders.find(o => o.id === oid);
    const item = order.items[key];
    const pending = item.count - (item.served || 0);
    if (pending <= 0) return;

    db.ref(`orders/${oid}/items/${key}/served`).set((item.served || 0) + pending);

    // Notification toast for UX
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg z-[100] font-bold text-sm animate-bounce';
    toast.innerHTML = `<i class="fas fa-bolt mr-2"></i> Served ${item.name} (${pending})`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);

    setTimeout(() => {
        const updatedOrder = liveOrders.find(o => o.id === oid);
        if (updatedOrder) {
            const stillPending = Object.values(updatedOrder.items).some(i => (i.count - (i.served || 0)) > 0);
            if (!stillPending && updatedOrder.table === 'Takeaway') { db.ref(`orders/${oid}/status`).set('served'); }
        }
    }, 500);
}

function serveAllItems(oid) {
    const order = liveOrders.find(o => o.id === oid);
    if (!order) return;
    const pendingCount = Object.values(order.items).reduce((acc, i) => acc + (i.count - (i.served || 0)), 0);
    if (!confirm(`Serve all ${pendingCount} remaining items for Table ${order.table.replace('_', '.')}?`)) return;

    let updates = {};
    Object.keys(order.items).forEach(key => {
        const item = order.items[key];
        const pending = item.count - (item.served || 0);
        if (pending > 0) {
            updates[`orders/${oid}/items/${key}/served`] = item.count;
        }
    });

    if (order.table === 'Takeaway') updates[`orders/${oid}/status`] = 'served';

    db.ref().update(updates).then(() => {
        // Optional: Show success
    });
}

function closeServeModal() { document.getElementById('serve-item-modal').classList.add('hidden'); document.getElementById('serve-item-modal').classList.remove('flex'); }
function adjustServeModalQty(change) { let newQty = serveContext.count + change; if (newQty < 1) newQty = 1; if (newQty > serveContext.max) newQty = serveContext.max; serveContext.count = newQty; document.getElementById('serve-modal-qty').innerText = newQty; }
function confirmServe() { const order = liveOrders.find(o => o.id === serveContext.oid); const item = order.items[serveContext.key]; db.ref(`orders/${serveContext.oid}/items/${serveContext.key}/served`).set((item.served || 0) + serveContext.count); setTimeout(() => { const updatedOrder = liveOrders.find(o => o.id === serveContext.oid); const stillPending = Object.values(updatedOrder.items).some(i => (i.count - (i.served || 0)) > 0); if (!stillPending && updatedOrder.table === 'Takeaway') { db.ref(`orders/${serveContext.oid}/status`).set('served'); } }, 500); closeServeModal(); }
function finishTableOrder(oid, tableId) { db.ref(`orders/${oid}/status`).set('served'); if (tableId && tableId !== 'Takeaway') { db.ref(`tables/${tableId}`).update({ status: "free" }); } }
function deleteLiveItem(orderId, itemKey) { if (!confirm("Remove this item?")) return; const order = liveOrders.find(o => o.id === orderId); const item = order.items[itemKey]; if (item.count !== -1) { const stock = globalSettings.find(i => i.id === item.id).count; db.ref(`menu_settings/${item.id}/count`).set(stock + item.count); } const remainingItems = Object.keys(order.items).length; if (remainingItems <= 1) { db.ref(`orders/${orderId}`).remove(); if (order.table !== 'Takeaway') { db.ref(`tables/${order.table}`).update({ status: "free" }); } } else { const itemTotal = item.price * item.count; db.ref(`orders/${orderId}/items/${itemKey}`).remove(); db.ref(`orders/${orderId}/total`).set(order.total - itemTotal); } }

function toggleSidebar() {
    const sb = document.getElementById('left-sidebar');
    const body = document.body;
    if (window.innerWidth < 768) {
        sb.classList.toggle('drawer-closed-left');
    } else {
        sb.classList.toggle('sidebar-expanded');
        body.classList.toggle('sidebar-open');
    }
}
function toggleOrderPanel(force) {
    const p = document.getElementById('order-panel');
    const b = document.getElementById('backdrop');
    if (window.innerWidth < 768) {
        if (force || p.classList.contains('drawer-closed-right')) { p.classList.remove('drawer-closed-right'); b.classList.remove('hidden'); }
        else { p.classList.add('drawer-closed-right'); b.classList.add('hidden'); }
    } else {
        if (force || p.classList.contains('drawer-closed-right')) { p.classList.remove('drawer-closed-right'); b.classList.add('hidden'); }
        else { p.classList.add('drawer-closed-right'); b.classList.add('hidden'); }
    }
}
function closeAllDrawers() { document.getElementById('left-sidebar').classList.add('drawer-closed-left'); document.getElementById('order-panel').classList.add('drawer-closed-right'); document.getElementById('backdrop').classList.add('hidden'); }
function logout() { localStorage.clear(); window.location.href = "index.html"; }
function toggleManagerMode() { isManagerMode = !isManagerMode; document.getElementById('split-controls').classList.toggle('hidden', !isManagerMode); }

// --- Full Screen Logic ---
function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(e => {
            console.log(`Error attempting to enable full-screen mode: ${e.message} (${e.name})`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('fullscreen-btn');
    if (!btn) return;
    if (document.fullscreenElement) {
        btn.innerHTML = '<i class="fas fa-compress"></i>';
    } else {
        btn.innerHTML = '<i class="fas fa-expand"></i>';
    }
});

// Updated: Auto-collapse sidebar on desktop click
function handleNavClick(viewId) {
    showView(viewId);
    updateNavState(viewId);
    if (window.innerWidth >= 768) {
        const sb = document.getElementById('left-sidebar');
        if (sb.classList.contains('sidebar-expanded')) {
            toggleSidebar();
        }
    }
}

function updateNavState(viewId) {
    const navItems = [
        { id: 'tables-view', navId: 'nav-tables-view' },
        { id: 'completed-orders-view', navId: 'nav-completed-orders-view' },
        { id: 'set-menu-view', navId: 'nav-set-menu-view' },
        { id: 'todays-menu-view', navId: 'nav-todays-menu-view' }
    ];

    const activeClasses = ['bg-[#F97316]', 'text-white', 'font-medium', 'shadow-lg', 'shadow-orange-900/20'];
    const inactiveClasses = ['text-gray-400', 'hover:bg-gray-800', 'hover:text-white'];

    navItems.forEach(item => {
        const navEl = document.getElementById(item.navId);
        if (!navEl) return;

        if (item.id === viewId) {
            navEl.classList.add(...activeClasses);
            navEl.classList.remove(...inactiveClasses);
        } else {
            navEl.classList.remove(...activeClasses);
            navEl.classList.add(...inactiveClasses);
        }
    });
}

function showView(id) { document.querySelectorAll('.view-section').forEach(e => e.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); if (window.innerWidth < 768) toggleSidebar(); }
function fetchSettingsFromSheet() { if (confirm("Sync?")) fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "GET_MENU_SETTINGS" }) }).then(r => r.json()).then(d => { if (d.status === "SUCCESS") { const u = {}; d.data.forEach(i => { if (!i.id) i.id = i.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(); if (!i.type) i.type = 'Default'; if (i.days === undefined) i.days = '0,1,2,3,4,5,6'; if (i.count === undefined) i.count = -1; u[i.id] = i; }); db.ref('menu_settings').set(u); alert("Synced!"); } }); }
function saveSettingsToSheet() { fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "SAVE_MENU_SETTINGS", settings: globalSettings }) }).then(() => alert("Saved!")); }
function checkDailyReset(s) { db.ref('system/last_reset').once('value', p => { const t = new Date().toDateString(); if (p.val() !== t) { if (!s) alert("Resetting..."); const u = {}; globalSettings.forEach(i => { if (i.type === 'Special') u[`menu_settings/${i.id}/type`] = 'None'; u[`menu_settings/${i.id}/count`] = (i.count === -1 ? -1 : 0); }); u['system/last_reset'] = t; db.ref().update(u); } }); }
function renderConfigTable(list) { const itemsToRender = list || globalSettings; const tbody = document.getElementById('config-table-body'); tbody.innerHTML = itemsToRender.map(i => { const safeId = escapeId(i.id); return `<tr class="hover:bg-gray-50 border-b border-gray-100"><td class="p-4 font-bold text-gray-700 text-sm">${i.name}</td><td class="p-4 text-center"><button onclick="toggleType('${safeId}')" class="px-3 py-1 rounded text-xs font-bold w-20 ${i.type === 'Default' ? 'bg-blue-100 text-blue-700' : (i.type === 'Special' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-200 text-gray-500')}">${i.type}</button></td><td class="p-4 flex gap-1 justify-center">${[0, 1, 2, 3, 4, 5, 6].map(d => `<button onclick="toggleDay('${safeId}',${d})" class="w-6 h-6 rounded text-[10px] font-bold ${String(i.days || "").split(',').includes(String(d)) ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'}">${['S', 'M', 'T', 'W', 'T', 'F', 'S'][d]}</button>`).join('')}</td></tr>` }).join(''); }
function updateStock(id, val) {
    let newCount = parseInt(val);
    if (newCount < -1) newCount = -1;
    db.ref(`menu_settings/${id}/count`).set(newCount);
}
function toggleType(id) { const i = globalSettings.find(x => x.id === id); const t = ["None", "Default", "Special"]; db.ref(`menu_settings/${id}/type`).set(t[(t.indexOf(i.type) + 1) % 3]); }
function toggleDay(id, d) { const i = globalSettings.find(x => x.id === id); let arr = String(i.days || "").split(',').filter(x => x); if (arr.includes(String(d))) arr = arr.filter(x => x != d); else arr.push(d); db.ref(`menu_settings/${id}/days`).set(arr.join(',')); }
function renderGrid() { const container = document.getElementById('layout-container'); container.innerHTML = ""; const b = "h-[180px] md:h-full text-5xl bg-white shadow-sm border border-gray-200/50 hover:shadow-md transition-all"; const s = "h-[85px] md:h-1/2 text-2xl bg-white shadow-sm border border-gray-200/50 hover:shadow-md transition-all"; container.innerHTML += tableConfig.splitT1 ? `<div id="area-T1" class="flex flex-col gap-3 h-full">${renderBtn("T1_1", "1.1", s)}${renderBtn("T1_2", "1.2", s)}</div>` : `<div id="area-T1" class="h-full">${renderBtn("T1", "1", `h-full ${b}`)}</div>`; container.innerHTML += tableConfig.splitT2 ? `<div id="area-T2" class="flex flex-col gap-3 h-full">${renderBtn("T2_1", "2.1", s)}${renderBtn("T2_2", "2.2", s)}</div>` : `<div id="area-T2" class="h-full">${renderBtn("T2", "2", `h-full ${b}`)}</div>`;["T3", "T4", "T5", "T6"].forEach(t => container.innerHTML += `<div id="area-${t}" class="h-full">${renderBtn(t, t.replace('T', ''), `h-full ${b}`)}</div>`); }
function renderBtn(id, lbl, cls) { const occ = tableData[id]?.status === 'occupied'; return `<div onclick="handleTableClick('${id}')" ondblclick="handleTableDoubleClick('${id}')" class="split-anim w-full ${cls} ${occ ? 'ring-2 ring-red-100 bg-red-50/50' : ''} rounded-2xl flex flex-col items-center justify-center cursor-pointer font-bold relative group active:scale-[0.98]"><span class="text-[#111827]">${lbl}</span><span class="text-[10px] uppercase font-bold tracking-[0.15em] mt-3 ${occ ? 'text-red-500' : 'text-gray-300'}">${occ ? 'BUSY' : 'FREE'}</span></div>`; }
function renderCompletedOrders() {
    const container = document.getElementById('completed-orders-container');
    const servedOrders = liveOrders.filter(o => o.status === 'served');
    if (servedOrders.length === 0) { container.innerHTML = '<div class="text-center text-gray-400 italic">No orders ready for payment.</div>'; return; }
    container.innerHTML = servedOrders.map(order => {
        const safeOrderId = escapeId(order.id);
        const items = order.items || {};
        let itemsList = Object.entries(items).map(([key, i]) => {
            const safeKey = escapeId(key);
            return `
            <div class="flex justify-between text-sm py-2 border-b border-gray-50 last:border-0 items-center">
                <div class="flex items-center gap-2"><span class="font-bold text-gray-700">${i.count}x</span><span>${i.name} <span class="text-xs text-gray-400">(${i.orderType})</span></span></div>
                <div class="flex items-center gap-3"><span class="font-mono font-bold text-gray-600">€${(i.price * i.count).toFixed(2)}</span>
                    <div class="flex items-center bg-gray-100 rounded px-1">
                        <button onclick="openReturnModal('${safeOrderId}', '${safeKey}')" class="text-red-500 hover:text-red-700 p-1 w-6 h-6 flex items-center justify-center font-bold">-</button><span class="text-gray-300 text-xs">|</span>
                        <button onclick="openAddModal('${safeOrderId}', '${safeKey}')" class="text-green-600 hover:text-green-800 p-1 w-6 h-6 flex items-center justify-center font-bold">+</button>
                    </div>
                </div>
            </div>`;
        }).join('');
        return `<div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-4"><div class="flex justify-between items-center mb-3 border-b border-gray-100 pb-2"><span class="font-bold text-lg text-gray-800">Table ${order.table.replace('_', '.')}</span><span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Served</span></div><div class="mb-3">${itemsList}</div><div class="flex justify-between items-center pt-2"><span class="font-bold text-xl">Total: €${order.total.toFixed(2)}</span><button onclick="goToPayment('${order.id}')" class="bg-green-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-green-700">Pay Now</button></div></div>`;
    }).join('');
}
function goToPayment(orderId) { sessionStorage.setItem("ich_payment_order_id", orderId); window.open("payment.html", "_blank"); }
function toggleSplit(table) { const newState = !tableConfig['split' + table]; db.ref('config/layout/split' + table).set(newState); if (newState) { db.ref(`tables/${table}_1`).update({ id: `${table}_1` }); db.ref(`tables/${table}_2`).update({ id: `${table}_2` }); } if (newState && tableData[table] && tableData[table].status === 'occupied') { const order = liveOrders.find(o => o.table === table && (o.status === 'active' || o.status === 'served')); if (order) { db.ref(`orders/${order.id}/table`).set(`${table}_1`); db.ref(`tables/${table}`).update({ status: 'free' }); db.ref(`tables/${table}_1`).update({ status: 'occupied' }); } } }
