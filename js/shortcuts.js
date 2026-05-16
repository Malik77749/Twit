// Keyboard Shortcuts Module (like X)
const shortcuts = [
    { key: 'n', description: 'منشور جديد', action: () => window.focusComposer?.() },
    { key: '/', description: 'بحث', action: () => window.openSearch?.() },
    { key: 'g h', description: 'الرئيسية', action: () => window.showHome?.() },
    { key: 'g n', description: 'الإشعارات', action: () => window.showNotifications?.() },
    { key: 'g m', description: 'الرسائل', action: () => window.showMessages?.() },
    { key: 'g p', description: 'الملف الشخصي', action: () => window.showProfile?.() },
    { key: 'Escape', description: 'إغلاق', action: () => closeAllModals() },
    { key: '?', description: 'اختصارات لوحة المفاتيح', action: () => showShortcutsHelp() }
];

let pendingKey = null;
let pendingTimeout = null;
let isEnabled = true;

/**
 * Initialize keyboard shortcuts
 */
function init() {
    document.addEventListener('keydown', handleKeyDown);
}

/**
 * Handle keydown events
 */
function handleKeyDown(e) {
    if (!isEnabled) return;

    // Don't trigger shortcuts when typing in inputs
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return;
    }

    // Don't trigger with modifier keys (except Shift for ?)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key.toLowerCase();

    // Check for two-key combinations
    if (pendingKey) {
        const combo = `${pendingKey} ${key}`;
        const shortcut = shortcuts.find(s => s.key === combo);
        clearTimeout(pendingTimeout);
        pendingKey = null;

        if (shortcut) {
            e.preventDefault();
            shortcut.action();
            return;
        }
    }

    // Check for single key shortcuts
    const shortcut = shortcuts.find(s => s.key === key);
    if (shortcut) {
        e.preventDefault();
        shortcut.action();
        return;
    }

    // Check if this could be the first key of a combo
    if (key === 'g') {
        pendingKey = 'g';
        pendingTimeout = setTimeout(() => { pendingKey = null; }, 1000);
    }
}

/**
 * Close all modals
 */
function closeAllModals() {
    // Close lightbox
    window.closeLightbox?.();

    // Close dropdown
    const dropdown = document.getElementById('post-dropdown');
    if (dropdown) dropdown.style.display = 'none';

    // Close emoji picker
    const picker = document.querySelector('.emoji-picker');
    if (picker) picker.classList.remove('show');

    // Close drawer
    window.closeDrawer?.();

    // Close shortcuts help
    const help = document.getElementById('shortcuts-help');
    if (help) help.style.display = 'none';
}

/**
 * Show shortcuts help modal
 */
function showShortcutsHelp() {
    let help = document.getElementById('shortcuts-help');

    if (!help) {
        help = document.createElement('div');
        help.id = 'shortcuts-help';
        help.className = 'shortcuts-modal';
        help.innerHTML = `
            <div class="shortcuts-content">
                <div class="shortcuts-header">
                    <h3>اختصارات لوحة المفاتيح</h3>
                    <button class="shortcuts-close" onclick="document.getElementById('shortcuts-help').style.display='none'">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="shortcuts-list">
                    ${shortcuts.map(s => `
                        <div class="shortcut-row">
                            <kbd>${s.key.toUpperCase()}</kbd>
                            <span>${s.description}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(help);
    }

    help.style.display = 'flex';
}

/**
 * Enable/disable shortcuts
 */
function setEnabled(enabled) {
    isEnabled = enabled;
}

export {
    init,
    showShortcutsHelp,
    setEnabled
};
