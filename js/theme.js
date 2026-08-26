// Theme Module — Mimer visual themes
const THEMES = {
    dark: {
        '--bg-primary': '#000000',
        '--bg-secondary': '#0b0b0c',
        '--bg-hover': '#17181a',
        '--bg-input': '#111214',
        '--surface': '#0b0b0c',
        '--surface-raised': '#17181a',
        '--text-primary': '#f2f2f2',
        '--text-secondary': '#a8a8a8',
        '--text-muted': '#737373',
        '--border-color': 'rgba(255,255,255,.16)',
        '--border-strong': 'rgba(255,255,255,.25)',
        '--shadow-card': '0 1px 3px rgba(0,0,0,.34)'
    },
    dim: {
        '--bg-primary': '#15202b',
        '--bg-secondary': '#192734',
        '--bg-hover': '#223447',
        '--bg-input': '#253341',
        '--surface': '#192734',
        '--surface-raised': '#223447',
        '--text-primary': '#f1f5f9',
        '--text-secondary': '#b7c4d0',
        '--text-muted': '#91a2b2',
        '--border-color': 'rgba(203,213,225,.20)',
        '--border-strong': 'rgba(203,213,225,.32)',
        '--shadow-card': '0 1px 3px rgba(0,0,0,.24)'
    },
    light: {
        '--bg-primary': '#ffffff',
        '--bg-secondary': '#ffffff',
        '--bg-hover': '#f6f6f6',
        '--bg-input': '#ffffff',
        '--surface': '#ffffff',
        '--surface-raised': '#ffffff',
        '--text-primary': '#000000',
        '--text-secondary': '#000000',
        '--text-muted': '#000000',
        '--border-color': 'rgba(0,0,0,.16)',
        '--border-strong': 'rgba(0,0,0,.28)',
        '--shadow-card': '0 1px 3px rgba(0,0,0,.10)'
    }
};

let currentTheme = 'dark';

function init() {
    const saved = localStorage.getItem('mimer-theme') || 'dark';
    setTheme(saved);
}

function setTheme(themeName) {
    if (!THEMES[themeName]) return;

    const root = document.documentElement;
    const theme = THEMES[themeName];
    for (const [key, value] of Object.entries(theme)) root.style.setProperty(key, value);

    root.dataset.mimerTheme = themeName;
    currentTheme = themeName;
    localStorage.setItem('mimer-theme', themeName);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = theme['--bg-primary'];
}

function getTheme() {
    return currentTheme;
}

function cycleTheme() {
    const order = ['dark', 'dim', 'light'];
    const currentIndex = order.indexOf(currentTheme);
    const nextTheme = order[(currentIndex + 1) % order.length];
    setTheme(nextTheme);
    return nextTheme;
}

function renderToggle() {
    const icons = { dark: 'fa-moon', dim: 'fa-cloud-moon', light: 'fa-sun' };
    const labels = { dark: 'داكن', dim: 'عتمة', light: 'فاتح' };
    return `
        <button class="theme-toggle" onclick="cycleTheme()" title="تغيير السمة: ${labels[currentTheme]}" aria-label="تغيير السمة الحالية ${labels[currentTheme]}">
            <i class="fas ${icons[currentTheme]}"></i>
        </button>
    `;
}

export { init, setTheme, getTheme, cycleTheme, renderToggle };
