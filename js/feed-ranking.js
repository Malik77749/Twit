// Explainable, client-side For You ranking for Mimer.
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const SEARCH_HISTORY_KEY = 'mimer-search-history';
const MAX_SEARCH_TERMS = 20;

function tokens(value) {
    return new Set(String(value || '').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}_#@]+/u).map(x => x.replace(/^[@#]/, '')).filter(x => x.length >= 2).slice(0, 80));
}

function readSearchTerms() {
    try {
        const raw = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
        return Array.isArray(raw) ? raw.slice(0, MAX_SEARCH_TERMS).flatMap(tokens) : [];
    } catch (error) { return []; }
}

function rememberSearchTerm(value) {
    const term = String(value || '').trim();
    if (term.length < 2) return;
    try {
        const current = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
        const next = [term, ...(Array.isArray(current) ? current : [])].filter((item, index, list) => String(item).toLowerCase() === term.toLowerCase() ? index === list.findIndex(x => String(x).toLowerCase() === term.toLowerCase()) : true).slice(0, MAX_SEARCH_TERMS);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    } catch (error) { /* Private browsing may deny localStorage. */ }
}

async function loadRankingSignals(database, userId) {
    const empty = { followingIds: new Set(), networkSuggestedIds: new Set(), likedPostIds: new Set(), repostedPostIds: new Set(), interestTerms: new Set() };
    if (!database || !userId) return empty;
    try {
        const [followersSnap, likesSnap, retweetsSnap] = await Promise.all([
            get(ref(database, 'followers')),
            get(ref(database, 'likes')),
            get(ref(database, 'retweets'))
        ]);
        const followingIds = new Set();
        if (followersSnap.exists()) {
            followersSnap.forEach(target => { if (target.hasChild(userId)) followingIds.add(target.key); });
        }
        const networkSuggestedIds = new Set();
        if (followersSnap.exists()) {
            followersSnap.forEach(target => {
                if ([...followingIds].some(followedId => target.hasChild(followedId))) networkSuggestedIds.add(target.key);
            });
        }
        const likedPostIds = new Set();
        if (likesSnap.exists()) likesSnap.forEach(post => { if (post.hasChild(userId)) likedPostIds.add(post.key); });
        const repostedPostIds = new Set();
        const repostedAuthorIds = new Set();
        if (retweetsSnap.exists()) retweetsSnap.forEach(retweet => {
            const value = retweet.val() || {};
            if (value.userId === userId && value.originalPostId) repostedPostIds.add(value.originalPostId);
        });
        return { followingIds, networkSuggestedIds, likedPostIds, repostedPostIds, repostedAuthorIds, interestTerms: new Set(readSearchTerms()) };
    } catch (error) {
        return empty;
    }
}

function rankPostsForYou(posts, signals = {}) {
    const followingIds = signals.followingIds || new Set();
    const networkSuggestedIds = signals.networkSuggestedIds || new Set();
    const likedPostIds = signals.likedPostIds || new Set();
    const repostedPostIds = signals.repostedPostIds || new Set();
    const interestTerms = signals.interestTerms || new Set();
    const now = Date.now();

    return [...posts].map(post => {
        const ageHours = Math.max(0, (now - new Date(post.timestamp || now).getTime()) / 3600000);
        const recency = Math.max(0, 34 * Math.exp(-ageHours / 48));
        const postTerms = tokens(`${post.content || ''} ${post.userHandle || ''}`);
        const topicMatches = [...postTerms].filter(term => interestTerms.has(term)).length;
        const engagement = Math.min(18, Math.log1p(Number(post.likes || 0) + Number(post.retweets || 0) * 1.5 + Number(post.commentCount || 0)) * 3);
        let score = recency + engagement;
        const reasons = [];
        if (followingIds.has(post.userId)) { score += 58; reasons.push('من حساب تتابعه'); }
        if (networkSuggestedIds.has(post.userId) && !followingIds.has(post.userId)) { score += 7; reasons.push('من شبكة متابَعيك'); }
        if (likedPostIds.has(post.id) || repostedPostIds.has(post.id)) { score += 12; reasons.push('قريب من تفاعلاتك'); }
        if (topicMatches) { score += Math.min(24, topicMatches * 8); reasons.push('مرتبط ببحثك أو اهتماماتك'); }
        if (engagement >= 8) reasons.push('تفاعل جيد');
        if (ageHours <= 6) reasons.push('حديث');
        return { ...post, rankingScore: Number(score.toFixed(3)), rankingReasons: reasons };
    }).sort((a, b) => b.rankingScore - a.rankingScore || new Date(b.timestamp) - new Date(a.timestamp));
}

export { loadRankingSignals, rankPostsForYou, rememberSearchTerm };
