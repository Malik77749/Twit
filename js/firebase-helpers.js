// Firebase Helper Functions
import { ref, get, set, push } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

/**
 * Get user name by userId
 */
async function getUserName(database, userId) {
    try {
        const snapshot = await get(ref(database, 'users/' + userId));
        const userData = snapshot.val();
        return userData?.name || `مستخدم ${userId.slice(0, 8)}`;
    } catch (error) {
        return `مستخدم ${userId.slice(0, 8)}`;
    }
}

/**
 * Get user profile picture by userId
 */
async function getUserProfilePicture(database, userId) {
    try {
        const snapshot = await get(ref(database, 'users/' + userId));
        const userData = snapshot.val();
        return userData?.profilePicture || 'https://via.placeholder.com/48';
    } catch (error) {
        return 'https://via.placeholder.com/48';
    }
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

export { getUserName, getUserProfilePicture, addNotification };
