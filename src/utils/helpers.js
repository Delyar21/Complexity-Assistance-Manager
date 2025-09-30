import { CONSTANTS } from './constants.js';
import { 
    panOffset, 
    zoomLevel,
    isPanning,
    selectedElement,
    currentTool,
    dragOffset,
    isDragging
} from './state.js';
import { updatePan } from '../canvas/canvas.js';
import { updateConnections } from '../canvas/connections.js';

// Prüfe ob Klick auf Canvas-Arbeitsbereich erfolgte
export function isClickOnCanvas(event) {
    const containerRect = document.querySelector('.canvas-container').getBoundingClientRect();
    const canvasX = (event.clientX - containerRect.left - panOffset.x) / zoomLevel;
    const canvasY = (event.clientY - containerRect.top - panOffset.y) / zoomLevel;
    
    return canvasX >= 0 && canvasX <= CONSTANTS.CANVAS_WIDTH &&  // 1920 x 1080 px (PowerPoint Slide größe)
           canvasY >= 0 && canvasY <= CONSTANTS.CANVAS_HEIGHT;
}

// Throttling-Funktion wurde Performancebedingt implementiert
export function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

export const throttledMouseMove = throttle(function(event) {
    if (isPanning) {
        updatePan(event);
        return;
    }
   
    if (isDragging && selectedElement && currentTool === 'select') {
        const containerRect = document.querySelector('.canvas-container').getBoundingClientRect();
 
        const mouseX = (event.clientX - containerRect.left - panOffset.x) / zoomLevel;
        const mouseY = (event.clientY - containerRect.top - panOffset.y) / zoomLevel;
   
        let x = mouseX - dragOffset.x;
        let y = mouseY - dragOffset.y;
       
        const elementWidth = selectedElement.offsetWidth;
        const elementHeight = selectedElement.offsetHeight;
        x = Math.max(0, Math.min(CONSTANTS.CANVAS_WIDTH - elementWidth, x));
        y = Math.max(0, Math.min(CONSTANTS.CANVAS_HEIGHT - elementHeight, y));
   
        selectedElement.style.left = x + 'px';
        selectedElement.style.top = y + 'px';
   
        if (typeof updateConnectionsForElement === 'function') {
            updateConnectionsForElement(selectedElement.id);
        } else {
            updateConnections(selectedElement.id);
        }
    }
}, 16); // ~60fps