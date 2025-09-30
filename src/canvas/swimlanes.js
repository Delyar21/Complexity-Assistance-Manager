import { CONSTANTS } from '../utils/constants.js';
import { projectData, zoomLevel, panOffset } from '../utils/state.js';
import { saveToHistory } from '../data/history.js';
import { showToast } from '../ui/toast.js';

let swimLanes = [];
window.swimLanes = swimLanes;
let isDraggingDivider = false;
let currentDragData = null;
let swimLanesVisible = false;

// Standard Swim Lanes für Geschäftsprozesse 
const DEFAULT_SWIM_LANES = [
    { id: 'kunde', name: 'Kunde', color: '#003b6f', height: 150 },
    { id: 'vertrieb', name: 'Vertrieb', color: '#ad2929ff', height: 150 },
    { id: 'produktion', name: 'Produktion', color: '#003b6f', height: 150 },
    { id: 'finanzen', name: 'Finanzen', color: '#ad2929ff', height: 150 },
    { id: 'it', name: 'IT-Abteilung', color: '#1abc9c', height: 150 },
    { id: 'management', name: 'Management', color: '#003b6f', height: 150 }
];


export function initializeSwimLanes() {
    if (swimLanes.length === 0) {
        swimLanes = [...DEFAULT_SWIM_LANES];
    }
    
    const adjustedLanes = adjustSwimLaneHeights([...swimLanes]);
    swimLanes.length = 0;
    swimLanes.push(...adjustedLanes);
    
    // NEU: Global verfügbar machen
    window.swimLanes = swimLanes;
    
    updateSwimLaneData();
}

export function toggleSwimLanes() {
    swimLanesVisible = !swimLanesVisible;
    
    if (swimLanesVisible) {
        showSwimLanes();
        showToast('Swim Lanes aktiviert', 'success');
    } else {
        hideSwimLanes();
        showToast('Swim Lanes deaktiviert', 'info');
    }
    
    updateSwimLaneButton();
    updateSwimLaneData(); 
    saveToHistory('Toggle Swim Lanes');
}

function showSwimLanes() {
    const canvas = document.getElementById('canvas');
    
    // Entferne existierenden Container
    let swimContainer = document.getElementById('swimlane-container');
    if (swimContainer) {
        swimContainer.remove();
    }
    
    // ✅ BERECHNE KORREKTE HÖHEN - LETZTE LANE BIS ZUM BODEN
    const adjustedSwimLanes = adjustSwimLaneHeights([...swimLanes]);
    
    // Erstelle neuen Container
    swimContainer = document.createElement('div');
    swimContainer.id = 'swimlane-container';
    swimContainer.className = 'swimlane-container';
    canvas.appendChild(swimContainer);
    
    let currentY = 0;
    
    adjustedSwimLanes.forEach((lane, index) => {
        // Swim Lane erstellen
        const laneElement = createSwimLaneElement(lane, currentY, index);
        swimContainer.appendChild(laneElement);
        
        // Divider erstellen (außer beim letzten Lane)
        if (index < adjustedSwimLanes.length - 1) {
            const divider = createDivider(currentY + lane.height, index);
            swimContainer.appendChild(divider);
        }
        
        currentY += lane.height;
    });
    
    updateElementLaneAssignments();
    updateSwimLaneData(); 
}

function adjustSwimLaneHeights(lanes) {
    if (lanes.length === 0) return lanes;
    
    // Berechne Gesamthöhe aller Lanes außer der letzten
    const totalHeightExceptLast = lanes.slice(0, -1).reduce((sum, lane) => sum + lane.height, 0);
    
    // Die letzte Lane soll den Rest des Canvas ausfüllen
    const remainingHeight = CONSTANTS.CANVAS_HEIGHT - totalHeightExceptLast;
    
    // Setze die Höhe der letzten Lane
    lanes[lanes.length - 1] = {
        ...lanes[lanes.length - 1],
        height: Math.max(80, remainingHeight) // Mindestens 80px Höhe
    };
    
    // Falls die Gesamthöhe zu groß ist, skaliere alle Lanes proportional
    const totalHeight = lanes.reduce((sum, lane) => sum + lane.height, 0);
    if (totalHeight > CONSTANTS.CANVAS_HEIGHT) {
        const scaleFactor = CONSTANTS.CANVAS_HEIGHT / totalHeight;
        lanes.forEach(lane => {
            lane.height = Math.max(80, Math.floor(lane.height * scaleFactor));
        });
        
        // Korrigiere die letzte Lane nochmals
        const newTotalHeightExceptLast = lanes.slice(0, -1).reduce((sum, lane) => sum + lane.height, 0);
        lanes[lanes.length - 1].height = CONSTANTS.CANVAS_HEIGHT - newTotalHeightExceptLast;
    }
    
    return lanes;
}

function createSwimLaneElement(lane, yPosition, index) {
    const laneDiv = document.createElement('div');
    laneDiv.className = 'swim-lane';
    laneDiv.setAttribute('data-lane-id', lane.id);
    laneDiv.setAttribute('data-lane-index', index);
    
    const isMobile = 'ontouchstart' in window;
    
    laneDiv.style.cssText = `
        position: absolute;
        left: 0;
        top: ${yPosition}px;
        width: ${CONSTANTS.CANVAS_WIDTH}px;
        height: ${lane.height}px;
        background: linear-gradient(135deg, ${lane.color}15, ${lane.color}08);
        border: 2px solid ${lane.color}40;
        border-radius: 12px;
        z-index: -1;
        transition: all 0.3s ease;
        box-shadow: inset 0 0 20px ${lane.color}20;
    `;
    
    const header = document.createElement('div');
    header.className = 'swim-lane-header';
    header.style.cssText = `
        position: absolute;
        left: 10px;
        top: 10px;
        background: ${lane.color};
        color: white;
        padding: ${isMobile ? '12px 20px' : '8px 16px'};
        border-radius: 8px;
        font-weight: 600;
        font-size: ${isMobile ? '16px' : '14px'};
        box-shadow: 0 4px 12px ${lane.color}40;
        cursor: pointer;
        transition: transform 0.2s ease;
        min-width: 120px;
        text-align: center;
        z-index: 5;
    `;
    
    header.textContent = lane.name;
    
    header.addEventListener('mouseenter', () => {
        header.style.transform = 'translateY(-2px)';
        laneDiv.style.background = `linear-gradient(135deg, ${lane.color}25, ${lane.color}12)`;
    });
    
    header.addEventListener('mouseleave', () => {
        header.style.transform = 'translateY(0)';
        laneDiv.style.background = `linear-gradient(135deg, ${lane.color}15, ${lane.color}08)`;
    });
    
    header.addEventListener('dblclick', () => editLaneName(lane, header));
    
    const infoBadge = document.createElement('div');
    infoBadge.className = 'lane-info-badge';
    infoBadge.style.cssText = `
        position: absolute;
        right: 15px;
        top: 15px;
        background: rgba(255, 255, 255, 0.9);
        color: ${lane.color};
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
        border: 1px solid ${lane.color}30;
        z-index: 5;
    `;
    
    updateLaneInfoBadge(infoBadge, lane.id);
    
    laneDiv.appendChild(header);
    laneDiv.appendChild(infoBadge);
    
    return laneDiv;
}

function createDivider(yPosition, index) {
    const divider = document.createElement('div');
    divider.className = 'swim-lane-divider';
    divider.setAttribute('data-divider-index', index);
    
    const isMobile = 'ontouchstart' in window;
    const dividerHeight = isMobile ? 16 : 12;
    
    divider.style.cssText = `
        position: absolute;
        left: 0;
        top: ${yPosition - dividerHeight/2}px;
        width: ${CONSTANTS.CANVAS_WIDTH}px;
        height: ${dividerHeight}px;
        background: linear-gradient(90deg, #bdc3c7, #3498db, #bdc3c7);
        cursor: ns-resize !important;
        z-index: 1000 !important;
        transition: all 0.3s ease;
        border-radius: 6px;
        border: 2px solid rgba(52, 152, 219, 0.3);
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        opacity: 0.8;
        pointer-events: all !important;
        user-select: none;
    `;
    
    divider.addEventListener('mouseenter', (e) => {
        divider.style.background = 'linear-gradient(90deg, #3498db, #2980b9, #3498db)';
        divider.style.transform = 'scaleY(1.5)';
        divider.style.opacity = '1';
        divider.style.cursor = 'ns-resize';
        document.body.style.cursor = 'ns-resize';
    });
    
    divider.addEventListener('mouseleave', (e) => {
        if (!isDraggingDivider) {
            divider.style.background = 'linear-gradient(90deg, #bdc3c7, #3498db, #bdc3c7)';
            divider.style.transform = 'scaleY(1)';
            divider.style.opacity = '0.8';
            document.body.style.cursor = '';
        }
    });
    
    divider.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startDividerDrag(e, index);
    });
    
    return divider;
}

function startDividerDrag(e, dividerIndex) {
    isDraggingDivider = true;
    
    const containerRect = document.querySelector('.canvas-container').getBoundingClientRect();
    const startY = (e.clientY - containerRect.top - panOffset.y) / zoomLevel;
    
    currentDragData = {
        dividerIndex,
        startY,
        originalHeights: swimLanes.map(lane => lane.height)
    };
    
    document.body.style.cursor = 'ns-resize';
    document.addEventListener('mousemove', handleDividerDrag);
    document.addEventListener('mouseup', stopDividerDrag);
    
    e.preventDefault();
}

function handleDividerDrag(e) {
    if (!isDraggingDivider || !currentDragData) return;
    
    const containerRect = document.querySelector('.canvas-container').getBoundingClientRect();
    const currentY = (e.clientY - containerRect.top - panOffset.y) / zoomLevel;
    const deltaY = currentY - currentDragData.startY;
    
    const { dividerIndex, originalHeights } = currentDragData;
    
    const minHeight = 120;
    
    let newTopHeight = originalHeights[dividerIndex] + deltaY;
    let newBottomHeight = originalHeights[dividerIndex + 1] - deltaY;
    
    // Mindesthöhe einhalten
    newTopHeight = Math.max(minHeight, newTopHeight);
    newBottomHeight = Math.max(minHeight, newBottomHeight);
    
    // ✅ SPEZIALBEHANDLUNG FÜR LETZTE LANE
    if (dividerIndex === swimLanes.length - 2) {
        // Wenn wir die vorletzte Lane resizen, muss die letzte bis zum Boden reichen
        const totalHeightExceptLast = swimLanes.slice(0, -1).reduce((sum, lane, idx) => {
            if (idx === dividerIndex) return sum + newTopHeight;
            return sum + lane.height;
        }, 0);
        
        newBottomHeight = CONSTANTS.CANVAS_HEIGHT - totalHeightExceptLast;
        newBottomHeight = Math.max(minHeight, newBottomHeight);
        
        // Falls die letzte Lane zu klein wird, korrigiere die vorletzte
        if (newBottomHeight < minHeight) {
            newBottomHeight = minHeight;
            newTopHeight = CONSTANTS.CANVAS_HEIGHT - newBottomHeight - (totalHeightExceptLast - newTopHeight);
            newTopHeight = Math.max(minHeight, newTopHeight);
        }
    }
    
    swimLanes[dividerIndex].height = newTopHeight;
    swimLanes[dividerIndex + 1].height = newBottomHeight;
    
    // Aktualisiere Display sofort
    showSwimLanes();
}
function stopDividerDrag() {
    isDraggingDivider = false;
    currentDragData = null;
    document.body.style.cursor = '';
    
    document.removeEventListener('mousemove', handleDividerDrag);
    document.removeEventListener('mouseup', stopDividerDrag);
    
    saveToHistory('Resize Swim Lane');
}

function editLaneName(lane, headerElement) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = lane.name;
    input.style.cssText = `
        background: white;
        color: ${lane.color};
        border: 2px solid ${lane.color};
        border-radius: 6px;
        padding: 6px 12px;
        font-weight: 600;
        font-size: 14px;
        text-align: center;
        min-width: 120px;
    `;
    
    headerElement.replaceWith(input);
    input.focus();
    input.select();
    
    const finishEdit = () => {
        const newName = input.value.trim();
        if (newName) {
            lane.name = newName;
            saveToHistory('Edit Lane Name');
        }
        showSwimLanes();
    };
    
    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishEdit();
        if (e.key === 'Escape') showSwimLanes();
    });
}

export function updateElementLaneAssignments() {
    if (!swimLanesVisible) return;
    
    projectData.elements.forEach(elementData => {
        const element = document.getElementById(elementData.id);
        if (!element) return;
        
        const elementCenterY = element.offsetTop + element.offsetHeight / 2;
        const assignedLane = getLaneAtPosition(elementCenterY);
        
        if (assignedLane) {
            elementData.swimLane = assignedLane.id;
            element.style.borderLeft = `4px solid ${assignedLane.color}`;
            element.setAttribute('data-swim-lane', assignedLane.id);
        }
    });
    
    updateAllLaneInfoBadges();
}

function getLaneAtPosition(yPosition) {
    let currentY = 0;
    
    for (const lane of swimLanes) {
        if (yPosition >= currentY && yPosition < currentY + lane.height) {
            return lane;
        }
        currentY += lane.height;
    }
    
    return null;
}

function updateLaneInfoBadge(badge, laneId) {
    const elementsInLane = projectData.elements.filter(el => el.swimLane === laneId);
    badge.textContent = `${elementsInLane.length} Elemente`;
}

function updateAllLaneInfoBadges() {
    document.querySelectorAll('.lane-info-badge').forEach((badge, index) => {
        if (swimLanes[index]) {
            updateLaneInfoBadge(badge, swimLanes[index].id);
        }
    });
}

function hideSwimLanes() {
    const swimContainer = document.getElementById('swimlane-container');
    if (swimContainer) {
        swimContainer.remove();
    }
    
    // Lane-Indikatoren von Elementen entfernen
    projectData.elements.forEach(elementData => {
        const element = document.getElementById(elementData.id);
        if (element) {
            element.style.borderLeft = '';
            element.removeAttribute('data-swim-lane');
            delete elementData.swimLane;
        }
    });
}

export function addSwimLane(name, color, position = -1) {
    const newLane = {
        id: `lane-${Date.now()}`,
        name: name || 'Neue Lane',
        color: color || '#95a5a6',
        height: 150 // Initial-Höhe
    };
    
    if (position === -1) {
        swimLanes.push(newLane);
        window.swimLanes = swimLanes; 
    } else {
        swimLanes.splice(position, 0, newLane);
        window.swimLanes = swimLanes; 
    }
    
    if (swimLanesVisible) {
        showSwimLanes();
    }
    
    updateSwimLaneData();
    saveToHistory('Add Swim Lane');
    return newLane;
}

export function removeSwimLane(laneId) {
    const index = swimLanes.findIndex(lane => lane.id === laneId);
    if (index !== -1 && swimLanes.length > 1) {
        swimLanes.splice(index, 1);
        window.swimLanes = swimLanes; 
        
        if (swimLanesVisible) {
            showSwimLanes();
        }
        
        updateSwimLaneData();
        saveToHistory('Remove Swim Lane');
        return true;
    }
    return false;
}

function updateSwimLaneButton() {
    const button = document.getElementById('swimlaneBtn');
    if (button) {
        button.classList.toggle('active', swimLanesVisible);
        button.title = swimLanesVisible ? 'Swim Lanes ausblenden' : 'Swim Lanes anzeigen';
    }
}

function updateSwimLaneData() {
    if (!projectData.swimLanes) {
        projectData.swimLanes = {};
    }
    
    projectData.swimLanes = {
        visible: swimLanesVisible,
        lanes: JSON.parse(JSON.stringify(swimLanes))
    };
}

export function loadSwimLanes(savedData) {
    if (savedData && savedData.swimLanes) {
        swimLanes = savedData.swimLanes.lanes || [...DEFAULT_SWIM_LANES];
        swimLanesVisible = savedData.swimLanes.visible || false;
        
        if (swimLanesVisible) {
            showSwimLanes();
        }
        
        updateSwimLaneButton();
    }
}

export function getSwimLaneStats() {
    const stats = {};
    
    swimLanes.forEach(lane => {
        const elementsInLane = projectData.elements.filter(el => el.swimLane === lane.id);
        stats[lane.name] = {
            elementCount: elementsInLane.length,
            elements: elementsInLane.map(el => el.text || el.id)
        };
    });
    
    return stats;
}

export function showSwimLaneManager() {
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
    
    dialog.innerHTML = `
        <h2 style="margin: 0 0 20px 0; color: #2c3e50;">Swim Lane Konfigurieren</h2>
        <div id="swimlane-list"></div>
        <div style="margin-top: 20px; display: flex; gap: 10px;">
            <button id="add-lane-btn" style="flex: 1; padding: 12px; background: #3498db; color: white; border: none; border-radius: 8px; cursor: pointer;">
                Neue Lane hinzufügen
            </button>
            <button id="close-manager-btn" style="flex: 1; padding: 12px; background: #95a5a6; color: white; border: none; border-radius: 8px; cursor: pointer;">
                Schließen
            </button>
        </div>
    `;
    
    dialog.querySelector('#add-lane-btn').addEventListener('click', () => {
        showCustomPrompt(
            'Neue Swim Lane',
            'Geben Sie den Namen für die neue Swim Lane ein:',
            '',
            (name) => {
                const colors = ['#ad2929ff', '#003b6f', '#1abc9c'];
                const randomColor = colors[Math.floor(Math.random() * colors.length)];
                addSwimLane(name, randomColor);
                updateManagerList();
            }
        );
    });
    
    dialog.querySelector('#close-manager-btn').addEventListener('click', () => {
        overlay.remove();
    });
    
    const updateManagerList = () => {
        const listContainer = dialog.querySelector('#swimlane-list');
        listContainer.innerHTML = '';
        
        swimLanes.forEach((lane, index) => {
            const laneItem = document.createElement('div');
            laneItem.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                margin-bottom: 8px;
                background: ${lane.color}15;
                border: 2px solid ${lane.color}30;
                border-radius: 8px;
            `;
            
            laneItem.innerHTML = `
                <div style="width: 20px; height: 20px; background: ${lane.color}; border-radius: 4px;"></div>
                <span style="flex: 1; font-weight: 500;">${lane.name} (${lane.height}px)</span>
            `;
            
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Bearbeiten';
            editBtn.style.cssText = `
                padding: 4px 8px; 
                background: none; 
                border: 1px solid ${lane.color}; 
                color: ${lane.color}; 
                border-radius: 4px; 
                cursor: pointer;
            `;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Löschen';
            deleteBtn.style.cssText = `
                padding: 4px 8px; 
                background: #ad2929ff; 
                color: white; 
                border: none; 
                border-radius: 4px; 
                cursor: pointer;
            `;
            
            editBtn.addEventListener('click', () => {
                showCustomPrompt(
                    'Swim Lane umbenennen',
                    'Neuer Name für die Swim Lane:',
                    lane.name,
                    (newName) => {
                        lane.name = newName;
                        updateManagerList();
                        if (swimLanesVisible) {
                            showSwimLanes();
                        }
                        saveToHistory('Edit Lane Name');
                    }
                );
            });
            
            deleteBtn.addEventListener('click', () => {
                if (swimLanes.length <= 1) {
                    showToast('Mindestens eine Swim Lane muss vorhanden sein', 'error');
                    return;
                }
                
                showCustomConfirm(
                    `Swim Lane "${lane.name}" wirklich löschen?`,
                    () => {
                        removeSwimLane(lane.id);
                        updateManagerList();
                    }
                );
            });
            
            laneItem.appendChild(editBtn);
            laneItem.appendChild(deleteBtn);
            listContainer.appendChild(laneItem);
        });
    };
    
    updateManagerList();
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
}

export function onElementMove(elementId) {
    if (swimLanesVisible) {
        setTimeout(() => updateElementLaneAssignments(), 50);
    }
}

export function injectSwimLaneCSS() {
    const style = document.createElement('style');
    style.textContent = `
        .swimlane-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
        }
        
        .swim-lane {
            pointer-events: none;
            z-index: 1;
        }
        
        .swim-lane-header {
            pointer-events: all !important;
            z-index: 10;
        }
        
        .swim-lane-divider {
            pointer-events: all !important;
            z-index: 1000 !important;
            user-select: none !important;
        }
        
        .swim-lane-divider:hover {
            box-shadow: 0 0 12px rgba(52, 152, 219, 0.5) !important;
            cursor: ns-resize !important;
        }
        
        .swim-lane-divider:active {
            background: linear-gradient(90deg, #e74c3c, #c0392b, #e74c3c) !important;
            transform: scaleY(2) !important;
            cursor: ns-resize !important;
        }
        
        @media (max-width: 768px) {
            .swim-lane-divider {
                height: 20px !important;
                opacity: 0.9 !important;
            }
        }
    `;
    document.head.appendChild(style);
}

// Swimlange Hilfsfunktion
export function getSwimLaneState() {
    return {
        visible: swimLanesVisible,
        lanes: JSON.parse(JSON.stringify(swimLanes)),
        buttonActive: document.getElementById('swimlaneBtn')?.classList.contains('active') || false
    };
}

export function restoreSwimLaneState(swimLaneState) {
    if (!swimLaneState) return;
    
    //console.log('Restoring swimlane state:', swimLaneState);
    
    swimLanes = JSON.parse(JSON.stringify(swimLaneState.lanes)) || [];
    swimLanesVisible = swimLaneState.visible || false;
    
    const swimlaneBtn = document.getElementById('swimlaneBtn');
    if (swimlaneBtn) {
        if (swimLanesVisible) {
            swimlaneBtn.classList.add('active');
            swimlaneBtn.title = 'Swim Lanes ausblenden';
        } else {
            swimlaneBtn.classList.remove('active');
            swimlaneBtn.title = 'Swim Lanes anzeigen';
        }
    }
    
    if (swimLanesVisible) {
        showSwimLanes();
    } else {
        hideSwimLanes();
    }
    
    updateSwimLaneData();
}

//  Custom Alert-Funktionenen
function showCustomConfirm(message, onConfirm, onCancel = null) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        z-index: 20000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease-out;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        border-radius: 16px;
        padding: 24px;
        max-width: 400px;
        min-width: 300px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        transform: scale(0.9);
        animation: popIn 0.3s ease-out forwards;
    `;
    
    dialog.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
            <div style="width: 48px; height: 48px; background: #e74c3c; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 16px;">
                <i class="fa-solid fa-exclamation-triangle" style="color: white; font-size: 20px;"></i>
            </div>
            <div>
                <h3 style="margin: 0; color: #2c3e50; font-size: 18px;">Bestätigung erforderlich</h3>
                <p style="margin: 8px 0 0 0; color: #7f8c8d; font-size: 14px;">${message}</p>
            </div>
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button id="cancel-btn" style="
                padding: 12px 24px; 
                background: #95a5a6; 
                color: white; 
                border: none; 
                border-radius: 8px; 
                cursor: pointer; 
                font-weight: 500;
                transition: all 0.2s ease;
            ">Abbrechen</button>
            <button id="confirm-btn" style="
                padding: 12px 24px; 
                background: #e74c3c; 
                color: white; 
                border: none; 
                border-radius: 8px; 
                cursor: pointer; 
                font-weight: 500;
                transition: all 0.2s ease;
            ">Löschen</button>
        </div>
    `;
    
    // CSS Animationen hinzufügen
    if (!document.getElementById('custom-dialog-styles')) {
        const style = document.createElement('style');
        style.id = 'custom-dialog-styles';
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes popIn {
                from { transform: scale(0.8); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
            #cancel-btn:hover { background: #7f8c8d !important; transform: translateY(-1px); }
            #confirm-btn:hover { background: #c0392b !important; transform: translateY(-1px); }
        `;
        document.head.appendChild(style);
    }
    
    dialog.querySelector('#cancel-btn').addEventListener('click', () => {
        overlay.remove();
        if (onCancel) onCancel();
    });
    
    dialog.querySelector('#confirm-btn').addEventListener('click', () => {
        overlay.remove();
        onConfirm();
    });
    
    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            overlay.remove();
            if (onCancel) onCancel();
        }
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
            if (onCancel) onCancel();
        }
    });
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    dialog.querySelector('#cancel-btn').focus();
}

function showCustomPrompt(title, message, defaultValue = '', onConfirm, onCancel = null) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        z-index: 20000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease-out;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white;
        border-radius: 16px;
        padding: 24px;
        max-width: 450px;
        min-width: 350px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        transform: scale(0.9);
        animation: popIn 0.3s ease-out forwards;
    `;
    
    dialog.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
            <div style="width: 48px; height: 48px; background: #3498db; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 16px;">
                <i class="fa-solid fa-edit" style="color: white; font-size: 20px;"></i>
            </div>
            <div>
                <h3 style="margin: 0; color: #2c3e50; font-size: 18px;">${title}</h3>
                <p style="margin: 8px 0 0 0; color: #7f8c8d; font-size: 14px;">${message}</p>
            </div>
        </div>
        <div style="margin-bottom: 20px;">
            <input type="text" id="custom-input" value="${defaultValue}" style="
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #e1e8ed;
                border-radius: 8px;
                font-size: 16px;
                font-family: inherit;
                transition: border-color 0.2s ease;
                box-sizing: border-box;
            " placeholder="Name eingeben...">
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button id="cancel-btn" style="
                padding: 12px 24px; 
                background: #95a5a6; 
                color: white; 
                border: none; 
                border-radius: 8px; 
                cursor: pointer; 
                font-weight: 500;
                transition: all 0.2s ease;
            ">Abbrechen</button>
            <button id="confirm-btn" style="
                padding: 12px 24px; 
                background: #3498db; 
                color: white; 
                border: none; 
                border-radius: 8px; 
                cursor: pointer; 
                font-weight: 500;
                transition: all 0.2s ease;
            ">OK</button>
        </div>
    `;
    
    // CSS für Input-Feld
    if (!document.getElementById('custom-input-styles')) {
        const style = document.createElement('style');
        style.id = 'custom-input-styles';
        style.textContent = `
            #custom-input:focus {
                outline: none;
                border-color: #3498db !important;
                box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
            }
            #custom-input:hover {
                border-color: #bdc3c7;
            }
        `;
        document.head.appendChild(style);
    }
    
    const input = dialog.querySelector('#custom-input');
    const cancelBtn = dialog.querySelector('#cancel-btn');
    const confirmBtn = dialog.querySelector('#confirm-btn');
    
    const handleCancel = () => {
        overlay.remove();
        if (onCancel) onCancel();
    };
    
    const handleConfirm = () => {
        const value = input.value.trim();
        if (value) {
            overlay.remove();
            onConfirm(value);
        } else {
            // Shake-Animation wenn leer
            input.style.animation = 'shake 0.5s ease-in-out';
            input.focus();
            setTimeout(() => input.style.animation = '', 500);
        }
    };
    
    cancelBtn.addEventListener('click', handleCancel);
    confirmBtn.addEventListener('click', handleConfirm);
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        }
    });
    
    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            handleCancel();
        }
    });
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            handleCancel();
        }
    });
    
    // Shake-Animation CSS hinzufügen
    if (!document.getElementById('shake-animation')) {
        const shakeStyle = document.createElement('style');
        shakeStyle.id = 'shake-animation';
        shakeStyle.textContent = `
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-5px); }
                75% { transform: translateX(5px); }
            }
        `;
        document.head.appendChild(shakeStyle);
    }
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    setTimeout(() => {
        input.focus();
        input.select();
    }, 100);
}

// Auto-Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    injectSwimLaneCSS();
    initializeSwimLanes();
});

// ===== ERWEITERTE SWIMLANE-FUNKTIONEN FÜR swimlanes.js =====

// Swimlane-Höhe dynamisch anpassen (von KI aufrufbar)
window.adjustSwimlaneHeight = function(laneId, newHeight) {
    const lane = swimLanes.find(l => l.id === laneId);
    if (!lane) {
        //console.warn(`Swimlane '${laneId}' nicht gefunden`);
        return false;
    }
    
    const oldHeight = lane.height;
    lane.height = Math.max(120, Math.min(300, newHeight)); // Grenzen einhalten
    
    //console.log(`Swimlane-Höhe angepasst: ${lane.name} ${oldHeight}px → ${lane.height}px`);
    
    // DOM aktualisieren falls Swimlanes sichtbar
    if (swimLanesVisible) {
        updateSwimLaneHeights();
    }
    
    // Projektdaten aktualisieren
    updateSwimLaneData();
    
    return true;
};

// Alle Swimlane-Höhen im DOM aktualisieren
function updateSwimLaneHeights() {
    const container = document.querySelector('.swim-lane-container');
    if (!container) return;
    
    // Entferne alle bestehenden Lanes
    container.innerHTML = '';
    
    // Neu rendern mit aktualisierten Höhen
    let currentY = 0;
    swimLanes.forEach((lane, index) => {
        const laneDiv = createSwimLaneDiv(lane, currentY, index);
        container.appendChild(laneDiv);
        currentY += lane.height;
    });
    
    // Gesamthöhe anpassen
    const totalHeight = swimLanes.reduce((sum, lane) => sum + lane.height, 0);
    container.style.height = totalHeight + 'px';
    
    //console.log(`Alle Swimlane-Höhen aktualisiert. Gesamthöhe: ${totalHeight}px`);
}

window.optimizeSwimlaneHeights = function() {
    const elementCounts = {};
    const elementHeight = 80;
    const minLaneHeight = 120;
    const maxLaneHeight = 300;
    
    projectData.elements.forEach(element => {
        const lane = element.swimLane || 'unassigned';
        elementCounts[lane] = (elementCounts[lane] || 0) + 1;
    });
    
    let adjustmentsNeeded = false;
    
    swimLanes.forEach(lane => {
        const elementCount = elementCounts[lane.id] || 0;
        const recommendedHeight = Math.max(
            minLaneHeight,
            Math.min(maxLaneHeight, elementCount * elementHeight + 40)
        );
        
        if (Math.abs(lane.height - recommendedHeight) > 20) {
            //console.log(`Swimlane ${lane.name}: ${elementCount} Elemente → empfohlen ${recommendedHeight}px (aktuell ${lane.height}px)`);
            lane.height = recommendedHeight;
            adjustmentsNeeded = true;
        }
    });
    
    if (adjustmentsNeeded) {
        updateSwimLaneHeights();
        showToast('Swimlane-Höhen automatisch optimiert', 'success');
        return true;
    }
    
    return false;
};

export function suggestSwimlaneAssignment(elementText) {
    const text = elementText.toLowerCase();
    if (text.includes('rechnung') || text.includes('zahlung') || text.includes('kostenstelle') || text.includes('budget')) {
        return 'finanzen';
    }
    if (text.includes('kunde') || text.includes('anruf') || text.includes('beratung') || text.includes('verkauf')) {
        return 'kunde';
    }
    if (text.includes('angebot') || text.includes('vertrieb') || text.includes('akquise')) {
        return 'vertrieb';  
    }
    if (text.includes('herstellung') || text.includes('produktion') || text.includes('fertigung')) {
        return 'produktion';
    }
    if (text.includes('system') || text.includes('software') || text.includes('daten')) {
        return 'it';
    }
    if (text.includes('entscheidung') || text.includes('genehmigung') || text.includes('strategie')) {
        return 'management';
    }
    
    return 'kunde'; // Fallback - meist Kundenprozess
}

// Debug-Funktion: Zeige Element-Swimlane-Verteilung
window.debugSwimlaneDistribution = function() {
    //console.group('SWIMLANE VERTEILUNG');
    
    const distribution = {};
    const unassigned = [];
    
    projectData.elements.forEach(element => {
        const lane = element.swimLane || 'unassigned';
        if (!distribution[lane]) {
            distribution[lane] = [];
        }
        distribution[lane].push(element.text);
        
        if (!element.swimLane) {
            unassigned.push(element.text);
        }
    });
    
    // Zeige Verteilung
    Object.entries(distribution).forEach(([lane, elements]) => {
        console.log(`${lane.toUpperCase()}: ${elements.length} Elemente`);
        elements.forEach(text => console.log(`  - ${text}`));
    });
    
    // Automatische Vorschläge für unzugeordnete
    if (unassigned.length > 0) {
        //console.log('\nAUTOMATISCHE ZUORDNUNGSVORSCHLÄGE:');
        unassigned.forEach(text => {
            const suggestion = suggestSwimlaneAssignment(text);
            console.log(`"${text}" → ${suggestion}`);
        });
    }
    
    console.groupEnd();
    
    return distribution;
};

// KI-Funktion: Erstelle Swimlane falls nicht vorhanden
window.ensureSwimlaneExists = function(laneId, laneName, color = '#17a2b8') {
    //console.log(`KI prüft Swimlane: ${laneId} ("${laneName}")`);
    
    // Suche existierende Lane
    let existingLane = swimLanes.find(lane => lane.id === laneId || lane.name.toLowerCase() === laneName.toLowerCase());
    
    if (existingLane) {
        //console.log(`Swimlane bereits vorhanden: ${existingLane.name} (${existingLane.id})`);
        return existingLane;
    }
    
    // Erstelle neue Lane
    const newLane = {
        id: laneId,
        name: laneName,
        color: color,
        height: 150
    };
    
    const insertIndex = this.determineInsertPosition(laneId);
    swimLanes.splice(insertIndex, 0, newLane);
    window.swimLanes = swimLanes; 
    //console.log(`Neue Swimlane erstellt: ${laneName} (${laneId})`);
    
    // UI aktualisieren falls sichtbar
    if (swimLanesVisible) {
        showSwimLanes();
    }
    
    updateSwimLaneData();
    saveToHistory(`KI: Swimlane "${laneName}" erstellt`);
    showToast(`Neue Swimlane "${laneName}" von KI erstellt`, 'success');
    
    return newLane;
};

window.findOrCreateSwimlaneForElement = function(elementText) {
    const text = elementText.toLowerCase();
    
    // Präzisere Zuordnungs-Regeln
    const mappings = [
        { keywords: ['rechnung', 'zahlung', 'invoice', 'bezahl', 'geld'], id: 'finanzen', name: 'Finanzen', color: '#ad2929ff' },
        { keywords: ['kunde ruft', 'anruf', 'kunde meldet', 'kunde kontakt'], id: 'kunde', name: 'Kunde', color: '#003b6f' },
        { keywords: ['kunde sagt', 'kunde entscheidet', 'kunde antwortet'], id: 'kunde', name: 'Kunde', color: '#003b6f' },
        { keywords: ['angebot erstell', 'vertrieb', 'verkauf', 'akquise'], id: 'vertrieb', name: 'Vertrieb', color: '#ad2929ff' },
        { keywords: ['los werden', 'verloren', 'kündigung', 'abbruch'], id: 'service', name: 'Service', color: '#17a2b8' },
        { keywords: ['neukunden', 'gewonnen', 'erfolgreich'], id: 'vertrieb', name: 'Vertrieb', color: '#ad2929ff' },
        { keywords: ['entscheidung', 'bewertung'], id: 'management', name: 'Management', color: '#003b6f' }
    ];
    
    // Finde beste Übereinstimmung (längster Match gewinnt)
    let bestMatch = null;
    let longestMatch = 0;
    
    for (const mapping of mappings) {
        for (const keyword of mapping.keywords) {
            if (text.includes(keyword) && keyword.length > longestMatch) {
                bestMatch = mapping;
                longestMatch = keyword.length;
            }
        }
    }
    
    if (bestMatch) {
        return window.ensureSwimlaneExists(bestMatch.id, bestMatch.name, bestMatch.color);
    }
    
    return window.ensureSwimlaneExists('vertrieb', 'Vertrieb', '#ad2929ff');
};

window.renameSwimlane = function(oldName, newName) {
    const lane = swimLanes.find(l => l.name.toLowerCase() === oldName.toLowerCase());
    
    if (!lane) {
        //console.warn(`Swimlane "${oldName}" nicht gefunden für Umbenennung`);
        return false;
    }
    
    const oldNameStr = lane.name;
    lane.name = newName;
    
    //console.log(`Swimlane umbenannt: "${oldNameStr}" -> "${newName}"`);
    
    // UI aktualisieren
    if (swimLanesVisible) {
        showSwimLanes();
    }
    
    updateSwimLaneData();
    saveToHistory(`KI: Swimlane "${oldNameStr}" zu "${newName}" umbenannt`);
    showToast(`Swimlane "${oldNameStr}" zu "${newName}" umbenannt`, 'success');
    
    return true;
};

window.listAvailableSwimlanes = function() {
    const lanes = swimLanes.map(lane => ({
        id: lane.id,
        name: lane.name,
        color: lane.color,
        height: lane.height,
        elementCount: projectData.elements.filter(el => el.swimLane === lane.id).length
    }));
    
    //console.log('Verfügbare Swimlanes:', lanes);
    return lanes;
};


window.optimizeSwimlaneConfigurationForElements = function() {
    //console.log('KI optimiert Swimlane-Konfiguration...');
    
    const elementTexts = projectData.elements.map(el => el.text).filter(Boolean);
    const requiredCategories = new Set();
    
    // Analysiere welche Kategorien benötigt werden
    elementTexts.forEach(text => {
        const lane = window.findOrCreateSwimlaneForElement(text);
        requiredCategories.add(lane.id);
    });
    
    //console.log(`KI hat ${requiredCategories.size} Swimlane-Kategorien identifiziert:`, Array.from(requiredCategories));
    
    // Automatische Höhen-Optimierung
    window.optimizeSwimlaneHeights();
    
    return Array.from(requiredCategories);
};

window.calculateSwimlaneYPosition = function(swimlaneId, relativeY = 0) {
    if (!swimLanes || swimLanes.length === 0) {
        return relativeY; // Fallback wenn keine Swimlanes
    }
    
    let currentY = 0;
    for (const lane of swimLanes) {
        if (lane.id === swimlaneId) {
            // Position innerhalb der Swimlane: Mitte der Lane + relativer Offset
            const laneCenter = currentY + (lane.height / 2);
            const finalY = laneCenter + relativeY;
            
            //console.log(`Swimlane Y-Berechnung: ${lane.name} (${swimlaneId}) -> Y: ${finalY} (Lane: ${currentY}-${currentY + lane.height})`);
            return Math.max(currentY + 20, Math.min(currentY + lane.height - 20, finalY)); // Mit Padding
        }
        currentY += lane.height;
    }
    
    //console.warn(`Swimlane ${swimlaneId} nicht gefunden, verwende Fallback Y: ${relativeY}`);
    return relativeY;
};

function applyPositionWithSwimlaneCorrection(pos) {
    const element = findElementByTextContent(pos.element_id);
    
    if (!element) {
        //console.warn(`Element mit Text "${pos.element_id}" nicht gefunden`);
        return false;
    }
    
    let finalX = pos.x;
    let finalY = pos.y;
    
    if (pos.swimlane) {
        finalY = window.calculateSwimlaneYPosition(pos.swimlane, pos.y - 100); // pos.y als relativer Offset
        
        if (element.swimLane !== pos.swimlane) {
            element.swimLane = pos.swimlane;
            
            const domElement = document.getElementById(element.id);
            if (domElement) {
                domElement.setAttribute('data-swimlane', pos.swimlane);
            }
        }
    }
    
    // DOM aktualisieren
    const domElement = document.getElementById(element.id);
    if (domElement) {
        domElement.style.left = finalX + 'px';
        domElement.style.top = finalY + 'px';
        //onsole.log(`Korrigierte Position: ${element.text} -> (${finalX}, ${finalY}) in ${pos.swimlane || 'default'}`);
    }
    
    // Projektdaten aktualisieren
    element.x = finalX;
    element.y = finalY;
    
    return true;
}

window.applyLayoutOptimizationWithSwimlaneYCorrection = function() {
    const analysis = window.currentMistralAnalysis;
    
    //console.log('Erweiterte Layout-Optimierung mit Y-Korrektur:', analysis);
    
    if (!analysis?.layout_optimierung?.optimized_positions && 
        !analysis?.swimlane_optimierung && 
        !analysis?.status_optimierung) {
        showToast('Keine Optimierungsdaten verfügbar', 'warning');
        applyEnhancedFallbackPositioning();
        return;
    }
    
    showToast('Layout wird mit Swimlane-Y-Korrektur optimiert...', 'info');
    saveToHistory('KI: Erweiterte Layout-Optimierung mit Y-Korrektur');
    
    let appliedCount = 0;
    let swimlaneChanges = 0;
    
    if (analysis.swimlane_optimierung) {
        //console.log('Swimlane-Optimierungen anwenden...');
        swimlaneChanges = applySwimlaneOptimizations(analysis.swimlane_optimierung);
    }
    
    if (analysis.status_optimierung) {
        //console.log('Status-Optimierungen anwenden...');
        applyStatusOptimizations(analysis.status_optimierung);
    }
    
    if (analysis.layout_optimierung?.optimized_positions) {
        //console.log('Position-Optimierungen mit Y-Korrektur anwenden...');
        
        analysis.layout_optimierung.optimized_positions.forEach(pos => {
            //console.log('Verarbeite Position mit Y-Korrektur:', pos);
            
            if (applyPositionWithSwimlaneCorrection(pos)) {
                appliedCount++;
                //console.log(`Y-korrigierte Position angewendet: ${pos.element_id} -> (${pos.x}, korrigiert) in ${pos.swimlane}`);
            }
        });
    }

    setTimeout(() => {
        recalculateAllConnections();
        
        const successParts = [];
        if (appliedCount > 0) successParts.push(`${appliedCount} Elemente repositioniert`);
        if (swimlaneChanges > 0) successParts.push(`${swimlaneChanges} Swimlane-Zuordnungen`);
        
        if (successParts.length > 0) {
            showToast(`Y-korrigierte Optimierung abgeschlossen! ${successParts.join(', ')}`, 'success');
        } else {
            showToast('Keine Optimierungen angewendet', 'warning');
        }
    }, 100);
};

/*
window.debugSwimlaneYRanges = function() {
    console.group('SWIMLANE Y-BEREICHE');
    
    let currentY = 0;
    swimLanes.forEach(lane => {
        const startY = currentY;
        const endY = currentY + lane.height;
        const centerY = currentY + (lane.height / 2);
        
        console.log(`${lane.name}: Y ${startY}-${endY} (Mitte: ${centerY})`);
        
        // Zeige Elemente in dieser Lane
        const elementsInLane = projectData.elements.filter(el => el.swimLane === lane.id);
        elementsInLane.forEach(el => {
            console.log(`  └─ ${el.text}: aktuell Y ${el.y}, sollte in Bereich ${startY}-${endY} sein`);
        });
        
        currentY += lane.height;
    });
    
    console.groupEnd();
};
*/