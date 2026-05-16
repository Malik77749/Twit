// Firebase Helper Functions
import { ref, get, set, push } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

// In-memory cache to avoid repeated reads for the same user
const userCache = new Map();
const CACHE_TTL = 60000; // 1 minute

function getCachedUser(userId) {
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    return null;
}

/**
 * Get user name by userId (cached)
 */
async function getUserName(database, userId) {
    try {
        const cached = getCachedUser(userId);
        if (cached) return cached.name || `مستخدم ${userId.slice(0, 8)}`;

        const snapshot = await get(ref(database, 'users/' + userId));
        const userData = snapshot.val();
        if (userData) {
            userCache.set(userId, { data: userData, timestamp: Date.now() });
        }
        return userData?.name || `مستخدم ${userId.slice(0, 8)}`;
    } catch (error) {
        return `مستخدم ${userId.slice(0, 8)}`;
    }
}

/**
 * Get user profile picture by userId (cached)
 */
async function getUserProfilePicture(database, userId) {
    try {
        const cached = getCachedUser(userId);
        if (cached) return cached.profilePicture || DEFAULT_AVATAR;

        const snapshot = await get(ref(database, 'users/' + userId));
        const userData = snapshot.val();
        if (userData) {
            userCache.set(userId, { data: userData, timestamp: Date.now() });
        }
        return userData?.profilePicture || DEFAULT_AVATAR;
    } catch (error) {
        return DEFAULT_AVATAR;
    }
}

/**
 * Get full user data (cached) — avoids double-fetching name + picture
 */
async function getUserData(database, userId) {
    try {
        const cached = getCachedUser(userId);
        if (cached) return cached;

        const snapshot = await get(ref(database, 'users/' + userId));
        const userData = snapshot.val();
        if (userData) {
            userCache.set(userId, { data: userData, timestamp: Date.now() });
        }
        return userData || {};
    } catch (error) {
        return {};
    }
}

/**
 * Clear user cache (call on logout)
 */
function clearUserCache() {
    userCache.clear();
}

/**
 * Add a notification for a user
 */
async function addNotification(database, toUserId, message, postId) {
    try {
        const notificationRef = push(ref(database, `notifications/${toUserId}`));
        await set(notificationRef, {
            message: message,
            postId: postId,
            timestamp: new Date().toISOString(),
            read: false
        });
    } catch (error) {
        console.error('Failed to add notification:', error);
    }
}

/**
 * Search user by name (case-insensitive) — returns userId or null
 */
async function searchUserByName(nameLower) {
    try {
        const snapshot = await get(ref(database, 'users'));
        if (!snapshot.exists()) return null;

        let foundId = null;
        snapshot.forEach(child => {
            const userData = child.val();
            if (userData.name && userData.name.replace(/\s/g, '').toLowerCase() === nameLower) {
                foundId = child.key;
            }
        });
        return foundId;
    } catch (error) {
        return null;
    }
}

/**
 * Search user by handle (case-insensitive) — returns userId or null
 */
async function searchUserByHandle(handleLower) {
    try {
        const snapshot = await get(ref(database, `handles/${handleLower}`));
        if (snapshot.exists()) {
            return snapshot.val(); // returns the uid
        }
        return null;
    } catch (error) {
        return null;
    }
}

export { getUserName, getUserProfilePicture, getUserData, addNotification, clearUserCache, searchUserByName, searchUserByHandle };
