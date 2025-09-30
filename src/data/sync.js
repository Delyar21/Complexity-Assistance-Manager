// Offline-First Sync-Mechanismus
class SyncEngine {
    constructor() {
        this.syncQueue = [];
        this.isOnline = navigator.onLine;
        this.lastSync = localStorage.getItem('lastSync');
    }

    // Überwacht Online-Status
    startNetworkMonitoring() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.processOfflineQueue();
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
        });
    }

    // Fügt Änderung zur Sync-Queue hinzu
    queueChange(action, data) {
        const change = {
            id: generateUUID(),
            action, // 'create', 'update', 'delete'
            data,
            timestamp: Date.now(),
            synced: false
        };
        
        this.syncQueue.push(change);
        this.saveQueueToLocal();
        
        if (this.isOnline) {
            this.syncToCloud();
        }
    }

    // Synchronisiert mit Cloud
    async syncToCloud() {
        try {
            const response = await apiClient.post('/sync', {
                changes: this.syncQueue.filter(c => !c.synced),
                lastSync: this.lastSync
            });
            
            // Markiere als synchronisiert
            this.syncQueue.forEach(change => {
                if (response.syncedIds.includes(change.id)) {
                    change.synced = true;
                }
            });
            
            this.lastSync = Date.now();
            this.saveQueueToLocal();
            
        } catch (error) {
            console.log('Sync failed, staying in offline mode');
        }
    }
}