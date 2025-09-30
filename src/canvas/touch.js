import {
    initialTouchDistance,
    setInitialTouchDistance,
    initialZoom,
    setInitialZoom,
    zoomLevel,
    setZoomLevel,
    minZoom,
    maxZoom,
    isPanning
} from '../utils/state.js';
import { startPanning, stopPanning, updatePan, updateCanvasTransform } from './canvas.js';
import { canvasMouseDown, canvasMouseUp } from './interactions.js';
import { throttledMouseMove } from '../utils/helpers.js';
import { projectData } from '../utils/state.js';
import { handleElementDoubleClick } from './elements.js'; 
import { handleSegmentTouch, showMobileConnectionMenu } from './connections.js'; 

let singleTouchData = {
    startTime: 0,
    startPos: { x: 0, y: 0 },
    moved: false,
    target: null,
    isInteracting: false
};

let lastTouchTime = 0;
let lastTouchedElement = null;

// Touch-Events für Mobile
export function handleTouchStart(event) {
    if (event.touches.length === 2) {
        // Pinch-to-Zoom starten
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const distance = Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        setInitialTouchDistance(distance);
        setInitialZoom(zoomLevel);
        
        // Reset single touch wenn Multi-Touch startet
        singleTouchData.isInteracting = false;
        
    } else if (event.touches.length === 1) {
        const touch = event.touches[0];
        
        // Prüfe ob Touch auf Element
        const interactiveTarget = findInteractiveTarget(touch.target);
        
        singleTouchData = {
            startTime: Date.now(),
            startPos: { x: touch.clientX, y: touch.clientY },
            moved: false,
            target: interactiveTarget,
            isInteracting: !!interactiveTarget
        };
        
        if (singleTouchData.isInteracting) {
            // Touch auf Element, dann delegiere an Mouse Handler
            const mockMouseEvent = createMouseEvent(touch, event.target, 'mousedown');
            canvasMouseDown(mockMouseEvent);
        } else {
            // Also bei leerem Canvas touchen, wird Pan gestartet
            startPanning({ clientX: touch.clientX, clientY: touch.clientY, button: 0 });
        }
    }
}

export function handleTouchMove(event) {
    event.preventDefault();
    
    if (event.touches.length === 2) {
        // Pinch-to-Zoom
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const currentDistance = Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
        
        if (initialTouchDistance > 0) {
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            
            const newZoom = Math.max(minZoom, Math.min(maxZoom, 
                initialZoom * (currentDistance / initialTouchDistance)
            ));
            setZoomLevel(newZoom);
            
            updateCanvasTransform();
        }
    } else if (event.touches.length === 1) {
        const touch = event.touches[0];
        
        // Überprüfe, ob Touch bewegt
        const deltaX = Math.abs(touch.clientX - singleTouchData.startPos.x);
        const deltaY = Math.abs(touch.clientY - singleTouchData.startPos.y);
        
        if (deltaX > 5 || deltaY > 5) {
            singleTouchData.moved = true;
        }
        
        if (singleTouchData.isInteracting) {
            const mockMouseEvent = createMouseEvent(touch, singleTouchData.target, 'mousemove');
            throttledMouseMove(mockMouseEvent);
        } else if (isPanning) {
            updatePan({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }
}

export function handleTouchEnd(event) {
    if (event.touches.length === 0) {
        const touch = event.changedTouches[0];
        const touchDuration = Date.now() - singleTouchData.startTime;
        const currentTime = Date.now();
        
        if (singleTouchData.isInteracting) {
            const mockMouseEvent = createMouseEvent(touch, singleTouchData.target, 'mouseup');
            canvasMouseUp(mockMouseEvent);
            
            // Double-Touch Erkennung für Properties Panel
            if (!singleTouchData.moved && touchDuration < 300) {
                const timeDiff = currentTime - lastTouchTime;
                const isDoubleTap = timeDiff < 500 && lastTouchedElement === singleTouchData.target;
    
                if (isDoubleTap && singleTouchData.target.classList.contains('element-wrapper')) {
                    // Double-Touch auf Element - öffne Properties
                    handleElementDoubleClick(singleTouchData.target);  
                } else if (singleTouchData.target.classList.contains('line-segment') || 
                          singleTouchData.target.classList.contains('connection-path') ||
                          singleTouchData.target.classList.contains('connection-arrow')) {
                    
                    const connectionId = getConnectionIdFromTarget(singleTouchData.target);
                    if (connectionId) {
                        // Long press -> context menu
                        if (touchDuration > 400) {
                            showMobileConnectionMenu(connectionId, touch.clientX, touch.clientY);
                        } else {
                            // Short tap -> just select
                            const conn = projectData.connections.find(c => c.id === connectionId);
                            const connectionGroup = singleTouchData.target.closest('.connection-container') || 
                                                  singleTouchData.target.closest('.connection-group');
                            
                            if (conn && connectionGroup) {
                                handleSegmentTouch(singleTouchData.target, conn, connectionGroup);
                            }
                        }
                    }
                }
    
                lastTouchTime = currentTime;
                lastTouchedElement = singleTouchData.target;
            }
        } else {
            stopPanning();
        }
        
        setInitialTouchDistance(0);
        singleTouchData = {
            startTime: 0,
            startPos: { x: 0, y: 0 },
            moved: false,
            target: null,
            isInteracting: false
        };
    }
}

function getConnectionIdFromTarget(target) {
    let element = target;
    while (element && element !== document.body) {
        const connectionId = element.getAttribute('data-connection-id');
        if (connectionId) {
            return connectionId;
        }
        
        // Check for connection container/group
        if (element.classList.contains('connection-container') || 
            element.classList.contains('connection-group')) {
            return element.getAttribute('data-connection-id');
        }
        
        element = element.parentElement;
    }
    
    return null;
}

function findInteractiveTarget(element) {
    let current = element;
    while (current && current !== document.body) {
        if (current.classList.contains('element-wrapper') ||
            current.classList.contains('line-segment') ||
            current.classList.contains('corner-point-handle') ||
            current.classList.contains('connection-path') ||
            current.classList.contains('connection-arrow') ||  // Added
            current.classList.contains('connection-container') || // Added
            current.classList.contains('tool-item') ||
            current.classList.contains('resize-handle')) {
            
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

function createMouseEvent(touch, target, type) {
    return {
        type: type,
        clientX: touch.clientX,
        clientY: touch.clientY,
        screenX: touch.screenX || touch.clientX,
        screenY: touch.screenY || touch.clientY,
        button: 0,
        buttons: type === 'mouseup' ? 0 : 1,
        bubbles: true,
        cancelable: true,
        target: target,
        currentTarget: target,
        preventDefault: () => {},
        stopPropagation: () => {},
        stopImmediatePropagation: () => {}
    };
}

let longPressTimer = null;

export function startLongPressTimer(callback, delay = 800) {
    clearLongPressTimer();
    longPressTimer = setTimeout(callback, delay);
}

export function clearLongPressTimer() {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

export function isTouchInteracting() {
    return singleTouchData.isInteracting;
}

export function getTouchTarget() {
    return singleTouchData.target;
}