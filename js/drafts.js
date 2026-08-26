// Drafts Module — remote drafts with local offline fallback
import { ref, push, set, get, remove, update } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js?v=9';

let auth, database;
const LOCAL_PREFIX = 'mimer-drafts-';
const AUTO_ID = 'local-composer-autosave';

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

function localKey(userId) { return `${LOCAL_PREFIX}${userId}`; }
function readLocal(userId) {
    if (!userId) return [];
    try { return JSON.parse(localStorage.getItem(localKey(userId)) || '[]'); }
    catch (_) { return []; }
}
function writeLocal(userId, drafts) {
    if (!userId) return;
    try { localStorage.setItem(localKey(userId), JSON.stringify(drafts.slice(0, 30))); } catch (_) { /* storage can be unavailable */ }
}
function saveLocalRecord(record) {
    const userId = auth.currentUser?.uid;
    if (!userId) return null;
    const drafts = readLocal(userId).filter(item => item.id !== record.id);
    const saved = { ...record, offline: true, updatedAt: new Date().toISOString() };
    drafts.unshift(saved);
    writeLocal(userId, drafts);
    return saved.id;
}
function removeLocalRecord(draftId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    writeLocal(userId, readLocal(userId).filter(item => item.id !== draftId));
}

async function saveDraft(content, imageUrl, videoUrl, metadata = {}) {
    const userId = auth.currentUser?.uid;
    if (!userId || (!content && !imageUrl && !videoUrl)) return null;
    const payload = {
        content: String(content || ''), imageUrl: imageUrl || null, videoUrl: videoUrl || null,
        createdAt: new Date().toISOString(), scheduledFor: null, published: false, ...metadata
    };
    if (navigator.onLine !== false) {
        try {
            const draftRef = push(ref(database, `drafts/${userId}`));
            await set(draftRef, payload);
            return draftRef.key;
        } catch (error) { console.warn('Remote draft unavailable; using local copy:', error); }
    }
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    saveLocalRecord({ id: localId, ...payload });
    return localId;
}

async function saveComposerDraft(content, imageUrl = '', videoUrl = '') {
    const userId = auth.currentUser?.uid;
    if (!userId || (!content && !imageUrl && !videoUrl)) return null;
    return saveLocalRecord({ id: AUTO_ID, content, imageUrl: imageUrl || null, videoUrl: videoUrl || null, createdAt: new Date().toISOString(), autoSaved: true, published: false });
}

function clearComposerDraft() { removeLocalRecord(AUTO_ID); }

function getLocalComposerDraft() {
    const userId = auth.currentUser?.uid;
    return readLocal(userId).find(item => item.id === AUTO_ID) || null;
}

async function schedulePost(content, imageUrl, videoUrl, scheduledFor) {
    return saveDraft(content, imageUrl, videoUrl, { scheduledFor, published: false });
}

async function getDrafts() {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];
    const localDrafts = readLocal(userId);
    let remoteDrafts = [];
    if (navigator.onLine !== false) {
        try {
            const snapshot = await get(ref(database, `drafts/${userId}`));
            if (snapshot.exists()) snapshot.forEach(child => remoteDrafts.push({ id: child.key, ...child.val() }));
        } catch (_) { /* local drafts remain available offline */ }
    }
    const remoteIds = new Set(remoteDrafts.map(item => item.id));
    const merged = [...remoteDrafts, ...localDrafts.filter(item => !remoteIds.has(item.id))];
    return merged.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

async function getDraft(draftId) {
    const userId = auth.currentUser?.uid;
    if (!userId || !draftId) return null;
    const local = readLocal(userId).find(item => item.id === draftId);
    if (local) return local;
    try {
        const snapshot = await get(ref(database, `drafts/${userId}/${draftId}`));
        return snapshot.exists() ? { id: draftId, ...snapshot.val() } : null;
    } catch (_) { return null; }
}

async function deleteDraft(draftId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;
    if (String(draftId).startsWith('local-')) { removeLocalRecord(draftId); return true; }
    try { await remove(ref(database, `drafts/${userId}/${draftId}`)); return true; }
    catch (error) { console.error('Delete draft error:', error); return false; }
}

async function updateDraft(draftId, updates) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;
    if (String(draftId).startsWith('local-') || draftId === AUTO_ID) {
        const current = readLocal(userId).find(item => item.id === draftId);
        if (!current) return false;
        saveLocalRecord({ ...current, ...updates });
        return true;
    }
    try { await update(ref(database, `drafts/${userId}/${draftId}`), updates); return true; }
    catch (error) { console.error('Update draft error:', error); return false; }
}

function renderDraftsList(drafts) {
    if (!drafts.length) return '<div class="empty-state"><h3>المسودات</h3><p>لا توجد مسودات محفوظة</p></div>';
    let html = '<div class="drafts-list">';
    for (const draft of drafts) {
        const date = new Date(draft.updatedAt || draft.createdAt);
        const dateStr = Number.isNaN(date.getTime()) ? 'غير محدد' : `${date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })} ${date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
        const label = draft.autoSaved ? 'حفظ تلقائي' : (draft.offline ? 'محفوظ دون اتصال' : 'مسودة');
        html += `<div class="draft-item" data-draft-id="${escapeHtml(draft.id)}" onclick="loadDraft('${escapeHtml(draft.id)}')"><div class="draft-content">${escapeHtml(draft.content || '').substring(0, 160) || 'مسودة وسائط'}</div><div class="draft-meta"><span>${label} · ${dateStr}</span>${draft.scheduledFor ? `<span class="draft-scheduled">مجدول</span>` : ''}</div><div class="draft-actions"><button type="button" class="draft-publish" onclick="event.stopPropagation(); publishDraftAction('${escapeHtml(draft.id)}')">نشر</button><button type="button" class="draft-delete" onclick="event.stopPropagation(); deleteDraftAction('${escapeHtml(draft.id)}')" aria-label="حذف المسودة"><i class="fas fa-trash"></i></button></div></div>`;
    }
    return `${html}</div>`;
}

export { init, saveDraft, saveComposerDraft, clearComposerDraft, getLocalComposerDraft, schedulePost, getDrafts, getDraft, deleteDraft, updateDraft, renderDraftsList };
