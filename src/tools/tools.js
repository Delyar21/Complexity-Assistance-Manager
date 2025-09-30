import { setCurrentTool, currentTool  } from '../utils/state.js';
import { resetConnectionState } from '../canvas/interactions.js';

const TOOL_MAPPING = ['select', 'rectangle', 'circle', 'diamond', 'cylinder', 'connection'];
const CURSOR_CLASSES = [
    'cursor-select', 'cursor-rectangle', 'cursor-circle', 'cursor-diamond', 
    'cursor-cylinder', 'cursor-person', 'cursor-connection'
];

export function setTool(tool) {
    if (!isValidTool(tool)) {
        //console.warn(`Unbekanntes Tool: ${tool}. Fallback zu 'select'.`);
        tool = 'select';
    }

    // Reset connection state beim Tool-Wechsel
    const previousTool = getCurrentTool();
    if (previousTool === 'connection' && tool !== 'connection') {
        console.log('🔄 Switching from connection tool - resetting connection state');
        resetConnectionState();
    }

    setCurrentTool(tool);
    updateToolButtons(tool);
    updateCanvasCursor(tool);
    
    console.log('Tool set to:', tool);
}

function getCurrentTool() {
    return currentTool;
}

function isValidTool(tool) {
    return TOOL_MAPPING.includes(tool) || tool === 'person';
}

function updateToolButtons(tool) {
    const toolButtons = document.querySelectorAll('.tool-item');

    toolButtons.forEach(item => item.classList.remove('active'));

    const toolIndex = TOOL_MAPPING.indexOf(tool);

    if (toolIndex !== -1 && toolButtons[toolIndex]) {
        toolButtons[toolIndex].classList.add('active');
        toolButtons[toolIndex].setAttribute('aria-pressed', 'true');
    }

    toolButtons.forEach((button, index) => {
        if (index !== toolIndex) {
            button.setAttribute('aria-pressed', 'false');
        }
    });
}

function updateCanvasCursor(tool) {
    const canvas = document.getElementById('canvas');

    if (!canvas) {
        console.warn('Canvas-Element nicht gefunden');
        return;
    }

    canvas.classList.remove(...CURSOR_CLASSES);

    const toolToCursor = {
        'rectangle': 'cursor-rectangle',
        'circle': 'cursor-circle', 
        'diamond': 'cursor-diamond',
        'system': 'cursor-system',
        'person': 'cursor-person',  
        'connection': 'cursor-connection',
        'select': 'cursor-select'
    };

    const cursorClass = toolToCursor[tool] || 'cursor-select';
    canvas.classList.add(cursorClass);
}

export function getElementConfig(type) {
    const configs = {
        rectangle: {
            shape: 'rectangle',
            icon: 'fa-square',
            title: 'Prozess',
            color: '#3a6a8a'
        },
        circle: {
            shape: 'circle',
            icon: 'fa-circle',
            title: 'Start/Ende',
            color: '#3a6a8a'
        },
        diamond: {
            shape: 'diamond',
            icon: 'fa-gem',
            title: 'Entscheidung',
            color: '#3a6a8a'
        },
        cylinder: {
            shape: 'cylinder',
            icon: 'fa-database',
            title: 'System',
            color: '#3a6a8a'
        },
        person: {
            shape: 'circle',
            icon: 'fa-user',
            title: 'Person',
            color: '#3a6a8a'
        }
    };

    return configs[type] || configs.rectangle;
}

export function getToolInfo(tool) {
    const toolInfos = {
        select: { name: 'Auswählen', shortcut: 'Alt+1', description: 'Elemente auswählen und bewegen' },
        rectangle: { name: 'Prozess', shortcut: 'Alt+2', description: 'Rechteckige Prozess-Elemente erstellen' },
        circle: { name: 'Start/Ende', shortcut: 'Alt+3', description: 'Runde Start/Ende-Elemente erstellen' },
        diamond: { name: 'Entscheidung', shortcut: 'Alt+4', description: 'Rauten-förmige Entscheidungselemente erstellen' },
        system: { name: 'System', shortcut: 'Alt+5', description: 'System-Elemente erstellen' },
        connection: { name: 'Verbindung', shortcut: 'Alt+6', description: 'Elemente miteinander verbinden' }
    };

    return toolInfos[tool] || { name: 'Unbekannt', shortcut: '', description: '' };
}

export function getNextTool(currentTool, direction = 1) {
    const currentIndex = TOOL_MAPPING.indexOf(currentTool);
    if (currentIndex === -1) return 'select';

    const nextIndex = (currentIndex + direction + TOOL_MAPPING.length) % TOOL_MAPPING.length;
    return TOOL_MAPPING[nextIndex];
}

export function setToolByShortcut(keyNumber) {
    if (keyNumber >= 1 && keyNumber <= TOOL_MAPPING.length) {
        const tool = TOOL_MAPPING[keyNumber - 1];
        setTool(tool);
        return true;
    }
    return false;
}

export function cleanupTools() {
    const canvas = document.getElementById('canvas');
    if (canvas) {
        canvas.classList.remove(...CURSOR_CLASSES);
    }

    document.querySelectorAll('.tool-item').forEach(item => {
        item.classList.remove('active');
        item.removeAttribute('aria-pressed');
    });
}

export function getToolStatus() {
    const activeButton = document.querySelector('.tool-item.active');
    const canvasCursor = document.getElementById('canvas')?.className.match(/cursor-\w+/)?.[0];

    return {
        activeButton: activeButton?.getAttribute('data-tool') || 'none',
        canvasCursor: canvasCursor || 'none',
        toolMapping: TOOL_MAPPING
    };
}

window.setTool = setTool;
window.getToolInfo = getToolInfo;
window.setToolByShortcut = setToolByShortcut;
