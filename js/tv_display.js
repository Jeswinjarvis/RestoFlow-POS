const db = firebase.database();

document.addEventListener('click', toggleFullScreen);

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

function getLuminance(hex) {
    const rgb = hex.match(/[A-Za-z0-9]{2}/g).map(v => parseInt(v, 16));
    return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
}

db.ref('config/tv_state').on('value', snap => {
    const s = snap.val() || {};

    // REMOTE SCROLL TOGGLE
    const tickerWrap = document.querySelector('.ticker-wrap');
    if (tickerWrap && s.hasOwnProperty('tickerShow')) {
        tickerWrap.style.display = s.tickerShow ? 'flex' : 'none';

        // Dynamic bottom padding to ensure content doesn't get cut off or look empty
        const mainContainer = document.querySelector('.flex-col.h-full');
        if (mainContainer) {
            mainContainer.style.paddingBottom = s.tickerShow ? "" : '1rem';
        }
    }

    document.getElementById('ticker-msg').innerText = s.ticker || "";
});

function initTV() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
    db.ref('config/tv_state').on('value', snap => {
        const s = snap.val() || {};
        const root = document.documentElement;
        if (s.accent) root.style.setProperty('--accent', s.accent);
        if (s.bg1) {
            root.style.setProperty('--bg1', s.bg1);
            const lum = getLuminance(s.bg1);
            root.style.setProperty('--text-color', lum > 0.6 ? '#111827' : '#ffffff');
            root.style.setProperty('--box-rgb', lum > 0.6 ? '0,0,0' : '255,255,255');
        }
        if (s.bg2) root.style.setProperty('--bg2', s.bg2);
        document.getElementById('ticker-msg').innerText = s.ticker || "";
    });
    db.ref('menu_settings').on('value', snap => {
        const data = snap.val() || {};
        const today = String(new Date().getDay());
        const items = Object.values(data).filter(i => i.type !== 'None' && String(i.days || "0-6").includes(today));
        renderWall(items);
    });
}

function renderWall(items) {
    const container = document.getElementById('menu-wall');
    container.innerHTML = '';
    const grouped = {};
    items.forEach(i => {
        if (!grouped[i.category]) grouped[i.category] = [];
        grouped[i.category].push(i);
    });

    const categories = Object.keys(grouped).sort();
    container.className = items.length > 20 ? 'menu-dense' : (items.length > 12 ? 'menu-compact' : 'menu-spacious');

    if (categories.length === 0) {
        container.innerHTML = `
            <div class="empty-menu">
                <div>
                    <i class="fa-solid fa-mug-hot"></i>
                    <strong>Menu coming soon</strong>
                </div>
            </div>`;
        return;
    }

    categories.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'category-container';
        const rows = grouped[cat].map(item => {
            const isOut = item.count === 0;
            return `<div class="item-row ${isOut ? 'opacity-20 grayscale' : ''}"><span class="item-name">${item.name}</span><span class="item-price">€${Number(item.price).toFixed(2)}</span></div>`;
        }).join('');
        card.innerHTML = `<h2 class="category-header theme-text">${cat}</h2><div class="category-items">${rows}</div>`;
        container.appendChild(card);
    });
}

function updateDateTime() {
    const now = new Date();
    const clock = document.getElementById('clock');
    const date = document.getElementById('current-date');

    if (clock) {
        clock.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (date) {
        date.innerText = now.toLocaleDateString('en-IE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
    }
}
