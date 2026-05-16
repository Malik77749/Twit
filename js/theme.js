// Theme Module — Dark/Light Mode Toggle (like X)
const THEMES = {
    dark: {
        '--bg-primary': '#000000',
        '--bg-secondary': '#16181c',
        '--bg-hover': '#1d1f23',
        '--bg-input': '#202327',
        '--text-primary': '#e7e9ea',
        '--text-secondary': '#71767b',
        '--border-color': '#2f3336'
    },
    dim: {
        '--bg-primary': '#15202b',
        '--bg-secondary': '#192734',
        '--bg-hover': '#1e2d3d',
        '--bg-input': '#253341',
        '--text-primary': '#e7e9ea',
        '--text-secondary': '#8899a6',
        '--border-color': '#38444d'
    },
    light: {
        '--bg-primary': '#ffffff',
        '--bg-secondary': '#f7f9f9',
        '--bg-hover': '#eff1f1',
        '--bg-input': '#eff3f4',
        '--text-primary': '#0f1419',
        '--text-secondary': '#536471',
        '--border-color': '#eff3f4'
    }
};

let currentTheme = 'dark';

/**
 * Initialize theme from saved preference
 */
function init() {
    const saved = localStorage.getItem('twit-theme') || 'dark';
    setTheme(saved);
}

/**
 * Set theme
 */
function setTheme(themeName) {
    if (!THEMES[themeName]) return;

    const root = document.documentElement;
    const theme = THEMES[themeName];

    for (const [key, value] of Object.entries(theme)) {
        root.style.setProperty(key, value);
    }

    currentTheme = themeName;
    localStorage.setItem('twit-theme', themeName);

    // Update theme meta tag for mobile browser
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.content = theme['--bg-primary'];
    }
}

/**
 * Get current theme
 */
function getTheme() {
    return currentTheme;
}

/**
 * Cycle through themes: dark → dim → light → dark
 */
function cycleTheme() {
    const order = ['dark', 'dim', 'light'];
    const currentIndex = order.indexOf(currentTheme);
    const nextTheme = order[(currentIndex + 1) % order.length];
    setTheme(nextTheme);
    return nextTheme;
}

/**
 * Render theme toggle button HTML
 */
function renderToggle() {
    const icons = {
        dark: 'fa-moon',
        dim: 'fa-cloud-moon',
        light: 'fa-sun'
    };
    const labels = {
        dark: 'داكن',
        dim: 'عتمة',
        light: 'فاتح'
    };

    return `
        <button class="theme-toggle" onclick="cycleTheme()" title="تغيير السمة: ${labels[currentTheme]}">
            <i class="fas ${icons[currentTheme]}"></i>
        </button>
    `;
}

export {
    init,
    setTheme,
    getTheme,
    cycleTheme,
    renderToggle
};
