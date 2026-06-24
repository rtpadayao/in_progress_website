document.addEventListener('DOMContentLoaded', function() {
    const projectLinks = document.querySelectorAll('.project-link');
    const projectContent = document.getElementById('project-content');

    projectLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            event.preventDefault();
            const projectId = this.getAttribute('data-project');
            loadProjectDetails(projectId);
            document.querySelector(this.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
        });
    });

    function loadProjectDetails(projectId) {
        const projectDetails = {
            project1: {
                title: 'Invoice Analysis',
                context: 'Identifying the circumstances around the 5% annual loss of revenue.',
                presentationFile: 'Datasets/Yellevate/Yellevate Dispute Analysis.pdf',
                documentationFile: 'Datasets/Yellevate/Yellevate Work Documentation.pdf',
                video: 'path/to/video.mp4'
            },
        };

        const project = projectDetails[projectId];
        if (project) {
            projectContent.innerHTML = `
                <h3>${project.title}</h3>
                <p>${project.context}</p>
                <p><a href="${project.presentationFile}" target="_blank">View Presentation</a></p>
                <p><a href="${project.documentationFile}" target="_blank">View Documentation</a></p>
                <video controls>
                    <source src="${project.video}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            `;
        }
    }
});
