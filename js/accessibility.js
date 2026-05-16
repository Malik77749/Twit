// Accessibility Module — ARIA labels, screen reader support (like X)

/**
 * Initialize accessibility features
 */
function init() {
    addAriaLabels();
    setupFocusManagement();
    setupReducedMotion();
    setupHighContrast();
}

/**
 * Add ARIA labels to interactive elements
 */
function addAriaLabels() {
    // Navigation
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(el => {
        const text = el.querySelector('span')?.textContent || el.getAttribute('title') || '';
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', text);
    });

    // Like buttons
    document.querySelectorAll('.tweet-action.like').forEach(el => {
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', 'إعجاب');
    });

    // Retweet buttons
    document.querySelectorAll('.tweet-action.retweet').forEach(el => {
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', 'إعادة نشر');
    });

    // Comment buttons
    document.querySelectorAll('.tweet-action.reply').forEach(el => {
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', 'رد');
    });

    // Bookmark buttons
    document.querySelectorAll('.tweet-action.bookmark').forEach(el => {
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', 'حفظ');
    });

    // Composer
    const composer = document.getElementById('postContent');
    if (composer) {
        composer.setAttribute('aria-label', 'كتابة منشور جديد');
        composer.setAttribute('aria-placeholder', 'ما الذي يحدث؟!');
    }

    // Search
    const searchInputs = document.querySelectorAll('.search-box input, #search-input');
    searchInputs.forEach(el => {
        el.setAttribute('aria-label', 'بحث');
    });

    // Images
    document.querySelectorAll('.tweet-avatar, .composer-avatar').forEach(el => {
        if (!el.getAttribute('alt')) {
            el.setAttribute('alt', 'صورة المستخدم');
            el.setAttribute('role', 'img');
        }
    });

    // Post actions container
    document.querySelectorAll('.tweet-actions').forEach(el => {
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', 'إجراءات المنشور');
    });

    // Feed tabs
    document.querySelectorAll('.feed-tab, .mobile-feed-tab').forEach(el => {
        el.setAttribute('role', 'tab');
    });

    // Profile tabs
    document.querySelectorAll('.profile-tab').forEach(el => {
        el.setAttribute('role', 'tab');
    });

    // Modals
    document.querySelectorAll('.lightbox, .dropdown-menu, .shortcuts-modal').forEach(el => {
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
    });
}

/**
 * Setup focus management
 */
function setupFocusManagement() {
    // Trap focus in modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            const modal = document.querySelector('.lightbox.open, .shortcuts-modal[style*="flex"]');
            if (modal) {
                const focusable = modal.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
    });

    // Skip to main content link
    const skipLink = document.createElement('a');
    skipLink.href = '#posts';
    skipLink.className = 'skip-link';
    skipLink.textContent = 'تخطي إلى المحتوى الرئيسي';
    skipLink.setAttribute('tabindex', '0');
    document.body.insertBefore(skipLink, document.body.firstChild);
}

/**
 * Respect prefers-reduced-motion
 */
function setupReducedMotion() {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    function handleMotionPreference(mq) {
        if (mq.matches) {
            document.documentElement.classList.add('reduced-motion');
        } else {
            document.documentElement.classList.remove('reduced-motion');
        }
    }

    handleMotionPreference(mediaQuery);
    mediaQuery.addEventListener('change', handleMotionPreference);
}

/**
 * Respect prefers-contrast
 */
function setupHighContrast() {
    const mediaQuery = window.matchMedia('(prefers-contrast: high)');

    function handleContrastPreference(mq) {
        if (mq.matches) {
            document.documentElement.classList.add('high-contrast');
        } else {
            document.documentElement.classList.remove('high-contrast');
        }
    }

    handleContrastPreference(mediaQuery);
    mediaQuery.addEventListener('change', handleContrastPreference);
}

/**
 * Announce to screen readers
 */
function announce(message, priority = 'polite') {
    let announcer = document.getElementById('sr-announcer');
    if (!announcer) {
        announcer = document.createElement('div');
        announcer.id = 'sr-announcer';
        announcer.setAttribute('aria-live', priority);
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'sr-only';
        document.body.appendChild(announcer);
    }
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = message; }, 100);
}

export {
    init,
    addAriaLabels,
    announce
};
