/* Dashtreme Settings - Theme Switcher */
document.addEventListener('DOMContentLoaded', () => {

    // Switcher Toggle
    const switcherIcon = document.querySelector('.switcher-icon');
    const rightSidebar = document.querySelector('.right-sidebar');

    if (switcherIcon && rightSidebar) {
        switcherIcon.addEventListener('click', (e) => {
            e.preventDefault();
            rightSidebar.classList.toggle('open');
            switcherIcon.classList.toggle('open');
        });
    }

    // Theme Switching Logic
    const themes = [
        'bg-theme1', 'bg-theme2', 'bg-theme3', 'bg-theme4', 'bg-theme5', 'bg-theme6',
        'bg-theme7', 'bg-theme8', 'bg-theme9', 'bg-theme10', 'bg-theme11', 'bg-theme12',
        'bg-theme13', 'bg-theme14', 'bg-theme15'
    ];

    // Load Saved Theme
    const savedTheme = localStorage.getItem('dashtreme_theme');
    if (savedTheme && themes.includes(savedTheme)) {
        document.body.classList.add(savedTheme);
        document.body.classList.add('bg-theme');
        document.body.classList.add('glossy-theme');
        document.body.classList.remove('classic-theme');
    } else {
        // Default to Classic if no theme saved
        document.body.classList.add('classic-theme');
    }

    themes.forEach((theme, index) => {
        const themeId = `theme${index + 1}`;
        const themeBtn = document.getElementById(themeId);

        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                // Remove all existing theme classes
                document.body.classList.remove(...themes);
                // Add the selected theme
                document.body.classList.add(theme);
                // Reset bg-theme base class just in case
                document.body.classList.add('bg-theme');
                document.body.classList.add('glossy-theme');
                // Remove Classic theme class
                document.body.classList.remove('classic-theme');
                // Save to localStorage
                localStorage.setItem('dashtreme_theme', theme);
            });
        }
    });

    // Classic Theme (Reset)
    const classicBtn = document.getElementById('theme-classic');
    if (classicBtn) {
        classicBtn.addEventListener('click', () => {
            // Remove all existing theme classes
            document.body.classList.remove(...themes);
            // Remove base theme classes
            document.body.classList.remove('bg-theme');
            document.body.classList.remove('glossy-theme');
            // Add Classic theme class
            document.body.classList.add('classic-theme');
            // Remove from localStorage
            localStorage.removeItem('dashtreme_theme');
        });
    }
});
