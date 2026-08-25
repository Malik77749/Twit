import { cloudinaryConfig } from './config.js?v=9';

const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm'
]);

function isCloudinaryReady() {
    return Boolean(cloudinaryConfig?.cloudName && cloudinaryConfig?.uploadPreset);
}

function validateMediaFile(file) {
    if (!file || typeof file !== 'object') throw new Error('MEDIA_FILE_MISSING');
    if (!ALLOWED_MEDIA_TYPES.has(file.type)) throw new Error('MEDIA_TYPE_UNSUPPORTED');
    if (file.size > MAX_MEDIA_BYTES) throw new Error('MEDIA_TOO_LARGE');
}

async function uploadMedia(file, { folder = 'mimer/media' } = {}) {
    validateMediaFile(file);
    if (!isCloudinaryReady()) throw new Error('CLOUDINARY_NOT_CONFIGURED');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 180000);
    const formData = new FormData();
    formData.append('file', file, file.name || `mimer-${Date.now()}`);
    formData.append('upload_preset', cloudinaryConfig.uploadPreset);
    formData.append('folder', folder);
    const resourceType = file.type.startsWith('video/') ? 'video' : 'image';
    const uploadEndpoint = cloudinaryConfig.uploadEndpoint.replace('/auto/upload', `/${resourceType}/upload`);

    try {
        const response = await fetch(uploadEndpoint, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.secure_url) {
            const message = payload?.error?.message || `HTTP_${response.status}`;
            throw new Error(`CLOUDINARY_UPLOAD_FAILED:${message}`);
        }
        return {
            url: payload.secure_url,
            secureUrl: payload.secure_url,
            publicId: payload.public_id || '',
            resourceType: payload.resource_type || (file.type.startsWith('video/') ? 'video' : 'image'),
            type: file.type.startsWith('video/') ? 'video' : 'image',
            width: Number(payload.width || 0),
            height: Number(payload.height || 0),
            duration: Number(payload.duration || 0),
            bytes: Number(payload.bytes || file.size),
            format: payload.format || ''
        };
    } finally {
        window.clearTimeout(timeout);
    }
}

function getDeliveryUrl(url, { width = 1200, quality = 'auto:good' } = {}) {
    if (!url || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url || '';
    return url.replace('/upload/', `/upload/f_auto,q_${quality},w_${Math.max(80, Number(width) || 1200)},c_limit/`);
}

/**
 * Generate a lightweight first-frame poster for Cloudinary videos.
 * The poster is fetched independently; the video itself remains preload=none.
 */
function getVideoPosterUrl(url, { width = 720, quality = 'auto:eco' } = {}) {
    if (!url || !url.includes('res.cloudinary.com') || !url.includes('/video/upload/')) return '';
    const boundedWidth = Math.max(160, Math.min(1280, Number(width) || 720));
    const transformed = url.replace('/video/upload/', `/video/upload/so_0,f_jpg,q_${quality},w_${boundedWidth},c_limit/`);
    return transformed.replace(/\.(mp4|webm|mov)(\?.*)?$/i, '.jpg$2');
}

export { MAX_MEDIA_BYTES, ALLOWED_MEDIA_TYPES, isCloudinaryReady, validateMediaFile, uploadMedia, getDeliveryUrl, getVideoPosterUrl };
