import { 
    projectData,
    setProjectData,
    projectHistory,
    setProjectHistory,
    currentHistoryIndex,
    setCurrentHistoryIndex,
    maxHistorySize,
    elementCounter,
    setElementCounter
} from '../utils/state.js';
import { createElementDOM } from '../canvas/elements.js';
import { createConnectionLine, cleanup } from '../canvas/connections.js';
import { deselectAll } from '../canvas/elements.js';
import { getSwimLaneState, restoreSwimLaneState, updateElementLaneAssignments } from '../canvas/swimlanes.js';

let isUndoRedoAction = false;

// Aktuellen Zustand zur History hinzufügen
export function saveToHistory(action = 'action') {
    if (isUndoRedoAction) return;
    
    // Aktualisiere Element-Positionen
    projectData.elements.forEach(elementData => {
        const element = document.getElementById(elementData.id);
        if (element && elementData) {
            elementData.x = element.offsetLeft;
            elementData.y = element.offsetTop;
            elementData.width = element.offsetWidth;
            elementData.height = element.offsetHeight;
        }
    });
    
    const newHistory = projectHistory.slice(0, currentHistoryIndex + 1);
    
    const currentState = {
        elements: JSON.parse(JSON.stringify(projectData.elements)),
        connections: JSON.parse(JSON.stringify(projectData.connections)),
        elementCounter: elementCounter,
        action: action,
        timestamp: Date.now(),
        swimLaneState: getSwimLaneState()
    };
    
    newHistory.push(currentState);
    const newIndex = newHistory.length - 1;
    
    if (newHistory.length > maxHistorySize) {
        newHistory.shift();
        setCurrentHistoryIndex(newIndex - 1);
    } else {
        setCurrentHistoryIndex(newIndex);
    }
    
    setProjectHistory(newHistory);
    updateUndoRedoButtons();
}

export function undo() {
    if (currentHistoryIndex <= 0) return;
    
    isUndoRedoAction = true;
    const newIndex = currentHistoryIndex - 1;
    setCurrentHistoryIndex(newIndex);
    
    const previousState = projectHistory[newIndex];
    restoreState(previousState);
    
    isUndoRedoAction = false;
    updateUndoRedoButtons();
}

export function redo() {
    if (currentHistoryIndex >= projectHistory.length - 1) return;
    
    isUndoRedoAction = true;
    const newIndex = currentHistoryIndex + 1;
    setCurrentHistoryIndex(newIndex);
    
    const nextState = projectHistory[newIndex];
    restoreState(nextState);
    
    isUndoRedoAction = false;
    updateUndoRedoButtons();
}

//  Zustand-Wiederherstellung
function restoreState(state) {
    //console.log('Restoring state:', state.action, 'Elements:', state.elements.length, 'Connections:', state.connections.length);
    
    cleanup();
    
    const canvas = document.getElementById('canvas');
    canvas.innerHTML = '';
    
    if (typeof state.elementCounter === 'number') {
        setElementCounter(state.elementCounter);
    }
    
    // ProjectData wiederherstellen (Deep Copy)
    const newProjectData = {
        elements: JSON.parse(JSON.stringify(state.elements || [])),
        connections: JSON.parse(JSON.stringify(state.connections || []))
    };
    setProjectData(newProjectData);
    
    if (state.swimLaneState) {
        restoreSwimLaneState(state.swimLaneState);
    }
    
    const elementPromises = newProjectData.elements.map(elementData => {
        return new Promise((resolve) => {
            try {
                const wrapper = createElementDOM(elementData);
                canvas.appendChild(wrapper);
                
                requestAnimationFrame(() => {
                    wrapper.style.left = elementData.x + 'px';
                    wrapper.style.top = elementData.y + 'px';
                    resolve(elementData.id);
                });
            } catch (error) {
                console.error('Fehler beim Erstellen von Element:', elementData.id, error);
                resolve(null);
            }
        });
    });
    
    Promise.all(elementPromises).then((elementIds) => {
        const validElementIds = elementIds.filter(id => id !== null);
        //console.log('Elemente erstellt:', validElementIds);
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                restoreConnections(newProjectData.connections);
                deselectAll();
                
                setTimeout(() => {
                    updateElementLaneAssignments();
                }, 100);
            });
        });
    });
}

function restoreConnections(connections) {
    if (!connections || connections.length === 0) {
        //console.log('Keine Verbindungen zu wiederherstellen');
        return;
    }
    
    //console.log('Wiederherstellen von', connections.length, 'Verbindungen');
    
    // Entferne alle existierenden Verbindungen aus DOM
    document.querySelectorAll('.connection-group').forEach(group => {
        group.remove();
    });
    
    connections.forEach((conn, index) => {
        try {
            // Prüfe ob Start- und End-Elemente existieren
            const startEl = document.getElementById(conn.from);
            const endEl = document.getElementById(conn.to);
            
            if (!startEl) {
                console.warn(`Start-Element ${conn.from} für Verbindung ${conn.id} nicht gefunden`);
                return;
            }
            
            if (!endEl) {
                console.warn(`End-Element ${conn.to} für Verbindung ${conn.id} nicht gefunden`);
                return;
            }
            
            // Validiere Verbindungsdaten und repariere wenn nötig
            const validatedConn = validateAndRepairConnection(conn, startEl, endEl);
            
            // Erstelle Verbindung
            createConnectionLine(validatedConn, index);
            
            // Wiederherstellung des Labels nach Verbindungserstellung
            if (validatedConn.label) {
                setTimeout(() => {
                    const connectionGroup = document.querySelector(`[data-connection-id="${validatedConn.id}"]`);
                    if (connectionGroup) {
                        // Entferne existierendes Label
                        const existingLabel = connectionGroup.querySelector('.connection-label');
                        if (existingLabel) {
                            existingLabel.remove();
                        }
                        // Erstelle neues Label
                        createConnectionLabel(validatedConn, connectionGroup);
                    }
                }, 50);
            }
            
            //console.log(`Verbindung wiederhergestellt: ${conn.id} (${conn.from} → ${conn.to})${conn.label ? ' mit Label: ' + conn.label : ''}`);
            
        } catch (error) {
            //console.error(`Fehler beim Wiederherstellen von Verbindung ${conn.id}:`, error);
        }
    });
}

function createConnectionLabel(conn, connectionGroup) {
    if (!conn.label || !conn.startPoint || !conn.endPoint) return;
    
    const label = document.createElement('div');
    label.className = 'connection-label';
    label.textContent = conn.label;
    
    // Berechnet Position in der Mitte der Verbindung
    let midX, midY;
    
    if (conn.cornerPoints && conn.cornerPoints.length > 0) {
        const allPoints = [conn.startPoint, ...conn.cornerPoints, conn.endPoint];
        const totalLength = allPoints.length;
        const midIndex = Math.floor(totalLength / 2);
        
        if (totalLength % 2 === 0) {
            const point1 = allPoints[midIndex - 1];
            const point2 = allPoints[midIndex];
            midX = (point1.x + point2.x) / 2;
            midY = (point1.y + point2.y) / 2;
        } else {
            const midPoint = allPoints[midIndex];
            midX = midPoint.x;
            midY = midPoint.y;
        }
    } else {
        midX = (conn.startPoint.x + conn.endPoint.x) / 2;
        midY = (conn.startPoint.y + conn.endPoint.y) / 2;
    }
    
    const isMobile = 'ontouchstart' in window;
    label.style.cssText = `
        position: absolute;
        left: ${midX - 30}px;
        top: ${midY - 12}px;
        background: rgba(255, 255, 255, 0.95);
        padding: ${isMobile ? '8px 12px' : '4px 8px'};
        border-radius: 6px;
        font-size: ${isMobile ? '14px' : '12px'};
        color: #2c3e50;
        border: 1px solid #bdc3c7;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        pointer-events: none;
        z-index: 10;
        font-weight: 600;
        max-width: 120px;
        text-align: center;
        word-wrap: break-word;
        line-height: 1.2;
    `;
    
    connectionGroup.appendChild(label);
}

// Validiere und repariere Verbindungsdaten
function validateAndRepairConnection(conn, startEl, endEl) {
    const repairedConn = { ...conn };
    
    if (!repairedConn.id) {
        repairedConn.id = `connection-${Date.now()}-${Math.random()}`;
    }
    
    if (!repairedConn.type) {
        repairedConn.type = 'dataflow';
    }
    
    if (!repairedConn.style) {
        repairedConn.style = {
            color: '#3498db',
            width: 2,
            style: 'solid'
        };
    }
    
    if (!repairedConn.startPoint || !isValidPoint(repairedConn.startPoint)) {
        repairedConn.startPoint = calculateConnectionPoint(startEl, endEl, true);
    }
    
    if (!repairedConn.endPoint || !isValidPoint(repairedConn.endPoint)) {
        repairedConn.endPoint = calculateConnectionPoint(endEl, startEl, false);
    }
    
    if (!Array.isArray(repairedConn.cornerPoints)) {
        repairedConn.cornerPoints = [];
    }
    
    if (repairedConn.cornerPoints.length === 0) {
        repairedConn.cornerPoints = calculateDefaultCornerPoints(
            repairedConn.startPoint, 
            repairedConn.endPoint
        );
    }
    
    // Validiere alle Eckpunkte
    repairedConn.cornerPoints = repairedConn.cornerPoints.filter(point => {
        if (!isValidPoint(point)) {
            //console.warn('Ungültiger Eckpunkt entfernt:', point);
            return false;
        }
        return true;
    });
    
    // Stelle sicher, dass jeder Eckpunkt eine ID hat
    repairedConn.cornerPoints.forEach((point, index) => {
        if (!point.id) {
            point.id = `corner-${Date.now()}-${index}`;
        }
        if (!point.type) {
            point.type = 'corner';
        }
    });
    
    // Stelle sicher, dass isOrthogonal gesetzt ist
    if (typeof repairedConn.isOrthogonal !== 'boolean') {
        repairedConn.isOrthogonal = true;
    }
    
    return repairedConn;
}

// Prüft, ob ein Punkt gültig ist
function isValidPoint(point) {
    return point && 
           typeof point.x === 'number' && 
           typeof point.y === 'number' && 
           !isNaN(point.x) && 
           !isNaN(point.y) && 
           isFinite(point.x) && 
           isFinite(point.y);
}

// Berechnet die Verbindungspunkt
function calculateConnectionPoint(element, targetElement, isStart) {
    const elementX = element.offsetLeft;
    const elementY = element.offsetTop;
    const elementCenterX = elementX + element.offsetWidth / 2;
    const elementCenterY = elementY + element.offsetHeight / 2;
    
    const targetCenterX = targetElement.offsetLeft + targetElement.offsetWidth / 2;
    const targetCenterY = targetElement.offsetTop + targetElement.offsetHeight / 2;
    
    const deltaX = targetCenterX - elementCenterX;
    const deltaY = targetCenterY - elementCenterY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    
    let connectionX, connectionY;
    
    if (absX > absY) {
        if (deltaX > 0) {
            connectionX = elementX + element.offsetWidth;
            connectionY = elementCenterY;
        } else {
            connectionX = elementX;
            connectionY = elementCenterY;
        }
    } else {
        if (deltaY > 0) {
            connectionX = elementCenterX;
            connectionY = elementY + element.offsetHeight;
        } else {
            connectionX = elementCenterX;
            connectionY = elementY;
        }
    }
    
    return { x: connectionX, y: connectionY };
}

// Berechnet die Standard-Eckpunkte
function calculateDefaultCornerPoints(startPoint, endPoint) {
    const midX = startPoint.x + (endPoint.x - startPoint.x) * 0.5;
    
    return [{
        id: `corner-${Date.now()}-1`,
        x: midX,
        y: startPoint.y,
        type: 'corner'
    }, {
        id: `corner-${Date.now()}-2`, 
        x: midX,
        y: endPoint.y,
        type: 'corner'
    }];
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    if (undoBtn) {
        undoBtn.disabled = currentHistoryIndex <= 0;
        undoBtn.style.opacity = undoBtn.disabled ? '0.5' : '1';
    }
    
    if (redoBtn) {
        redoBtn.disabled = currentHistoryIndex >= projectHistory.length - 1;
        redoBtn.style.opacity = redoBtn.disabled ? '0.5' : '1';
    }
}

window.undo = undo;
window.redo = redo;