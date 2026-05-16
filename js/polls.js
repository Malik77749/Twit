// Polls Module — Create and Vote on Polls
import { ref, push, set, get, update, remove } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { escapeHtml } from './utils.js?v=3';

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Create a poll
 */
async function createPoll(postId, question, options, durationHours) {
    const userId = auth.currentUser?.uid;
    if (!userId || !question.trim() || options.length < 2) return null;

    const pollData = {
        postId: postId,
        userId: userId,
        question: escapeHtml(question.trim()),
        options: {},
        totalVotes: 0,
        endsAt: new Date(Date.now() + (durationHours || 24) * 3600000).toISOString(),
        createdAt: new Date().toISOString(),
        ended: false
    };

    options.forEach((opt, index) => {
        pollData.options[`opt${index}`] = {
            text: escapeHtml(opt.trim()),
            votes: 0
        };
    });

    const pollRef = ref(database, `polls/${postId}`);
    await set(pollRef, pollData);
    return pollData;
}

/**
 * Vote on a poll
 */
async function vote(postId, optionKey) {
    const userId = auth.currentUser?.uid;
    if (!userId) return false;

    // Check if already voted
    const voteRef = ref(database, `pollVotes/${postId}/${userId}`);
    const existingVote = await get(voteRef);
    if (existingVote.exists()) return false;

    // Check if poll ended
    const pollRef = ref(database, `polls/${postId}`);
    const pollSnap = await get(pollRef);
    if (!pollSnap.exists()) return false;

    const poll = pollSnap.val();
    if (new Date(poll.endsAt) < new Date()) return false;

    // Record vote
    await set(voteRef, {
        option: optionKey,
        timestamp: new Date().toISOString()
    });

    // Increment vote count
    const currentVotes = poll.options[optionKey]?.votes || 0;
    await update(ref(database, `polls/${postId}/options/${optionKey}`), {
        votes: currentVotes + 1
    });
    await update(ref(database, `polls/${postId}`), {
        totalVotes: (poll.totalVotes || 0) + 1
    });

    return true;
}

/**
 * Get poll data
 */
async function getPoll(postId) {
    try {
        const snapshot = await get(ref(database, `polls/${postId}`));
        if (!snapshot.exists()) return null;
        const poll = snapshot.val();

        // Check if ended
        if (new Date(poll.endsAt) < new Date() && !poll.ended) {
            await update(ref(database, `polls/${postId}`), { ended: true });
            poll.ended = true;
        }

        return poll;
    } catch (error) {
        return null;
    }
}

/**
 * Check if user voted and which option
 */
async function getUserVote(postId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return null;

    try {
        const snapshot = await get(ref(database, `pollVotes/${postId}/${userId}`));
        if (snapshot.exists()) return snapshot.val().option;
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Delete a poll
 */
async function deletePoll(postId) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
        const pollSnap = await get(ref(database, `polls/${postId}`));
        if (pollSnap.exists() && pollSnap.val().userId === userId) {
            await remove(ref(database, `polls/${postId}`));
            await remove(ref(database, `pollVotes/${postId}`));
        }
    } catch (error) {
        console.error('Delete poll error:', error);
    }
}

/**
 * Get remaining time text
 */
function getTimeRemaining(endsAt) {
    const now = new Date();
    const end = new Date(endsAt);
    const diff = end - now;

    if (diff <= 0) return 'انتهى';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);

    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        return `${days} يوم`;
    }
    if (hours > 0) return `${hours} ساعة ${minutes} دقيقة`;
    return `${minutes} دقيقة`;
}

/**
 * Render poll HTML (for feed)
 */
function renderPollHTML(poll, userVote) {
    if (!poll) return '';

    const isEnded = poll.ended || new Date(poll.endsAt) < new Date();
    const hasVoted = userVote !== null;
    const totalVotes = poll.totalVotes || 0;

    let optionsHTML = '';
    const optionKeys = Object.keys(poll.options || {});

    for (const key of optionKeys) {
        const opt = poll.options[key];
        const votes = opt.votes || 0;
        const percent = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const isSelected = userVote === key;
        const showResults = hasVoted || isEnded;

        if (showResults) {
            optionsHTML += `
                <div class="poll-option-result ${isSelected ? 'selected' : ''}">
                    <div class="poll-bar" style="width: ${percent}%"></div>
                    <span class="poll-option-text">${escapeHtml(opt.text)}</span>
                    <span class="poll-percent">${percent}%</span>
                    ${isSelected ? '<i class="fas fa-circle-check poll-check"></i>' : ''}
                </div>
            `;
        } else {
            optionsHTML += `
                <button class="poll-option-btn" onclick="votePoll('${poll.postId}', '${key}')">
                    ${escapeHtml(opt.text)}
                </button>
            `;
        }
    }

    return `
        <div class="poll-container">
            <div class="poll-question">${escapeHtml(poll.question)}</div>
            <div class="poll-options">${optionsHTML}</div>
            <div class="poll-footer">
                <span>${totalVotes} صوت${totalVotes !== 1 ? 'ات' : ''}</span>
                <span>·</span>
                <span>${isEnded ? 'انتهى' : getTimeRemaining(poll.endsAt) + ' متبقي'}</span>
            </div>
        </div>
    `;
}

/**
 * Render poll composer UI
 */
function renderPollComposer() {
    return `
        <div class="poll-composer" id="poll-composer" style="display:none;">
            <div class="poll-composer-header">
                <span>إنشاء استطلاع</span>
                <button class="poll-remove" onclick="removePoll()"><i class="fas fa-times"></i></button>
            </div>
            <input type="text" class="poll-input" id="poll-question" placeholder="اسأل سؤالاً..." maxlength="200">
            <div class="poll-options-input">
                <input type="text" class="poll-input" id="poll-opt1" placeholder="الخيار 1" maxlength="100">
                <input type="text" class="poll-input" id="poll-opt2" placeholder="الخيار 2" maxlength="100">
            </div>
            <button class="poll-add-option" onclick="addPollOption()"><i class="fas fa-plus"></i> إضافة خيار</button>
            <div class="poll-duration">
                <label>المدة:</label>
                <select id="poll-duration" class="poll-select">
                    <option value="1">ساعة واحدة</option>
                    <option value="6">6 ساعات</option>
                    <option value="24" selected>24 ساعة</option>
                    <option value="168">7 أيام</option>
                </select>
            </div>
        </div>
    `;
}

export {
    init,
    createPoll,
    vote,
    getPoll,
    getUserVote,
    deletePoll,
    getTimeRemaining,
    renderPollHTML,
    renderPollComposer
};
