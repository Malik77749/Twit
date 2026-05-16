// Verified Badge Module — Blue/Gold checkmark (like X)
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

let database;

function init(databaseInstance) {
    database = databaseInstance;
}

/**
 * Check if user is verified
 */
async function isVerified(userId) {
    if (!userId) return false;

    try {
        const snapshot = await get(ref(database, `users/${userId}/verified`));
        if (snapshot.exists()) return snapshot.val();

        // Check admin status as fallback
        const adminSnap = await get(ref(database, `users/${userId}/isAdmin`));
        if (adminSnap.exists() && adminSnap.val()) return 'gold';

        return false;
    } catch (error) {
        return false;
    }
}

/**
 * Get verified badge HTML
 * @param {string|boolean} verified - false, 'blue', 'gold', or true
 */
function getBadgeHTML(verified) {
    if (!verified || verified === false) return '';

    const color = verified === 'gold' ? '#e8a800' : '#1d9bf0';
    const icon = verified === 'gold' ? 'fa-certificate' : 'fa-circle-check';

    return `<span class="verified-badge" style="color:${color};" title="${verified === 'gold' ? 'حساب موثق ذهبي' : 'حساب موثق'}"><i class="fas ${icon}"></i></span>`;
}

/**
 * Get badge type for a user (checks database)
 */
async function getBadge(userId) {
    return await isVerified(userId);
}

export {
    init,
    isVerified,
    getBadgeHTML,
    getBadge
};
