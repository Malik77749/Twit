// Drafts Module — Save and Schedule Posts
import { ref, push, set, get, remove, update } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js?v=3';

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Save a draft
 */
async function saveDraft(content, imageUrl, videoUrl) {
    const userId = auth.currentUser?.uid;
    if (!userId || (!content && !imageUrl && !videoUrl)) return null;

    try {
        const draftRef = push(ref(database, `drafts/${userId}`));
        await set(draftRef, {
            content: escapeHtml(content || ''),
            imageUrl: imageUrl || null,
            videoUrl: videoUrl || null,
            createdAt: new Date().toISOString(),
            scheduledFor: null
        });
        return draftRef.key;
    } catch (error) {
        console.error('Save draft error:', error);
        return null;
    }
}

/**
 * Schedule a post
 */
async function schedulePost(content, imageUrl, videoUrl, scheduledFor) {
    const userId = auth.currentUser?.uid;
    if (!userId || (!content && !imageUrl && !videoUrl)) return null;

    try {
        const draftRef = push(ref(database, `drafts/${userId}`));
        await set(draftRef, {
            content: escapeHtml(content || ''),
            imageUrl: imageUrl || null,
            videoUrl: videoUrl || null,
            createdAt: new Date().toISOString(),
            scheduledFor: scheduledFor,
            published: false
        });
        return draftRef.key;
    } catch (error) {
        console.error('Schedule post error:', error);
        return null;
    }
}

/**
 * Get all drafts for user
 */
async function getDrafts() {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];

    try {
        const snapshot = await get(ref(database, `drafts/${userId}`));
        if (!snapshot.exists()) return [];

        const drafts = [];
        snapshot.forEach(child => {
            drafts.push({ id: child.key, ...child.val() });
        });

        drafts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return drafts;
    } catch (error) {
        return [];
    }
}

/**
 * Delete a draft
 */
async function deleteDraft(draftId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
        await remove(ref(database, `drafts/${userId}/${draftId}`));
    } catch (error) {
        console.error('Delete draft error:', error);
    }
}

/**
 * Update a draft
 */
async function updateDraft(draftId, updates) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
        await update(ref(database, `drafts/${userId}/${draftId}`), updates);
    } catch (error) {
        console.error('Update draft error:', error);
    }
}

/**
 * Render drafts list HTML
 */
function renderDraftsList(drafts) {
    if (!drafts.length) {
        return `
            <div class="empty-state">
                <h3>المسودات</h3>
                <p>لا توجد مسودات محفوظة</p>
            </div>
        `;
    }

    let html = '<div class="drafts-list">';
    for (const draft of drafts) {
        const date = new Date(draft.createdAt);
        const dateStr = date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
        const timeStr = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const scheduled = draft.scheduledFor ? new Date(draft.scheduledFor) : null;
        const scheduledStr = scheduled ? `مجدول: ${scheduled.toLocaleDateString('ar-EG')} ${scheduled.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}` : '';

        html += `
            <div class="draft-item" onclick="loadDraft('${draft.id}')">
                <div class="draft-content">${escapeHtml(draft.content || '').substring(0, 100)}</div>
                <div class="draft-meta">
                    <span>${dateStr} ${timeStr}</span>
                    ${scheduledStr ? `<span class="draft-scheduled">${scheduledStr}</span>` : ''}
                </div>
                <button class="draft-delete" onclick="event.stopPropagation(); deleteDraftAction('${draft.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }
    html += '</div>';
    return html;
}

export {
    init,
    saveDraft,
    schedulePost,
    getDrafts,
    deleteDraft,
    updateDraft,
    renderDraftsList
};
