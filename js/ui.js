// UI State Management

const views = ['home', 'notifications', 'profile'];

function showView(viewName) {
    views.forEach(v => {
        const el = document.getElementById(`${v}-view`);
        if (el) el.style.display = v === viewName ? 'block' : 'none';
    });
}

function showApp() {
    hideLoading();
    document.body.classList.add('mimer-authenticated');
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('app-section').style.display = 'flex';
}

function showAuth() {
    hideLoading();
    document.body.classList.remove('mimer-authenticated');
    document.getElementById('auth-section').style.display = 'flex';
    document.getElementById('app-section').style.display = 'none';
}

function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    const authSection = document.getElementById('auth-section');
    const appSection = document.getElementById('app-section');
    if (!overlay) return;
    // Never cover the public login/register surface with a blocking loader.
    const authVisible = authSection && getComputedStyle(authSection).display !== 'none';
    const appVisible = appSection && getComputedStyle(appSection).display !== 'none';
    if (authVisible && !appVisible) return;
    overlay.style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

function focusComposer() {
    showView('home');
    const input = document.getElementById('postContent');
    if (input) input.focus();
}

export { showView, showApp, showAuth, showLoading, hideLoading, focusComposer };
