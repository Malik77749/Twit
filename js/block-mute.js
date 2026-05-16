// Block & Mute Module — User Safety
import { ref, set, get, remove, push } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { showToast } from './utils.js?v=3';

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

// ===== BLOCK =====

/**
 * Block a user
 */
async function blockUser(targetUserId) {
    const userId = auth.currentUser?.uid;
    if (!userId || userId === targetUserId) return false;

    try {
        await set(ref(database, `blocks/${userId}/${targetUserId}`), {
            timestamp: new Date().toISOString()
        });

        // Also unfollow each other
        await remove(ref(database, `followers/${targetUserId}/${userId}`));
        await remove(ref(database, `followers/${userId}/${targetUserId}`));

        // Remove from muted if exists
        await remove(ref(database, `mutes/${userId}/${targetUserId}`));

        showToast('تم حظر المستخدم');
        return true;
    } catch (error) {
        console.error('Block error:', error);
        showToast('خطأ في الحظر');
        return false;
    }
}

/**
 * Unblock a user
 */
async function unblockUser(targetUserId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;

    try {
        await remove(ref(database, `blocks/${userId}/${targetUserId}`));
        showToast('تم إلغاء الحظر');
        return true;
    } catch (error) {
        console.error('Unblock error:', error);
        return false;
    }
}

/**
 * Check if user is blocked
 */
async function isBlocked(targetUserId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;

    try {
        const snapshot = await get(ref(database, `blocks/${userId}/${targetUserId}`));
        return snapshot.exists();
    } catch (error) {
        return false;
    }
}

/**
 * Check if current user is blocked by target
 */
async function isBlockedBy(targetUserId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;

    try {
        const snapshot = await get(ref(database, `blocks/${targetUserId}/${userId}`));
        return snapshot.exists();
    } catch (error) {
        return false;
    }
}

/**
 * Get all blocked users
 */
async function getBlockedUsers() {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];

    try {
        const snapshot = await get(ref(database, `blocks/${userId}`));
        if (!snapshot.exists()) return [];

        const blocked = [];
        snapshot.forEach(child => {
            blocked.push(child.key);
        });
        return blocked;
    } catch (error) {
        return [];
    }
}

// ===== MUTE =====

/**
 * Mute a user
 */
async function muteUser(targetUserId) {
    const userId = auth.currentUser?.uid;
    if (!userId || userId === targetUserId) return false;

    try {
        await set(ref(database, `mutes/${userId}/${targetUserId}`), {
            timestamp: new Date().toISOString()
        });
        showToast('تم كتم المستخدم');
        return true;
    } catch (error) {
        console.error('Mute error:', error);
        return false;
    }
}

/**
 * Unmute a user
 */
async function unmuteUser(targetUserId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;

    try {
        await remove(ref(database, `mutes/${userId}/${targetUserId}`));
        showToast('تم إلغاء الكتم');
        return true;
    } catch (error) {
        console.error('Unmute error:', error);
        return false;
    }
}

/**
 * Check if user is muted
 */
async function isMuted(targetUserId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;

    try {
        const snapshot = await get(ref(database, `mutes/${userId}/${targetUserId}`));
        return snapshot.exists();
    } catch (error) {
        return false;
    }
}

/**
 * Get all muted users
 */
async function getMutedUsers() {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];

    try {
        const snapshot = await get(ref(database, `mutes/${userId}`));
        if (!snapshot.exists()) return [];

        const muted = [];
        snapshot.forEach(child => {
            muted.push(child.key);
        });
        return muted;
    } catch (error) {
        return [];
    }
}

// ===== FILTER HELPERS =====

/**
 * Filter posts array — remove posts from blocked/muted users
 */
async function filterPosts(postsArray) {
    const userId = auth.currentUser?.uid;
    if (!userId) return postsArray;

    const [blocked, muted] = await Promise.all([
        getBlockedUsers(),
        getMutedUsers()
    ]);

    const blockedSet = new Set(blocked);
    const mutedSet = new Set(muted);

    return postsArray.filter(post => {
        // Completely hide blocked users' posts
        if (blockedSet.has(post.userId)) return false;
        // Hide muted users' posts (soft filter)
        if (mutedSet.has(post.userId)) return false;
        return true;
    });
}

/**
 * Filter users array — remove blocked users from suggestions/search
 */
async function filterUsers(usersArray) {
    const userId = auth.currentUser?.uid;
    if (!userId) return usersArray;

    const blocked = await getBlockedUsers();
    const blockedSet = new Set(blocked);

    return usersArray.filter(user => user.id !== userId && !blockedSet.has(user.id));
}

/**
 * Check if interaction is allowed (not blocked either way)
 */
async function canInteract(targetUserId) {
    const userId = auth.currentUser?.uid;
    if (!userId || userId === targetUserId) return false;

    const [iBlocked, theyBlocked] = await Promise.all([
        isBlocked(targetUserId),
        isBlockedBy(targetUserId)
    ]);

    return !iBlocked && !theyBlocked;
}

// ===== MUTE WORDS =====

/**
 * Add a muted word
 */
async function addMutedWord(word) {
    const userId = auth.currentUser?.uid;
    if (!userId || !word.trim()) return;

    try {
        const wordRef = ref(database, `mutedWords/${userId}/${btoa(word.trim())}`);
        await set(wordRef, {
            word: word.trim().toLowerCase(),
            timestamp: new Date().toISOString()
        });
        showToast('تم كتم الكلمة');
    } catch (error) {
        console.error('Add muted word error:', error);
    }
}

/**
 * Remove a muted word
 */
async function removeMutedWord(word) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
        await remove(ref(database, `mutedWords/${userId}/${btoa(word.trim())}`));
        showToast('تم إلغاء كتم الكلمة');
    } catch (error) {
        console.error('Remove muted word error:', error);
    }
}

/**
 * Get all muted words
 */
async function getMutedWords() {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];

    try {
        const snapshot = await get(ref(database, `mutedWords/${userId}`));
        if (!snapshot.exists()) return [];

        const words = [];
        snapshot.forEach(child => {
            words.push(child.val().word);
        });
        return words;
    } catch (error) {
        return [];
    }
}

/**
 * Check if text contains muted words
 */
async function containsMutedWord(text) {
    const words = await getMutedWords();
    if (!words.length) return false;

    const lowerText = text.toLowerCase();
    return words.some(word => lowerText.includes(word));
}

/**
 * Filter posts by muted words
 */
async function filterByMutedWords(postsArray) {
    const words = await getMutedWords();
    if (!words.length) return postsArray;

    return postsArray.filter(post => {
        if (!post.content) return true;
        const lowerContent = post.content.toLowerCase();
        return !words.some(word => lowerContent.includes(word));
    });
}

export {
    init,
    blockUser,
    unblockUser,
    isBlocked,
    isBlockedBy,
    getBlockedUsers,
    muteUser,
    unmuteUser,
    isMuted,
    getMutedUsers,
    filterPosts,
    filterUsers,
    canInteract,
    addMutedWord,
    removeMutedWord,
    getMutedWords,
    containsMutedWord,
    filterByMutedWords
};
