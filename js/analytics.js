// Analytics Module — Post & Profile Statistics (like X Analytics)
import { ref, get, query, orderByChild, startAt, endAt } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

let auth, database;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

/**
 * Get user's post analytics
 */
async function getUserAnalytics(userId) {
    if (!userId) return null;

    try {
        const postsSnap = await get(ref(database, 'posts'));
        if (!postsSnap.exists()) return getEmptyAnalytics();

        let totalPosts = 0;
        let totalLikes = 0;
        let totalRetweets = 0;
        let totalViews = 0;
        let totalComments = 0;
        const posts = [];

        postsSnap.forEach(child => {
            const post = child.val();
            if (post.userId === userId) {
                totalPosts++;
                totalLikes += post.likes || 0;
                totalRetweets += post.retweets || 0;
                totalViews += post.views || 0;
                totalComments += post.commentCount || 0;
                posts.push({ id: child.key, ...post });
            }
        });

        // Get followers
        const userSnap = await get(ref(database, `users/${userId}`));
        const userData = userSnap.exists() ? userSnap.val() : {};
        const followers = userData.followers || 0;

        // Sort posts by engagement
        posts.sort((a, b) => {
            const engA = (a.likes || 0) + (a.retweets || 0) + (a.commentCount || 0);
            const engB = (b.likes || 0) + (b.retweets || 0) + (b.commentCount || 0);
            return engB - engA;
        });

        // Get last 7 days activity
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const recentPosts = posts.filter(p => p.timestamp >= weekAgo);

        return {
            totalPosts,
            totalLikes,
            totalRetweets,
            totalViews,
            totalComments,
            followers,
            avgLikes: totalPosts > 0 ? Math.round(totalLikes / totalPosts) : 0,
            avgViews: totalPosts > 0 ? Math.round(totalViews / totalPosts) : 0,
            engagementRate: totalViews > 0 ? ((totalLikes + totalRetweets + totalComments) / totalViews * 100).toFixed(2) : 0,
            topPosts: posts.slice(0, 5),
            recentPostsCount: recentPosts.length,
            recentLikes: recentPosts.reduce((sum, p) => sum + (p.likes || 0), 0),
            recentViews: recentPosts.reduce((sum, p) => sum + (p.views || 0), 0)
        };
    } catch (error) {
        console.error('Analytics error:', error);
        return getEmptyAnalytics();
    }
}

function getEmptyAnalytics() {
    return {
        totalPosts: 0, totalLikes: 0, totalRetweets: 0, totalViews: 0,
        totalComments: 0, followers: 0, avgLikes: 0, avgViews: 0,
        engagementRate: 0, topPosts: [], recentPostsCount: 0,
        recentLikes: 0, recentViews: 0
    };
}

/**
 * Format large numbers
 */
function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace('.0', '') + 'K';
    return num.toString();
}

/**
 * Render analytics dashboard HTML
 */
function renderDashboard(analytics, userName) {
    if (!analytics) return '<div class="empty-state"><p>لا توجد بيانات</p></div>';

    const topPostsHtml = analytics.topPosts.map((post, i) => `
        <div class="analytics-top-post" onclick="openPostDetail('${post.id}')">
            <div class="analytics-post-rank">#${i + 1}</div>
            <div class="analytics-post-content">
                <div class="analytics-post-text">${escapeHtml(post.content || '').substring(0, 80)}</div>
                <div class="analytics-post-stats">
                    <span><i class="far fa-eye"></i> ${formatNumber(post.views)}</span>
                    <span><i class="far fa-heart"></i> ${formatNumber(post.likes)}</span>
                    <span><i class="fas fa-retweet"></i> ${formatNumber(post.retweets)}</span>
                </div>
            </div>
        </div>
    `).join('');

    return `
        <div class="analytics-dashboard">
            <div class="analytics-header">
                <h3>إحصائيات ${escapeHtml(userName || '')}</h3>
                <span class="analytics-period">آخر 28 يوم</span>
            </div>

            <!-- Overview Cards -->
            <div class="analytics-cards">
                <div class="analytics-card">
                    <div class="analytics-card-icon"><i class="far fa-eye"></i></div>
                    <div class="analytics-card-value">${formatNumber(analytics.totalViews)}</div>
                    <div class="analytics-card-label">مشاهدات</div>
                    <div class="analytics-card-change positive">+${formatNumber(analytics.recentViews)} هذا الأسبوع</div>
                </div>
                <div class="analytics-card">
                    <div class="analytics-card-icon"><i class="far fa-heart"></i></div>
                    <div class="analytics-card-value">${formatNumber(analytics.totalLikes)}</div>
                    <div class="analytics-card-label">إعجابات</div>
                    <div class="analytics-card-change positive">+${formatNumber(analytics.recentLikes)} هذا الأسبوع</div>
                </div>
                <div class="analytics-card">
                    <div class="analytics-card-icon"><i class="fas fa-retweet"></i></div>
                    <div class="analytics-card-value">${formatNumber(analytics.totalRetweets)}</div>
                    <div class="analytics-card-label">إعادة نشر</div>
                </div>
                <div class="analytics-card">
                    <div class="analytics-card-icon"><i class="fas fa-users"></i></div>
                    <div class="analytics-card-value">${formatNumber(analytics.followers)}</div>
                    <div class="analytics-card-label">متابعين</div>
                </div>
            </div>

            <!-- Engagement Rate -->
            <div class="analytics-engagement">
                <div class="analytics-engagement-label">معدل التفاعل</div>
                <div class="analytics-engagement-value">${analytics.engagementRate}%</div>
                <div class="analytics-engagement-bar">
                    <div class="analytics-engagement-fill" style="width: ${Math.min(analytics.engagementRate * 5, 100)}%"></div>
                </div>
                <div class="analytics-engagement-desc">
                    ${analytics.avgLikes} إعجاب · ${analytics.avgViews} مشاهدة في المتوسط لكل منشور
                </div>
            </div>

            <!-- Top Posts -->
            <div class="analytics-section">
                <h4>أفضل المنشورات أداءً</h4>
                ${topPostsHtml || '<div class="empty-state"><p>لا توجد منشورات</p></div>'}
            </div>

            <!-- Weekly Summary -->
            <div class="analytics-section">
                <h4>ملخص الأسبوع</h4>
                <div class="analytics-weekly">
                    <div class="analytics-weekly-item">
                        <span class="analytics-weekly-num">${analytics.recentPostsCount}</span>
                        <span class="analytics-weekly-label">منشورات جديدة</span>
                    </div>
                    <div class="analytics-weekly-item">
                        <span class="analytics-weekly-num">${formatNumber(analytics.recentLikes)}</span>
                        <span class="analytics-weekly-label">إعجابات جديدة</span>
                    </div>
                    <div class="analytics-weekly-item">
                        <span class="analytics-weekly-num">${formatNumber(analytics.recentViews)}</span>
                        <span class="analytics-weekly-label">مشاهدات جديدة</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export {
    init,
    getUserAnalytics,
    formatNumber,
    renderDashboard
};
