import { CONSTANTS } from '../utils/constants.js';
import { getElementConfig } from '../tools/tools.js';
import { 
    elementCounter, 
    setElementCounter,
    projectData, 
    selectedElement, 
    setSelectedElement 
} from '../utils/state.js';
import { saveToHistory } from '../data/history.js';
import { showProperties, hideProperties } from '../ui/properties.js';
import { updateConnections, deselectConnections, getConnectionManager  } from './connections.js';  
import {  updateStatusIcon, PROCESS_STATUS } from './status.js';

// Neues Element erzeugen 
export function createElement(type, x, y) {
    const config = getElementConfig(type);
    const elementSize = CONSTANTS.DEFAULT_ELEMENT_SIZES[type] || CONSTANTS.DEFAULT_ELEMENT_SIZES.rectangle;

    const newCounter = elementCounter + 1;
    setElementCounter(newCounter);

    const elementData = {
        id: `element-${newCounter}`,
        type,
        x: Math.max(0, Math.min(CONSTANTS.CANVAS_SIZE - elementSize.width, x)),
        y: Math.max(0, Math.min(CONSTANTS.CANVAS_SIZE - elementSize.height, y)),
        text: config.title,
        color: config.color,
        width: elementSize.width,
        height: elementSize.height,
        properties: {
            description: '',
            category: type,
            priority: 'Normal'
        }
    };

    const wrapper = createElementDOM(elementData);
    document.getElementById('canvas').appendChild(wrapper);
    projectData.elements.push(elementData);
    saveToHistory(`Create ${type}`);
}

// Helper-Funktion für loadProject, restoreState, createElement um Redundanzen zu meiden (waren ähnlich aufgebaut)
export function createElementDOM(elementData) {
    const wrapper = document.createElement('div');
    wrapper.className = 'element-wrapper';
    wrapper.setAttribute('data-type', elementData.type);
    wrapper.id = elementData.id;
    
    // Status-Attribut setzen
    wrapper.setAttribute('data-status', elementData.processStatus || 'pending');
    
    wrapper.style.left = (elementData.x || 0) + 'px';
    wrapper.style.top = (elementData.y || 0) + 'px';

    const defaultSize = CONSTANTS.DEFAULT_ELEMENT_SIZES[elementData.type] || CONSTANTS.DEFAULT_ELEMENT_SIZES.rectangle;
    wrapper.style.width = (elementData.width || defaultSize.width) + 'px';
    wrapper.style.height = (elementData.height || defaultSize.height) + 'px';

    const innerElement = document.createElement('div');
    const config = getElementConfig(elementData.type);
    const shapeClass = config?.shapeClass || `${elementData.type}-shape`;
    innerElement.className = `shape ${shapeClass}`;

    if (elementData.color) {
        innerElement.style.borderColor = elementData.color;
    }

    const span = document.createElement('span');
    span.textContent = elementData.text;
    span.style.transform = elementData.type === 'diamond' ? 'rotate(-45deg)' : 'none';

    innerElement.appendChild(span);
    wrapper.appendChild(innerElement);
    
    // Doppelklick Event für Properties Panel
    wrapper.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        handleElementDoubleClick(wrapper);
    });

    // Stelle sicher dass Element einen Status hat
    if (!elementData.processStatus) {
        elementData.processStatus = PROCESS_STATUS.PENDING;
        // console.log(`Setting default status for ${elementData.id}: PENDING`);
    }
    
    // Status-Icon hinzufügen wenn Status vorhanden
    if (elementData.processStatus) {
        setTimeout(() => {
            updateStatusIcon(wrapper, elementData.processStatus);
        }, 10);
    }
    
    return wrapper;
}


// Visuelles Update nach Typwechsel
export function updateElementVisual(el, type, color = null) {
    const shape = el.querySelector('.shape');
    const span = el.querySelector('span');
    if (!shape) return;

    shape.className = `shape ${type}-shape`;

    if (color) shape.style.borderColor = color;

    switch (type) {
        case 'circle':
            shape.style.borderRadius = '50%';
            shape.style.borderStyle = 'solid';
            shape.style.borderWidth = '3px';
            span.style.transform = 'none';
            break;
        case 'diamond':
            shape.style.transform = 'rotate(45deg)';
            shape.style.borderStyle = 'solid';
            shape.style.borderWidth = '3px';
            span.style.transform = 'rotate(-45deg)';
            break;
        case 'umlClass':
            shape.style.borderRadius = '0';
            shape.style.borderStyle = 'double';
            shape.style.borderWidth = '4px';
            shape.style.transform = 'none';
            span.style.transform = 'none';
            break;
        default:
            shape.style.borderRadius = '0';
            shape.style.borderStyle = 'solid';
            shape.style.borderWidth = '2px';
            shape.style.transform = 'none';
            span.style.transform = 'none';
    }
}

// Hilfsfunktionen
export function getElementAt(x, y) {
    const elements = document.querySelectorAll('.element-wrapper');
    for (let element of elements) {
        const rect = element.getBoundingClientRect();
        const canvasRect = document.getElementById('canvas').getBoundingClientRect();
        const elX = rect.left - canvasRect.left;
        const elY = rect.top - canvasRect.top;

        if (x >= elX && x <= elX + rect.width && y >= elY && y <= elY + rect.height) {
            return element;
        }
    }
    return null;
}

export function selectElement(element) {
    deselectAll();
    deselectConnections();
    element.classList.add('selected');
    setSelectedElement(element);
}

export function handleElementDoubleClick(element) {
    selectElement(element);
    showProperties(element);
}

export function deselectAll() {
    document.querySelectorAll('.element-wrapper').forEach(el => el.classList.remove('selected'));
    setSelectedElement(null);
    hideProperties();
}

export function deleteSelected() {
    if (selectedElement) {
        const elementId = selectedElement.id;
        
        // console.log('Lösche Element:', elementId);
        
        // Speichere für Undo
        saveToHistory('Delete Element');
        
        const connectionManager = getConnectionManager();
        
        // Find all connections involving this element
        const connectionsToDelete = [];
        connectionManager.connections.forEach((connection, connId) => {
            if (connection.from === elementId || connection.to === elementId) {
                connectionsToDelete.push(connId);
            }
        });
        
        // console.log(`Lösche ${connectionsToDelete.length} Connections für Element ${elementId}`);
        
        // Delete connections from ConnectionManager
        connectionsToDelete.forEach(connectionId => {
            connectionManager.deleteConnection(connectionId);
        });
        
        // Filter connections from projectData
        const originalConnectionCount = projectData.connections.length;
        projectData.connections = projectData.connections.filter(conn =>
            conn.from !== elementId && conn.to !== elementId
        );
        
        const removedConnections = originalConnectionCount - projectData.connections.length;
        // console.log(`Legacy cleanup: ${removedConnections} connections entfernt aus projectData`);
        
        document.querySelectorAll(`[data-connection-id]`).forEach(connElement => {
            const connId = connElement.getAttribute('data-connection-id');
            const connection = projectData.connections.find(c => c.id === connId);
            
            // Wenn connection nicht mehr existiert oder Element betrifft
            if (!connection || connection.from === elementId || connection.to === elementId) {
                connElement.remove();
                // console.log(`DOM cleanup: Connection ${connId} entfernt`);
            }
        });
        
        selectedElement.remove();
        projectData.elements = projectData.elements.filter(el => el.id !== elementId);
        setSelectedElement(null);
        hideProperties();
        
        setTimeout(() => {
            if (typeof recalculateAllConnections === 'function') {
                recalculateAllConnections();
            } else if (typeof updateConnections === 'function') {
                updateConnections();
            }
        }, 50);
        
        // console.log(`Element ${elementId} und alle zugehörigen Connections erfolgreich gelöscht`);
    }
}