import { 
    eventController, projectData,
    selectedElement, propertiesPanelOpen, aiPanelOpen,
} from './utils/state.js';
import { setTool } from './tools/tools.js';
import { saveProject, loadProject, exportProject, importProjectFromFile,
    exportOptimizedPNG, exportWorkingPDF      } from './data/project.js';
import { saveToHistory, undo, redo } from './data/history.js';
import { deleteSelected, deselectAll } from './canvas/elements.js';
import { canvasMouseDown, canvasMouseUp } from './canvas/interactions.js';
import { handleWheel, centerCanvas } from './canvas/canvas.js';
import { handleTouchStart, handleTouchMove, handleTouchEnd } from './canvas/touch.js';
import { throttledMouseMove } from './utils/helpers.js';
import { toggleProperties, initPropertiesPanelTouch } from './ui/properties.js';
import { toggleAI } from './ui/ai.js';
import { toggleSwimLanes, showSwimLaneManager } from './canvas/swimlanes.js';
import { initStatusSystem, initializeAllElementStatuses } from './canvas/status.js';
import { initializeDependencyEngine } from './canvas/dependencies.js';
import { showDependencyDashboard } from './ui/dependency-dashboard.js'; 
import { deselectConnections, stopConnectionDragging } from './canvas/connections.js';
import { showMistralAPISettings } from './utils/settings.js';


window.showMistralAPISettings = showMistralAPISettings;

function showExportMenu(event) {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
   
    const menu = document.createElement('div');
    menu.className = 'export-dropdown';
    menu.style.cssText = `
        position: fixed;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        min-width: 200px;
        top: ${rect.bottom + 5}px;
        right: ${window.innerWidth - rect.right}px;
    `;
   
    const menuItems = [
        { text: 'Export JSON', action: exportProject, desc: 'Projektdaten' },
        { text: 'Export PNG', action: exportOptimizedPNG, desc: 'Bild-Format' },
        { text: 'Export PDF', action: exportWorkingPDF, desc: 'Standard-Qualität' },
    ];
    
    menuItems.forEach(item => {
        const btn = document.createElement('button');
        btn.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: flex-start;">
                <span style="font-weight: 500;">${item.text}</span>
                <small style="color: #666; font-size: 11px;">${item.desc}</small>
            </div>
        `;
        btn.style.cssText = `
            width: 100%; padding: 12px 15px; border: none;
            background: transparent; text-align: left; cursor: pointer;
            font-size: 14px; color: #333; border-radius: 4px;
        `;
        btn.addEventListener('mouseenter', () => btn.style.background = '#f5f5f5');
        btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
        btn.addEventListener('click', () => {
            item.action();
            menu.remove();
        });
        menu.appendChild(btn);
    });
   
    document.body.appendChild(menu);
    
    setTimeout(() => {
        document.addEventListener('click', () => menu.remove(), { once: true });
    }, 100);
}

function initializeMainApp() {
    // App-Container direkt anzeigen
    document.getElementById('appContainer').style.display = 'flex';

    loadProject();
    
    setTimeout(() => {
        const checkProjectLoaded = () => {
            if (typeof projectData !== 'undefined' && projectData) {
                if (projectData.elements.length > 0 || projectData.connections.length > 0) {
                    saveToHistory('Initial State');
                    centerCanvas();
                } else {
                    setTimeout(() => {
                        saveToHistory('Initial State');
                        centerCanvas();
                    }, 100);
                }
            } else {
                // Fallback wenn projectData noch nicht verfügbar
                setTimeout(() => {
                    saveToHistory('Initial State');
                    centerCanvas();
                }, 200);
            }
        };
        
        checkProjectLoaded();
    }, 500);
}

function showShapePanel(e) {
    const panel = document.getElementById('paint-shapes-panel');
    if (!panel) return;
    
    // Toggle
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
        return;
    }
    
    // Panel anzeigen
    const rect = e.currentTarget.getBoundingClientRect();
    panel.style.left = rect.left + 'px';
    panel.style.top = (rect.bottom + 8) + 'px';
    panel.style.display = 'block';
    
    // Panel beim Klick außerhalb schließen
    setTimeout(() => {
        document.addEventListener('click', function handler(ev) {
            if (!panel.contains(ev.target) && ev.target !== e.currentTarget) {
                panel.style.display = 'none';
                document.removeEventListener('click', handler);
            }
        });
    }, 100);
}

// Hauptinitialisierung
document.addEventListener('DOMContentLoaded', function() {
    const options = { signal: eventController.signal };

    // Core Systems initialisieren
    initializeDependencyEngine();
    initStatusSystem();
    initializeAllElementStatuses();
    
    initializeMainApp();
    
    // PDF + JSON Export Button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', showExportMenu, options);
    }
    
    const OpenpanelBtn = document.getElementById('OpenpanelBtn');
    if (OpenpanelBtn) {
        OpenpanelBtn.addEventListener('click', showShapePanel, options);
    }

    // JSON Import Button
    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        importBtn.addEventListener('click', importProjectFromFile, options);
    }
    
    // UI Controls
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', toggleProperties, options);
    }
    
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveProject, options);
    }
    
    const aiBtn = document.getElementById('aiBtn');
    if (aiBtn) {
        aiBtn.addEventListener('click', toggleAI, options);
    }
    
    const deleteBtn = document.getElementById('deleteBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteSelected, options);
    }
    
    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) {
        undoBtn.addEventListener('click', undo, options);
    }
    
    const redoBtn = document.getElementById('redoBtn');
    if (redoBtn) {
        redoBtn.addEventListener('click', redo, options);
    }
    
    const swimlaneManagerBtn = document.getElementById('swimlaneManagerBtn');
    if (swimlaneManagerBtn) {
        swimlaneManagerBtn.addEventListener('click', showSwimLaneManager, options);
    }
    
    const swimlaneBtn = document.getElementById('swimlaneBtn');
    if (swimlaneBtn) {
        swimlaneBtn.addEventListener('click', toggleSwimLanes, options);
    }
    
    // Dependency Dashboard Button
    const depDashBtn = document.getElementById('dependencyDashboardBtn');
    if (depDashBtn) {
        depDashBtn.addEventListener('click', showDependencyDashboard, options);
    }

    // Tool-Selection-Listeners
    document.querySelectorAll('.tool-item[data-tool]').forEach(button => {
        button.addEventListener('click', (e) => {
            const tool = e.currentTarget.getAttribute('data-tool');
            setTool(tool);
        }, options);
    });
    
    // Shape Panel Tools
    document.querySelectorAll('#paint-shapes-panel .shape-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tool = btn.getAttribute('data-shape');
            setTool(tool);
            document.getElementById('paint-shapes-panel').style.display = 'none';
        });
    });
    
    // Global Mouse Events
    document.addEventListener('mouseup', canvasMouseUp, options);
    document.addEventListener('mousemove', throttledMouseMove, options);
    
    // Erstes Tool aktivieren
    const firstTool = document.querySelector('.tool-item');
    if (firstTool) {
        firstTool.classList.add('active');
    }
    
    // Keyboard Shortcuts
    document.addEventListener('keydown', function(e) {
        // Save Shortcut
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveProject();
        }
        
        // Delete Selected Element
        if (e.key === 'Delete' && selectedElement) {
            saveToHistory('Delete Element');
            deleteSelected();
        }
        
        // Escape - Deselect All
        if (e.key === 'Escape') {
            deselectAll();
            if (propertiesPanelOpen) toggleProperties();
            if (aiPanelOpen) toggleAI();
            deselectConnections();
            stopConnectionDragging();
        }

        // Tool Shortcuts (Alt+1-6)
        if (e.altKey && e.key >= '1' && e.key <= '6') { 
            e.preventDefault();
            const tools = ['select', 'rectangle', 'circle', 'diamond', 'system', 'connection'];
            const toolIndex = parseInt(e.key) - 1;
            setTool(tools[toolIndex]);
        }
        
        // Export PDF Shortcut
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            exportWorkingPDF();
        }
        
        // Import JSON Shortcut
        if (e.ctrlKey && e.shiftKey && e.key === 'O') {
            e.preventDefault();
            importProjectFromFile();
        }
        
        // Undo/Redo Shortcuts
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo();
        }
    }, options);

    // Canvas Container Events
    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) {
        canvasContainer.addEventListener('mousedown', canvasMouseDown, options);
        canvasContainer.addEventListener('wheel', handleWheel, {...options, passive: false });
        
        // Touch-Events für Mobile
        canvasContainer.addEventListener('touchstart', handleTouchStart, {...options, passive: false });
        canvasContainer.addEventListener('touchmove', handleTouchMove, {...options, passive: false });
        canvasContainer.addEventListener('touchend', handleTouchEnd, {...options, passive: false });
        
        // Mittlere Maustaste für Pan
        canvasContainer.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
            }
        }, options); 
        
        // Context-Menu unterdrücken
        canvasContainer.addEventListener('contextmenu', (e) => e.preventDefault(), options);
    }

    // Tool Button Tooltips mit Shortcuts
    const toolButtons = document.querySelectorAll('.tool-item:not(#paint-shapes-panel .tool-item)');
    const shortcuts = ['Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5', 'Alt+6'];
    toolButtons.forEach((button, index) => {
        if (index < shortcuts.length) {
            const currentTitle = button.getAttribute('title') || '';
            button.setAttribute('title', `${currentTitle} (${shortcuts[index]})`);
        }
    });

    // Properties Panel Touch Support
    initPropertiesPanelTouch();
});
