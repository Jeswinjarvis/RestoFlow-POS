const ThemeManager = {
    currentTheme: null,
    defaultTheme: 'classic',
    pageType: null,

    init(pageType) {
        this.pageType = pageType;
        const savedTheme = localStorage.getItem('ich_theme') || this.defaultTheme;
        this.loadTheme(savedTheme);
    },

    loadTheme(themeName) {
        const head = document.getElementsByTagName('head')[0];

        // Remove existing theme links
        const existingLinks = document.querySelectorAll('link[data-theme-css]');
        existingLinks.forEach(el => el.remove());

        // Also remove legacy ID if present
        const oldLink = document.getElementById('theme-css');
        if (oldLink) oldLink.remove();

        // Handle array or single string
        const cssFiles = Array.isArray(this.pageType) ? this.pageType : [this.pageType];

        cssFiles.forEach(file => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = `css/themes/${themeName}/${file}.css`;
            link.setAttribute('data-theme-css', 'true');
            // Add ID only to the first one for backward compat if needed, or don't use IDs
            // link.onload = () => console.log(`Theme CSS loaded: ${themeName}/${file}.css`);
            head.appendChild(link);
        });

        // Create or Update JS script
        const existingScript = document.getElementById('theme-js');
        const script = document.createElement('script');
        script.id = 'theme-js';
        script.src = `js/themes/${themeName}/theme.js`;
        script.onload = () => {

            // Dispatch event so other scripts know theme is ready
            window.dispatchEvent(new Event('themeLoaded'));
            if (window.ThemeSettings) {
                this.currentTheme = window.ThemeSettings;
            }
        };

        if (existingScript) head.replaceChild(script, existingScript);
        else head.appendChild(script);

        localStorage.setItem('ich_theme', themeName);
    }
};

window.ThemeManager = ThemeManager;
