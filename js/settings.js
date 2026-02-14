const token = localStorage.getItem("ich_auth_token");
if (!token) window.location.href = "index.html";

const presets = {
    'bell': 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    'ding': 'https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3',
    'beep': 'https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3',
    'chime': 'https://assets.mixkit.co/active_storage/sfx/999/999-preview.mp3'
};

const db = firebase.database();

const currentUrlInput = document.getElementById('custom-url');
const toggleSwitch = document.getElementById('sound-toggle');
const player = document.getElementById('audio-player');
const optionsDiv = document.getElementById('sound-options');

// Ensure DOM elements are available before adding event listeners
document.addEventListener('DOMContentLoaded', () => {
    // We need to re-fetch elements here if they were outside the scope or if script runs before DOM
    // But since we are moving to a linked JS file, it might run DOMContentLoaded if in head with defer or at end of body.
    // However, `window.onload` was used. I'll stick to window.onload or simply setup listeners.

    // Re-assigning them here to be safe inside the function scope if needed, but globals are fine if script is loaded at end.
    // The previous code used window.onload.
});

window.onload = function () {
    // Load Toggle State (Default to true if not set)
    const isEnabled = localStorage.getItem("ich_ring_enabled") !== 'false';
    if (toggleSwitch) toggleSwitch.checked = isEnabled;
    toggleOptions(isEnabled);

    // Load Sound URL
    const savedUrl = localStorage.getItem("ich_ring_sound");
    if (currentUrlInput) currentUrlInput.value = savedUrl || presets['bell'];
};

// Toggle UI visibility based on switch
if (toggleSwitch) {
    toggleSwitch.addEventListener('change', (e) => {
        toggleOptions(e.target.checked);
    });
}

function toggleOptions(show) {
    if (!optionsDiv) return;
    if (show) {
        optionsDiv.classList.remove('opacity-50', 'pointer-events-none');
    } else {
        optionsDiv.classList.add('opacity-50', 'pointer-events-none');
    }
}

function selectPreset(key) {
    currentUrlInput.value = presets[key];
    previewSound();
}

function previewSound() {
    if (!toggleSwitch.checked) return;
    const url = currentUrlInput.value;
    if (!url) return;
    player.src = url;
    player.play().catch(e => alert("Error playing sound."));
}

function saveSettings() {
    const isEnabled = toggleSwitch.checked;
    const url = currentUrlInput.value;

    localStorage.setItem("ich_ring_enabled", isEnabled);
    if (isEnabled && !url) {
        alert("Please select a sound URL.");
        return;
    }
    if (url) localStorage.setItem("ich_ring_sound", url);

    const btn = document.querySelector('button[onclick="saveSettings()"]');
    const originalText = btn.innerText;
    btn.innerText = "Saved!";
    btn.classList.replace('bg-gray-900', 'bg-green-600');

    setTimeout(() => {
        btn.innerText = originalText;
        btn.classList.replace('bg-green-600', 'bg-gray-900');
        btn.classList.replace('bg-green-600', 'bg-gray-900');
    }, 1500);
}

function resetTables() {
    if (!confirm("⚠️ CRITICAL WARNING ⚠️\n\nAre you sure you want to RESET THE FLOOR PLAN?\n\nThis will:\n1. Mark ALL tables as FREE (Green)\n2. DELETE all ACTIVE/SERVED orders\n3. Reset any merged tables (Splits)\n\nThis cannot be undone.")) return;

    const btn = document.querySelector('button[onclick="resetTables()"]');
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';

    db.ref('orders').once('value').then(snapshot => {
        const updates = {};

        // 1. Identify active/served orders to delete
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const order = child.val();
                if (order.status === 'active' || order.status === 'served') {
                    updates[`orders/${child.key}`] = null;
                }
            });
        }

        // 2. Prepare Table Resets
        const defaultTables = {
            "T1": { status: "free" }, "T1_1": { status: "free" }, "T1_2": { status: "free" },
            "T2": { status: "free" }, "T2_1": { status: "free" }, "T2_2": { status: "free" },
            "T3": { status: "free" }, "T4": { status: "free" }, "T5": { status: "free" }, "T6": { status: "free" }
        };
        updates['tables'] = defaultTables;
        updates['config/layout'] = { splitT1: false, splitT2: false };

        // 3. Execute Atomic Update
        return db.ref().update(updates);
    }).then(() => {
        btn.classList.replace('text-red-600', 'text-green-600');
        btn.classList.replace('border-red-200', 'border-green-200');
        btn.classList.replace('bg-white', 'bg-green-50');
        btn.innerHTML = '<i class="fas fa-check"></i> Reset Complete';

        setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalContent;
            btn.className = "w-full py-3 bg-white border border-red-200 text-red-600 hover:bg-red-600 hover:text-white rounded-lg font-bold shadow-sm transition";
        }, 3000);
    }).catch(err => {
        console.error(err);
        alert("Reset Failed: " + err.message);
        btn.disabled = false;
        btn.innerHTML = originalContent;
    });
}

function closeOrNavigate() {
    try { window.close(); if (!window.closed) window.location.href = "landing.html"; }
    catch (e) { window.location.href = "landing.html"; }
}
