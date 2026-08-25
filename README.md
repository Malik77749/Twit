# ميمر Mimer — منصة تواصل اجتماعي عربية بالعربية

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
- **Backend:** Firebase (Auth, Realtime Database؛ Storage اختياري عند تفعيل الخطة المناسبة)
- **Deployment:** Firebase Hosting (`https://mimer-23cf6.web.app/`) مع GitHub Pages كنسخة بديلة
- **أيقونات:** Font Awesome 6.5
- **التصميم:** CSS Variables + Flexbox + Grid

## 📂 بنية المشروع

```
Mimer/
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
cd Mimer
```

2. فتح `index.html` في المتصفح (أو استخدام Live Server)

3. لإعداد Firebase:
   - أنشئ مشروع Firebase على [console.firebase.google.com](https://console.firebase.google.com)
   - فعّل Authentication (Email/Password)
   - فعّل Realtime Database
   - فعّل Storage فقط إذا كانت خطة المشروع تسمح به وتحتاج رفع الوسائط
   - حدّث `js/config.js` بإعدادات مشروعك
   - ارفع `database.rules.json` كقواعد الأمان

## 🧪 الفحص المحلي

لا يحتاج المشروع إلى حزم تشغيل خارجية. بعد تثبيت Node.js 22 أو أحدث، شغّل الأمر التالي للتحقق من صحة JSON، الروابط المحلية، وتركيب وحدات JavaScript:

```bash
npm run check
```

يُنفَّذ الفحص تلقائياً في GitHub Actions قبل أي نشر. كما أن Service Worker يستخدم مسارات نسبية، لذلك يعمل التطبيق عند نشره في جذر الموقع أو داخل مسار فرعي مثل `/Mimer/` على GitHub Pages.

## 🌐 النشر

الموقع الإنتاجي منشور على Firebase Hosting عبر `https://mimer-23cf6.web.app/`، مع نسخة GitHub Pages بديلة. يتم فحص المشروع تلقائياً عبر GitHub Actions عند الدفع إلى branch `main` أو `master`. لا يُستخدم Vercel في إنتاج ميمر.

## 🔒 الأمان

- Firebase Security Rules مُعرّفة في `database.rules.json`
- Rate Limiting على المنشورات والتعليقات والإعجابات
- حماية ضد XSS عبر `escapeHtml()`
- تحقق من حجم الملفات قبل الرفع (حد أقصى 5MB)؛ ويظل رفع الوسائط اختياريًا إذا لم تكن Firebase Storage مفعّلة
- قواعد Firebase تمنع المستخدم من تعديل منشورات أو تعليقات أو محادثات لا يملكها
- أرشفة المنشورات المحذوفة للمراجعة

## 📝 الترخيص

مشروع مفتوح المصدر.
