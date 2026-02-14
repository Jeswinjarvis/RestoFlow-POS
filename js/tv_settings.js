const token = localStorage.getItem("ich_auth_token");
if (!token) window.location.href = "index.html";

// Existing Config from your tv_display.html
const db = firebase.database();

let prideInterval = null;
const prideColors = ['#FF0000', '#FF8C00', '#FFEB00', '#008026', '#004dff', '#732982'];
let colorIdx = 0;

function toggleUI(m) {
    document.getElementById('admin-body').className = m === 'light' ? 'ui-light min-h-screen p-6' : 'ui-dark min-h-screen p-6';
}

function setPreset(a, b1, b2) {
    stopPride();
    document.getElementById('accent-color').value = a;
    document.getElementById('bg1-color').value = b1;
    document.getElementById('bg2-color').value = b2;
}

function setPrideMode() {
    stopPride();
    setPreset('#ffffff', prideColors[0], '#000000');
    prideInterval = setInterval(() => {
        colorIdx = (colorIdx + 1) % prideColors.length;
        document.getElementById('bg1-color').value = prideColors[colorIdx];
        saveTV(true);
    }, 8000);
}

function stopPride() { if (prideInterval) clearInterval(prideInterval); }

function saveTV(silent = false) {
    const btn = document.getElementById('save-btn');
    const data = {
        accent: document.getElementById('accent-color').value,
        bg1: document.getElementById('bg1-color').value,
        bg2: document.getElementById('bg2-color').value,
        ticker: document.getElementById('ticker-text').value,
        tickerShow: document.getElementById('ticker-toggle').checked, // New Feature
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    db.ref('config/tv_state').set(data).then(() => {
        if (!silent) {
            btn.innerHTML = "<i class='fas fa-check'></i> BROADCASTED";
            btn.classList.replace('bg-orange-600', 'bg-green-600');
            setTimeout(() => {
                btn.innerHTML = "<i class='fas fa-broadcast-tower'></i> PUSH TO TV";
                btn.classList.replace('bg-green-600', 'bg-orange-600');
            }, 2000);
        }
    });
}

// Auto-load state on start
db.ref('config/tv_state').once('value').then(snap => {
    const d = snap.val() || {};
    if (d.accent) document.getElementById('accent-color').value = d.accent;
    if (d.bg1) document.getElementById('bg1-color').value = d.bg1;
    if (d.bg2) document.getElementById('bg2-color').value = d.bg2;
    if (d.ticker) document.getElementById('ticker-text').value = d.ticker;
    if (d.hasOwnProperty('tickerShow')) document.getElementById('ticker-toggle').checked = d.tickerShow;
});

function closeOrNavigate() {
    try { window.close(); if (!window.closed) window.location.href = "landing.html"; }
    catch (e) { window.location.href = "landing.html"; }
}

function openTVDisplay() {
    window.open("tv_display.html", "_blank");
}
