// UI State Management

const sections = ['auth', 'home', 'menu', 'profile', 'notifications'];

/**
 * Toggle visibility of app sections
 */
function toggleSections(activeSection) {
    sections.forEach(section => {
        const el = document.getElementById(`${section}-section`);
        if (el) {
            el.style.display = section === activeSection ? 'block' : 'none';
        }
    });
    hideLoading();
}

function showLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

export { toggleSections, showLoading, hideLoading };
