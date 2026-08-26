// Profile Module
import { ref, get, set, update, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { showLoading, hideLoading, showView } from './ui.js?v=11';
import { getUserData } from './firebase-helpers.js?v=9';
import { showToast } from './utils.js?v=9';
import { renderPost, renderRetweet, reportPost } from './posts.js?v=24';
import { escapeHtml } from './utils.js?v=9';
import * as cloudinary from './cloudinary.js?v=11';
import * as imageCdn from './image-cdn.js?v=10';
import * as lists from './lists.js?v=9';
import * as blockMute from './block-mute.js?v=9';

const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#333" width="40" height="40" rx="20"/><circle cx="20" cy="15" r="7" fill="#555"/><path d="M8 36c0-7 5-12 12-12s12 5 12 12" fill="#555"/></svg>');

function safeImageUrl(value) {
    const raw = String(value || '').trim();
    return /^(https?:\/\/|data:image\/)/i.test(raw) ? raw : DEFAULT_AVATAR;
}

function isSafeRemoteImageUrl(value) {
    const raw = String(value || '').trim();
    return /^(https:\/\/|http:\/\/|data:image\/)/i.test(raw);
}

let auth, database;
let currentProfileUserId = null;
let pendingCroppedImages = { avatar: null, banner: null };
let cropState = null;

function init(authInstance, databaseInstance) {
    auth = authInstance;
    database = databaseInstance;
}

function renderProfileError(container, message = 'تعذر تحميل البيانات') {
    if (!container) return;
    container.innerHTML = `<div class="empty-state profile-error-state"><h3>${escapeHtml(message)}</h3><p>تحقق من الاتصال ثم حاول مرة أخرى.</p><button class="follow-btn" type="button" onclick="showProfile(window.currentProfileUserId || '')">إعادة المحاولة</button></div>`;
}

async function showProfile(userId) {
    showLoading();
    userId = userId || auth.currentUser?.uid;
    if (!userId) { hideLoading(); return; }
    currentProfileUserId = userId;
    window.currentProfileUserId = userId;

    try {
        const userData = await getUserData(database, userId);
        if (!userData || !Object.keys(userData).length) throw new Error('PROFILE_NOT_FOUND');
        const isOwnProfile = userId === auth.currentUser?.uid;
        const profileView = document.getElementById('profile-view');
        profileView?.classList.toggle('profile-view-public', !isOwnProfile);
        profileView?.classList.toggle('profile-view-own', isOwnProfile);
        const publicShareButton = document.getElementById('profile-public-share');
        const notificationButton = document.getElementById('profile-notification-button');
        if (publicShareButton) {
            publicShareButton.toggleAttribute('hidden', isOwnProfile);
            publicShareButton.onclick = () => window.shareProfile?.(userId);
        }
        if (notificationButton) {
            notificationButton.toggleAttribute('hidden', isOwnProfile);
            notificationButton.onclick = () => window.openAccountNotificationSettings?.(userId, userData.handle || userData.name || 'الحساب');
        }

        const protectedIcon = userData.isProtected ? ' <i class="fas fa-lock" style="font-size:14px;color:var(--text-secondary);"></i>' : '';
        document.getElementById('profile-name').innerHTML = escapeHtml(userData.name || 'مستخدم') + protectedIcon;
        document.getElementById('profile-view-name').innerHTML = escapeHtml(userData.name || 'مستخدم') + protectedIcon;
        document.getElementById('profile-handle').textContent = '@' + (userData.handle || (userData.name || 'user').replace(/\s/g, '').toLowerCase());
        const numericIdEl = document.getElementById('profile-numeric-id');
        if (numericIdEl) numericIdEl.textContent = userData.numericId ? `معرّف ميمر: ${userData.numericId}` : 'معرّف ميمر: قيد التحديث';
        const followerRecords = await get(ref(database, `followers/${userId}`));
        const allFollowerRecords = await get(ref(database, 'followers'));
        let liveFollowingCount = 0;
        if (allFollowerRecords.exists()) allFollowerRecords.forEach(target => { if (target.hasChild(userId)) liveFollowingCount += 1; });
        document.getElementById('profile-followers').textContent = followerRecords.exists() ? Object.keys(followerRecords.val() || {}).length : 0;
        document.getElementById('profile-following').textContent = liveFollowingCount;
        document.getElementById('profile-picture').src = userData.profilePicture || DEFAULT_AVATAR;

        // Join date
        if (userData.joinDate) {
            const d = new Date(userData.joinDate);
            const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
            document.getElementById('profile-join-date').innerHTML = `<i class="far fa-calendar"></i> انضم في ${months[d.getMonth()]} ${d.getFullYear()}`;
        }

        // Bio (if exists)
        const bioEl = document.getElementById('profile-bio');
        if (bioEl) {
            bioEl.textContent = userData.bio || '';
            bioEl.style.display = userData.bio ? 'block' : 'none';
        }

        // Website + Location (if exists)
        const websiteEl = document.getElementById('profile-website');
        const locationEl = document.getElementById('profile-location');
        if (websiteEl) {
            if (userData.website) {
                websiteEl.innerHTML = `<i class="fas fa-link"></i> <a href="${escapeHtml(userData.website)}" target="_blank" rel="noopener noreferrer" style="color:var(--text-link);">${escapeHtml(userData.website)}</a>`;
                websiteEl.style.display = 'block';
            } else {
                websiteEl.style.display = 'none';
            }
        }
        if (locationEl) {
            if (userData.location) {
                locationEl.innerHTML = `<i class="fas fa-location-dot"></i> ${escapeHtml(userData.location)}`;
                locationEl.style.display = 'block';
            } else {
                locationEl.style.display = 'none';
            }
        }

        // Banner image
        const bannerEl = document.querySelector('.profile-banner');
        if (bannerEl) {
            if (userData.banner) {
                bannerEl.style.backgroundImage = `url(${userData.banner})`;
                bannerEl.style.backgroundSize = 'cover';
                bannerEl.style.backgroundPosition = 'center';
                bannerEl.querySelector('.profile-banner-gradient').style.display = 'none';
            } else {
                bannerEl.style.backgroundImage = '';
                const grad = bannerEl.querySelector('.profile-banner-gradient');
                if (grad) grad.style.display = 'block';
            }
        }

        // Profile actions
        const actionsDiv = document.getElementById('profile-actions');
        if (!actionsDiv) throw new Error('PROFILE_ACTIONS_NOT_FOUND');
        if (isOwnProfile) {
            actionsDiv.innerHTML = `
                <button class="profile-edit-btn" onclick="editProfile()">تعديل الملف الشخصي</button>
                <div id="profile-edit-form" style="display:none;margin-top:12px;">
                    <input type="text" class="auth-input" id="profile-name-input" placeholder="الاسم الجديد" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;" value="${escapeHtml(userData.name || '')}">
                    <div class="profile-handle-edit"><span>@</span><input type="text" class="auth-input" id="profile-handle-input" placeholder="اسم المستخدم" dir="ltr" maxlength="20" autocomplete="off" value="${escapeHtml(userData.handle || '')}"></div>
                    <div class="profile-media-pickers">
                        <label class="profile-file-picker"><i class="fas fa-user-circle"></i><span>تغيير الصورة الشخصية</span><input type="file" id="profile-avatar-file" accept="image/jpeg,image/png,image/webp"></label>
                        <label class="profile-file-picker"><i class="fas fa-panorama"></i><span>تغيير صورة الغلاف</span><input type="file" id="profile-banner-file" accept="image/jpeg,image/png,image/webp"></label>
                    </div>
                    <div class="profile-crop-hint">يمكنك تحريك الصورة وتكبيرها وقص الجزء المناسب قبل الحفظ.</div>
                    <input type="text" class="auth-input" id="profile-picture-url" placeholder="أو رابط صورة الملف الشخصي" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;">
                    <input type="text" class="auth-input" id="profile-banner-url" placeholder="أو رابط صورة الغلاف" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;" value="${escapeHtml(userData.banner || '')}">
                    <input type="text" class="auth-input" id="profile-bio-input" placeholder="نبذة عنك" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;" value="${escapeHtml(userData.bio || '')}">
                    <input type="text" class="auth-input" id="profile-website-input" placeholder="الموقع الإلكتروني" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;" value="${escapeHtml(userData.website || '')}">
                    <input type="text" class="auth-input" id="profile-location-input" placeholder="الموقع الجغرافي" style="font-size:14px;padding:8px 12px;margin-bottom:8px;max-width:250px;" value="${escapeHtml(userData.location || '')}">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <input type="checkbox" id="profile-protected-input" ${userData.isProtected ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent);">
                        <label for="profile-protected-input" style="font-size:14px;color:var(--text-primary);cursor:pointer;"><i class="fas fa-lock"></i> حساب خاص (المنشورات تظهر للمتابعين فقط)</label>
                    </div>
                    <div class="profile-edit-actions"><button class="follow-btn" type="button" onclick="saveProfile()" style="font-size:13px;padding:4px 12px;background:var(--accent);color:white;">حفظ</button><button class="profile-edit-cancel" type="button" data-profile-edit-cancel>إلغاء</button></div>
                </div>
            `;
        } else {
            const followSnap = await get(ref(database, `followers/${userId}/${auth.currentUser.uid}`));
            const isFollowing = followSnap.exists();
            if (notificationButton) {
                notificationButton.toggleAttribute('hidden', !isFollowing);
                notificationButton.onclick = () => window.openAccountNotificationSettings?.(userId, userData.handle || userData.name || 'الحساب');
                if (isFollowing) await updateNotificationButton(notificationButton, userId);
            }
            const canMessage = typeof window.canMessageUser === 'function' ? await window.canMessageUser(userId) : true;
            actionsDiv.innerHTML = `
                <div class="profile-public-actions">
                    ${canMessage ? `<button class="profile-message-btn" type="button" onclick="openDMWithUser('${userId}')"><i class="far fa-envelope" aria-hidden="true"></i><span>رسالة</span></button>` : ''}
                    <button class="follow-btn profile-follow-btn ${isFollowing ? 'following' : ''}" data-follow-id="${userId}" onclick="followUser('${userId}', event)">${isFollowing ? 'متابَع' : 'متابعة'}</button>
                    <button class="profile-more-btn" type="button" aria-label="خيارات الحساب" onclick="openProfileOptions('${userId}', '${escapeHtml(userData.handle || userData.name || 'الحساب').replace(/'/g, '&#39;')}', event)"><i class="fas fa-ellipsis" aria-hidden="true"></i></button>
                </div>
            `;
        }

        // Profile tabs — make them functional
        const tabs = document.querySelectorAll('.profile-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const tabType = tab.dataset.tab;
                loadProfileTab(userId, tabType);
            };
        });

        // Reset to "posts" tab
            tabs.forEach(t => t.classList.remove('active'));
        tabs[0]?.classList.add('active');

        document.getElementById('profile-avatar-file')?.addEventListener('change', (event) => { handleImageSelection(event.target.files?.[0], 'avatar'); event.target.value = ''; });
        document.getElementById('profile-banner-file')?.addEventListener('change', (event) => { handleImageSelection(event.target.files?.[0], 'banner'); event.target.value = ''; });

        const avatarTarget = document.getElementById('profile-avatar-target');
        const avatarTrigger = document.getElementById('profile-avatar-edit-trigger');
        const bannerTrigger = document.getElementById('profile-banner-edit-trigger');
        const cancelEditButton = document.querySelector('[data-profile-edit-cancel]');
        const openAvatarPicker = () => {
            if (!document.getElementById('profile-view')?.classList.contains('profile-editing')) return;
            triggerProfileImageUpload('avatar');
        };
        const openBannerPicker = () => {
            if (!document.getElementById('profile-view')?.classList.contains('profile-editing')) return;
            triggerProfileImageUpload('banner');
        };
        if (isOwnProfile) {
            avatarTarget?.addEventListener('click', openAvatarPicker);
            avatarTarget?.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAvatarPicker(); } });
            bannerEl?.addEventListener('click', (event) => { if (!event.target.closest('button')) openBannerPicker(); });
            avatarTrigger?.addEventListener('click', (event) => { event.stopPropagation(); openAvatarPicker(); });
            bannerTrigger?.addEventListener('click', (event) => { event.stopPropagation(); openBannerPicker(); });
            cancelEditButton?.addEventListener('click', () => editProfile(false));
        }
        setProfileEditMode(false);

        showView('profile');
        await loadProfilePosts(userId);
    } catch (error) {
        console.error('Profile load error:', error);
        showView('profile');
        renderProfileError(document.getElementById('profile-posts'), error.message === 'PROFILE_NOT_FOUND' ? 'الحساب غير موجود' : 'تعذر تحميل الملف الشخصي');
        hideLoading();
    }
}

function setProfileEditMode(enabled) {
    const view = document.getElementById('profile-view');
    const form = document.getElementById('profile-edit-form');
    const avatarTrigger = document.getElementById('profile-avatar-edit-trigger');
    const bannerTrigger = document.getElementById('profile-banner-edit-trigger');
    const avatarTarget = document.getElementById('profile-avatar-target');
    const headerName = document.getElementById('profile-view-name');
    const editTitle = document.getElementById('profile-edit-title');
    const topSave = document.getElementById('profile-edit-top-save');
    const backButton = document.getElementById('profile-back-btn');
    if (!view) return;
    view.classList.toggle('profile-editing', Boolean(enabled));
    headerName?.toggleAttribute('hidden', Boolean(enabled));
    editTitle?.toggleAttribute('hidden', !enabled);
    topSave?.toggleAttribute('hidden', !enabled);
    if (backButton) {
        backButton.setAttribute('aria-label', enabled ? 'إلغاء التعديل' : 'رجوع');
        backButton.onclick = enabled ? () => editProfile(false) : () => window.showHome?.();
    }
    [avatarTrigger, bannerTrigger].forEach((button) => {
        if (!button) return;
        if (enabled) button.removeAttribute('hidden');
        else button.setAttribute('hidden', '');
    });
    if (avatarTarget) {
        avatarTarget.setAttribute('role', enabled ? 'button' : 'img');
        avatarTarget.setAttribute('tabindex', enabled ? '0' : '-1');
        avatarTarget.setAttribute('aria-label', enabled ? 'تغيير الصورة الشخصية' : 'صورة الملف الشخصي');
    }
    if (form) form.style.display = enabled ? 'block' : 'none';
}

function editProfile(force) {
    const form = document.getElementById('profile-edit-form');
    if (!form) return;
    const view = document.getElementById('profile-view');
    const open = typeof force === 'boolean' ? force : !view?.classList.contains('profile-editing');
    if (open) {
        setProfileEditMode(true);
    } else {
        closeCropper();
        pendingCroppedImages = { avatar: null, banner: null };
        setProfileEditMode(false);
    }
}

function triggerProfileImageUpload(type) {
    const inputId = type === 'banner' ? 'profile-banner-file' : 'profile-avatar-file';
    const input = document.getElementById(inputId);
    if (!input) {
        showToast('افتح تعديل الملف الشخصي أولًا');
        return;
    }
    input.click();
}

function closeCropper() {
    document.getElementById('mimer-image-cropper')?.remove();
    if (cropState?.url) URL.revokeObjectURL(cropState.url);
    cropState = null;
}

function drawCropper() {
    if (!cropState) return;
    const canvas = document.getElementById('mimer-crop-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const outW = cropState.type === 'banner' ? 840 : 420;
    const outH = cropState.type === 'banner' ? 300 : 420;
    canvas.width = outW; canvas.height = outH;
    ctx.fillStyle = '#070b16'; ctx.fillRect(0, 0, outW, outH);
    const image = cropState.image;
    const scale = Math.max(outW / image.width, outH / image.height) * cropState.zoom;
    const w = image.width * scale; const h = image.height * scale;
    ctx.drawImage(image, (outW - w) / 2 + cropState.x, (outH - h) / 2 + cropState.y, w, h);
}

function openCropper(file, type) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
        closeCropper();
        cropState = { type, url, image, zoom: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0 };
        const modal = document.createElement('div');
        modal.id = 'mimer-image-cropper';
        modal.className = 'image-cropper-modal';
        modal.innerHTML = `<div class="image-cropper-card" role="dialog" aria-modal="true" aria-label="قص الصورة"><div class="image-cropper-head"><strong>${type === 'banner' ? 'قص صورة الغلاف' : 'قص الصورة الشخصية'}</strong><button type="button" class="icon-btn" data-crop-cancel aria-label="إغلاق">×</button></div><canvas id="mimer-crop-canvas"></canvas><label class="crop-zoom-label">التكبير <input id="mimer-crop-zoom" type="range" min="1" max="3" step="0.05" value="1"></label><div class="image-cropper-actions"><button type="button" class="secondary-btn" data-crop-cancel>إلغاء</button><button type="button" class="primary-btn" data-crop-save>اعتماد القص</button></div></div>`;
        document.body.appendChild(modal);
        drawCropper();
        const canvas = document.getElementById('mimer-crop-canvas');
        canvas.addEventListener('pointerdown', (event) => { cropState.dragging = true; cropState.startX = event.clientX - cropState.x; cropState.startY = event.clientY - cropState.y; canvas.setPointerCapture(event.pointerId); });
        canvas.addEventListener('pointermove', (event) => { if (!cropState.dragging) return; cropState.x = event.clientX - cropState.startX; cropState.y = event.clientY - cropState.startY; drawCropper(); });
        canvas.addEventListener('pointerup', () => { cropState.dragging = false; });
        document.getElementById('mimer-crop-zoom').addEventListener('input', (event) => { cropState.zoom = Number(event.target.value); drawCropper(); });
        modal.querySelectorAll('[data-crop-cancel]').forEach((button) => button.addEventListener('click', closeCropper));
        modal.querySelector('[data-crop-save]').addEventListener('click', () => canvas.toBlob((blob) => { pendingCroppedImages[type] = blob; closeCropper(); showToast('تم تجهيز الصورة للحفظ'); }, 'image/jpeg', 0.9));
    };
    image.src = url;
}

function handleImageSelection(file, type) { openCropper(file, type); }

async function uploadCroppedImage(blob, type) {
    if (!blob || !auth.currentUser) return null;
    const file = new File([blob], `${type}-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
    const uploaded = await cloudinary.uploadMedia(file, { folder: `mimer/profiles/${auth.currentUser.uid}` });
    return uploaded.secureUrl;
}

async function saveProfile() {
    const nameInput = document.getElementById('profile-name-input');
    const handleInput = document.getElementById('profile-handle-input');
    const picInput = document.getElementById('profile-picture-url');
    const bannerInput = document.getElementById('profile-banner-url');
    const bioInput = document.getElementById('profile-bio-input');
    const websiteInput = document.getElementById('profile-website-input');
    const locationInput = document.getElementById('profile-location-input');

    const name = nameInput?.value.trim();
    const newHandle = String(handleInput?.value || '').trim().replace(/^@+/, '').toLowerCase();
    const picUrl = picInput?.value.trim();
    const bannerUrl = bannerInput?.value.trim();
    const bio = bioInput?.value.trim();
    const website = websiteInput?.value.trim();
    const location = locationInput?.value.trim();
    const isProtected = document.getElementById('profile-protected-input')?.checked || false;

    if (!name) { alert('أدخل اسمك'); return; }
    if (!/^[a-z0-9_.]{3,20}$/.test(newHandle)) { alert('اسم المستخدم يجب أن يكون 3-20 حرفًا إنجليزيًا أو رقمًا'); return; }

    showLoading();
    try {
        const currentUserData = await getUserData(database, auth.currentUser.uid);
        const oldHandle = String(currentUserData.handle || '').toLowerCase();
        if (newHandle !== oldHandle) {
            const claim = await runTransaction(ref(database, `handles/${newHandle}`), current => current === null ? auth.currentUser.uid : current);
            if (!claim.committed || claim.snapshot.val() !== auth.currentUser.uid) throw new Error('HANDLE_TAKEN');
            if (oldHandle) await update(ref(database), { [`handles/${oldHandle}`]: null });
        }
        const updates = { name, handle: newHandle, isProtected };
        if (bio !== undefined) updates.bio = bio;
        if (website !== undefined) updates.website = website;
        if (location !== undefined) updates.location = location;

        if (pendingCroppedImages.avatar) {
            try {
                const uploadedAvatar = await uploadCroppedImage(pendingCroppedImages.avatar, 'avatar');
                if (uploadedAvatar) updates.profilePicture = uploadedAvatar;
                else throw new Error('CLOUDINARY_UNAVAILABLE');
            } catch (uploadError) {
                pendingCroppedImages.avatar = null;
                showToast('تم حفظ بيانات الملف، لكن تعذر رفع الصورة إلى Cloudinary');
            }
        } else if (picUrl) {
            if (!isSafeRemoteImageUrl(picUrl)) throw new Error('INVALID_PROFILE_IMAGE_URL');
            updates.profilePicture = picUrl;
        }

        if (pendingCroppedImages.banner) {
            try {
                const uploadedBanner = await uploadCroppedImage(pendingCroppedImages.banner, 'banner');
                if (uploadedBanner) updates.banner = uploadedBanner;
                else throw new Error('CLOUDINARY_UNAVAILABLE');
            } catch (uploadError) {
                pendingCroppedImages.banner = null;
                showToast('تم حفظ بيانات الملف، لكن تعذر رفع صورة الغلاف إلى Cloudinary');
            }
        } else if (bannerUrl) {
            if (!isSafeRemoteImageUrl(bannerUrl)) throw new Error('INVALID_PROFILE_IMAGE_URL');
            updates.banner = bannerUrl;
        }

        await update(ref(database, 'users/' + auth.currentUser.uid), updates);

        // Update UI
        document.getElementById('profile-name').textContent = name;
        document.getElementById('profile-view-name').textContent = name;
        // Keep existing handle if set, otherwise generate from name
        const currentHandle = document.getElementById('profile-handle').textContent.replace('@', '');
        document.getElementById('profile-handle').textContent = '@' + (currentHandle || name.replace(/\s/g, '').toLowerCase());

        if (updates.profilePicture) {
            document.getElementById('profile-picture').src = updates.profilePicture;
            document.getElementById('sidebar-avatar').src = updates.profilePicture;
            document.getElementById('composer-avatar').src = updates.profilePicture;
        }

        pendingCroppedImages = { avatar: null, banner: null };
        // Update banner
        if (updates.banner) {
            const bannerEl = document.querySelector('.profile-banner');
            if (bannerEl) {
                bannerEl.style.backgroundImage = `url(${updates.banner})`;
                bannerEl.style.backgroundSize = 'cover';
                bannerEl.style.backgroundPosition = 'center';
                const grad = bannerEl.querySelector('.profile-banner-gradient');
                if (grad) grad.style.display = 'none';
            }
        }

        // Update bio
        const bioEl = document.getElementById('profile-bio');
        if (bioEl) {
            bioEl.textContent = bio || '';
            bioEl.style.display = bio ? 'block' : 'none';
        }

        // Update website
        const websiteEl = document.getElementById('profile-website');
        if (websiteEl) {
            if (website) {
                websiteEl.innerHTML = `<i class="fas fa-link"></i> <a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer" style="color:var(--text-link);">${escapeHtml(website)}</a>`;
                websiteEl.style.display = 'block';
            } else {
                websiteEl.style.display = 'none';
            }
        }

        // Update location
        const locationEl = document.getElementById('profile-location');
        if (locationEl) {
            if (location) {
                locationEl.innerHTML = `<i class="fas fa-location-dot"></i> ${escapeHtml(location)}`;
                locationEl.style.display = 'block';
            } else {
                locationEl.style.display = 'none';
            }
        }

        // Update sidebar name
        document.getElementById('sidebar-name').textContent = name;
        document.getElementById('drawer-name').textContent = name;

        document.getElementById('profile-handle').textContent = '@' + newHandle;
        const numericIdEl = document.getElementById('profile-numeric-id');
        if (numericIdEl && currentUserData.numericId) numericIdEl.textContent = `معرّف ميمر: ${currentUserData.numericId}`;
            editProfile(false);
        showToast('تم تحديث الملف الشخصي');
    } catch (error) {
        alert(error.message === 'HANDLE_TAKEN' ? 'اسم المستخدم مستخدم بالفعل' : 'تعذر حفظ التعديلات، تحقق من البيانات وحاول مرة أخرى');
    } finally {
        hideLoading();
    }
}

// ===== Profile Tab Loading =====

async function loadProfileTab(userId, tabType) {
    const container = document.getElementById('profile-posts');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    switch (tabType) {
        case 'posts':
            await loadProfilePosts(userId);
            break;
        case 'replies':
            await loadProfileReplies(userId, container);
            break;
        case 'media':
            await loadProfileMedia(userId, container);
            break;
        case 'likes':
            await loadProfileLikes(userId, container);
            break;
        default:
            await loadProfilePosts(userId);
    }
}

function renderProfilePostFallback(item, container) {
    const userName = item.userName || 'مستخدم';
    const handle = item.userHandle || userName.replace(/\s/g, '').toLowerCase();
    container.innerHTML = `<article class="tweet profile-post-fallback" data-post-id="${escapeHtml(item.id || '')}" onclick="window.openPostDetail?.('${escapeHtml(item.id || '')}')"><div class="tweet-body"><div class="tweet-header"><strong class="tweet-name">${escapeHtml(userName)}</strong><span class="tweet-handle">@${escapeHtml(handle)}</span><span class="tweet-time">${escapeHtml(item.timestamp || '')}</span></div>${item.content ? `<div class="tweet-content">${escapeHtml(item.content)}</div>` : ''}<div class="profile-fallback-note">عرض المنشور</div></div></article>`;
}

async function loadProfilePosts(userId) {
    const container = document.getElementById('profile-posts');
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
        const [postsSnap, retweetsSnap, userSnap] = await Promise.all([
            get(ref(database, 'posts')),
            get(ref(database, 'retweets')),
            get(ref(database, 'users/' + userId))
        ]);

        container.innerHTML = '';
        const allItems = [];
        const userData = userSnap.val() || {};
        const pinnedPostId = userData.pinnedPost;

        if (postsSnap.exists()) {
            postsSnap.forEach(child => {
                if (child.val().userId === userId) {
                    allItems.push({ id: child.key, ...child.val(), type: 'post' });
                }
            });
        }
        if (retweetsSnap.exists()) {
            retweetsSnap.forEach(child => {
                if (child.val().userId === userId) {
                    allItems.push({ id: child.key, ...child.val(), type: 'retweet' });
                }
            });
        }

        document.getElementById('profile-view-count').textContent = `${allItems.length} منشورات`;

        if (!allItems.length && !pinnedPostId) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد منشورات</p></div>';
            hideLoading();
            return;
        }

        allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Show pinned post first (if exists)
        if (pinnedPostId) {
            const pinnedSnap = await get(ref(database, 'posts/' + pinnedPostId));
            if (pinnedSnap.exists()) {
                const pinnedEl = document.createElement('div');
                pinnedEl.setAttribute('data-post-id', pinnedPostId);
                pinnedEl.style.borderBottom = '2px solid var(--accent)';
                container.appendChild(pinnedEl);
                await renderPost({ id: pinnedPostId, ...pinnedSnap.val(), isPinned: true }, pinnedEl);

                // Remove pinned from regular list
                const pinnedIdx = allItems.findIndex(i => i.id === pinnedPostId);
                if (pinnedIdx !== -1) allItems.splice(pinnedIdx, 1);
            }
        }

        for (const item of allItems) {
            const el = document.createElement('div');
            el.setAttribute('data-post-id', item.id);
            container.appendChild(el);
            if (item.type === 'post') {
                try {
                    await renderPost(item, el);
                } catch (renderError) {
                    console.error('Profile post render error:', renderError);
                    renderProfilePostFallback(item, el);
                }
            } else {
                try {
                    const snap = await get(ref(database, 'posts/' + item.originalPostId));
                    if (snap.exists()) {
                        await renderRetweet(item, { id: snap.key, ...snap.val() }, el);
                    }
                } catch (renderError) {
                    console.error('Profile retweet render error:', renderError);
                    renderProfilePostFallback(item, el);
                }
            }
        }

        hideLoading();
    } catch (error) {
        console.error('Profile posts load error:', error);
        renderProfileError(container, 'تعذر تحميل منشورات الحساب');
        hideLoading();
    }
}

async function loadProfileReplies(userId, container) {
    try {
        const commentsSnap = await get(ref(database, 'comments'));
        if (!commentsSnap.exists()) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد ردود</p></div>';
            hideLoading();
            return;
        }

        const userComments = [];
        commentsSnap.forEach(postCommentsSnap => {
            const postId = postCommentsSnap.key;
            postCommentsSnap.forEach(commentSnap => {
                const comment = commentSnap.val();
                if (comment.userId === userId) {
                    userComments.push({ postId, ...comment });
                }
            });
        });

        if (!userComments.length) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد ردود</p></div>';
            hideLoading();
            return;
        }

        userComments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        container.innerHTML = '';
        for (const comment of userComments.slice(0, 20)) {
            const postSnap = await get(ref(database, `posts/${comment.postId}`));
            if (!postSnap.exists()) continue;

            const post = postSnap.val();
            const postUser = await getUserData(database, post.userId);

            const el = document.createElement('div');
            el.className = 'comment-section';
            el.style.display = 'block';
            el.style.padding = '12px 16px';
            el.innerHTML = `
                <div style="color:var(--text-secondary);font-size:13px;margin-bottom:8px;">
                    الرد على <span style="color:var(--accent);cursor:pointer;" onclick="showProfile('${post.userId}')">@${escapeHtml(postUser.name || 'مستخدم')}</span>
                </div>
                <div style="font-size:15px;margin-bottom:8px;">${escapeHtml(comment.content)}</div>
                <div style="color:var(--text-secondary);font-size:13px;cursor:pointer;" onclick="openPostDetail('${comment.postId}')">
                    عرض المنشور الأصلي ←
                </div>
            `;
            container.appendChild(el);
        }

        hideLoading();
    } catch (error) {
        console.error('Profile tab load error:', error);
        renderProfileError(container, 'تعذر تحميل هذا القسم');
        hideLoading();
    }
}

async function loadProfileMedia(userId, container) {
    try {
        const postsSnap = await get(ref(database, 'posts'));
        if (!postsSnap.exists()) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد وسائط</p></div>';
            hideLoading();
            return;
        }

        const mediaPosts = [];
        postsSnap.forEach(child => {
            const post = child.val();
            const hasCloudinaryMedia = Array.isArray(post.media) && post.media.some(item => item?.url);
            if (post.userId === userId && (hasCloudinaryMedia || post.imageUrl || post.videoUrl)) {
                mediaPosts.push({ id: child.key, ...post });
            }
        });

        if (!mediaPosts.length) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد وسائط</p></div>';
            hideLoading();
            return;
        }

        mediaPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        container.innerHTML = '';
        // Show as a grid of media
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:2px;';
        for (const post of mediaPosts) {
            const mediaItems = Array.isArray(post.media) && post.media.length
                ? post.media.filter(item => item?.url)
                : post.imageUrl
                    ? [{ type: 'image', url: post.imageUrl }]
                    : post.videoUrl
                        ? [{ type: 'embed', url: post.videoUrl }]
                        : [];
            const firstMedia = mediaItems[0];
            const mediaUrl = String(firstMedia?.url || '');
            const el = document.createElement('div');
            el.style.cssText = 'aspect-ratio:1;overflow:hidden;cursor:pointer;position:relative;background:var(--bg-secondary);';
            el.setAttribute('aria-label', firstMedia?.type === 'video' || firstMedia?.type === 'embed' ? 'فتح فيديو المنشور' : 'فتح صورة المنشور');
            el.onclick = () => {
                if (firstMedia?.type === 'image' && mediaUrl) openLightbox(mediaUrl);
                else openPostDetail(post.id);
            };
            if (firstMedia?.type === 'image' && mediaUrl) {
                el.innerHTML = imageCdn.createResponsiveImage(mediaUrl, 'صورة المنشور');
                const img = el.querySelector('img');
                if (img) { img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover'; }
            } else {
                el.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"><i class="fas fa-play" style="font-size:32px;color:var(--text-secondary);"></i></div>`;
            }
            if (mediaItems.length > 1) {
                const count = document.createElement('span');
                count.textContent = `+${mediaItems.length - 1}`;
                count.style.cssText = 'position:absolute;top:8px;left:8px;padding:3px 7px;border-radius:999px;background:rgba(0,0,0,.7);color:#fff;font-size:12px;font-weight:700;';
                el.appendChild(count);
            }
            grid.appendChild(el);
        }
        container.appendChild(grid);

        hideLoading();
    } catch (error) {
        console.error('Profile tab load error:', error);
        renderProfileError(container, 'تعذر تحميل هذا القسم');
        hideLoading();
    }
}

async function loadProfileLikes(userId, container) {
    try {
        const likesSnap = await get(ref(database, 'likes'));
        if (!likesSnap.exists()) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد إعجابات</p></div>';
            hideLoading();
            return;
        }

        const likedPostIds = [];
        likesSnap.forEach(postLikesSnap => {
            if (postLikesSnap.hasChild(userId)) {
                likedPostIds.push(postLikesSnap.key);
            }
        });

        if (!likedPostIds.length) {
            container.innerHTML = '<div class="empty-state"><p>لا توجد إعجابات</p></div>';
            hideLoading();
            return;
        }

        container.innerHTML = '';
        for (const postId of likedPostIds.slice(0, 20)) {
            const postSnap = await get(ref(database, `posts/${postId}`));
            if (!postSnap.exists()) continue;

            const el = document.createElement('div');
            el.setAttribute('data-post-id', postId);
            container.appendChild(el);
            await renderPost({ id: postId, ...postSnap.val() }, el);
        }

        hideLoading();
    } catch (error) {
        console.error('Profile tab load error:', error);
        renderProfileError(container, 'تعذر تحميل هذا القسم');
        hideLoading();
    }
}

async function updateProfilePicture() {
    const url = document.getElementById('profile-picture-url')?.value.trim();
    if (!url) { alert('أدخل رابط الصورة'); return; }

    showLoading();
    try {
        new URL(url);
        await update(ref(database, 'users/' + auth.currentUser.uid), { profilePicture: url });
        document.getElementById('profile-picture').src = url;
        document.getElementById('sidebar-avatar').src = url;
        document.getElementById('composer-avatar').src = url;
        document.getElementById('profile-picture-url').value = '';
        alert('تم التحديث');
    } catch (error) {
        alert('رابط غير صالح');
    } finally {
        hideLoading();
    }
}

/**
 * Show list of followers for a user
 */
async function showFollowersList(userId) {
    const container = document.getElementById('profile-posts');
    if (!container) return;
    userId = userId || window.currentProfileUserId || auth.currentUser?.uid;
    if (!userId) { renderProfileError(container, 'لم يتم تحديد الحساب'); return; }
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
        const followersSnap = await get(ref(database, `followers/${userId}`));
        if (!followersSnap.exists()) {
            container.innerHTML = '<div class="empty-state"><p>لا يوجد متابعون</p></div>';
            return;
        }

        container.innerHTML = '';
        const followerIds = [];
        followersSnap.forEach(child => { followerIds.push(child.key); });

        for (const fid of followerIds.slice(0, 30)) {
            const userData = await getUserData(database, fid);
            if (!userData || !userData.name) continue;

            const isFollowing = (await get(ref(database, `followers/${fid}/${auth.currentUser?.uid}`))).exists();
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-color);cursor:pointer;';
            el.onclick = () => showProfile(fid);
            el.innerHTML = `
                <img src="${escapeHtml(safeImageUrl(userData.profilePicture))}" style="width:40px;height:40px;border-radius:50%;" alt="">
                <div style="flex:1;">
                    <div style="font-weight:700;font-size:15px;">${escapeHtml(userData.name)}</div>
                    <div style="color:var(--text-secondary);font-size:13px;">@${escapeHtml(userData.handle || userData.name).replace(/\s/g, '').toLowerCase()}</div>
                </div>
                ${fid !== auth.currentUser?.uid ? `<button class="follow-btn ${isFollowing ? 'following' : ''}" onclick="event.stopPropagation(); followUser('${fid}', event)">${isFollowing ? 'متابَع' : 'متابعة'}</button>` : ''}
            `;
            container.appendChild(el);
        }

        if (!container.children.length) {
            container.innerHTML = '<div class="empty-state"><p>لا يوجد متابعون</p></div>';
        }
    } catch (error) {
        console.error('Followers list error:', error);
        renderProfileError(container, 'تعذر تحميل المتابعين');
    }
}

/**
 * Show list of users this account is following
 */
async function showFollowingList(userId) {
    const container = document.getElementById('profile-posts');
    if (!container) return;
    userId = userId || window.currentProfileUserId || auth.currentUser?.uid;
    if (!userId) { renderProfileError(container, 'لم يتم تحديد الحساب'); return; }
    container.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
        const allFollowersSnap = await get(ref(database, 'followers'));
        if (!allFollowersSnap.exists()) {
            container.innerHTML = '<div class="empty-state"><p>لا يتابع أحداً</p></div>';
            return;
        }

        container.innerHTML = '';
        const followingIds = [];

        // Find all users where this userId is a follower
        allFollowersSnap.forEach(targetUserSnap => {
            if (targetUserSnap.hasChild(userId)) {
                followingIds.push(targetUserSnap.key);
            }
        });

        for (const fid of followingIds.slice(0, 30)) {
            const userData = await getUserData(database, fid);
            if (!userData || !userData.name) continue;

            const isFollowing = (await get(ref(database, `followers/${fid}/${auth.currentUser?.uid}`))).exists();
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-color);cursor:pointer;';
            el.onclick = () => showProfile(fid);
            el.innerHTML = `
                <img src="${escapeHtml(safeImageUrl(userData.profilePicture))}" style="width:40px;height:40px;border-radius:50%;" alt="">
                <div style="flex:1;">
                    <div style="font-weight:700;font-size:15px;">${escapeHtml(userData.name)}</div>
                    <div style="color:var(--text-secondary);font-size:13px;">@${escapeHtml(userData.handle || userData.name).replace(/\s/g, '').toLowerCase()}</div>
                </div>
                ${fid !== auth.currentUser?.uid ? `<button class="follow-btn ${isFollowing ? 'following' : ''}" onclick="event.stopPropagation(); followUser('${fid}', event)">${isFollowing ? 'متابَع' : 'متابعة'}</button>` : ''}
            `;
            container.appendChild(el);
        }

        if (!container.children.length) {
            container.innerHTML = '<div class="empty-state"><p>لا يتابع أحداً</p></div>';
        }
    } catch (error) {
        console.error('Following list error:', error);
        renderProfileError(container, 'تعذر تحميل الحسابات التي يتابعها');
    }
}

const ACCOUNT_NOTIFICATION_MODES = {
    all: { title: 'جميع المنشورات', description: 'احصل على تنبيهات لجميع منشورات هذا الحساب.' },
    posts_replies: { title: 'جميع المنشورات والردود', description: 'احصل على تنبيهات المنشورات والردود الخاصة بهذا الحساب.' },
    live: { title: 'فيديو البث المباشر فقط', description: 'احصل على تنبيهات البث المباشر فقط.' },
    none: { title: 'إيقاف', description: 'أوقف التنبيهات الخاصة بمنشورات هذا الحساب.' }
};

async function getAccountNotificationMode(userId) {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId || !userId) return 'none';
    try {
        const snap = await get(ref(database, `notificationPreferences/${currentUserId}/${userId}`));
        const mode = snap.val()?.mode;
        return ACCOUNT_NOTIFICATION_MODES[mode] ? mode : 'none';
    } catch (error) { return 'none'; }
}

async function updateNotificationButton(button, userId) {
    if (!button) return;
    const mode = await getAccountNotificationMode(userId);
    button.classList.toggle('is-active', mode !== 'none');
    button.setAttribute('aria-label', mode === 'none' ? 'تفعيل إشعارات الحساب' : `إشعارات الحساب: ${ACCOUNT_NOTIFICATION_MODES[mode].title}`);
    const icon = button.querySelector('i');
    if (icon) icon.className = `fas ${mode === 'none' ? 'fa-bell-plus' : 'fa-bell'}`;
}

window.syncProfileNotificationButton = async function(userId, isFollowing) {
    const button = document.getElementById('profile-notification-button');
    if (!button || window.currentProfileUserId !== userId) return;
    button.toggleAttribute('hidden', !isFollowing);
    if (isFollowing) await updateNotificationButton(button, userId);
};

function closeAccountNotificationSettings() {
    document.getElementById('account-notification-backdrop')?.remove();
    document.body.classList.remove('modal-open');
}

window.openAccountNotificationSettings = async function(userId, rawHandle) {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId || !userId || userId === currentUserId) return;
    closeAccountNotificationSettings();
    const handle = String(rawHandle || 'الحساب').replace(/^@/, '').trim();
    const backdrop = document.createElement('div');
    backdrop.id = 'account-notification-backdrop';
    backdrop.className = 'account-notification-backdrop';
    backdrop.innerHTML = `<section class="account-notification-sheet" role="dialog" aria-modal="true" aria-labelledby="account-notification-title"><div class="account-notification-grabber" aria-hidden="true"></div><div class="account-notification-header"><div><h2 id="account-notification-title">لا تفوت أي شيء</h2><p>@${escapeHtml(handle)}</p></div><button type="button" class="post-menu-close" aria-label="إغلاق">×</button></div><div class="account-notification-options"></div></section>`;
    document.body.appendChild(backdrop);
    document.body.classList.add('modal-open');
    backdrop.querySelector('.post-menu-close')?.addEventListener('click', closeAccountNotificationSettings);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) closeAccountNotificationSettings(); });
    const currentMode = await getAccountNotificationMode(userId);
    const options = backdrop.querySelector('.account-notification-options');
    options.innerHTML = Object.entries(ACCOUNT_NOTIFICATION_MODES).map(([mode, data]) => `<button type="button" class="account-notification-option ${mode === currentMode ? 'active' : ''}" data-mode="${mode}" aria-pressed="${mode === currentMode}"><span class="account-notification-radio" aria-hidden="true"></span><span><strong>${data.title}</strong><small>${data.description}</small></span></button>`).join('');
    options.querySelectorAll('.account-notification-option').forEach(option => option.addEventListener('click', async () => {
        const mode = option.dataset.mode;
        options.querySelectorAll('.account-notification-option').forEach(item => { item.classList.remove('active'); item.setAttribute('aria-pressed', 'false'); });
        option.classList.add('active'); option.setAttribute('aria-pressed', 'true');
        try {
            await set(ref(database, `notificationPreferences/${currentUserId}/${userId}`), { mode, updatedAt: new Date().toISOString() });
            const button = document.getElementById('profile-notification-button');
            await updateNotificationButton(button, userId);
            showToast(mode === 'none' ? 'تم إيقاف إشعارات الحساب' : 'تم تحديث إشعارات الحساب');
            closeAccountNotificationSettings();
        } catch (error) { showToast('تعذر حفظ إعدادات الإشعارات'); }
    }));
};

function closeProfileOptions() {
    document.getElementById('profile-options-backdrop')?.remove();
    document.body.classList.remove('modal-open');
}

window.openProfileOptions = async function(userId, rawHandle, event) {
    event?.preventDefault();
    event?.stopPropagation();
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId || !userId || userId === currentUserId) return;
    closeProfileOptions();
    const handle = String(rawHandle || 'الحساب').replace(/^@/, '').trim();
    const anchorRect = event?.currentTarget?.getBoundingClientRect();
    const backdrop = document.createElement('div');
    backdrop.id = 'profile-options-backdrop';
    backdrop.className = 'profile-options-backdrop';
    backdrop.innerHTML = `<section class="profile-options-sheet" role="dialog" aria-modal="true" aria-label="خيارات الحساب"><div class="profile-options-header"><span class="post-menu-grabber" aria-hidden="true"></span><strong>خيارات الحساب</strong><button type="button" class="post-menu-close" aria-label="إغلاق">×</button></div><div class="profile-options-body"><div class="spinner"></div></div></section>`;
    document.body.appendChild(backdrop);
    if (anchorRect) {
        const estimatedHeight = 390;
        const top = Math.max(12, Math.min(anchorRect.bottom + 8, window.innerHeight - estimatedHeight - 12));
        const start = Math.max(12, Math.min(anchorRect.left, window.innerWidth - 360 - 12));
        backdrop.style.setProperty('--profile-options-top', `${top}px`);
        backdrop.style.setProperty('--profile-options-start', `${start}px`);
    }
    document.body.classList.add('modal-open');
    backdrop.querySelector('.post-menu-close')?.addEventListener('click', closeProfileOptions);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeProfileOptions(); });
    const body = backdrop.querySelector('.profile-options-body');
    const button = (id, icon, label, danger = false) => `<button type="button" class="profile-option-row ${danger ? 'danger' : ''}" id="${id}"><i class="fas ${icon}" aria-hidden="true"></i><span>${label}</span></button>`;
    body.innerHTML = [
        button('profile-option-lists', 'fa-list-check', 'إضافة/إزالة من القوائم'),
        button('profile-option-view-lists', 'fa-list', 'عرض القوائم'),
        button('profile-option-listed-in', 'fa-list-ul', 'القوائم المدرج بها'),
        button('profile-option-mute', 'fa-volume-xmark', `كتم @${escapeHtml(handle)}`),
        button('profile-option-block', 'fa-ban', `حظر @${escapeHtml(handle)}`, true),
        button('profile-option-report', 'fa-flag', `الإبلاغ عن @${escapeHtml(handle)}`, true)
    ].join('');
    body.querySelector('#profile-option-lists')?.addEventListener('click', () => { closeProfileOptions(); window.openPostListsPicker?.('', userId); });
    body.querySelector('#profile-option-view-lists')?.addEventListener('click', () => { closeProfileOptions(); window.showLists?.(); });
    body.querySelector('#profile-option-listed-in')?.addEventListener('click', async () => {
        const listsData = await lists.getUserLists(currentUserId);
        const memberships = [];
        for (const list of listsData) {
            if ((await get(ref(database, `listMembers/${currentUserId}/${list.id}/${userId}`))).exists()) memberships.push(list);
        }
        if (!memberships.length) { showToast('هذا الحساب غير مدرج في قوائمك'); return; }
        body.innerHTML = `<div class="profile-listed-title">مدرج في قوائمك</div>${memberships.map(list => `<div class="profile-listed-row"><i class="fas fa-list"></i><span>${escapeHtml(list.name || 'قائمة بلا اسم')}</span><small>${list.isPrivate ? 'خاصة' : 'عامة'}</small></div>`).join('')}<button type="button" class="profile-listed-back">رجوع</button>`;
        body.querySelector('.profile-listed-back')?.addEventListener('click', () => window.openProfileOptions(userId, handle, event));
    });
    body.querySelector('#profile-option-mute')?.addEventListener('click', async () => { closeProfileOptions(); await blockMute.muteUser(userId); });
    body.querySelector('#profile-option-block')?.addEventListener('click', async () => { if (!confirm(`حظر @${handle}؟`)) return; closeProfileOptions(); const ok = await blockMute.blockUser(userId); if (ok) window.showHome?.(); });
    body.querySelector('#profile-option-report')?.addEventListener('click', () => { closeProfileOptions(); reportPost(null, userId); });
};

async function shareProfile(userId) {
    const url = `${window.location.origin}${window.location.pathname}#profile/${encodeURIComponent(userId)}`;
    try {
        if (navigator.share) {
            await navigator.share({ title: 'ملف على ميمر', url });
        } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            showToast('تم نسخ رابط الملف');
        } else {
            window.prompt('انسخ رابط الملف', url);
        }
    } catch (error) {
        if (error?.name !== 'AbortError') showToast('تعذرت مشاركة الملف');
    }
}

export { init, showProfile, updateProfilePicture, editProfile, saveProfile, showFollowersList, showFollowingList, shareProfile };

// Expose to window for HTML onclick handlers
if (typeof window !== 'undefined') {
    window.saveProfile = saveProfile;
    window.updateProfilePicture = updateProfilePicture;
    window.showFollowersList = showFollowersList;
    window.showFollowingList = showFollowingList;
    window.shareProfile = shareProfile;
    window.syncProfileNotificationButton = window.syncProfileNotificationButton;
}

// ===== MIMER_PROFILE_ENHANCEMENTS_V2 =====
(function () {
    const __originalShowProfile = showProfile;
    showProfile = async function(userId) {
        await __originalShowProfile(userId);
        try {
            const profileUserId = userId || auth.currentUser?.uid;
            const currentUserId = auth.currentUser?.uid;
            if (!profileUserId || !currentUserId || profileUserId === currentUserId) return;

            const followsYouSnap = await get(ref(database, `followers/${currentUserId}/${profileUserId}`));
            const handleEl = document.getElementById('profile-handle');
            if (followsYouSnap.exists() && handleEl && !document.querySelector('.follows-you-badge')) {
                handleEl.insertAdjacentHTML('afterend', '<span class="follows-you-badge">يتابعك</span>');
            }
        } catch (e) {
            console.error('Profile enhancement error:', e);
        }
    };
})();
