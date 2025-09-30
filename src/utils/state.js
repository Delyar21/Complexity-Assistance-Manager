import { LocalStorage } from '../data/storage.js';
import { CONSTANTS } from './constants.js';

// Storage
export const storage = new LocalStorage();

// Variablen 
export let currentTool = 'select';
export let selectedElement = null;
export let isDragging = false;
export let dragOffset = { x: 0, y: 0 };
export let isConnecting = false;
export let connectionStart = null;
export let projectData = { elements: [], connections: [] };
export let elementCounter = 0;
export let propertiesPanelOpen = false;
export let aiPanelOpen = false;

// Pan & Zoom Variablen
export let isPanning = false;
export let panStart = { x: 0, y: 0 };
export let panOffset = { x: 0, y: 0 };
export let zoomLevel = 1;
export let canvasElement = null;

// Touch-Variablen
export let initialTouchDistance = 0;
export let initialZoom = 1;
export let eventController = new AbortController();

// Zoom Limits
export let minZoom = CONSTANTS.ZOOM_LIMITS.min;
export let maxZoom = CONSTANTS.ZOOM_LIMITS.max;

// History
export let projectHistory = [];
export let currentHistoryIndex = -1;
export let maxHistorySize = CONSTANTS.HISTORY_SIZE;

// Setter-Funktionen 
export function setCurrentTool(tool) { currentTool = tool; }
export function setSelectedElement(element) { selectedElement = element; }
export function setIsDragging(value) { isDragging = value; }
export function setIsConnecting(value) { isConnecting = value; }
export function setConnectionStart(start) { connectionStart = start; }
export function setProjectData(data) { projectData = data; }
export function setProjectHistory(history) { projectHistory = history; }
export function setCurrentHistoryIndex(index) { currentHistoryIndex = index; }
export function setEventController(controller) { eventController = controller; }
export function setElementCounter(counter) { elementCounter = counter; }
export function setPropertiesPanelOpen(value) { propertiesPanelOpen = value; }
export function setAiPanelOpen(value) { aiPanelOpen = value; }
export function setInitialTouchDistance(distance) { initialTouchDistance = distance; }
export function setInitialZoom(zoom) { initialZoom = zoom; }
export function setZoomLevel(level) { zoomLevel = level; }
export function setIsPanning(value) { isPanning = value; }
export function setPanStart(start) { 
    panStart.x = start.x; 
    panStart.y = start.y; 
}
export function setPanOffset(offset) { 
    panOffset.x = offset.x; 
    panOffset.y = offset.y; 
}
export function setCanvasElement(element) { canvasElement = element; }