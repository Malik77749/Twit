// Lists Module — Custom User Lists (like X Lists)
import { ref, push, set, get, update, remove } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js';
import { getUserData } from './firebase-helpers.js';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Create a new list
 */
async function createList(name, description, isPrivate) {
    const userId = auth.currentUser?.uid;
    if (!userId || !name.trim()) return null;

    try {
        const listRef = push(ref(database, `lists/${userId}`));
        await set(listRef, {
            name: escapeHtml(name.trim()),
            description: escapeHtml(description || ''),
            isPrivate: isPrivate || false,
            memberCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        return listRef.key;
    } catch (error) {
        console.error('Create list error:', error);
        return null;
    }
}

/**
 * Get user's lists
 */
async function getUserLists(userId) {
    if (!userId) return [];

    try {
        const snapshot = await get(ref(database, `lists/${userId}`));
        if (!snapshot.exists()) return [];

        const lists = [];
        snapshot.forEach(child => {
            lists.push({ id: child.key, ...child.val() });
        });

        lists.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        return lists;
    } catch (error) {
        return [];
    }
}

/**
 * Add member to list
 */
async function addMember(listOwnerId, listId, memberId) {
    if (!listOwnerId || !listId || !memberId) return false;

    try {
        await set(ref(database, `listMembers/${listOwnerId}/${listId}/${memberId}`), {
            addedAt: new Date().toISOString()
        });

        // Update member count
        const listSnap = await get(ref(database, `lists/${listOwnerId}/${listId}`));
        if (listSnap.exists()) {
            await update(ref(database, `lists/${listOwnerId}/${listId}`), {
                memberCount: (listSnap.val().memberCount || 0) + 1,
                updatedAt: new Date().toISOString()
            });
        }

        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Remove member from list
 */
async function removeMember(listOwnerId, listId, memberId) {
    if (!listOwnerId || !listId || !memberId) return false;

    try {
        await remove(ref(database, `listMembers/${listOwnerId}/${listId}/${memberId}`));

        const listSnap = await get(ref(database, `lists/${listOwnerId}/${listId}`));
        if (listSnap.exists()) {
            await update(ref(database, `lists/${listOwnerId}/${listId}`), {
                memberCount: Math.max(0, (listSnap.val().memberCount || 0) - 1),
                updatedAt: new Date().toISOString()
            });
        }

        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Get list members
 */
async function getListMembers(listOwnerId, listId) {
    if (!listOwnerId || !listId) return [];

    try {
        const snapshot = await get(ref(database, `listMembers/${listOwnerId}/${listId}`));
        if (!snapshot.exists()) return [];

        const members = [];
        for (const child of snapshot.forEach ? [snapshot] : []) {
            // This iterates differently
        }

        const memberIds = [];
        snapshot.forEach(child => {
            memberIds.push(child.key);
        });

        for (const uid of memberIds) {
            const userData = await getUserData(database, uid);
            members.push({ id: uid, ...userData });
        }

        return members;
    } catch (error) {
        return [];
    }
}

/**
 * Delete a list
 */
async function deleteList(listOwnerId, listId) {
    if (!listOwnerId || !listId) return;

    try {
        await remove(ref(database, `lists/${listOwnerId}/${listId}`));
        await remove(ref(database, `listMembers/${listOwnerId}/${listId}`));
    } catch (error) {
        console.error('Delete list error:', error);
    }
}

/**
 * Load feed for a specific list
 */
async function loadListFeed(listOwnerId, listId) {
    const members = await getListMembers(listOwnerId, listId);
    const memberIds = new Set(members.map(m => m.id));

    // This would need to filter posts by member IDs
    return { members, memberIds };
}

/**
 * Render lists HTML
 */
function renderLists(lists, isOwner) {
    if (!lists.length) {
        return `
            <div class="empty-state">
                <h3>القوائم</h3>
                <p>أنشئ قائمة لتنظيم المتابعين</p>
            </div>
        `;
    }

    let html = '<div class="lists-container">';
    for (const list of lists) {
        html += `
            <div class="list-item" onclick="showListDetail('${list.id}')">
                <div class="list-info">
                    <div class="list-name">${escapeHtml(list.name)}</div>
                    <div class="list-meta">
                        ${list.isPrivate ? '<i class="fas fa-lock"></i> خاصة' : '<i class="fas fa-earth-americas"></i> عامة'}
                        · ${list.memberCount || 0} عضو
                    </div>
                    ${list.description ? `<div class="list-desc">${escapeHtml(list.description)}</div>` : ''}
                </div>
                ${isOwner ? `<button class="list-delete" onclick="event.stopPropagation(); deleteListAction('${list.id}')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        `;
    }
    html += '</div>';
    return html;
}

export {
    init,
    createList,
    getUserLists,
    addMember,
    removeMember,
    getListMembers,
    deleteList,
    loadListFeed,
    renderLists
};
