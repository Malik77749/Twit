// Utility Functions

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format timestamp to relative time (Arabic)
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'الآن';
    if (diffMin < 60) return `قبل ${diffMin} دقيقة`;
    if (diffHr < 24) return `قبل ${diffHr} ساعة`;
    if (diffDay < 7) return `قبل ${diffDay} يوم`;
    return date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Format join date for profile
 */
function formatJoinDate(timestamp) {
    const date = new Date(timestamp);
    return `انضم في ${date.toLocaleString('ar-EG', { month: 'long', year: 'numeric' })}`;
}

/**
 * Extract YouTube embed URL from various YouTube URL formats
 */
function getYouTubeEmbedUrl(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

/**
 * Show a toast notification
 */
function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

/**
 * Parse post content: linkify @mentions, #hashtags, and URLs
 * NOTE: Content in DB is already HTML-escaped, so this does NOT escape again.
 * For new content, escapeHtml() first, then pass to parseContent().
 */
function parseContent(text) {
    if (!text) return '';

    let html = text;

    // 1. URLs → clickable links
    html = html.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--text-link);">$1</a>'
    );

    // 2. @mentions → clickable profile links
    html = html.replace(
        /@([a-zA-Z0-9_\u0600-\u06FF]{1,30})/g,
        (match, username) => {
            return `<span class="mention" onclick="searchAndShowUser('${username}')" style="color:var(--text-link);cursor:pointer;">@${username}</span>`;
        }
    );

    // 3. #hashtags → clickable search links
    html = html.replace(
        /#([a-zA-Z0-9_\u0600-\u06FF]{1,50})/g,
        (match, tag) => {
            return `<span class="hashtag" onclick="searchHashtag('${tag}')" style="color:var(--text-link);cursor:pointer;">#${tag}</span>`;
        }
    );

    return html;
}

/**
 * Search for a user by name and show their profile
 */
function searchAndShowUser(username) {
    const lower = username.toLowerCase();
    // Search in database for user with matching name
    import('./firebase-helpers.js').then(({ searchUserByName }) => {
        searchUserByName(lower).then(userId => {
            if (userId) {
                window.showProfile(userId);
            } else {
                showToast('لم يتم العثور على المستخدم');
            }
        });
    });
}

/**
 * Search for a hashtag
 */
function searchHashtag(tag) {
    if (window.handleSearch) {
        window.handleSearch('#' + tag);
        if (window.navigateTo) window.navigateTo('search');
    }
}

export { escapeHtml, formatTimestamp, formatJoinDate, getYouTubeEmbedUrl, showToast, parseContent, searchAndShowUser, searchHashtag };
