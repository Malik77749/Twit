const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.database();
const messaging = admin.messaging();

exports.sendCommentPush = functions.database
  .ref('/notifications/{userId}/{notificationId}')
  .onCreate(async (snapshot, context) => {
    const notification = snapshot.val() || {};
    if (!['comments', 'replies'].includes(notification.type)) return null;

    const tokensSnapshot = await db.ref(`fcmTokens/${context.params.userId}`).once('value');
    const tokenEntries = Object.entries(tokensSnapshot.val() || {})
      .map(([key, value]) => ({ key, token: value?.token }))
      .filter(entry => typeof entry.token === 'string' && entry.token.length > 20);
    if (!tokenEntries.length) return null;

    const link = `https://mimer-23cf6.web.app/?notification=${encodeURIComponent(notification.postId || '')}`;
    const response = await messaging.sendEachForMulticast({
      tokens: tokenEntries.map(entry => entry.token),
      notification: {
        title: notification.type === 'replies' ? 'رد جديد في ميمر' : 'تعليق جديد في ميمر',
        body: notification.message || 'لديك تفاعل جديد على ميمر'
      },
      data: {
        type: String(notification.type),
        postId: String(notification.postId || ''),
        notificationId: String(context.params.notificationId),
        link
      },
      webpush: {
        fcmOptions: { link },
        notification: {
          icon: 'https://mimer-23cf6.web.app/assets/mimer-icon-original.png',
          badge: 'https://mimer-23cf6.web.app/assets/mimer-icon-original.png',
          tag: `mimer-${context.params.notificationId}`,
          renotify: true
        }
      }
    });

    const stale = {};
    response.responses.forEach((result, index) => {
      const code = result.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        stale[`fcmTokens/${context.params.userId}/${tokenEntries[index].key}`] = null;
      }
    });
    if (Object.keys(stale).length) await db.ref().update(stale);
    console.log(`Push ${context.params.notificationId}: ${response.successCount} sent, ${response.failureCount} failed`);
    return null;
  });
