import { 
    isPanning,
    setIsPanning,
    panStart,
    setPanStart,
    panOffset,
    setPanOffset,
    zoomLevel,
    setZoomLevel,
    canvasElement,
    setCanvasElement,
    minZoom,
    maxZoom
} from '../utils/state.js';
import { CONSTANTS } from '../utils/constants.js';

export function startPanning(event) {
    setIsPanning(true);
    setPanStart({
        x: event.clientX - panOffset.x,
        y: event.clientY - panOffset.y
    });
    document.getElementById('canvas').classList.add('panning');
}

export function updatePan(event) {
    if (!isPanning) return;
    
    const newPanOffset = {
        x: event.clientX - panStart.x,
        y: event.clientY - panStart.y
    };
    
    const canvasContainer = document.querySelector('.canvas-container');
    const containerRect = canvasContainer.getBoundingClientRect();
    const canvasWidth = CONSTANTS.CANVAS_WIDTH * zoomLevel;
    const canvasHeight = CONSTANTS.CANVAS_HEIGHT * zoomLevel;
    
    // Grenzen berechnen
    const maxPanX = 0;
    const minPanX = Math.min(0, containerRect.width - canvasWidth);
    const maxPanY = 0;
    const minPanY = Math.min(0, containerRect.height - canvasHeight);
    
    // Pan-Offset begrenzen
    newPanOffset.x = Math.max(minPanX, Math.min(maxPanX, newPanOffset.x));
    newPanOffset.y = Math.max(minPanY, Math.min(maxPanY, newPanOffset.y));
    
    setPanOffset(newPanOffset);
    updateCanvasTransform();
}

export function stopPanning() {
    setIsPanning(false);
    document.getElementById('canvas').classList.remove('panning');
}

export function updateCanvasTransform() {
    if (!canvasElement) {
        const canvas = document.getElementById('canvas');
        setCanvasElement(canvas);
    }
    canvasElement.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`;
    
    const gridSize = 20 * zoomLevel;
    canvasElement.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    
    updateZoomIndicator();
}

function updateZoomIndicator() {
    let indicator = document.querySelector('.zoom-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'zoom-indicator';
        document.querySelector('.canvas-container').appendChild(indicator);
    }
    indicator.textContent = `${Math.round(zoomLevel * 100)}%`;
}

// Zoom-Funktion
export function handleZoom(event, zoomIn, centerX, centerY) {
    event.preventDefault();
    
    const oldZoom = zoomLevel;
    const zoomFactor = zoomIn ? 1.1 : 0.9;
    
    const newZoom = Math.max(minZoom, Math.min(maxZoom, zoomLevel * zoomFactor));
    setZoomLevel(newZoom);
    
    if (centerX !== undefined && centerY !== undefined) {
        // Zoom zum Punkt
        const canvasRect = document.getElementById('canvas').getBoundingClientRect();
        const mouseX = centerX - canvasRect.left;
        const mouseY = centerY - canvasRect.top;
        
        const newPanOffset = {
            x: mouseX - (mouseX - panOffset.x) * (zoomLevel / oldZoom),
            y: mouseY - (mouseY - panOffset.y) * (zoomLevel / oldZoom)
        };
        setPanOffset(newPanOffset);
    }
    
    updateCanvasTransform();
}

// Mausrad-Zoom
export function handleWheel(event) {
    if (event.ctrlKey || event.metaKey) {
        handleZoom(event, event.deltaY < 0, event.clientX, event.clientY);
    }
}

export function centerCanvas() {
    const canvasContainer = document.querySelector('.canvas-container');
    const containerRect = canvasContainer.getBoundingClientRect();
    
    // Canvas in der Mitte des Containers positionieren
    const newPanOffset = {
        x: (containerRect.width - CONSTANTS.CANVAS_WIDTH) / 2,
        y: (containerRect.height - CONSTANTS.CANVAS_HEIGHT) / 2
    };
    
    newPanOffset.x = Math.max(newPanOffset.x, -CONSTANTS.CANVAS_WIDTH * 0.8);
    newPanOffset.y = Math.max(newPanOffset.y, -CONSTANTS.CANVAS_HEIGHT * 0.8);
    
    setPanOffset(newPanOffset);
    updateCanvasTransform();
}

const TOOL_MAPPING = ['select', 'rectangle', 'circle', 'diamond', 'cylinder', 'connection'];
const CURSOR_CLASSES = [
    'cursor-rectangle',
    'cursor-circle',
    'cursor-diamond',
    'cursor-system',
    'cursor-person',
    'cursor-connection',
    'cursor-select'
];
export function updateToolSelection(tool) {
    const toolButtons = document.querySelectorAll('.tool-item');

    if (!isValidTool(tool)) {
        console.warn('Ungültiges Werkzeug:', tool);
        return;
    }
    setCurrentTool(tool);
    updateToolButtons(tool);
    
    //console.log('Tool set to:', tool);
}