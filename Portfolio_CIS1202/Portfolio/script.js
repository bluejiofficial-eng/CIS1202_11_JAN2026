function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
}

function showSkills(type) {
    const tech = document.getElementById('tech-skills');
    const soft = document.getElementById('soft-skills');
    const tabs = document.querySelectorAll('.skill-tab');

    tabs.forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.skill === type);
    });

    if (type === 'tech') {
        tech.hidden = false;
        soft.hidden = true;
    } else {
        tech.hidden = true;
        soft.hidden = false;
    }
}
