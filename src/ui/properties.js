import { CONSTANTS } from '../utils/constants.js';
import { 
    propertiesPanelOpen, 
    setPropertiesPanelOpen,
    projectData 
} from '../utils/state.js';
import { updateConnections } from '../canvas/connections.js';
import { saveToHistory } from '../data/history.js'; 
import { updateElementStatus } from '../canvas/status.js';
import { saveProject } from '../data/project.js';  
import { getDependencyEngine } from '../canvas/dependencies.js'; 
import { showToast } from '../ui/toast.js'; 

export function toggleProperties() {
    const panel = document.getElementById('propertiesPanel');
    setPropertiesPanelOpen(!propertiesPanelOpen);
    
    if (propertiesPanelOpen) {
        panel.classList.add('open');
        if ('ontouchstart' in window) {
            document.body.style.overflow = 'hidden';
        }
    } else {
        panel.classList.remove('open');
        if ('ontouchstart' in window) {
            document.body.style.overflow = '';
        }
    }
}


export function showProperties(element) {
    if (!propertiesPanelOpen) {
        toggleProperties();
    }
    
    const content = document.getElementById('propertiesContent');
    const elementData = projectData.elements.find(el => el.id === element.id);
    
    const isMobile = 'ontouchstart' in window;
    const inputStyle = isMobile ? 'style="min-height: 44px; font-size: 16px;"' : '';
    const selectStyle = isMobile ? 'style="min-height: 44px; font-size: 16px;"' : '';
    
    content.innerHTML = `
        <div class="property-group">
            <label>Beschriftung:</label>
            <input type="text" id="elementText" value="${elementData?.text || ''}" 
                   onchange="updateElementText('${element.id}', this.value)" ${inputStyle}>
        </div>
        <div class="property-group">
            <label>Beschreibung:</label>
            <textarea id="elementDescription" 
                onblur="updateElementProperty('${element.id}', 'description', this.value)"
                onkeydown="handleDescriptionKeydown(event, '${element.id}')"
                ${isMobile ? 'style="min-height: 80px; font-size: 16px;"' : ''}>${elementData?.properties?.description || ''}</textarea>
        </div>
        
        <div class="property-group">
            <label>Input:</label>
            <textarea id="elementInput" 
                onblur="updateElementProperty('${element.id}', 'input', this.value)"
                ${isMobile ? 'style="min-height: 60px; font-size: 16px;"' : 'style="min-height: 40px;"'}>${elementData?.properties?.input || ''}</textarea>
        </div>
        <div class="property-group">
            <label>Output:</label>
            <textarea id="elementOutput" 
                onblur="updateElementProperty('${element.id}', 'output', this.value)"
                ${isMobile ? 'style="min-height: 60px; font-size: 16px;"' : 'style="min-height: 40px;"'}>${elementData?.properties?.output || ''}</textarea>
        </div>
        
        <div class="property-group">
            <label>Dauer:</label>
            <input type="text" id="elementDuration" 
                value="${elementData?.properties?.duration || ''}"
                onchange="updateElementProperty('${element.id}', 'duration', this.value)" ${inputStyle}>
        </div>
        
        <div class="property-group">
            <label>Kategorie:</label>
            <select id="elementCategory" onchange="updateElementProperty('${element.id}', 'category', this.value)" ${selectStyle}>
                <option value="process" ${elementData?.properties?.category === 'process' ? 'selected' : ''}>Prozess</option>
                <option value="system" ${elementData?.properties?.category === 'system' ? 'selected' : ''}>System</option>
                <option value="person" ${elementData?.properties?.category === 'person' ? 'selected' : ''}>Person</option>
                <option value="resource" ${elementData?.properties?.category === 'resource' ? 'selected' : ''}>Ressource</option>
            </select>
        </div>
        <div class="property-group">
            <label>Priorität:</label>
            <select id="elementPriority" onchange="updateElementProperty('${element.id}', 'priority', this.value)" ${selectStyle}>
                <option value="Hoch" ${elementData?.properties?.priority === 'Hoch' ? 'selected' : ''}>Hoch</option>
                <option value="Normal" ${elementData?.properties?.priority === 'Normal' ? 'selected' : ''}>Normal</option>
                <option value="Niedrig" ${elementData?.properties?.priority === 'Niedrig' ? 'selected' : ''}>Niedrig</option>
            </select>
        </div>

        <div class="property-group" style="border-bottom: 1px solid #ddd; padding-bottom: 15px; margin-bottom: 15px;">
            <label>Status:</label>
            <select id="processStatus" onchange="updateElementStatus('${element.id}', this.value)" ${selectStyle}>
                <option value="pending" ${elementData?.processStatus === 'pending' ? 'selected' : ''}>Wartend</option>
                <option value="active" ${elementData?.processStatus === 'active' ? 'selected' : ''}>Aktiv</option>
                <option value="completed" ${elementData?.processStatus === 'completed' ? 'selected' : ''}>Abgeschlossen</option>
                <option value="blocked" ${elementData?.processStatus === 'blocked' ? 'selected' : ''}>Blockiert</option>
                <option value="archived" ${elementData?.processStatus === 'archived' ? 'selected' : ''}>Archiviert</option>
            </select>
        </div>
    `;
}

export function hideProperties() {
    document.getElementById('propertiesContent').innerHTML = 
        '<p style="color: #7f8c8d;">Wählen Sie ein Element aus, um dessen Eigenschaften zu bearbeiten.</p>';
    
    if ('ontouchstart' in window) {
        document.body.style.overflow = '';
    }
}

export function updateElementText(id, text) {
    //console.log('Updating element text:', id, text);
    
    const element = document.getElementById(id);
    const elementData = projectData.elements.find(el => el.id === id);
    
    if (!element || !elementData) {
        //console.error('Element oder ElementData nicht gefunden:', id);
        return;
    }
    
    const span = element.querySelector('span');
    if (span) {
        span.textContent = text;
        //console.log('DOM Text aktualisiert:', text);
    }
    
    elementData.text = text;
    //console.log('ElementData aktualisiert:', elementData);
    
    saveToHistory('Update Element Text');
    saveProject();
}

export function updateElementProperty(id, property, value) {
    //console.log('Updating element property:', id, property, value);
    
    const elementData = projectData.elements.find(el => el.id === id);
    
    if (!elementData) {
        //console.error('ElementData nicht gefunden:', id);
        return;
    }
    
    // Properties-Objekt sicherstellen
    if (!elementData.properties) {
        elementData.properties = {};
    }
    
    // Validierung für spezielle Felder
    switch(property) {
        case 'input':
        case 'output':
        case 'duration':
        case 'description':
            elementData.properties[property] = typeof value === 'string' ? value.trim() : value;
            break;
        case 'category':
        case 'priority':
            // Select-Felder: Nur gültige Werte
            const validCategories = ['process', 'system', 'person', 'resource'];
            const validPriorities = ['Hoch', 'Normal', 'Niedrig'];
            
            if (property === 'category' && validCategories.includes(value)) {
                elementData.properties[property] = value;
            } else if (property === 'priority' && validPriorities.includes(value)) {
                elementData.properties[property] = value;
            } else if (property === 'category' || property === 'priority') {
                //console.warn(`Ungültiger ${property} Wert:`, value);
                return;
            }
            break;
        default:
            elementData.properties[property] = value;
    }
    
    //console.log('Property aktualisiert:', property, '=', elementData.properties[property], 'in:', elementData);
    
    saveToHistory('Update Element Property');
    saveProject();
}

export function updateElementPosition(id, axis, value) {
    const element = document.getElementById(id);
    if (!element) {
       //console.error('Element nicht gefunden:', id);
        return;
    }
    
    let newValue = parseInt(value);
    if (isNaN(newValue)) {
        //console.error('Ungültiger Position-Wert:', value);
        return;
    }

    // Grenzen-check
    if (axis === 'x') {
        const maxX = CONSTANTS.CANVAS_WIDTH - element.offsetWidth;
        newValue = Math.max(0, Math.min(maxX, newValue));
        element.style.left = newValue + 'px';
    } else if (axis === 'y') {
        const maxY = CONSTANTS.CANVAS_HEIGHT - element.offsetHeight;
        newValue = Math.max(0, Math.min(maxY, newValue));
        element.style.top = newValue + 'px';
    } else {
        //console.error('Ungültige Achse:', axis);
        return;
    }
   
    const elementData = projectData.elements.find(el => el.id === id);
    if (elementData) {
        elementData[axis] = newValue;
    }
   
    updateConnections();
    saveToHistory('Update Element Position');
}

let panelTouchStart = 0;
let panelTouchStartTime = 0;
let isDragingPanel = false;

function handlePanelTouchStart(event) {
    panelTouchStart = event.touches[0].clientY;
    panelTouchStartTime = Date.now();
    isDragingPanel = false;
}

function handlePanelTouchMove(event) {
    if (Math.abs(event.touches[0].clientY - panelTouchStart) > 10) {
        isDragingPanel = true;
        event.preventDefault();
    }
}

function handlePanelTouchEnd(event) {
    const touchEnd = event.changedTouches[0].clientY;
    const diff = touchEnd - panelTouchStart;
    const duration = Date.now() - panelTouchStartTime;
    
    if (diff > 50 && duration < 500 && isDragingPanel && propertiesPanelOpen) {
        toggleProperties();
    }
    
    isDragingPanel = false;
}

export function initPropertiesPanelTouch() {
    const panel = document.getElementById('propertiesPanel');
    if (panel && 'ontouchstart' in window) {
        panel.addEventListener('touchstart', handlePanelTouchStart, { passive: true });
        panel.addEventListener('touchmove', handlePanelTouchMove, { passive: false });
        panel.addEventListener('touchend', handlePanelTouchEnd, { passive: true });
    }
}


export function showConnectionProperties(connection) {
    if (!propertiesPanelOpen) {
        toggleProperties();
    }
    
    const content = document.getElementById('propertiesContent');
    
    const isMobile = 'ontouchstart' in window;
    const inputStyle = isMobile ? 'style="min-height: 44px; font-size: 16px;"' : '';
    const selectStyle = isMobile ? 'style="min-height: 44px; font-size: 16px;"' : '';
    const buttonStyle = isMobile ? 'style="min-height: 44px; font-size: 16px; padding: 12px 16px;"' : 'style="padding: 8px 12px;"';
    
    content.innerHTML = `
        <div class="property-group">
            <h4>Verbindung bearbeiten</h4>
            <label>Typ:</label>
            <select id="connectionType" onchange="updateConnectionProperty('${connection.id}', 'type', this.value)" ${selectStyle}>
                <option value="dataflow" ${connection.type === 'dataflow' ? 'selected' : ''}>Datenfluss</option>
                <option value="dependency" ${connection.type === 'dependency' ? 'selected' : ''}>Abhängigkeit</option>
                <option value="inheritance" ${connection.type === 'inheritance' ? 'selected' : ''}>Vererbung</option>
                <option value="association" ${connection.type === 'association' ? 'selected' : ''}>Assoziation</option>
            </select>
        </div>
        <div class="property-group">
            <label>Abhängigkeits-Typ:</label>
            <select id="dependencyType" onchange="updateConnectionProperty('${connection.id}', 'dependencyType', this.value)" ${selectStyle}>
                <option value="sequential" ${connection.dependencyType === 'sequential' ? 'selected' : ''}>Sequenziell</option>
                <option value="parallel" ${connection.dependencyType === 'parallel' ? 'selected' : ''}>Parallel</option>
                <option value="conditional" ${connection.dependencyType === 'conditional' ? 'selected' : ''}>Bedingt</option>
            </select>
        </div>
        
        <div class="property-group">
            <label>Abhängigkeits-Stärke:</label>
            <select id="dependencyStrength" onchange="updateConnectionMetadata('${connection.id}', 'strength', this.value)" ${selectStyle}>
                <option value="strong" ${connection.metadata?.strength === 'strong' ? 'selected' : ''}>Stark (blockierend)</option>
                <option value="medium" ${connection.metadata?.strength === 'medium' ? 'selected' : ''}>Mittel</option>
                <option value="weak" ${connection.metadata?.strength === 'weak' ? 'selected' : ''}>Schwach (Empfehlung)</option>
            </select>
        </div>
        
        <div class="property-group">
            <label>
                <input type="checkbox" id="isRequired" ${connection.isRequired ? 'checked' : ''} 
                       onchange="updateConnectionProperty('${connection.id}', 'isRequired', this.checked)">
                Harte Abhängigkeit (erforderlich)
            </label>
        </div>
        <div class="property-group">
            <label>Beschriftung:</label>
            <input type="text" id="connectionLabel" value="${connection.label || ''}" 
                   placeholder="z.B. Freigabe, Dokument, Daten..."
                   onchange="updateConnectionProperty('${connection.id}', 'label', this.value)" ${inputStyle}>
        </div>
        <div class="property-group">
            <label>Farbe:</label>
            <input type="color" id="connectionColor" value="${connection.style?.color || '#3498db'}" 
                   onchange="updateConnectionStyle('${connection.id}', 'color', this.value)" ${inputStyle}>
        </div>
        <div class="property-group">
            <label>Linienstärke:</label>
            <input type="range" id="connectionWidth" min="1" max="8" value="${connection.style?.width || 2}" 
                   onchange="updateConnectionStyle('${connection.id}', 'width', this.value)"
                   ${isMobile ? 'style="min-height: 44px;"' : ''}>
            <span id="widthValue">${connection.style?.width || 2}px</span>
        </div>
        <div class="property-group">
            <label>Linienstil:</label>
            <select id="connectionStyle" onchange="updateConnectionStyle('${connection.id}', 'style', this.value)" ${selectStyle}>
                <option value="solid" ${connection.style?.style === 'solid' ? 'selected' : ''}>Durchgezogen</option>
                <option value="dashed" ${connection.style?.style === 'dashed' ? 'selected' : ''}>Gestrichelt</option>
                <option value="dotted" ${connection.style?.style === 'dotted' ? 'selected' : ''}>Gepunktet</option>
            </select>
        </div>
        <div class="property-group">
            <button onclick="deleteSelectedConnection()" 
                    ${buttonStyle}
                    style="background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; ${isMobile ? 'min-height: 44px; font-size: 16px;' : ''}">
                Verbindung löschen
            </button>
        </div>
        <div class="property-group">
            <small style="color: #7f8c8d;">
                ${isMobile ? 'Tipp: Berühren Sie die orangen Punkte, um Eckpunkte zu verschieben.' : 'Tipp: Ziehen Sie die orangen Punkte, um die Verbindungspunkte zu verschieben.'}
            </small>
        </div>
        <div class="property-group" style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 15px;">
            <button onclick="analyzeDependency('${connection.id}')" 
                    style="background: #3498db; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer; width: 100%;">
                <i class="fa-solid fa-search"></i> Abhängigkeit analysieren
            </button>
        </div>
    `;

    setTimeout(() => {
        const widthSlider = document.getElementById('connectionWidth');
        const widthValue = document.getElementById('widthValue');
        if (widthSlider && widthValue) {
            widthSlider.addEventListener('input', () => {
                widthValue.textContent = widthSlider.value + 'px';
            });
        }
    }, 100);
}

window.updateConnectionProperty = function(connectionId, property, value) {
    try {
        const connection = projectData.connections.find(conn => conn.id === connectionId);
        if (!connection) {
            //console.error('Verbindung nicht gefunden:', connectionId);
            return;
        }
        
        connection[property] = value;
        
        const connectionGroup = document.querySelector(`[data-connection-id="${connectionId}"]`);
        if (connectionGroup) {
            updateConnectionVisual(connection, connectionGroup);
            
            if (property === 'label' && value) {
                addConnectionLabel(connection, connectionGroup);
            }
        }
        
        saveToHistory('Update Connection Property');
        saveProject(); 
    } catch (error) {
        //console.error('Fehler beim Aktualisieren der Verbindungseigenschaft:', error);
        showToast('Fehler beim Aktualisieren der Verbindung', 'error');
    }
};

window.updateConnectionStyle = function(connectionId, styleProperty, value) {
    try {
        const connection = projectData.connections.find(conn => conn.id === connectionId);
        if (connection) {
            if (!connection.style) connection.style = {};
            connection.style[styleProperty] = value;
            
            const connectionGroup = document.querySelector(`[data-connection-id="${connectionId}"]`);
            if (connectionGroup) {
                updateConnectionVisual(connection, connectionGroup);
            }
            
            saveToHistory('Update Connection Style');
        }
    } catch (error) {
        //console.error('Fehler beim Aktualisieren des Verbindungsstils:', error);
    }
};

function updateConnectionVisual(connection, connectionGroup) {
    const path = connectionGroup.querySelector('.connection-path');
    const arrow = connectionGroup.querySelector('.connection-arrow');
    
    if (path && connection.style) {
        path.style.stroke = connection.style.color || '#3498db';
        path.style.strokeWidth = connection.style.width || '2';
        
        switch(connection.style.style) {
            case 'dashed':
                path.style.strokeDasharray = '8,4';
                break;
            case 'dotted':
                path.style.strokeDasharray = '2,2';
                break;
            default:
                path.style.strokeDasharray = 'none';
        }
    }
    
    if (arrow && connection.style) {
        arrow.style.fill = connection.style.color || '#3498db';
    }
    
    connectionGroup.className = `connection-group orthogonal connection-${connection.type}`;
    if (connectionGroup.classList.contains('selected')) {
        connectionGroup.classList.add('selected');
    }
}

function addConnectionLabel(connection, connectionGroup) {
    const existingLabel = connectionGroup.querySelector('.connection-label');
    if (existingLabel) {
        existingLabel.remove();
    }
    
    if (connection.label && connection.startPoint && connection.endPoint) {
        const label = document.createElement('div');
        label.className = 'connection-label';
        label.textContent = connection.label;
        
        const midX = (connection.startPoint.x + connection.endPoint.x) / 2;
        const midY = (connection.startPoint.y + connection.endPoint.y) / 2;
        
        const isMobile = 'ontouchstart' in window;
        label.style.cssText = `
            position: absolute;
            left: ${midX - 20}px;
            top: ${midY - 10}px;
            background: rgba(255, 255, 255, 0.9);
            padding: ${isMobile ? '6px 10px' : '2px 6px'};
            border-radius: 4px;
            font-size: ${isMobile ? '14px' : '11px'};
            color: #2c3e50;
            border: 1px solid #bdc3c7;
            pointer-events: none;
            z-index: 5;
            font-weight: 500;
        `;
        
        connectionGroup.appendChild(label);
    }
}

window.updateConnectionMetadata = function(connectionId, property, value) {
    const connection = projectData.connections.find(conn => conn.id === connectionId);
    if (connection) {
        if (!connection.metadata) connection.metadata = {};
        connection.metadata[property] = value;
        const depEngine = getDependencyEngine();
        if (depEngine) {
            setTimeout(() => {
                depEngine.onStatusChange(connection.from, 'unknown', 'unknown');
            }, 100);
        }
        
        saveToHistory('Update Connection Metadata');
    }
};

window.analyzeDependency = function(connectionId) {
    const depEngine = getDependencyEngine();
    if (!depEngine) {
        showToast('Dependency Engine nicht verfügbar', 'error');
        return;
    }
    
    const connection = projectData.connections.find(conn => conn.id === connectionId);
    if (!connection) return;
    
    const fromElement = projectData.elements.find(el => el.id === connection.from);
    const toElement = projectData.elements.find(el => el.id === connection.to);
    
    if (!fromElement || !toElement) return;
    
    // Analyse-Dialog anzeigen
    showDependencyAnalysisDialog(connection, fromElement, toElement, depEngine);
};

function showDependencyAnalysisDialog(connection, fromElement, toElement, depEngine) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.6); z-index: 15000;
        display: flex; align-items: center; justify-content: center;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white; border-radius: 16px; padding: 24px;
        max-width: 500px; max-height: 80vh; overflow-y: auto;
        box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    `;
    
    // Analyse durchführen
    const canActivate = depEngine.canBeActivated(toElement.id);
    const predecessors = depEngine.getDirectPredecessors(toElement.id);
    const successors = depEngine.getDirectSuccessors(fromElement.id);
    
            dialog.innerHTML = `
        <h3 style="margin: 0 0 20px 0; color: #2c3e50;">
            <i class="fa-solid fa-search"></i> Abhängigkeits-Analyse
        </h3>
        
        <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <h4 style="margin: 0 0 12px 0; color: #495057;">Verbindung</h4>
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="background: ${getStatusColor(fromElement.processStatus)}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                    ${fromElement.text}
                </span>
                <i class="fa-solid fa-arrow-right" style="color: #6c757d;"></i>
                <span style="background: ${getStatusColor(toElement.processStatus)}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                    ${toElement.text}
                </span>
            </div>
        </div>
        
        <div style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 8px 0; color: #495057;">Status-Analyse</h4>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <i class="fa-solid ${canActivate ? 'fa-check-circle' : 'fa-times-circle'}" 
                   style="color: ${canActivate ? '#28a745' : '#dc3545'};"></i>
                <span>${canActivate ? 'Kann aktiviert werden' : 'Kann nicht aktiviert werden'}</span>
            </div>
            <div style="font-size: 12px; color: #6c757d; margin-left: 20px;">
                ${canActivate ? 
                    'Alle Vorgänger-Abhängigkeiten sind erfüllt.' : 
                    'Warten auf Abschluss von Vorgänger-Prozessen.'}
            </div>
        </div>
        
        <div style="margin-bottom: 16px;">
            <h4 style="margin: 0 0 8px 0; color: #495057;">Abhängigkeits-Details</h4>
            <div style="background: #fff; border: 1px solid #dee2e6; border-radius: 6px; padding: 12px;">
                <div style="margin-bottom: 8px;">
                    <strong>Typ:</strong> ${connection.dependencyType || 'sequential'}
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Stärke:</strong> ${connection.metadata?.strength || 'strong'}
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Erforderlich:</strong> ${connection.isRequired ? 'Ja' : 'Nein'}
                </div>
                <div>
                    <strong>Vorgänger:</strong> ${predecessors.length} | 
                    <strong>Nachfolger:</strong> ${successors.length}
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h4 style="margin: 0 0 8px 0; color: #495057;">Empfehlungen</h4>
            <div id="recommendations" style="background: #e7f3ff; border-left: 4px solid #0084d4; padding: 12px;">
                ${generateDependencyRecommendations(connection, fromElement, toElement, canActivate)}
            </div>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button onclick="this.closest('.dependency-analysis-overlay').remove()" style="
                padding: 8px 16px; background: #6c757d; color: white; 
                border: none; border-radius: 6px; cursor: pointer;
            ">Schließen</button>
            <button onclick="optimizeDependency('${connection.id}')" style="
                padding: 8px 16px; background: #28a745; color: white; 
                border: none; border-radius: 6px; cursor: pointer;
            ">Optimieren</button>
        </div>
    `;
    
    overlay.className = 'dependency-analysis-overlay';
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

function generateDependencyRecommendations(connection, fromElement, toElement, canActivate) {
    const recommendations = [];
    
    if (!canActivate && toElement.processStatus === 'pending') {
        recommendations.push('Prüfen Sie ob Vorgänger-Prozesse beschleunigt werden können.');
    }
    
    if (fromElement.processStatus === 'blocked') {
        recommendations.push('Vorgänger-Prozess ist blockiert - beheben Sie die Blockade zuerst.');
    }
    
    if (connection.metadata?.strength === 'weak' && connection.isRequired) {
        recommendations.push('Schwache aber erforderliche Abhängigkeit - prüfen Sie die Konsistenz.');
    }
    
    if (connection.dependencyType === 'parallel') {
        recommendations.push('Parallel-Abhängigkeit - beide Prozesse können gleichzeitig laufen.');
    }
    
    return recommendations.length > 0 ? 
        recommendations.map(rec => `<div style="margin-bottom: 4px;">${rec}</div>`).join('') :
        '<div>Abhängigkeit ist optimal konfiguriert.</div>';
}

function getStatusColor(status) {
    const colors = {
        'pending': '#6c757d',
        'active': '#ffc107', 
        'completed': '#28a745',
        'blocked': '#dc3545',
        'archived': '#e9ecef'
    };
    return colors[status] || '#6c757d';
}

window.optimizeDependency = function(connectionId) {
    const depEngine = getDependencyEngine();
    if (!depEngine) return;
    
    const connection = projectData.connections.find(conn => conn.id === connectionId);
    if (!connection) return;
    
    // Zeige Optimierungs-Optionen
    showOptimizationDialog(connection, depEngine);
};

function showOptimizationDialog(connection, depEngine) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.6); z-index: 16000;
        display: flex; align-items: center; justify-content: center;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white; border-radius: 16px; padding: 24px;
        max-width: 400px; box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    `;
    
    dialog.innerHTML = `
        <h3 style="margin: 0 0 20px 0; color: #2c3e50;">
            <i class="fa-solid fa-magic"></i> Abhängigkeit optimieren
        </h3>
        
        <div style="margin-bottom: 20px;">
            <p style="margin: 0 0 16px 0; color: #495057;">
                Wählen Sie eine Optimierungsoption:
            </p>
            
            <div style="margin-bottom: 12px;">
                <button onclick="applyOptimization('${connection.id}', 'auto_activate')" style="
                    width: 100%; padding: 12px; background: #28a745; color: white;
                    border: none; border-radius: 6px; cursor: pointer; margin-bottom: 8px;
                ">
                    <i class="fa-solid fa-bolt"></i> Auto-Aktivierung einschalten
                </button>
            </div>
            
            <div style="margin-bottom: 12px;">
                <button onclick="applyOptimization('${connection.id}', 'weaken_dependency')" style="
                    width: 100%; padding: 12px; background: #ffc107; color: #212529;
                    border: none; border-radius: 6px; cursor: pointer; margin-bottom: 8px;
                ">
                    <i class="fa-solid fa-link"></i> Abhängigkeit abschwächen
                </button>
            </div>
            
            <div style="margin-bottom: 12px;">
                <button onclick="applyOptimization('${connection.id}', 'make_parallel')" style="
                    width: 100%; padding: 12px; background: #17a2b8; color: white;
                    border: none; border-radius: 6px; cursor: pointer; margin-bottom: 8px;
                ">
                    <i class="fa-solid fa-arrows-alt-h"></i> Parallel-Ausführung ermöglichen
                </button>
            </div>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button onclick="this.closest('.optimization-overlay').remove()" style="
                padding: 8px 16px; background: #6c757d; color: white; 
                border: none; border-radius: 6px; cursor: pointer;
            ">Abbrechen</button>
        </div>
    `;
    
    overlay.className = 'optimization-overlay';
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
}

window.applyOptimization = function(connectionId, optimizationType) {
    const connection = projectData.connections.find(conn => conn.id === connectionId);
    if (!connection) return;
    
    switch (optimizationType) {
        case 'auto_activate':
            connection.metadata = connection.metadata || {};
            connection.metadata.autoActivate = true;
            showToast('Auto-Aktivierung aktiviert', 'success');
            break;
            
        case 'weaken_dependency':
            connection.metadata = connection.metadata || {};
            connection.metadata.strength = 'weak';
            connection.isRequired = false;
            showToast('Abhängigkeit abgeschwächt', 'success');
            break;
            
        case 'make_parallel':
            connection.dependencyType = 'parallel';
            showToast('Parallel-Ausführung aktiviert', 'success');
            break;
    }
    
    // Dependency Engine über Änderung informieren
    const depEngine = getDependencyEngine();
    if (depEngine) {
        setTimeout(() => {
            depEngine.onStatusChange(connection.from, 'unknown', 'unknown');
        }, 100);
    }
    
    saveToHistory(`Optimize Dependency: ${optimizationType}`);
    document.querySelector('.optimization-overlay').remove();
    document.querySelector('.dependency-analysis-overlay')?.remove();
};

// Description mit der ESC-Taste speichern
function handleDescriptionKeydown(event, elementId) {
    if (event.key === 'Escape') {
        event.preventDefault();
        const value = event.target.value;
        updateElementProperty(elementId, 'description', value);
        event.target.blur();
        // console.log('Beschreibung gespeichert mit ESC:', value);
        showToast('Beschreibung gespeichert', 'success');
    }
}

window.handleDescriptionKeydown = handleDescriptionKeydown;
window.updateElementText = updateElementText;
window.updateElementProperty = updateElementProperty;
window.updateElementPosition = updateElementPosition;
window.updateElementStatus = updateElementStatus; 