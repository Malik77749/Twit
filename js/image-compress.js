// Image Compression Module — Compress before upload (like X)
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1600;
const QUALITY = 0.85;
const MAX_SIZE_KB = 500; // Target max size in KB

/**
 * Compress an image file before upload
 * @param {File} file - Original image file
 * @returns {Promise<File>} - Compressed image file
 */
async function compressImage(file) {
    // Only compress images, not videos
    if (!file.type.startsWith('image/') || file.type === 'image/gif') {
        return file;
    }

    // Skip if already small enough
    if (file.size <= MAX_SIZE_KB * 1024) {
        return file;
    }

    try {
        const img = await loadImage(file);
        const { width, height } = calculateDimensions(img.width, img.height);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first (smaller), fallback to JPEG
        let blob = await canvasToBlob(canvas, 'image/webp', QUALITY);
        if (!blob || blob.size > file.size) {
            blob = await canvasToBlob(canvas, 'image/jpeg', QUALITY);
        }

        // If still too large, reduce quality
        let currentQuality = QUALITY;
        while (blob && blob.size > MAX_SIZE_KB * 1024 && currentQuality > 0.3) {
            currentQuality -= 0.1;
            blob = await canvasToBlob(canvas, file.type === 'image/png' ? 'image/png' : 'image/jpeg', currentQuality);
        }

        if (blob && blob.size < file.size) {
            return new File([blob], file.name, {
                type: blob.type,
                lastModified: Date.now()
            });
        }

        return file;
    } catch (error) {
        console.warn('Image compression failed, using original:', error);
        return file;
    }
}

/**
 * Load image from file
 */
function loadImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

/**
 * Calculate new dimensions while maintaining aspect ratio
 */
function calculateDimensions(width, height) {
    if (width <= MAX_WIDTH && height <= MAX_HEIGHT) {
        return { width, height };
    }

    const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
    return {
        width: Math.round(width * ratio),
        height: Math.round(height * ratio)
    };
}

/**
 * Convert canvas to blob
 */
function canvasToBlob(canvas, type, quality) {
    return new Promise(resolve => {
        canvas.toBlob(resolve, type, quality);
    });
}

/**
 * Generate thumbnail for preview
 */
async function generateThumbnail(file, maxSize = 200) {
    if (!file.type.startsWith('image/')) return null;

    try {
        const img = await loadImage(file);
        const ratio = Math.min(maxSize / img.width, maxSize / img.height);
        const width = Math.round(img.width * ratio);
        const height = Math.round(img.height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        return canvas.toDataURL('image/jpeg', 0.7);
    } catch (error) {
        return null;
    }
}

/**
 * Get file size in human readable format
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

export {
    compressImage,
    generateThumbnail,
    formatFileSize
};
