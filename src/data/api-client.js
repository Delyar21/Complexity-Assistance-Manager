export class APIClient {
    constructor() {
        this.baseURL = 'http://localhost:3000/api';
    }

    async analyzeProject(projectData) {
        const response = await fetch(`${this.baseURL}/ai/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: projectData })
        });
        return response.json();
    }
}