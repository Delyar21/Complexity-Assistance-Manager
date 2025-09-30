import { CONSTANTS } from '../utils/constants.js';
import { projectData } from '../utils/state.js';
import { saveToHistory } from '../data/history.js';
import { showToast } from '../ui/toast.js';
import { getDependencyEngine } from './dependencies.js';

// Status-Konstanten
export const PROCESS_STATUS = {
    PENDING: 'pending',
    ACTIVE: 'active', 
    COMPLETED: 'completed',
    BLOCKED: 'blocked',
    ARCHIVED: 'archived'
};

// Initialisierung CSS für Status-Visualisierung hinzufügen
export function initStatusSystem() {
    injectStatusCSS();
    //console.log('Status-System initialisiert');
}

// Status-CSS einbetten
function injectStatusCSS() {
    if (document.getElementById('status-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'status-styles';
    style.textContent = `
        /* Status-Icons mit Font Awesome */
        .status-icon {
            position: absolute;
            top: -8px;
            right: -8px;
            width: 24px;
            height: 24px;
            background: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            z-index: 15;
            border: 2px solid #2c3e50;
            transition: all 0.3s ease;
            cursor: pointer;
        }

        .status-icon i {
            transition: all 0.3s ease;
        }

        /* Status-spezifische Icon-Farben */
        .element-wrapper[data-status="pending"] .status-icon {
            background: ${CONSTANTS.STATUS_COLORS.PENDING};
            border-color: ${CONSTANTS.STATUS_COLORS.PENDING};
        }
        
        .element-wrapper[data-status="pending"] .status-icon i {
            color: white;
        }

        .element-wrapper[data-status="active"] .status-icon {
            background: ${CONSTANTS.STATUS_COLORS.ACTIVE};
            border-color: ${CONSTANTS.STATUS_COLORS.ACTIVE};
            animation: iconPulse 1.5s infinite;
        }
        
        .element-wrapper[data-status="active"] .status-icon i {
            color: #2c3e50;
        }

        .element-wrapper[data-status="completed"] .status-icon {
            background: ${CONSTANTS.STATUS_COLORS.COMPLETED};
            border-color: ${CONSTANTS.STATUS_COLORS.COMPLETED};
        }
        
        .element-wrapper[data-status="completed"] .status-icon i {
            color: white;
        }

        .element-wrapper[data-status="blocked"] .status-icon {
            background: ${CONSTANTS.STATUS_COLORS.BLOCKED};
            border-color: ${CONSTANTS.STATUS_COLORS.BLOCKED};
        }
        
        .element-wrapper[data-status="blocked"] .status-icon i {
            color: white;
        }

        .element-wrapper[data-status="archived"] .status-icon {
            background: ${CONSTANTS.STATUS_COLORS.ARCHIVED};
            border-color: ${CONSTANTS.STATUS_COLORS.ARCHIVED};
        }
        
        .element-wrapper[data-status="archived"] .status-icon i {
            color: #6c757d;
        }

        /* Rest des CSS... */
        .element-wrapper[data-status="pending"] .shape {
            border-color: ${CONSTANTS.STATUS_COLORS.PENDING} !important;
            background: rgba(108, 117, 125, 0.1) !important;
        }

        .element-wrapper[data-status="active"] .shape {
            border-color: ${CONSTANTS.STATUS_COLORS.ACTIVE} !important;
            background: rgba(255, 193, 7, 0.15) !important;
            animation: statusPulse 2s infinite;
        }

        .element-wrapper[data-status="completed"] .shape {
            border-color: ${CONSTANTS.STATUS_COLORS.COMPLETED} !important;
            background: rgba(40, 167, 69, 0.1) !important;
            opacity: 0.8;
            filter: brightness(0.9);
        }

        .element-wrapper[data-status="blocked"] .shape {
            border-color: ${CONSTANTS.STATUS_COLORS.BLOCKED} !important;
            background: rgba(220, 53, 69, 0.1) !important;
            filter: grayscale(40%) brightness(0.8);
        }

        .element-wrapper[data-status="archived"] .shape {
            border-color: ${CONSTANTS.STATUS_COLORS.ARCHIVED} !important;
            background: rgba(233, 236, 239, 0.1) !important;
            opacity: 0.4;
            filter: grayscale(80%);
            transform: scale(0.9);
        }

        /* Animationen */
        @keyframes statusPulse {
            0%, 100% { 
                box-shadow: 0 0 0 0 rgba(255, 193, 7, 0.5); 
            }
            50% { 
                box-shadow: 0 0 0 8px rgba(255, 193, 7, 0); 
            }
        }

        @keyframes iconPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }

        /* Hover-Effekte für Status-Icons */
        .status-icon:hover {
            transform: scale(1.2);
        }

        .status-icon:hover i {
            transform: scale(1.1);
        }

        /* Status-Tooltip */
        .status-tooltip {
            position: absolute;
            bottom: 30px;
            right: -10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 20;
            pointer-events: none;
        }

        .status-icon:hover .status-tooltip {
            opacity: 1;
        }

        /* Status Menu Styling */
        .status-menu {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
    `;
    document.head.appendChild(style);
}

// Element-Status aktualisieren
export function updateElementStatus(elementId, newStatus) {
    const element = document.getElementById(elementId);
    const elementData = projectData.elements.find(el => el.id === elementId);
    
    if (!element || !elementData) {
        //console.warn(`Element ${elementId} nicht gefunden`);
        return;
    }
    
    // Prüfe ob newStatus gültig ist
    if (!newStatus || !Object.values(PROCESS_STATUS).includes(newStatus)) {
        //console.error(`Invalid status provided: ${newStatus}. Using PENDING as fallback.`);
        newStatus = PROCESS_STATUS.PENDING;
    }
    
    const oldStatus = elementData.processStatus || PROCESS_STATUS.PENDING;
    
    // Auch bei "gleichem" Status verarbeiten, falls es das erste Mal gesetzt wird
    const isInitialStatusSet = !elementData.processStatus && newStatus !== PROCESS_STATUS.PENDING;
    
    // Historie nur bei echten Änderungen aktualisieren
    if (oldStatus !== newStatus) {
        if (!elementData.statusHistory) {
            elementData.statusHistory = [];
        }
        
        // Bessere Validierung der Historie-Einträge
        const historyEntry = {
            fromStatus: oldStatus,  
            toStatus: newStatus,    
            from: oldStatus,     
            to: newStatus,          
            timestamp: new Date().toISOString(),
            duration: calculateStatusDuration(elementData, oldStatus)
        };
        
        elementData.statusHistory.push(historyEntry);
        
        // Begrenze Historie auf letzten 50 Einträge für Performance
        if (elementData.statusHistory.length > 50) {
            elementData.statusHistory = elementData.statusHistory.slice(-50);
        }
    }
    
    // Status in Daten aktualisieren
    elementData.processStatus = newStatus;
    
    // Metadaten aktualisieren
    if (!elementData.processMetadata) {
        elementData.processMetadata = {};
    }
    
    const now = new Date().toISOString();
    elementData.processMetadata.lastStatusChange = now;
    
    if (newStatus === PROCESS_STATUS.ACTIVE && oldStatus === PROCESS_STATUS.PENDING) {
        elementData.processMetadata.startDate = now;
    } else if (newStatus === PROCESS_STATUS.COMPLETED) {
        elementData.processMetadata.endDate = now;

        if (elementData.processMetadata.startDate) {
            const startTime = new Date(elementData.processMetadata.startDate);
            const endTime = new Date(now);
            elementData.processMetadata.totalProcessingTime = Math.round((endTime - startTime) / (1000 * 60 * 60)); // Stunden
        }
    }
    
    applyStatusToElement(element, newStatus);
    
    checkElementDependencies(elementId, newStatus);
    
    // Toast-Nachrichten (nur bei echten Änderungen oder initialer Setzung)
    if (oldStatus !== newStatus || isInitialStatusSet) {
        const statusNames = {
            [PROCESS_STATUS.PENDING]: 'Wartend',
            [PROCESS_STATUS.ACTIVE]: 'Aktiv',
            [PROCESS_STATUS.COMPLETED]: 'Abgeschlossen', 
            [PROCESS_STATUS.BLOCKED]: 'Blockiert',
            [PROCESS_STATUS.ARCHIVED]: 'Archiviert'
        };
        
        // Bessere Fehlermeldung für undefined elementData.text
        const elementText = elementData.text || `Element ${elementId}`;
        
        showToast(`"${elementText}" → ${statusNames[newStatus]}`, 'success');
        saveToHistory(`Status Update: ${elementText} → ${statusNames[newStatus]}`);
    }
    
    // Dependency Engine immer informieren
    const depEngine = getDependencyEngine();
    if (depEngine && (oldStatus !== newStatus || isInitialStatusSet)) {
        //console.log(`Triggering dependency check: ${elementData.text || elementId} ${oldStatus} → ${newStatus} (initial: ${isInitialStatusSet})`);
        
        setTimeout(() => {
            depEngine.onStatusChange(elementId, oldStatus, newStatus);
            
            if (isInitialStatusSet) {
                triggerDependencyCheckForConnectedElements(elementId, depEngine);
            }
        }, 100);
    }
}

// Prüft Abhängigkeiten für verbundene Elemente
function triggerDependencyCheckForConnectedElements(elementId, depEngine) {
    console.log(`Checking connected elements for ${elementId}`);
    
    // Finde alle Verbindungen die von diesem Element ausgehen oder zu diesem Element führen
    const relevantConnections = projectData.connections.filter(conn => 
        conn.from === elementId || conn.to === elementId
    );

    relevantConnections.forEach(connection => {
        const otherElementId = connection.from === elementId ? connection.to : connection.from;
        const otherElement = projectData.elements.find(el => el.id === otherElementId);
        
        if (otherElement) {
            //console.log(`Triggering dependency check for connected element: ${otherElement.text}`);
            // Simuliere eine Status-"Änderung" für das verbundene Element
            setTimeout(() => {
                depEngine.onStatusChange(otherElementId, otherElement.processStatus, otherElement.processStatus);
            }, 200);
        }
    });
}

// Vollständige Dependency-Prüfung für alle Elemente
export function triggerFullDependencyCheck() {
    const depEngine = getDependencyEngine();
    if (!depEngine) return;
    
    //console.log('Triggering full dependency check for all elements');
    
    projectData.elements.forEach((element, index) => {
        setTimeout(() => {
            const currentStatus = element.processStatus || PROCESS_STATUS.PENDING;
            depEngine.onStatusChange(element.id, currentStatus, currentStatus);
        }, index * 50);
    });
    
    showToast('Vollständige Abhängigkeitsprüfung gestartet', 'info');
}

// Berechne wie lange ein Element in einem Status war
function calculateStatusDuration(elementData, currentStatus) {
    if (!elementData.statusHistory || elementData.statusHistory.length === 0) {
        // Erstes Status-Update - Dauer seit Element-Erstellung
        const createdDate = elementData.processMetadata?.createdDate;
        if (createdDate) {
            const created = new Date(createdDate);
            const now = new Date();
            return Math.round((now - created) / (1000 * 60)); 
        }
        return 0;
    }
    
    // Finde letzten Status-Wechsel zu diesem Status
    const lastStatusChange = elementData.statusHistory
        .slice()
        .reverse()
        .find(entry => entry.to === currentStatus);
    
    if (lastStatusChange) {
        const changeTime = new Date(lastStatusChange.timestamp);
        const now = new Date();
        return Math.round((now - changeTime) / (1000 * 60)); 
    }
    
    return 0;
}

// Hilfsfunktionen für Historie-Anzeige
function formatDuration(minutes) {
    if (!minutes || minutes < 60) return `${minutes || 0}min`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
}

function getStatusLabel(status) {
    const labels = {
        'pending': 'Wartend',
        'active': 'Aktiv',
        'completed': 'Abgeschlossen',
        'blocked': 'Blockiert',
        'archived': 'Archiviert'
    };
    return labels[status] || (status || 'Unbekannt');
}

function getStatusColor(status) {
    if (!status) {
        //console.warn('getStatusColor called with undefined status, using default');
        return '#95a5a6';
    }
    
    const normalizedStatus = status.toString().toLowerCase();
    
    const colors = {
        'pending': '#6c757d',
        'active': '#ffc107', 
        'completed': '#28a745',
        'blocked': '#dc3545',
        'archived': '#e9ecef'
    };
    
    return colors[normalizedStatus] || '#95a5a6';
}


function getStatusIcon(status) {
    if (!status) {
        //console.warn('getStatusIcon called with undefined status, using default');
        return 'fa-question';
    }
    
    const normalizedStatus = status.toString().toLowerCase();
    
    const icons = {
        'pending': 'fa-clock',
        'active': 'fa-bolt',
        'completed': 'fa-check-circle',
        'blocked': 'fa-ban',
        'archived': 'fa-archive'
    };
    
    return icons[normalizedStatus] || 'fa-question';
}

export function showStatusHistory(elementId) {
    const elementData = projectData.elements.find(el => el.id === elementId);
    if (!elementData || !elementData.statusHistory) {
        showToast('Keine Status-Historie verfügbar', 'info');
        return;
    }
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        z-index: 15000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        border-radius: 16px;
        padding: 24px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    `;
    
    const historyHTML = elementData.statusHistory
        .slice()
        .reverse() // Neueste zuerst
        .map(entry => {
            const date = new Date(entry.timestamp).toLocaleString('de-DE');
            const duration = entry.duration ? ` (${formatDuration(entry.duration)})` : '';
            
            return `
                <div class="history-entry" style="
                    display: flex;
                    align-items: center;
                    padding: 12px;
                    margin: 8px 0;
                    background: #f8f9fa;
                    border-radius: 8px;
                    border-left: 4px solid ${getStatusColor(entry.to)};
                ">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #2c3e50;">
                            ${getStatusLabel(entry.from)} → ${getStatusLabel(entry.to)}
                        </div>
                        <div style="font-size: 12px; color: #7f8c8d;">
                            ${date} • ${entry.user}${duration}
                        </div>
                    </div>
                    <div style="margin-left: 12px;">
                        <i class="fa-solid ${getStatusIcon(entry.to)}" style="color: ${getStatusColor(entry.to)};"></i>
                    </div>
                </div>
            `;
        })
        .join('');
    
    dialog.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
            <div style="flex: 1;">
                <h2 style="margin: 0; color: #2c3e50;">Status-Historie</h2>
                <p style="margin: 4px 0 0 0; color: #7f8c8d;">"${elementData.text}"</p>
            </div>
            <button onclick="this.closest('.status-history-overlay').remove()" style="
                background: #95a5a6;
                color: white;
                border: none;
                border-radius: 50%;
                width: 32px;
                height: 32px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            ">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
        <div class="history-list">
            ${historyHTML || '<p style="color: #7f8c8d; text-align: center; padding: 20px;">Keine Historie verfügbar</p>'}
        </div>
    `;
    
    overlay.className = 'status-history-overlay';
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}


// Status-Historie Button zum Schnell-Menü hinzufügen
// In showStatusChangeMenu() nach den Status-Optionen einfügen:
const historyBtn = document.createElement('button');
historyBtn.style.cssText = `
    width: 100%;
    padding: 10px 12px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    border-radius: 4px;
    font-size: 14px;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: inherit;
    border-top: 1px solid #e1e8ed;
    margin-top: 8px;
    color: #6c757d;
`;

const historyIcon = document.createElement('i');
historyIcon.className = 'fa-solid fa-history';
historyIcon.style.cssText = 'color: #6c757d; width: 16px; text-align: center;';

const historyText = document.createElement('span');
historyText.textContent = 'Status-Historie anzeigen';

historyBtn.appendChild(historyIcon);
historyBtn.appendChild(historyText);

historyBtn.addEventListener('click', () => {
    showStatusHistory(element.id);
    menu.remove();
});

// Visuelle Status-Darstellung anwenden
function applyStatusToElement(element, status) {
    element.setAttribute('data-status', status);
    
    updateStatusIcon(element, status);
}

// Status-Icon erstellen/aktualisieren
export function updateStatusIcon(element, status) { 
    // Entferne existierendes Icon
    const existingIcon = element.querySelector('.status-icon');
    if (existingIcon) {
        existingIcon.remove();
    }
    
    // Font Awesome Icon-Mapping
    const iconMap = {
        [PROCESS_STATUS.PENDING]: 'fa-clock',
        [PROCESS_STATUS.ACTIVE]: 'fa-bolt',
        [PROCESS_STATUS.COMPLETED]: 'fa-check-circle',
        [PROCESS_STATUS.BLOCKED]: 'fa-ban',
        [PROCESS_STATUS.ARCHIVED]: 'fa-archive'
    };
    
    const tooltipMap = {
        [PROCESS_STATUS.PENDING]: 'Wartend',
        [PROCESS_STATUS.ACTIVE]: 'In Bearbeitung',
        [PROCESS_STATUS.COMPLETED]: 'Abgeschlossen',
        [PROCESS_STATUS.BLOCKED]: 'Blockiert',
        [PROCESS_STATUS.ARCHIVED]: 'Archiviert'
    };
    
    // Neues Icon erstellen
    const icon = document.createElement('div');
    icon.className = 'status-icon';
    
    // Font Awesome Icon hinzufügen
    const faIcon = document.createElement('i');
    faIcon.className = `fa-solid ${iconMap[status] || 'fa-question'}`;
    icon.appendChild(faIcon);
    
    // Tooltip hinzufügen
    const tooltip = document.createElement('div');
    tooltip.className = 'status-tooltip';
    tooltip.textContent = tooltipMap[status] || 'Unbekannt';
    icon.appendChild(tooltip);
    
    icon.addEventListener('click', (e) => {
        e.stopPropagation();
        showStatusChangeMenu(element, e.clientX, e.clientY);
    });
    
    element.appendChild(icon);
}

// Schnell-Status-Menü anzeigen
function showStatusChangeMenu(element, x, y) {
    // Entferne existierendes Menü
    const existingMenu = document.querySelector('.status-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    const menu = document.createElement('div');
    menu.className = 'status-menu';
    menu.style.cssText = `
        position: fixed;
        left: ${Math.max(10, Math.min(window.innerWidth - 180, x))}px;
        top: ${Math.max(10, y)}px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        padding: 8px;
        min-width: 170px;
        border: 1px solid #e1e8ed;
    `;
    
    // Status-Optionen mit Font Awesome Icons
    const statusOptions = [
        { 
            status: PROCESS_STATUS.PENDING, 
            label: 'Wartend', 
            icon: 'fa-clock',
            color: CONSTANTS.STATUS_COLORS.PENDING 
        },
        { 
            status: PROCESS_STATUS.ACTIVE, 
            label: 'Aktiv', 
            icon: 'fa-bolt',
            color: CONSTANTS.STATUS_COLORS.ACTIVE 
        },
        { 
            status: PROCESS_STATUS.COMPLETED, 
            label: 'Abgeschlossen', 
            icon: 'fa-check-circle',
            color: CONSTANTS.STATUS_COLORS.COMPLETED 
        },
        { 
            status: PROCESS_STATUS.BLOCKED, 
            label: 'Blockiert', 
            icon: 'fa-ban',
            color: CONSTANTS.STATUS_COLORS.BLOCKED 
        },
        { 
            status: PROCESS_STATUS.ARCHIVED, 
            label: 'Archiviert', 
            icon: 'fa-archive',
            color: CONSTANTS.STATUS_COLORS.ARCHIVED 
        }
    ];
    
    statusOptions.forEach(option => {
        const button = document.createElement('button');
        button.style.cssText = `
            width: 100%;
            padding: 10px 12px;
            border: none;
            background: transparent;
            text-align: left;
            cursor: pointer;
            border-radius: 4px;
            font-size: 14px;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: inherit;
        `;
        
        const icon = document.createElement('i');
        icon.className = `fa-solid ${option.icon}`;
        icon.style.cssText = `
            color: ${option.color};
            width: 16px;
            text-align: center;
        `;
        
        const text = document.createElement('span');
        text.textContent = option.label;
        
        button.appendChild(icon);
        button.appendChild(text);
        
        button.addEventListener('mouseenter', () => {
            button.style.background = option.color + '20';
            button.style.transform = 'translateX(2px)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = 'transparent';
            button.style.transform = 'translateX(0)';
        });
        
        button.addEventListener('click', () => {
            updateElementStatus(element.id, option.status);
            menu.remove();
        });
        
        menu.appendChild(button);
    });

    const historyBtn = document.createElement('button');
    historyBtn.style.cssText = `
        width: 100%;
        padding: 10px 12px;
        border: none;
        background: transparent;
        text-align: left;
        cursor: pointer;
        border-radius: 4px;
        font-size: 14px;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: inherit;
        border-top: 1px solid #e1e8ed;
        margin-top: 8px;
        color: #6c757d;
    `;

    const historyIcon = document.createElement('i');
    historyIcon.className = 'fa-solid fa-history';
    historyIcon.style.cssText = 'color: #6c757d; width: 16px; text-align: center;';

    const historyText = document.createElement('span');
    historyText.textContent = 'Status-Historie anzeigen';

    historyBtn.appendChild(historyIcon);
    historyBtn.appendChild(historyText);

    historyBtn.addEventListener('mouseenter', () => {
        historyBtn.style.background = '#f8f9fa';
        historyBtn.style.transform = 'translateX(2px)';
    });

    historyBtn.addEventListener('mouseleave', () => {
        historyBtn.style.background = 'transparent';
        historyBtn.style.transform = 'translateX(0)';
        });

    historyBtn.addEventListener('click', () => {
        showStatusHistory(element.id);
        menu.remove();
    });

    menu.appendChild(historyBtn);

    
    document.body.appendChild(menu);
    
    setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
    }, 100);
}

// Abhängigkeiten prüfen
function checkElementDependencies(elementId, newStatus) {
    if (newStatus === PROCESS_STATUS.COMPLETED) {
        //console.log(`Element ${elementId} abgeschlossen - prüfe Abhängigkeiten`);
    }
}

// Element-Status beim Erstellen initialisieren
export function initializeElementStatus(elementData) {
    if (!elementData.processStatus) {
        elementData.processStatus = PROCESS_STATUS.PENDING;
    }
    
    if (!elementData.processMetadata) {
        elementData.processMetadata = {
            createdDate: new Date().toISOString(),
            startDate: null,
            endDate: null,
            completionPercentage: 0
        };
    }
}

// Status für alle existierenden Elemente initialisieren
export function initializeAllElementStatuses() {
    let updatedCount = 0;
    
    projectData.elements.forEach(elementData => {
        if (!elementData.processStatus) {
            initializeElementStatus(elementData);
            updatedCount++;
        }
        
        const element = document.getElementById(elementData.id);
        if (element) {
            applyStatusToElement(element, elementData.processStatus);
        }
    });
    
    if (updatedCount > 0) {
        showToast(`${updatedCount} Elemente mit Status initialisiert`, 'success');
        saveToHistory('Initialize Element Statuses');
    }
}