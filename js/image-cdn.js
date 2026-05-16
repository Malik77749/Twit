// Image CDN & Optimization Module
// Uses Firebase Storage with optimized loading strategies

/**
 * Generate optimized image URL with size parameters
 * Works with Firebase Storage and common CDNs
 */
function getOptimizedImageUrl(url, width = 600, quality = 80) {
    if (!url) return '';

    // Firebase Storage URLs — append resize params
    if (url.includes('firebasestorage.googleapis.com')) {
        // Firebase doesn't support URL-based resizing without Extensions
        // Return original URL — we optimize via HTML attributes instead
        return url;
    }

    // Unsplash CDN
    if (url.includes('unsplash.com')) {
        return url.includes('?') ? `${url}&w=${width}&q=${quality}` : `${url}?w=${width}&q=${quality}`;
    }

    // Cloudinary CDN
    if (url.includes('cloudinary.com')) {
        return url.replace('/upload/', `/upload/w_${width},q_${quality},f_auto/`);
    }

    // Imgix CDN
    if (url.includes('imgix.net')) {
        return url.includes('?') ? `${url}&w=${width}&q=${quality}&auto=format` : `${url}?w=${width}&q=${quality}&auto=format`;
    }

    // Generic: return as-is
    return url;
}

/**
 * Create responsive image HTML with lazy loading + srcset
 */
function createResponsiveImage(src, alt = '', maxWidth = 600) {
    if (!src) return '';

    const optimizedSrc = getOptimizedImageUrl(src, maxWidth);

    return `<img
        src="${optimizedSrc}"
        alt="${alt}"
        loading="lazy"
        decoding="async"
        onload="this.classList.add('loaded'); this.style.opacity='1';"
        onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 300%22%3E%3Crect fill=%22%23222%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%22200%22 y=%22150%22 text-anchor=%22middle%22 fill=%22%23666%22 font-size=%2216%22%3Eصورة غير متاحة%3C/text%3E%3C/svg%3E'; this.onerror=null;"
        style="max-width:100%;border-radius:16px;border:1px solid var(--border-color);opacity:0;transition:opacity 0.3s;"
    >`;
}

/**
 * Preload critical images (above the fold)
 */
function preloadImage(src) {
    if (!src) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = src;
    document.head.appendChild(link);
}

/**
 * Intersection Observer for lazy loading images
 */
function initImageObserver() {
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                }
                observer.unobserve(img);
            }
        });
    }, { rootMargin: '200px' });

    // Observe all images with data-src
    document.querySelectorAll('img[data-src]').forEach(img => {
        observer.observe(img);
    });

    return observer;
}

/**
 * Compress image client-side before upload (returns File)
 * Uses canvas for compression
 */
function compressImageFile(file, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            resolve(file);
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                // Don't compress if already small
                if (img.width <= maxWidth && file.size <= 500 * 1024) {
                    resolve(file);
                    return;
                }

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                let newWidth = img.width;
                let newHeight = img.height;

                if (newWidth > maxWidth) {
                    newHeight = (maxWidth / newWidth) * newHeight;
                    newWidth = maxWidth;
                }

                canvas.width = newWidth;
                canvas.height = newHeight;
                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            const compressedFile = new File([blob], file.name, {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            });
                            resolve(compressedFile);
                        } else {
                            resolve(file);
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

/**
 * Get image dimensions
 */
function getImageDimensions(file) {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
            resolve({ width: 0, height: 0 });
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = () => resolve({ width: 0, height: 0 });
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

export {
    getOptimizedImageUrl,
    createResponsiveImage,
    preloadImage,
    initImageObserver,
    compressImageFile,
    getImageDimensions
};
