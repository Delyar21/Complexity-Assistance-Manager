import { CONSTANTS } from '../utils/constants.js';
import { 
    currentTool, 
    selectedElement, 
    isDragging, 
    isConnecting, 
    connectionStart, 
    panOffset, 
    zoomLevel, 
    canvasElement,
    isPanning,
    dragOffset,
    setIsDragging,
    setIsConnecting,
    setConnectionStart
} from '../utils/state.js';
import { selectElement, deselectAll, createElement } from '../canvas/elements.js';
import { createConnection, updateConnections } from '../canvas/connections.js';
import { startPanning, stopPanning } from '../canvas/canvas.js';
import { isClickOnCanvas } from '../utils/helpers.js';
import { saveToHistory } from '../data/history.js';
import { onElementMove } from '../canvas/swimlanes.js';

export function canvasMouseDown(event) {
    event.preventDefault();
    event.stopPropagation();
   
    // Prüfe ob das Event von einem Element kommt
    const clickedElement = event.target.closest('.element-wrapper'); 
    
    // mit mittlerer Maustaste oder Strg + linke Maustaste
    if (event.button === 1 || (event.button === 0 && event.ctrlKey)) {
        startPanning(event);
        return;
    }
   
    if (currentTool === 'select') {
        if (clickedElement) {
            selectElement(clickedElement);
           
            setIsDragging(true);
            const containerRect = document.querySelector('.canvas-container').getBoundingClientRect();
            
            const clientX = event.clientX || event.touches?.[0]?.clientX || 0;
            const clientY = event.clientY || event.touches?.[0]?.clientY || 0;
            
            const mouseX = (clientX - containerRect.left - panOffset.x) / zoomLevel;
            const mouseY = (clientY - containerRect.top - panOffset.y) / zoomLevel;
            
            dragOffset.x = mouseX - clickedElement.offsetLeft;
            dragOffset.y = mouseY - clickedElement.offsetTop;

            document.getElementById('canvas').classList.add('dragging');
        
        } else {
            if (event.button === 0 && !event.ctrlKey) {
                startPanning(event);
            }
            deselectAll();
            // Deselektiere auch Verbindungen
            import('../canvas/connections.js').then(module => {
                module.deselectConnections();
            });
        }
    } else if (currentTool === 'connection') {
        if (clickedElement) {
            /*console.log('Connection Click:', {
                isConnecting,
                connectionStart: connectionStart?.id,
                clickedElement: clickedElement.id
            });*/
            
            if (!isConnecting) {
               // console.log('Setting connection start:', clickedElement.id);
                setConnectionStart(clickedElement);
                setIsConnecting(true);
                document.getElementById('canvas').classList.add('connecting');
                
                clickedElement.classList.add('connection-source');
                
            } else if (clickedElement !== connectionStart && clickedElement.id !== connectionStart.id) {
                //console.log('Creating connection:', connectionStart.id, '->', clickedElement.id);
                
                createConnection(connectionStart, clickedElement);
                
                resetConnectionState();
                
            } else {
                // Derselbe Element geklickt - Connection abbrechen
                //console.log('Connection cancelled - same element clicked');
                resetConnectionState();
            }
        } else {
            // Klick auf leeren Canvas - Connection abbrechen
            //console.log('Connection cancelled - clicked on empty canvas');
            resetConnectionState();
        }
    } else {
        // Nur neues Element erstellen wenn auf Canvas-Arbeitsbereich geklickt wurde
        if (!clickedElement && isClickOnCanvas(event)) {
            const containerRect = document.querySelector('.canvas-container').getBoundingClientRect();
            
            const clientX = event.clientX || event.touches?.[0]?.clientX || 0;
            const clientY = event.clientY || event.touches?.[0]?.clientY || 0;
            
            let x = (clientX - containerRect.left - panOffset.x) / zoomLevel;
            let y = (clientY - containerRect.top - panOffset.y) / zoomLevel;
    
            // Grenzen-Check für neue Elemente
            const elementSize = CONSTANTS.DEFAULT_ELEMENT_SIZES[currentTool] || CONSTANTS.DEFAULT_ELEMENT_SIZES.rectangle;
            x = Math.max(0, Math.min(CONSTANTS.CANVAS_WIDTH - elementSize.width, x));
            y = Math.max(0, Math.min(CONSTANTS.CANVAS_HEIGHT - elementSize.height, y));
    
            createElement(currentTool, x, y);
        }
    }
}

// Helper Funktion zum sauberen Reset der Connection
function resetConnectionState() {
    // Entferne visuellen Feedback
    const sourceElement = document.querySelector('.connection-source');
    if (sourceElement) {
        sourceElement.classList.remove('connection-source');
    }
    
    // Reset States
    setIsConnecting(false);
    setConnectionStart(null);
    document.getElementById('canvas').classList.remove('connecting');
    
    //console.log('Connection state reset');
}

export function canvasMouseMove(event) {
    const clientX = event.clientX || event.touches?.[0]?.clientX || 0;
    const clientY = event.clientY || event.touches?.[0]?.clientY || 0;
    
    if (isDragging && selectedElement && currentTool === 'select') {
        const canvasRect = document.getElementById('canvas').getBoundingClientRect();
        const x = clientX - canvasRect.left - dragOffset.x;
        const y = clientY - canvasRect.top - dragOffset.y;
        
        const maxX = CONSTANTS.CANVAS_WIDTH - selectedElement.offsetWidth;
        const maxY = CONSTANTS.CANVAS_HEIGHT - selectedElement.offsetHeight;
        
        const constrainedX = Math.max(0, Math.min(maxX, x));
        const constrainedY = Math.max(0, Math.min(maxY, y));
        
        selectedElement.style.left = constrainedX + 'px';
        selectedElement.style.top = constrainedY + 'px';
        
        updateConnections();
    }
}

export function canvasMouseUp(event) {
    if (!canvasElement) {
        const canvas = document.getElementById('canvas');
    }
    
    if (isDragging) {
        saveToHistory('Move Element'); 
        document.getElementById('canvas').classList.remove('dragging');
    }
    
    if (isPanning) {
        stopPanning();
    }
    
    setIsDragging(false);

    if (selectedElement) {
        onElementMove(selectedElement.id);
    }
}

export function onToolChange(newTool) {
    // Wenn vom Connection-Tool weggewechselt wird, reset connection state
    if (currentTool === 'connection' && newTool !== 'connection') {
        //console.log('Tool changed from connection - resetting connection state');
        resetConnectionState();
    }
}

export { resetConnectionState };