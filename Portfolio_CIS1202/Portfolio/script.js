// Function to toggle dark mode
function toggleDarkMode() {
    // Access the body element and toggle the 'dark-mode' class
    document.body.classList.toggle('dark-mode');
    console.log("Dark mode toggled!"); 
}

function showSkills(type) {
    // Get both skill containers from the HTML
    const tech = document.getElementById('tech-skills');
    const soft = document.getElementById('soft-skills');

    if (type === 'tech') {
        // Show Technical, hide Soft
        tech.style.display = 'block';
        soft.style.display = 'none';
    } else {
        // Hide Technical, show Soft
        tech.style.display = 'none';
        soft.style.display = 'block';
    }
}