/**
 * Virtual Classroom – Auth Module
 * Login, register, logout, demo credentials.
 */
const Auth = {
    async login() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        if (!email || !password) { Auth.showError('login-error', 'Email and password required'); return; }
        const btn = document.getElementById('login-btn');
        btn.disabled = true; btn.innerHTML = '<span>Signing in...</span>';
        try {
            const data = await App.api('/api/auth/login', 'POST', { email, password });
            App.state.token = data.token; App.state.user = data.user;
            localStorage.setItem('vc_token', data.token); localStorage.setItem('vc_user', JSON.stringify(data.user));
            App.showApp(); App.connectSocket(); window.location.hash = '#/dashboard'; App.handleRoute();
            App.toast(`Welcome back, ${data.user.first_name || data.user.username}!`, 'success');
        } catch (e) { Auth.showError('login-error', e.message); }
        btn.disabled = false; btn.innerHTML = '<span>Sign In</span><i data-lucide="arrow-right"></i>'; lucide.createIcons();
    },

    async register() {
        const username = document.getElementById('reg-username').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        const firstName = document.getElementById('reg-firstname').value.trim();
        const lastName = document.getElementById('reg-lastname').value.trim();
        const role = document.querySelector('input[name="role"]:checked')?.value || 'student';
        if (!username || !email || !password) { Auth.showError('register-error', 'All fields required'); return; }
        if (password.length < 6) { Auth.showError('register-error', 'Min 6 characters'); return; }
        const btn = document.getElementById('register-btn');
        btn.disabled = true; btn.innerHTML = '<span>Creating...</span>';
        try {
            const data = await App.api('/api/auth/register', 'POST', { username, email, password, first_name: firstName, last_name: lastName, role });
            App.state.token = data.token; App.state.user = data.user;
            localStorage.setItem('vc_token', data.token); localStorage.setItem('vc_user', JSON.stringify(data.user));
            App.showApp(); App.connectSocket(); window.location.hash = '#/dashboard'; App.handleRoute();
            App.toast('Account created! Welcome!', 'success');
        } catch (e) { Auth.showError('register-error', e.message); }
        btn.disabled = false; btn.innerHTML = '<span>Create Account</span><i data-lucide="arrow-right"></i>'; lucide.createIcons();
    },

    logout() {
        App.state.token = null; App.state.user = null;
        localStorage.removeItem('vc_token'); localStorage.removeItem('vc_user');
        App.state.socket?.disconnect(); App.state.socket = null;
        window.location.hash = '';
        App.showAuth(); App.toast('Signed out', 'info');
    },

    fillDemo(role) {
        if (role === 'teacher') {
            document.getElementById('login-email').value = 'teacher@demo.com';
            document.getElementById('login-password').value = 'password123';
        } else {
            document.getElementById('login-email').value = 'student@demo.com';
            document.getElementById('login-password').value = 'password123';
        }
    },

    showRegister() { document.getElementById('login-form').classList.add('hidden'); document.getElementById('register-form').classList.remove('hidden'); lucide.createIcons(); },
    showLogin() { document.getElementById('register-form').classList.add('hidden'); document.getElementById('login-form').classList.remove('hidden'); lucide.createIcons(); },
    showError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.remove('hidden'); setTimeout(() => el.classList.add('hidden'), 4000); }
};
