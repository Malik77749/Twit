// Trending Module — Dynamic Trending Topics (like X)
import { ref, get, query, orderByChild, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

let database;

function init(databaseInstance) {
    database = databaseInstance;
}

/**
 * Get trending topics from recent posts
 */
async function getTrendingTopics(limit = 10) {
    try {
        // Get recent posts (last 500)
        const postsSnap = await get(query(ref(database, 'posts'), orderByChild('timestamp'), limitToLast(500)));
        if (!postsSnap.exists()) return getDefaultTrends();

        const wordCounts = {};
        const hashtagCounts = {};

        postsSnap.forEach(child => {
            const content = (child.val().content || '').toLowerCase();
            const words = content.split(/\s+/);

            words.forEach(word => {
                // Count hashtags
                if (word.startsWith('#') && word.length > 1) {
                    const tag = word.replace(/[^\u0600-\u06FFa-zA-Z0-9_#]/g, '');
                    hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
                }

                // Count significant Arabic words (3+ chars)
                if (word.length >= 3 && /[\u0600-\u06FF]/.test(word)) {
                    const clean = word.replace(/[^\u0600-\u06FF]/g, '');
                    if (clean.length >= 3) {
                        wordCounts[clean] = (wordCounts[clean] || 0) + 1;
                    }
                }
            });
        });

        // Merge hashtags and words
        const trends = [];

        // Add hashtags first (more relevant)
        Object.entries(hashtagCounts)
            .filter(([_, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([tag, count]) => {
                trends.push({
                    topic: tag,
                    count: count,
                    type: 'hashtag',
                    category: 'ترند'
                });
            });

        // Add trending words
        Object.entries(wordCounts)
            .filter(([_, count]) => count >= 3)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([word, count]) => {
                trends.push({
                    topic: `#${word}`,
                    count: count,
                    type: 'word',
                    category: 'موضوع رائج'
                });
            });

        return trends.length > 0 ? trends.slice(0, limit) : getDefaultTrends();
    } catch (error) {
        return getDefaultTrends();
    }
}

/**
 * Default trends when no data available
 */
function getDefaultTrends() {
    return [
        { topic: '#برمجة', count: 12000, type: 'hashtag', category: 'التكنولوجيا · الأكثر تداولاً' },
        { topic: '#كرة_القدم', count: 8500, type: 'hashtag', category: 'الرياضة · الأكثر تداولاً' },
        { topic: '#السعودية', count: 25000, type: 'hashtag', category: 'ترند' },
        { topic: '#رؤية_2030', count: 18000, type: 'hashtag', category: 'ترند في السعودية' },
        { topic: '#التقنية', count: 5200, type: 'hashtag', category: 'التكنولوجيا · الأكثر تداولاً' }
    ];
}

/**
 * Render trending HTML
 */
function renderTrending(trends) {
    if (!trends.length) return '';

    let html = '<div class="trending-card"><h3>الأكثر تداولاً</h3>';

    for (const trend of trends.slice(0, 5)) {
        const countStr = trend.count >= 1000 ? (trend.count / 1000).toFixed(1).replace('.0', '') + 'K' : trend.count;
        html += `
            <div class="trending-item" onclick="searchTrend('${trend.topic}')">
                <div class="category">${trend.category}</div>
                <div class="topic">${trend.topic}</div>
                <div class="count">${countStr} منشور</div>
            </div>
        `;
    }

    html += '</div>';
    return html;
}

/**
 * Search for a trend
 */
function searchTrend(topic) {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = topic;
        window.handleSearch?.(topic);
    }
    window.navigateTo?.('search');
}

export {
    init,
    getTrendingTopics,
    renderTrending,
    searchTrend
};
