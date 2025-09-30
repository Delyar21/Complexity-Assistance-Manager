export class LocalStorage {
    constructor() {
        this.storage = this.getStorageMethod();
        this.projects = this.loadData('cam_projects') || {};
    }

    getStorageMethod() {
        try {
            // Versuche localStorage zu verwenden
            if (typeof(Storage) !== "undefined" && localStorage) {
                localStorage.setItem('test', 'test');
                localStorage.removeItem('test');
                return 'localStorage';
            }
        } catch(e) {
            console.log('localStorage nicht verfügbar, verwende Memory-Storage');
        }
        return 'memory';
    }

    loadData(key) {
        if (this.storage === 'localStorage') {
            try {
                return JSON.parse(localStorage.getItem(key) || '{}');
            } catch(e) {
                return {};
            }
        }
        return this[`_${key}`] || {};
    }

    saveData(key, data) {
        if (this.storage === 'localStorage') {
            try {
                localStorage.setItem(key, JSON.stringify(data));
                return true;
            } catch(e) {
                console.log('Speichern in localStorage fehlgeschlagen:', e);
            }
        }
        this[`_${key}`] = data;
        return false;
    }

    saveProjects() {
        const saved = this.saveData('cam_projects', this.projects);
        if (!saved) {
            console.log('Projektdaten konnten nicht dauerhaft gespeichert werden');
        }
    }

    // Projekt unter einem festen Key speichern (ohne User-Bezug)
    saveProject(projectData) {
        this.projects['current'] = {
            data: projectData,
            lastModified: new Date().toISOString()
        };
        this.saveProjects();
    }

    // Aktuelles Projekt laden
    loadProject() {
        return this.projects['current']?.data || { elements: [], connections: [] };
    }

    // Auto-Save für kontinuierliches Speichern
    autoSaveProject(projectData) {
        this.projects['autosave'] = {
            data: projectData,
            lastModified: new Date().toISOString()
        };
        this.saveProjects();
    }

    // Auto-Save laden (für Recovery)
    loadAutoSave() {
        return this.projects['autosave']?.data || null;
    }

    // Projekt-Backup erstellen
    createBackup(projectData, backupName = null) {
        const timestamp = new Date().toISOString();
        const name = backupName || `backup_${timestamp}`;
        
        if (!this.projects['backups']) {
            this.projects['backups'] = {};
        }
        
        this.projects['backups'][name] = {
            data: projectData,
            created: timestamp
        };
        this.saveProjects();
        return name;
    }

    // Alle Backups auflisten
    getBackups() {
        return this.projects['backups'] || {};
    }

    // Backup laden
    loadBackup(backupName) {
        return this.projects['backups']?.[backupName]?.data || null;
    }

    // Backup löschen
    deleteBackup(backupName) {
        if (this.projects['backups']?.[backupName]) {
            delete this.projects['backups'][backupName];
            this.saveProjects();
            return true;
        }
        return false;
    }

    // Storage-Informationen abrufen
    getStorageInfo() {
        return {
            method: this.storage,
            persistent: this.storage === 'localStorage'
        };
    }

    // Storage-Status für UI
    getStorageStatus() {
        const info = this.getStorageInfo();
        const projectExists = !!this.projects['current'];
        const autoSaveExists = !!this.projects['autosave'];
        const backupCount = Object.keys(this.projects['backups'] || {}).length;
        
        return {
            ...info,
            projectExists,
            autoSaveExists,
            backupCount,
            lastModified: this.projects['current']?.lastModified || null
        };
    }

    // Alle Daten löschen (Reset)
    clearAllData() {
        this.projects = {};
        if (this.storage === 'localStorage') {
            try {
                localStorage.removeItem('cam_projects');
            } catch(e) {
                console.log('Daten konnten nicht gelöscht werden:', e);
            }
        }
        this[`_cam_projects`] = {};
    }

    // Import von externen Projektdaten
    importProject(projectData) {
        const backup = this.createBackup(this.loadProject(), `before_import_${Date.now()}`);
        this.saveProject(projectData);
        return backup;
    }

    // Export der aktuellen Projektdaten
    exportProject() {
        const project = this.loadProject();
        const metadata = {
            exported: new Date().toISOString(),
            version: '1.0',
            type: 'CAM_Project'
        };
        
        return {
            metadata,
            project
        };
    }
}