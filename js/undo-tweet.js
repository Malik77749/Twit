// Undo Tweet Module — Cancel tweet within 30 seconds (like X Premium)
import { ref, remove, get } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

let auth, database;
let undoTimer = null;
let lastPostId = null;
let undoCallback = null;
const UNDO_SECONDS = 30;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Start undo timer after posting
 */
function startUndo(postId, onDelete) {
    clearUndo();

    lastPostId = postId;
    undoCallback = onDelete;

    showUndoBar(UNDO_SECONDS);

    let remaining = UNDO_SECONDS;

    undoTimer = setInterval(() => {
        remaining--;
        updateUndoBar(remaining);

        if (remaining <= 0) {
            clearUndo();
        }
    }, 1000);
}

/**
 * Cancel the last post (undo)
 */
async function undoPost() {
    if (!lastPostId) return;

    try {
        const userId = auth.currentUser?.uid;
        if (!userId) return;

        // Verify ownership
        const postSnap = await get(ref(database, `posts/${lastPostId}`));
        if (postSnap.exists() && postSnap.val().userId === userId) {
            await remove(ref(database, `posts/${lastPostId}`));
            await remove(ref(database, `comments/${lastPostId}`));
            await remove(ref(database, `likes/${lastPostId}`));

            // Remove from UI
            document.querySelectorAll(`[data-post-id="${lastPostId}"]`).forEach(el => el.remove());

            if (undoCallback) undoCallback(lastPostId);
        }
    } catch (error) {
        console.error('Undo error:', error);
    }

    clearUndo();
    hideUndoBar();
}

/**
 * Clear the undo timer
 */
function clearUndo() {
    if (undoTimer) {
        clearInterval(undoTimer);
        undoTimer = null;
    }
    lastPostId = null;
    undoCallback = null;
}

/**
 * Show undo bar
 */
function showUndoBar(seconds) {
    let bar = document.getElementById('undo-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'undo-bar';
        bar.className = 'undo-bar';
        document.body.appendChild(bar);
    }

    bar.innerHTML = `
        <div class="undo-bar-content">
            <span>تم النشر</span>
            <button class="undo-btn" onclick="window.undoPost()">تراجع</button>
            <div class="undo-timer">
                <div class="undo-timer-fill" id="undo-timer-fill" style="width:100%"></div>
            </div>
        </div>
    `;

    bar.style.display = 'block';
    requestAnimationFrame(() => bar.classList.add('show'));
}

/**
 * Update undo bar timer
 */
function updateUndoBar(remaining) {
    const fill = document.getElementById('undo-timer-fill');
    if (fill) {
        fill.style.width = `${(remaining / UNDO_SECONDS) * 100}%`;
    }
}

/**
 * Hide undo bar
 */
function hideUndoBar() {
    const bar = document.getElementById('undo-bar');
    if (bar) {
        bar.classList.remove('show');
        setTimeout(() => { bar.style.display = 'none'; }, 300);
    }
}

export {
    init,
    startUndo,
    undoPost,
    clearUndo
};
