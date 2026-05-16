# Twit — منصة تواصل اجتماعي بالعربية

نسخة مصغرة من X (تويتر) بالكامل بالعربية مع دعم RTL.

## ✨ الميزات

- 🔐 تسجيل دخول بالبريد الإلكتروني وكلمة المرور
- 📝 إنشاء وحذف وتعديل المنشورات
- ❤️ إعجاب، إعادة نشر، حفظ المنشورات
- 💬 تعليقات مع ردود متداخلة
- 👤 ملفات شخصية كاملة مع متابعة
- 🔔 إشعارات فورية
- 🔍 بحث عن مستخدمين ومنشورات
- 📱 تصميم متجاوب (موبايل + تابلت + سطح مكتب)
- ♿ دعم RTL (من اليمين لليسار)
- 🎨 واجهة مظلمة بأسلوب X
- 📄 Pagination مع Infinite Scroll
- 🛡️ Rate Limiting ضد السبام
- 🔒 Firebase Security Rules
- 🗜️ Denormalization لتحسين الأداء

## 🛠️ التقنيات

- **Frontend:** Vanilla HTML/CSS/JavaScript (ES Modules)
- **Backend:** Firebase (Auth, Realtime Database, Storage)
- **Deployment:** GitHub Pages
- **أيقونات:** Font Awesome 6.5
- **التصميم:** CSS Variables + Flexbox + Grid

## 📂 بنية المشروع

```
Twit/
├── index.html              # الصفحة الرئيسية
├── database.rules.json     # قواعد أمان Firebase
├── README.md               # هذا الملف
├── .github/
│   └── workflows/
│       └── deploy.yml      # CI/CD لـ GitHub Pages
├── css/
│   └── style.css           # جميع الأنماط
└── js/
    ├── app.js              # نقطة الدخول الرئيسية
    ├── auth.js             # المصادقة
    ├── config.js           # إعدادات Firebase
    ├── comments.js         # التعليقات
    ├── firebase-helpers.js # دوال مساعدة + تخزين مؤقت
    ├── notifications.js    # الإشعارات
    ├── pagination.js       # التحميل الجزئي
    ├── posts.js            # المنشورات
    ├── profile.js          # الملف الشخصي
    ├── rate-limiter.js     # حماية ضد السبام
    ├── ui.js               # إدارة واجهة المستخدم
    └── utils.js            # دوال مساعدة عامة
```

## 🚀 التشغيل المحلي

1. استنساخ المستودع:
```bash
git clone https://github.com/Malik77749/Twit.git
cd Twit
```

2. فتح `index.html` في المتصفح (أو استخدام Live Server)

3. لإعداد Firebase:
   - أنشئ مشروع Firebase على [console.firebase.google.com](https://console.firebase.google.com)
   - فعّل Authentication (Email/Password)
   - فعّل Realtime Database
   - فعّل Storage
   - حدّث `js/config.js` بإعدادات مشروعك
   - ارفع `database.rules.json` كقواعد الأمان

## 🌐 النشر

المشروع يُنشر تلقائياً على GitHub Pages عبر GitHub Actions عند الدفع على branch `main`.

## 🔒 الأمان

- Firebase Security Rules مُعرّفة في `database.rules.json`
- Rate Limiting على المنشورات والتعليقات والإعجابات
- حماية ضد XSS عبر `escapeHtml()`
- تحقق من حجم الملفات قبل الرفع (حد أقصى 5MB)
- أرشفة المنشورات المحذوفة للمراجعة

## 📝 الترخيص

مشروع مفتوح المصدر.
