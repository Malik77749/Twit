// Communities Module — Groups/Communities (like X Communities)
import { ref, push, set, get, update, remove } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js?v=3';
import { getUserData } from './firebase-helpers.js?v=3';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Create a community
 */
async function createCommunity(name, description, category, isPrivate) {
    const userId = auth.currentUser?.uid;
    if (!userId || !name.trim()) return null;

    try {
        const commRef = push(ref(database, 'communities'));
        const commData = {
            name: escapeHtml(name.trim()),
            description: escapeHtml(description || ''),
            category: category || 'عام',
            isPrivate: isPrivate || false,
            ownerId: userId,
            memberCount: 1,
            postCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            rules: [],
            icon: null
        };

        await set(commRef, commData);

        // Add creator as admin member
        await set(ref(database, `communityMembers/${commRef.key}/${userId}`), {
            role: 'admin',
            joinedAt: new Date().toISOString()
        });

        return commRef.key;
    } catch (error) {
        console.error('Create community error:', error);
        return null;
    }
}

/**
 * Join a community
 */
async function joinCommunity(communityId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;

    try {
        const memberRef = ref(database, `communityMembers/${communityId}/${userId}`);
        const existing = await get(memberRef);
        if (existing.exists()) return false;

        await set(memberRef, {
            role: 'member',
            joinedAt: new Date().toISOString()
        });

        // Update member count
        const commSnap = await get(ref(database, `communities/${communityId}`));
        if (commSnap.exists()) {
            await update(ref(database, `communities/${communityId}`), {
                memberCount: (commSnap.val().memberCount || 0) + 1,
                updatedAt: new Date().toISOString()
            });
        }

        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Leave a community
 */
async function leaveCommunity(communityId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;

    try {
        await remove(ref(database, `communityMembers/${communityId}/${userId}`));

        const commSnap = await get(ref(database, `communities/${communityId}`));
        if (commSnap.exists()) {
            await update(ref(database, `communities/${communityId}`), {
                memberCount: Math.max(0, (commSnap.val().memberCount || 0) - 1),
                updatedAt: new Date().toISOString()
            });
        }

        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Post to a community
 */
async function postToCommunity(communityId, postId) {
    try {
        await set(ref(database, `communityPosts/${communityId}/${postId}`), {
            timestamp: new Date().toISOString()
        });

        const commSnap = await get(ref(database, `communities/${communityId}`));
        if (commSnap.exists()) {
            await update(ref(database, `communities/${communityId}`), {
                postCount: (commSnap.val().postCount || 0) + 1,
                updatedAt: new Date().toISOString()
            });
        }

        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Get all communities
 */
async function getAllCommunities() {
    try {
        const snapshot = await get(ref(database, 'communities'));
        if (!snapshot.exists()) return [];

        const communities = [];
        snapshot.forEach(child => {
            communities.push({ id: child.key, ...child.val() });
        });

        communities.sort((a, b) => b.memberCount - a.memberCount);
        return communities;
    } catch (error) {
        return [];
    }
}

/**
 * Get user's communities
 */
async function getUserCommunities(userId) {
    if (!userId) return [];

    try {
        const snapshot = await get(ref(database, 'communityMembers'));
        if (!snapshot.exists()) return [];

        const communityIds = [];
        snapshot.forEach(commSnap => {
            if (commSnap.hasChild(userId)) {
                communityIds.push(commSnap.key);
            }
        });

        const communities = [];
        for (const cid of communityIds) {
            const commSnap = await get(ref(database, `communities/${cid}`));
            if (commSnap.exists()) {
                communities.push({ id: cid, ...commSnap.val() });
            }
        }

        return communities;
    } catch (error) {
        return [];
    }
}

/**
 * Check if user is member
 */
async function isMember(communityId, userId) {
    if (!userId) return false;
    try {
        const snapshot = await get(ref(database, `communityMembers/${communityId}/${userId}`));
        return snapshot.exists();
    } catch (error) {
        return false;
    }
}

/**
 * Get community feed (post IDs)
 */
async function getCommunityFeed(communityId) {
    try {
        const snapshot = await get(ref(database, `communityPosts/${communityId}`));
        if (!snapshot.exists()) return [];

        const postIds = [];
        snapshot.forEach(child => {
            postIds.push(child.key);
        });

        return postIds;
    } catch (error) {
        return [];
    }
}

/**
 * Render communities list
 */
function renderCommunities(communities, userCommunities) {
    if (!communities.length) {
        return `
            <div class="empty-state">
                <h3>المجتمعات</h3>
                <p>لا توجد مجتمعات بعد</p>
                <button class="follow-btn" style="background:var(--accent);color:white;margin-top:12px;" onclick="createCommunityAction()">إنشاء مجتمع</button>
            </div>
        `;
    }

    const userCommIds = new Set(userCommunities.map(c => c.id));

    let html = '<div class="communities-list">';
    for (const comm of communities) {
        const isMember = userCommIds.has(comm.id);
        const categoryIcons = {
            'تقنية': '💻',
            'رياضة': '⚽',
            'فن': '🎨',
            'علوم': '🔬',
            'أعمال': '💼',
            'عام': '🌐'
        };
        const icon = categoryIcons[comm.category] || '🌐';

        html += `
            <div class="community-item" onclick="showCommunityDetail('${comm.id}')">
                <div class="community-icon">${icon}</div>
                <div class="community-info">
                    <div class="community-name">${escapeHtml(comm.name)}</div>
                    <div class="community-meta">
                        ${comm.isPrivate ? '<i class="fas fa-lock"></i> خاصة' : '<i class="fas fa-earth-americas"></i> عامة'}
                        · ${comm.memberCount || 0} عضو
                        · ${comm.postCount || 0} منشور
                    </div>
                    ${comm.description ? `<div class="community-desc">${escapeHtml(comm.description).substring(0, 80)}</div>` : ''}
                </div>
                <button class="follow-btn ${isMember ? 'following' : ''}" onclick="event.stopPropagation(); toggleCommunityMembership('${comm.id}', ${isMember})">
                    ${isMember ? 'عضو' : 'انضمام'}
                </button>
            </div>
        `;
    }
    html += '</div>';
    return html;
}

export {
    init,
    createCommunity,
    joinCommunity,
    leaveCommunity,
    postToCommunity,
    getAllCommunities,
    getUserCommunities,
    isMember,
    getCommunityFeed,
    renderCommunities
};
