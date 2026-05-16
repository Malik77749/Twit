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
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('app-section').style.display = 'flex';
}

function showAuth() {
    hideLoading();
    document.getElementById('auth-section').style.display = 'flex';
    document.getElementById('app-section').style.display = 'none';
}

function showLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';
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
