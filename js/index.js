let currentRole = '';

function openLoginModal(role) {
    currentRole = role;
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    const title = document.getElementById('modalTitle');
    if (title) title.innerText = role === 'admin' ? "Admin Access" : "Employee Login";

    const btn = document.getElementById('loginBtn');
    if (btn) btn.className = role === 'admin' ? "w-full bg-blue-600 text-white font-bold py-3.5 rounded-lg shadow-lg" : "w-full bg-orange-600 text-white font-bold py-3.5 rounded-lg shadow-lg";
}

function closeModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const msg = document.getElementById('login-msg');
    const inputId = document.getElementById('inputId').value;
    const inputPass = document.getElementById('inputPass').value;

    if (btn) {
        btn.disabled = true;
        btn.style.opacity = "0.7";
    }
    if (msg) msg.innerText = "Verifying...";

    fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
            action: "LOGIN",
            apiKey: API_SECRET,
            id: inputId,
            password: inputPass,
            role: currentRole
        })
    })
        .then(r => r.json())
        .then(d => {
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = "1";
            }
            if (d.status === "SUCCESS") {
                localStorage.setItem("ich_auth_token", "sec-" + Date.now());
                localStorage.setItem("ich_user_role", currentRole);
                localStorage.setItem("ich_user_name", d.name || currentRole); // Save Name
                window.location.href = currentRole === 'admin' ? "admin.html" : "landing.html";
            } else {
                if (msg) {
                    msg.innerText = "Invalid Credentials";
                    msg.className = "text-center mb-4 text-red-600 font-bold";
                }
            }
        })
        .catch(() => {
            if (btn) btn.disabled = false;
            if (msg) msg.innerText = "Connection Error";
        });
}
