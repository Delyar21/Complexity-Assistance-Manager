import { projectData } from '../utils/state.js';
import { saveToHistory } from '../data/history.js';
import { getDependencyEngine } from './dependencies.js';
import { showToast } from '../ui/toast.js';

// Zentralisiertes State Management
class ConnectionManager {
    static CONNECTION_TYPES = {
        dataflow: {
            label: "Datenfluss",
            description: "Übertragung von Informationen zwischen Systemen",
            color: "#3498db",
            style: "solid",
            icon: "fas fa-exchange-alt"
        },
        dependency: {
            label: "Abhängigkeit", 
            description: "Ein Prozess ist von einem anderen abhängig",
            color: "#e74c3c",
            style: "dashed",
            icon: "fas fa-link"
        },
        process_step: {
            label: "Prozessschritt",
            description: "Sequenzieller Übergang zwischen Aktivitäten", 
            color: "#2ecc71",
            style: "solid",
            icon: "fas fa-arrow-right"
        },
        physical_transport: {
            label: "Physischer Transport",
            description: "Transport von physischen Objekten/Dokumenten",
            color: "#f39c12", 
            style: "dotted",
            icon: "fas fa-truck"
        },
        resource_flow: {
            label: "Ressourcenfluss",
            description: "Übertragung von Ressourcen (Personal, Material)",
            color: "#9b59b6",
            style: "solid", 
            icon: "fas fa-boxes"
        }
    };

    constructor() {
        this.connections = new Map();
        this.domElements = new Map();
        this.selectedConnection = null;
        this.isDragging = false;
        this.dragData = null;
        this.eventListeners = new Map();
        this.renderQueue = new Set();
        this.updateThrottled = this.performUpdatesInstant.bind(this);
        this.globalEventsRegistered = false;
        
        this.domCache = {
            canvas: null,
            canvasContainer: null
        };
        
        this.init();
    }

    init() {
        this.registerGlobalEvents();
    }

    
    performUpdatesInstant() {
        if (this.renderQueue.size === 0) return;
        
        const updateIds = Array.from(this.renderQueue);
        this.renderQueue.clear();
        
        updateIds.forEach(connectionId => {
            const connection = this.connections.get(connectionId);
            if (connection && connection.state.isDirty) {
                if (this.calculateConnectionGeometry(connection)) {
                    this.renderConnectionInstant(connection);
                }
            }
        });
        
        //console.log(`Instant updated ${updateIds.length} connections`);
    }
    
    renderConnectionInstant(connection) {
        const domRefs = this.domElements.get(connection.id);
        if (!domRefs) return;
        
        const { svg, path, arrow } = domRefs;
        
        if (path && connection.geometry.pathData) {
            path.setAttribute('d', connection.geometry.pathData);
        }
        
        if (arrow && connection.geometry.endPoint) {
            this.updateArrowInstant(connection, arrow);
        }
    }
    
    updateArrowInstant(connection, arrow) {
        const { endPoint, controlPoints, startPoint } = connection.geometry;
        
        // Bestimme Richtung für Arrow
        const lastPoint = controlPoints.length > 0 ? 
            controlPoints[controlPoints.length - 1] : startPoint;
        
        const dx = endPoint.x - lastPoint.x;
        const dy = endPoint.y - lastPoint.y;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        const arrowSize = connection.style.width * 3;
        const arrowPoints = this.calculateArrowPoints(endPoint, arrowSize, angle);
        
        arrow.setAttribute('points', arrowPoints);
        arrow.style.transformOrigin = `${endPoint.x}px ${endPoint.y}px`;
    }
    
    createConnection(startElementId, endElementId, options = {}) {
        const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const connectionData = {
            id: connectionId,
            from: startElementId,
            to: endElementId,
            type: options.type || 'dataflow',
            style: {
                color: options.color || '#3498db',
                width: options.width || 2,
                strokeStyle: options.strokeStyle || 'solid',
                arrowType: options.arrowType || 'standard'
            },
            geometry: {
                startPoint: null,
                endPoint: null,
                controlPoints: [], // Orthogonale Eckpunkte
                pathData: null // SVG path string
            },
            metadata: {
                label: options.label || '',
                dependencyType: options.dependencyType || 'sequential',
                isRequired: options.isRequired !== false,
                strength: options.strength || 'strong',
                createdAt: new Date().toISOString()
            },
            state: {
                isSelected: false,
                isDirty: true, 
                isVisible: true
            }
        };
        
        // Validierung
        if (!this.validateConnection(connectionData)) {
            //console.error('Connection validation failed');
            return null;
        }
        
        // Store in memory and projectData
        this.connections.set(connectionId, connectionData);
        projectData.connections.push(connectionData);
        
        // Calculate geometry
        this.calculateConnectionGeometry(connectionData);
        
        this.renderConnection(connectionData);
        
        // Notify dependency engine
        this.notifyDependencyEngine(startElementId);
        
        saveToHistory('Create Connection');
        
        //console.log(`Connection created: ${connectionId}`);
        return connectionId;
    }
    
    updateConnections(elementId = null) {
        if (elementId) {
            this.connections.forEach(conn => {
                if (conn.from === elementId || conn.to === elementId) {
                    this.markForUpdate(conn.id);
                }
            });
        } else {
            this.connections.forEach(conn => {
                this.markForUpdate(conn.id);
            });
        }
        
        this.performUpdatesInstant();
    }

    updateConnectionsForMovingElement(elementId) {
        //console.log(`Instant update for moving element: ${elementId}`);
        
        this.connections.forEach(connection => {
            if (connection.from === elementId || connection.to === elementId) {
                if (this.calculateConnectionGeometry(connection)) {
                    this.renderConnectionInstant(connection);
                }
            }
        });
    }
    
    deleteConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            //console.warn(`Connection not found: ${connectionId}`);
            return false;
        }
        
        // Remove DOM elements
        this.removeConnectionDOM(connectionId);
        
        // Remove from memory
        this.connections.delete(connectionId);
        this.domElements.delete(connectionId);
        
        // Remove from projectData
        projectData.connections = projectData.connections.filter(conn => conn.id !== connectionId);
        
        // Clear selection if this was selected
        if (this.selectedConnection?.id === connectionId) {
            this.selectedConnection = null;
        }
        
        saveToHistory('Delete Connection');
        
        //console.log(`Connection deleted: ${connectionId}`);
        showToast('Connection gelöscht', 'success');
        return true;
    }
    

    selectConnection(connectionId) {
        // Deselect current
        if (this.selectedConnection) {
            this.deselectConnection(this.selectedConnection.id);
        }
        
        const connection = this.connections.get(connectionId);
        if (!connection) return false;
        
        connection.state.isSelected = true;
        this.selectedConnection = connection;
        
        // Visual feedback
        this.updateConnectionVisualState(connectionId);
        
        //console.log(`Connection selected: ${connectionId}`);
        return true;
    }
    
    deselectConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.state.isSelected = false;
            this.updateConnectionVisualState(connectionId);
        }
    }
    
    deselectAllConnections() {
        this.connections.forEach(conn => {
            if (conn.state.isSelected) {
                this.deselectConnection(conn.id);
            }
        });
        this.selectedConnection = null;
    }
    
    calculateConnectionGeometry(connection) {
        const startEl = document.getElementById(connection.from);
        const endEl = document.getElementById(connection.to);
        
        if (!startEl || !endEl) {
            //console.warn(`Elements not found for connection ${connection.id}`);
            return false;
        }
        
        // Ensure state object exists
        if (!connection.state) {
            connection.state = {
                isSelected: false,
                isDirty: true,
                isVisible: true
            };
        }
        
        const startPoint = this.calculateElementConnectionPoint(startEl, endEl);
        const endPoint = this.calculateElementConnectionPoint(endEl, startEl);
        const controlPoints = this.calculateOrthogonalPath(startPoint, endPoint, startEl, endEl);
        const pathData = this.generateSVGPath(startPoint, controlPoints, endPoint);
        
        // Store geometry
        connection.geometry = {
            startPoint,
            endPoint,
            controlPoints,
            pathData
        };
        
        connection.state.isDirty = false;
        
        return true;
    }
    
    calculateElementConnectionPoint(sourceEl, targetEl) {
        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const canvasRect = this.getCanvas().getBoundingClientRect();
        
        // Relative positions to canvas
        const sourceCenter = {
            x: (sourceRect.left + sourceRect.width / 2) - canvasRect.left,
            y: (sourceRect.top + sourceRect.height / 2) - canvasRect.top
        };
        
        const targetCenter = {
            x: (targetRect.left + targetRect.width / 2) - canvasRect.left,
            y: (targetRect.top + targetRect.height / 2) - canvasRect.top
        };
        
        // Calculate which side of the source element to connect from
        const dx = targetCenter.x - sourceCenter.x;
        const dy = targetCenter.y - sourceCenter.y;
        
        const sourceWidth = sourceRect.width;
        const sourceHeight = sourceRect.height;
        
        let connectionPoint = { x: sourceCenter.x, y: sourceCenter.y };
        
        // Determine connection side based on direction
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal connection
            if (dx > 0) {
                // Connect from right side
                connectionPoint.x = sourceCenter.x + sourceWidth / 2;
            } else {
                // Connect from left side
                connectionPoint.x = sourceCenter.x - sourceWidth / 2;
            }
        } else {
            // Vertical connection
            if (dy > 0) {
                // Connect from bottom
                connectionPoint.y = sourceCenter.y + sourceHeight / 2;
            } else {
                // Connect from top
                connectionPoint.y = sourceCenter.y - sourceHeight / 2;
            }
        }
        
        return connectionPoint;
    }
    
    calculateOrthogonalPath(startPoint, endPoint, startEl, endEl) {
        const controlPoints = [];
        
        // Simple orthogonal routing with 2 control points
        const midX = (startPoint.x + endPoint.x) / 2;
        const midY = (startPoint.y + endPoint.y) / 2;
        
        // Determine routing direction
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal first, then vertical
            controlPoints.push({
                x: midX,
                y: startPoint.y
            });
            controlPoints.push({
                x: midX,
                y: endPoint.y
            });
        } else {
            // Vertical first, then horizontal
            controlPoints.push({
                x: startPoint.x,
                y: midY
            });
            controlPoints.push({
                x: endPoint.x,
                y: midY
            });
        }
        
        return controlPoints;
    }
    
    generateSVGPath(startPoint, controlPoints, endPoint) {
        let pathData = `M ${startPoint.x} ${startPoint.y}`;
        
        controlPoints.forEach(point => {
            pathData += ` L ${point.x} ${point.y}`;
        });
        
        pathData += ` L ${endPoint.x} ${endPoint.y}`;
        
        return pathData;
    }
    

    renderConnection(connection) {
        this.removeConnectionDOM(connection.id);
    
        const connectionGroup = this.createConnectionContainer(connection);
    
        const svg = this.createConnectionSVG(connection);
        connectionGroup.appendChild(svg);
    
        if (connection.state.isSelected) {
            this.createConnectionHandles(connection, connectionGroup);
        }
    
        // Store DOM references
        this.domElements.set(connection.id, {
            container: connectionGroup,
            svg: svg,
            path: svg.querySelector('.connection-path'),
            arrow: svg.querySelector('.connection-arrow'),
            label: null  
        });
    
        // Add to canvas
        this.getCanvas().appendChild(connectionGroup);
    
        // Setup event listeners
        this.setupConnectionEvents(connection, connectionGroup);
        
        if (connection.metadata && connection.metadata.label) {
            //console.log('About to render label:', connection.metadata.label);
            this.renderConnectionLabel(connection, connectionGroup);
        }
    }

    renderConnectionLabel(connection, container) {
        // Remove existing label
        const existingLabel = container.querySelector('.connection-label');
        if (existingLabel) existingLabel.remove();
        
        // Check if label exists and geometry is available
        if (!connection.metadata.label) {
            return;
        }
        
        const labelStyle = connection.metadata.labelStyle || {};
        const position = labelStyle.position || 'middle';
        const background = labelStyle.background || 'white';
        const fontSize = labelStyle.fontSize || 12;
        
        // Calculate label position
        let labelX, labelY;
        const startPoint = connection.geometry.startPoint;
        const endPoint = connection.geometry.endPoint;

        // Fallback für fehlende Geometry
        if (!connection.geometry?.startPoint || !connection.geometry?.endPoint) {
            //console.log('Missing geometry, using center position');
            labelX = 0;
            labelY = 0;
        } else {
            switch (position) {
            case 'start':
                labelX = startPoint.x;
                labelY = startPoint.y - 20;
                break;
            case 'end':
                labelX = endPoint.x;
                labelY = endPoint.y - 20;
                break;
            case 'middle':
            default:
                labelX = (startPoint.x + endPoint.x) / 2;
                labelY = (startPoint.y + endPoint.y) / 2 - 15;
                break;
            }
        }
        
        
        const label = document.createElement('div');
        label.className = 'connection-label';
        label.textContent = connection.metadata.label;
        label.setAttribute('data-connection-id', connection.id);
        
        // Determine background style
        let bgStyle = 'rgba(255,255,255,0.9)';
        if (background === 'transparent') {
            bgStyle = 'transparent';
        } else if (background === 'colored') {
            bgStyle = (connection.style?.color || '#3498db') + '20';
        }
        
        // Apply styles
        label.style.cssText = `
            position: absolute;
            top: ${labelY}px;
            left: ${labelX - 30}px;
            background: rgba(255,255,255,0.95);
            color: #2c3e50;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            pointer-events: auto;
            z-index: 1000;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            border: 1px solid #ddd;
        `;
        
        container.appendChild(label);
        //console.log('Label added to connection-container:', connection.metadata.label);
        
        const domElements = this.domElements.get(connection.id);
        if (domElements) {
            domElements.label = label;
        }


    }
    
    createConnectionContainer(connection) {
        const container = document.createElement('div');
        container.className = `connection-container connection-${connection.type}`;
        container.setAttribute('data-connection-id', connection.id);
        
        if (connection.state.isSelected) {
            container.classList.add('selected');
        }
        
        container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: ${connection.state.isSelected ? 15 : 10};
        `;
        
        return container;
    }
    
    createConnectionSVG(connection) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'connection-svg');
        svg.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            overflow: visible;
        `;
        
        // Create path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'connection-path');
        path.setAttribute('d', connection.geometry.pathData);
        path.style.cssText = `
            stroke: ${connection.style.color};
            stroke-width: ${connection.style.width}px;
            stroke-linecap: round;
            stroke-linejoin: round;
            fill: none;
            pointer-events: stroke;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        
        // Apply stroke style
        if (connection.style.strokeStyle === 'dashed') {
            path.style.strokeDasharray = '8,4';
        } else if (connection.style.strokeStyle === 'dotted') {
            path.style.strokeDasharray = '2,2';
        }
        
        svg.appendChild(path);
        
        const arrow = this.createConnectionArrow(connection);
        svg.appendChild(arrow);
        
        return svg;
    }
    
    createConnectionArrow(connection) {
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('class', 'connection-arrow');
        
        // Calculate arrow position and rotation
        const { endPoint, controlPoints } = connection.geometry;
        const lastPoint = controlPoints.length > 0 ? 
            controlPoints[controlPoints.length - 1] : 
            connection.geometry.startPoint;
        
        const dx = endPoint.x - lastPoint.x;
        const dy = endPoint.y - lastPoint.y;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        const arrowSize = connection.style.width * 3;
        const arrowPoints = this.calculateArrowPoints(endPoint, arrowSize, angle);
        
        arrow.setAttribute('points', arrowPoints);
        arrow.style.cssText = `
            fill: ${connection.style.color};
            stroke: rgba(255,255,255,0.8);
            stroke-width: 1;
            pointer-events: all;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        
        return arrow;
    }
    
    calculateArrowPoints(endPoint, size, angle) {
        const rad = angle * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        
        return [
            `${endPoint.x},${endPoint.y}`,
            `${endPoint.x - size * cos + size/2 * sin},${endPoint.y - size * sin - size/2 * cos}`,
            `${endPoint.x - size * cos - size/2 * sin},${endPoint.y - size * sin + size/2 * cos}`
        ].join(' ');
    }
    
    setupConnectionEvents(connection, container) {
        const path = container.querySelector('.connection-path');
        const arrow = container.querySelector('.connection-arrow');
        
        // Click to select
        const clickHandler = (e) => {
            e.stopPropagation();
            this.selectConnection(connection.id);
        };
        
        // Context menu
        const contextMenuHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showConnectionContextMenu(connection.id, e.clientX, e.clientY);
        };
        
        // Hover effects
        const hoverInHandler = () => {
            if (!connection.state.isSelected) {
                path.style.strokeWidth = (connection.style.width + 1) + 'px';
                path.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))';
            }
        };
        
        const hoverOutHandler = () => {
            if (!connection.state.isSelected) {
                path.style.strokeWidth = connection.style.width + 'px';
                path.style.filter = 'none';
            }
        };
        
        // Add event listeners
        [path, arrow].forEach(element => {
            if (element) {
                element.addEventListener('click', clickHandler);
                element.addEventListener('contextmenu', contextMenuHandler);
                element.addEventListener('mouseenter', hoverInHandler);
                element.addEventListener('mouseleave', hoverOutHandler);
                
                // Store for cleanup
                this.storeEventListener(connection.id, element, 'click', clickHandler);
                this.storeEventListener(connection.id, element, 'contextmenu', contextMenuHandler);
                this.storeEventListener(connection.id, element, 'mouseenter', hoverInHandler);
                this.storeEventListener(connection.id, element, 'mouseleave', hoverOutHandler);
            }
        });
    }
    
    showConnectionContextMenu(connectionId, x, y) {
        const connection = this.connections.get(connectionId);
        if (!connection) return;
        
        // Remove existing menu
        const existingMenu = document.querySelector('.connection-context-menu');
        if (existingMenu) existingMenu.remove();
        
        // Create menu
        const menu = document.createElement('div');
        menu.className = 'connection-context-menu';
        menu.style.cssText = `
            position: fixed;
            top: ${y}px;
            left: ${x}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            padding: 8px 0;
            min-width: 150px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
        `;
        
        const menuItems = [
            { label: 'Gewicht', action: () => this.showConnectionProperties(connectionId) },
            { label: 'Typ', action: () => this.showTypeDialog(connectionId) },
            { label: 'Label', action: () => this.addConnectionLabel(connectionId) },
            { type: 'separator' },
            { label: 'Löschen', action: () => this.deleteConnection(connectionId), danger: true }
        ];
        
        menuItems.forEach(item => {
            if (item.type === 'separator') {
                const separator = document.createElement('div');
                separator.style.cssText = 'height: 1px; background: #eee; margin: 4px 0;';
                menu.appendChild(separator);
            } else {
                const menuItem = document.createElement('div');
                menuItem.textContent = item.label;
                menuItem.style.cssText = `
                    padding: 8px 16px;
                    cursor: pointer;
                    color: ${item.danger ? '#e74c3c' : '#333'};
                    transition: background-color 0.2s;
                `;
                
                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.backgroundColor = item.danger ? '#fdf2f2' : '#f8f9fa';
                });
                
                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.backgroundColor = 'transparent';
                });
                
                menuItem.addEventListener('click', () => {
                    item.action();
                    menu.remove();
                });
                
                menu.appendChild(menuItem);
            }
        });
        
        document.body.appendChild(menu);
        
        // Auto-remove menu when clicking outside
        const removeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', removeMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', removeMenu);
        }, 100);
    }
    
    validateConnection(connectionData) {
        // Check if source and target elements exist
        const sourceEl = document.getElementById(connectionData.from);
        const targetEl = document.getElementById(connectionData.to);
        
        if (!sourceEl) {
            //console.error(`Source element not found: ${connectionData.from}`);
            return false;
        }
        
        if (!targetEl) {
            //console.error(`Target element not found: ${connectionData.to}`);
            return false;
        }
        
        // Check for self-connection
        if (connectionData.from === connectionData.to) {
            //console.error('Self-connections are not allowed');
            return false;
        }
        
        // Check for duplicate connections
        const existing = Array.from(this.connections.values()).find(conn => 
            conn.from === connectionData.from && conn.to === connectionData.to
        );
        
        if (existing) {
            //console.warn('Connection already exists between these elements');
            return false;
        }
        
        return true;
    }
    
    markForUpdate(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.state.isDirty = true;
            this.renderQueue.add(connectionId);
            //console.log('Connection marked for update:', connectionId);
            //console.log('Will re-render connection');
        }
    }
    
    performUpdates() {
        if (this.renderQueue.size === 0) return;
        
        const updateIds = Array.from(this.renderQueue);
        this.renderQueue.clear();
        
        updateIds.forEach(connectionId => {
            const connection = this.connections.get(connectionId);
            if (connection && connection.state.isDirty) {
                if (this.calculateConnectionGeometry(connection)) {
                    this.renderConnection(connection);
                }
            }
        });
        
        //console.log(`Updated ${updateIds.length} connections`);
    }
    
    removeConnectionDOM(connectionId) {
        const domRefs = this.domElements.get(connectionId);
        if (domRefs) {
            this.removeEventListeners(connectionId);
        
            if (domRefs.label && domRefs.label.parentNode) {
                domRefs.label.remove();
            }
            
            if (domRefs.container) {
                const existingLabel = domRefs.container.querySelector('.connection-label');
                if (existingLabel) {
                    existingLabel.remove();
                }
            }
        
            if (domRefs.container && domRefs.container.parentNode) {
                domRefs.container.remove();
            }
        
            this.domElements.delete(connectionId);
        }
        
        const orphanedLabels = document.querySelectorAll(`[data-connection-id="${connectionId}"]`);
        orphanedLabels.forEach(label => {
            if (label.classList.contains('connection-label')) {
                label.remove();
            }
        });
    }
    
    storeEventListener(connectionId, element, eventType, handler) {
        if (!this.eventListeners.has(connectionId)) {
            this.eventListeners.set(connectionId, []);
        }
        
        this.eventListeners.get(connectionId).push({
            element,
            eventType,
            handler
        });
    }
    
    removeEventListeners(connectionId) {
        const listeners = this.eventListeners.get(connectionId);
        if (listeners) {
            listeners.forEach(({ element, eventType, handler }) => {
                if (element && element.removeEventListener) {
                    element.removeEventListener(eventType, handler);
                }
            });
            this.eventListeners.delete(connectionId);
        }
    }
    
    cleanup() {
        //console.log('Cleaning up ConnectionManager...');
        
        // Remove all connections
        this.connections.forEach((_, connectionId) => {
            this.removeConnectionDOM(connectionId);
        });
        
        // Clear all data structures
        this.connections.clear();
        this.domElements.clear();
        this.eventListeners.clear();
        this.renderQueue.clear();
        
        // Remove global events
        if (this.globalEventsRegistered) {
            document.removeEventListener('click', this.handleGlobalClick);
            this.globalEventsRegistered = false;
        }
        
        this.selectedConnection = null;
        this.isDragging = false;
        this.dragData = null;
        
        //console.log('ConnectionManager cleanup complete');
    }

    getCanvas() {
        return this.domCache.canvas || (this.domCache.canvas = document.getElementById('canvas'));
    }
    
    throttle(func, delay) {
        let timeoutId;
        let lastExecTime = 0;
        
        return function (...args) {
            const currentTime = Date.now();
            
            if (currentTime - lastExecTime > delay) {
                func.apply(this, args);
                lastExecTime = currentTime;
            } else {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    func.apply(this, args);
                    lastExecTime = Date.now();
                }, delay - (currentTime - lastExecTime));
            }
        };
    }
    
    registerGlobalEvents() {
        if (this.globalEventsRegistered) return;
        
        this.handleGlobalClick = (e) => {
            // Deselect connections when clicking on canvas
            if (e.target === this.getCanvas() || e.target.classList.contains('canvas-container')) {
                this.deselectAllConnections();
            }
        };
        
        document.addEventListener('click', this.handleGlobalClick);
        this.globalEventsRegistered = true;
    }
    
    notifyDependencyEngine(elementId) {
        const depEngine = getDependencyEngine();
        if (depEngine) {
            setTimeout(() => {
                depEngine.onStatusChange(elementId, 'unknown', 'unknown');
            }, 100);
        }
    }
    
    updateConnectionVisualState(connectionId) {
        const domRefs = this.domElements.get(connectionId);
        const connection = this.connections.get(connectionId);
        
        if (!domRefs || !connection) return;
        
        const { container, path, arrow } = domRefs;
        
        if (connection.state.isSelected) {
            container.classList.add('selected');
            container.style.zIndex = '15';
            
            if (path) {
                path.style.strokeWidth = (connection.style.width + 2) + 'px';
                path.style.filter = 'drop-shadow(0 2px 6px rgba(52,152,219,0.4))';
            }
            
            // Add control handles
            this.createConnectionHandles(connection, container);
            
        } else {
            container.classList.remove('selected');
            container.style.zIndex = '10';
            
            if (path) {
                path.style.strokeWidth = connection.style.width + 'px';
                path.style.filter = 'none';
            }
            
            // Remove control handles
            container.querySelectorAll('.connection-handle').forEach(handle => handle.remove());
        }
    }
    
    createConnectionHandles(connection, container) {
        // Remove existing handles
        container.querySelectorAll('.connection-handle').forEach(handle => handle.remove());
        
        // Create handles for control points
        connection.geometry.controlPoints.forEach((point, index) => {
            const handle = document.createElement('div');
            handle.className = 'connection-handle';
            handle.style.cssText = `
                position: absolute;
                left: ${point.x - 4}px;
                top: ${point.y - 4}px;
                width: 8px;
                height: 8px;
                background: #f39c12;
                border: 2px solid white;
                border-radius: 50%;
                cursor: move;
                z-index: 20;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                pointer-events: all;
                transition: all 0.2s ease;
            `;
            
            handle.addEventListener('mouseenter', () => {
                handle.style.transform = 'scale(1.2)';
                handle.style.background = '#e67e22';
            });
            
            handle.addEventListener('mouseleave', () => {
                handle.style.transform = 'scale(1)';
                handle.style.background = '#f39c12';
            });
            
            container.appendChild(handle);
        });
    }
    
    // Placeholder methods for future implementation
    showConnectionProperties(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    // Remove existing dialogs
    const existingDialog = document.querySelector('.connection-properties-dialog');
    if (existingDialog) existingDialog.remove();
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'connection-properties-dialog';
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 10001;
        padding: 24px;
        min-width: 400px;
        max-width: 90vw;
        font-family: system-ui, -apple-system, sans-serif;
    `;
    
    // Get current values
    const currentWeight = connection.metadata.weight || 5;
    const currentPriority = connection.metadata.priority || 'normal';
    const currentFrequency = connection.metadata.frequency || 'occasional';
    const currentCost = connection.metadata.cost || 0;
    const currentDuration = connection.metadata.duration || 0;
    const currentDescription = connection.metadata.description || '';
    
    dialog.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="margin: 0; color: #2c3e50;">Verbindung: Gewicht & Eigenschaften</h3>
        </div>
        
        <!-- Gewicht/Stärke -->
        <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #34495e;">
                Gewicht/Stärke (1-10)
            </label>
            <div style="display: flex; align-items: center; gap: 12px;">
                <input type="number" 
                    id="weightInput" 
                    min="1" max="10" 
                    value="${currentWeight}" 
                    style="width: 80px; padding: 6px; border: 1px solid #ccc; border-radius: 6px; text-align: center; font-weight: bold; color: #e74c3c;">
            </div>
            <small style="color: #7f8c8d; font-size: 12px;">Je höher, desto wichtiger die Verbindung</small>
        </div>
        
        <!-- Priorität -->
        <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #34495e;">
                Priorität
            </label>
            <select id="prioritySelect" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                <option value="low" ${currentPriority === 'low' ? 'selected' : ''}>Niedrig</option>
                <option value="normal" ${currentPriority === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="high" ${currentPriority === 'high' ? 'selected' : ''}>Hoch</option>
                <option value="critical" ${currentPriority === 'critical' ? 'selected' : ''}>Kritisch</option>
            </select>
        </div>
        
        <!-- Häufigkeit -->
        <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #34495e;">
                Häufigkeit
            </label>
            <select id="frequencySelect" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;">
                <option value="rare" ${currentFrequency === 'rare' ? 'selected' : ''}>Selten (< 1x/Monat)</option>
                <option value="occasional" ${currentFrequency === 'occasional' ? 'selected' : ''}>Gelegentlich (1-4x/Monat)</option>
                <option value="regular" ${currentFrequency === 'regular' ? 'selected' : ''}>Regelmäßig (1-4x/Woche)</option>
                <option value="frequent" ${currentFrequency === 'frequent' ? 'selected' : ''}>Häufig (täglich)</option>
                <option value="continuous" ${currentFrequency === 'continuous' ? 'selected' : ''}>Kontinuierlich</option>
            </select>
        </div>
        
        <!-- Kosten -->
        <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #34495e;">
                Kosten (€)
            </label>
            <input type="number" id="costInput" value="${currentCost}" min="0" step="0.01" 
                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;"
                   placeholder="Kosten pro Durchlauf in Euro">
        </div>
        
        <!-- Zeitbedarf -->
        <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #34495e;">
                Zeitbedarf (Minuten)
            </label>
            <input type="number" id="durationInput" value="${currentDuration}" min="0" step="1"
                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;"
                   placeholder="Durchschnittliche Dauer in Minuten">
        </div>
        
        <!-- Beschreibung -->
        <div style="margin-bottom: 24px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #34495e;">
                Beschreibung
            </label>
            <textarea id="descriptionInput" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; 
                      font-size: 14px; min-height: 80px; resize: vertical; font-family: inherit;"
                      placeholder="Zusätzliche Informationen zur Verbindung...">${currentDescription}</textarea>
        </div>
        
        <!-- Buttons -->
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="padding: 10px 20px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer;">
                Abbrechen
            </button>
            <button onclick="saveConnectionProperties('${connectionId}', this.parentElement.parentElement)" 
                    style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer;">
                <i class="fas fa-save" style="margin-right: 6px;"></i>Speichern
            </button>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    const weightInput = dialog.querySelector('#weightInput');

    // Error checking
    if (!weightInput) {
        //console.error('Weight input not found in dialog');
        return;
    }

    // Number input interaction (vereinfacht, da kein separates Display-Element)
    weightInput.addEventListener('input', () => {
        const value = parseInt(weightInput.value) || 1;
        
        // Validierung: Stelle sicher, dass Wert zwischen 1 und 10 liegt
        if (value < 1) {
            weightInput.value = 1;
        } else if (value > 10) {
            weightInput.value = 10;
        }
        
        // Visual feedback durch Farbe des Input-Feldes
        const normalizedValue = Math.max(1, Math.min(10, value));
        const percentage = (normalizedValue - 1) / 9; // 0 bis 1 für Werte 1-10
        const color = `hsl(${120 * (1 - percentage)}, 70%, 45%)`; // Rot bei 10, Grün bei 1
        
        weightInput.style.color = color;
    });

    // Zusätzliche Validierung bei Blur (wenn User das Feld verlässt)
    weightInput.addEventListener('blur', () => {
        const value = parseInt(weightInput.value) || 1;
        if (value < 1 || value > 10) {
            weightInput.value = Math.max(1, Math.min(10, value));
        }
    });
    
    // Add backdrop
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 10000;
    `;
    backdrop.addEventListener('click', () => {
        dialog.remove();
        backdrop.remove();
    });
    document.body.appendChild(backdrop);
}
    
    showTypeDialog(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    // Remove existing dialogs
    const existingDialog = document.querySelector('.connection-type-dialog');
    if (existingDialog) existingDialog.remove();
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'connection-type-dialog';
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 10001;
        padding: 24px;
        min-width: 500px;
        max-width: 90vw;
        font-family: system-ui, -apple-system, sans-serif;
    `;
    
    const currentType = connection.type || 'dataflow';
    
    // Generate type options
    const typeOptions = Object.entries(ConnectionManager.CONNECTION_TYPES).map(([key, config]) => {
        const isSelected = currentType === key;
        return `
            <div class="connection-type-option ${isSelected ? 'selected' : ''}" 
                 data-type="${key}" 
                 style="
                    display: flex; 
                    align-items: center; 
                    padding: 16px; 
                    border: 2px solid ${isSelected ? config.color : '#e0e0e0'}; 
                    border-radius: 8px; 
                    margin-bottom: 12px; 
                    cursor: pointer; 
                    transition: all 0.2s ease;
                    background: ${isSelected ? config.color + '15' : 'white'};
                 ">
                <div style="
                    width: 40px; 
                    height: 40px; 
                    background: ${config.color}; 
                    border-radius: 50%; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    color: white; 
                    margin-right: 16px;
                ">
                    <i class="${config.icon}"></i>
                </div>
                <div style="flex: 1;">
                    <h4 style="margin: 0; color: #2c3e50; font-size: 16px;">${config.label}</h4>
                    <p style="margin: 4px 0 0 0; color: #7f8c8d; font-size: 14px;">${config.description}</p>
                    <div style="margin-top: 8px; display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 12px; color: #95a5a6;">Farbe:</span>
                        <div style="width: 20px; height: 3px; background: ${config.color}; border-radius: 2px; ${config.style === 'dashed' ? 'border: 1px dashed ' + config.color + '; background: transparent;' : ''}${config.style === 'dotted' ? 'border: 1px dotted ' + config.color + '; background: transparent;' : ''}"></div>
                        <span style="font-size: 12px; color: #95a5a6; text-transform: capitalize;">${config.style}</span>
                    </div>
                </div>
                ${isSelected ? '<i class="fas fa-check-circle" style="color: ' + config.color + '; font-size: 20px;"></i>' : ''}
            </div>
        `;
    }).join('');
    
    dialog.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <h3 style="margin: 0; color: #2c3e50;">
                <i class="fas fa-palette" style="margin-right: 8px;"></i>Verbindungstyp ändern
            </h3>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">×</button>
        </div>
        
        <div style="margin-bottom: 24px;">
            <p style="color: #7f8c8d; margin-bottom: 16px;">Wählen Sie den passenden Typ für diese Verbindung:</p>
            <div id="typeOptions">
                ${typeOptions}
            </div>
        </div>
        
        <!-- Custom Style Options -->
        <div style="border-top: 1px solid #eee; padding-top: 20px; margin-bottom: 24px;">
            <h4 style="margin: 0 0 16px 0; color: #2c3e50;">
                <i class="fas fa-brush" style="margin-right: 8px;"></i>Anpassungen
            </h4>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <!-- Color Picker -->
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #34495e; font-size: 14px;">
                        Farbe
                    </label>
                    <input type="color" id="colorPicker" value="${connection.style?.color || '#3498db'}"
                           style="width: 100%; height: 40px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer;">
                </div>
                
                <!-- Line Width -->
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #34495e; font-size: 14px;">
                        Linienstärke: <span id="widthValue">${connection.style?.width || 2}px</span>
                    </label>
                    <input type="range" id="widthSlider" min="1" max="8" value="${connection.style?.width || 2}"
                           style="width: 100%; height: 6px; background: #ddd; border-radius: 3px; outline: none;">
                </div>
            </div>
        </div>
        
        <!-- Buttons -->
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="padding: 10px 20px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer;">
                Abbrechen
            </button>
            <button onclick="saveConnectionType('${connectionId}', this.parentElement.parentElement)" 
                    style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer;">
                <i class="fas fa-save" style="margin-right: 6px;"></i>Speichern
            </button>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Add event listeners for type selection
    const typeOptionElements = dialog.querySelectorAll('.connection-type-option');
    typeOptionElements.forEach(option => {
        option.addEventListener('click', () => {
            // Remove previous selection
            typeOptionElements.forEach(opt => {
                opt.classList.remove('selected');
                opt.style.border = '2px solid #e0e0e0';
                opt.style.background = 'white';
                const checkIcon = opt.querySelector('.fa-check-circle');
                if (checkIcon) checkIcon.remove();
            });
            
            // Select new option
            const selectedType = option.dataset.type;
            const typeConfig = ConnectionManager.CONNECTION_TYPES[selectedType];
            option.classList.add('selected');
            option.style.border = `2px solid ${typeConfig.color}`;
            option.style.background = typeConfig.color + '15';
            
            // Add check icon
            const checkIcon = document.createElement('i');
            checkIcon.className = 'fas fa-check-circle';
            checkIcon.style.color = typeConfig.color;
            checkIcon.style.fontSize = '20px';
            option.appendChild(checkIcon);
            
            // Update color picker
            dialog.querySelector('#colorPicker').value = typeConfig.color;
        });
    });
    
    // Width slider interaction
    const widthSlider = dialog.querySelector('#widthSlider');
    const widthValue = dialog.querySelector('#widthValue');
    
    widthSlider.addEventListener('input', () => {
        widthValue.textContent = widthSlider.value + 'px';
    });
    
    // Add backdrop
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 10000;
    `;
    backdrop.addEventListener('click', () => {
        dialog.remove();
        backdrop.remove();
    });
    document.body.appendChild(backdrop);
}

    
    
    addConnectionLabel(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection) return;
    
        // Remove existing dialogs
        const existingDialog = document.querySelector('.connection-label-dialog');
        if (existingDialog) existingDialog.remove();
    
        // Create dialog
        const dialog = document.createElement('div');
        dialog.className = 'connection-label-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            z-index: 10001;
            padding: 24px;
            min-width: 450px;
            max-width: 90vw;
            font-family: system-ui, -apple-system, sans-serif;
        `;
    
        const currentLabel = connection.metadata.label || '';
        const currentDescription = connection.metadata.description || '';
        
        dialog.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h3 style="margin: 0; color: #2c3e50;">
                    <i class="fas fa-tag" style="margin-right: 8px;"></i>Verbindung beschriften
                </h3>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">×</button>
            </div>
            
            <!-- Preview der Verbindung -->
            <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 20px; border-left: 4px solid ${connection.style?.color || '#3498db'};">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                    <i class="${ConnectionManager.CONNECTION_TYPES[connection.type]?.icon || 'fas fa-arrow-right'}" 
                    style="color: ${connection.style?.color || '#3498db'};"></i>
                    <span style="font-weight: 600; color: #2c3e50;">
                        ${ConnectionManager.CONNECTION_TYPES[connection.type]?.label || connection.type}
                    </span>
                </div>
                <div style="font-size: 14px; color: #7f8c8d;">
                    Von: <strong>${document.getElementById(connection.from)?.textContent || connection.from}</strong> 
                    → 
                    <strong>${document.getElementById(connection.to)?.textContent || connection.to}</strong>
                </div>
            </div>
            
            <!-- Label Input -->
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #34495e;">
                    <i class="fas fa-edit" style="margin-right: 6px;"></i>Label/Titel
                </label>
                <input type="text" id="labelInput" value="${currentLabel}" 
                    placeholder="z.B. Bestelldaten übertragen, Genehmigung erforderlich..."
                    style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px; 
                            font-size: 14px; transition: border-color 0.2s;"
                    maxlength="50">
                <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                    <small style="color: #7f8c8d;">Kurzer, prägnanter Titel für die Verbindung</small>
                    <small id="labelCounter" style="color: #95a5a6;">0/50</small>
                </div>
            </div>
            
            <!-- Description Input -->
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #34495e;">
                    <i class="fas fa-align-left" style="margin-right: 6px;"></i>Beschreibung (optional)
                </label>
                <textarea id="descriptionInput" 
                        placeholder="Detaillierte Beschreibung der Verbindung, Bedingungen, Datenformat..."
                        style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px; 
                                font-size: 14px; min-height: 80px; resize: vertical; font-family: inherit;"
                        maxlength="200">${currentDescription}</textarea>
                <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                    <small style="color: #7f8c8d;">Zusätzliche Details zur Verbindung</small>
                    <small id="descCounter" style="color: #95a5a6;">0/200</small>
                </div>
            </div>
            
            <!-- Label Position Options -->
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 12px; font-weight: 600; color: #34495e;">
                    <i class="fas fa-crosshairs" style="margin-right: 6px;"></i>Label-Position
                </label>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                    <button type="button" class="position-btn" data-position="start" 
                            style="padding: 8px 12px; border: 2px solid #e0e0e0; background: white; border-radius: 6px; 
                                cursor: pointer; font-size: 12px; transition: all 0.2s;">
                        <i class="fas fa-arrow-left"></i> Am Start
                        </button>
                        <button type="button" class="position-btn selected" data-position="middle"
                            style="padding: 8px 12px; border: 2px solid #3498db; background: #3498db15; border-radius: 6px; 
                                cursor: pointer; font-size: 12px; transition: all 0.2s; color: #3498db;">
                            <i class="fas fa-circle"></i> In der Mitte
                        </button>
                        <button type="button" class="position-btn" data-position="end"
                                style="padding: 8px 12px; border: 2px solid #e0e0e0; background: white; border-radius: 6px; 
                                cursor: pointer; font-size: 12px; transition: all 0.2s;">
                            <i class="fas fa-arrow-right"></i> Am Ende
                        </button>
                    </div>
                </div>
        
            <!-- Label Style Options -->
            <div style="margin-bottom: 24px;">
                <label style="display: block; margin-bottom: 12px; font-weight: 600; color: #34495e;">
                    <i class="fas fa-paint-brush" style="margin-right: 6px;"></i>Label-Stil
                </label>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                    <div>
                        <label style="font-size: 12px; color: #7f8c8d; margin-bottom: 4px; display: block;">Hintergrund</label>
                        <select id="backgroundSelect" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                            <option value="white">Weiß</option>
                            <option value="transparent">Transparent</option>
                            <option value="colored">Farbig</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 12px; color: #7f8c8d; margin-bottom: 4px; display: block;">Schriftgröße</label>
                        <select id="fontSizeSelect" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                            <option value="10">Klein (10px)</option>
                            <option value="12" selected>Normal (12px)</option>
                            <option value="14">Groß (14px)</option>
                        </select>
                    </div>
                </div>
            </div>
        
            <!-- Preview -->
            <div style="border: 1px solid #eee; border-radius: 8px; padding: 16px; margin-bottom: 24px; background: #fafafa;">
                <div style="font-size: 12px; color: #7f8c8d; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                    Vorschau
                </div>
                <div id="labelPreview" style="display: flex; align-items: center; justify-content: center; min-height: 40px;">
                    <span style="background: rgba(255,255,255,0.9); padding: 4px 8px; border-radius: 4px; font-size: 12px; color: #2c3e50;">
                        ${currentLabel || 'Beispiel-Label'}
                    </span>
                </div>
            </div>
        
            <!-- Buttons -->
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="padding: 10px 20px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer;">
                    Abbrechen
                </button>
                <button onclick="saveConnectionLabel('${connectionId}', this.parentElement.parentElement)" 
                        style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    <i class="fas fa-save" style="margin-right: 6px;"></i>Speichern
                </button>
            </div>
        `;
    
        document.body.appendChild(dialog);
    
        // Event Listeners
        const labelInput = dialog.querySelector('#labelInput');
        const descInput = dialog.querySelector('#descriptionInput');
        const labelCounter = dialog.querySelector('#labelCounter');
        const descCounter = dialog.querySelector('#descCounter');
        const positionBtns = dialog.querySelectorAll('.position-btn');
        const preview = dialog.querySelector('#labelPreview span');
    
        // Character counters
        function updateCounters() {
            labelCounter.textContent = `${labelInput.value.length}/50`;
            descCounter.textContent = `${descInput.value.length}/200`;
        
            // Update preview
            preview.textContent = labelInput.value || 'Beispiel-Label';
        }
    
        labelInput.addEventListener('input', updateCounters);
        descInput.addEventListener('input', updateCounters);
    
        // Position selection
        positionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                positionBtns.forEach(b => {
                    b.classList.remove('selected');
                    b.style.border = '2px solid #e0e0e0';
                    b.style.background = 'white';
                    b.style.color = '#666';
                });
                btn.classList.add('selected');
                btn.style.border = '2px solid #3498db';
                btn.style.background = '#3498db15';
                btn.style.color = '#3498db';
            });
        });
    
        // Style preview updates
        const backgroundSelect = dialog.querySelector('#backgroundSelect');
        const fontSizeSelect = dialog.querySelector('#fontSizeSelect');
    
        function updatePreview() {
            const bg = backgroundSelect.value;
            const fontSize = fontSizeSelect.value + 'px';
        
            let bgStyle = 'rgba(255,255,255,0.9)';
            if (bg === 'transparent') bgStyle = 'transparent';
            if (bg === 'colored') bgStyle = connection.style?.color + '20' || '#3498db20';
        
            preview.style.background = bgStyle;
            preview.style.fontSize = fontSize;
        }
    
        backgroundSelect.addEventListener('change', updatePreview);
        fontSizeSelect.addEventListener('change', updatePreview);
    
        // Initialize counters
        updateCounters();
    
        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 10000;
        `;
        backdrop.addEventListener('click', () => {
            dialog.remove();
            backdrop.remove();
        });
        document.body.appendChild(backdrop);
    }

    // Füge diese Methode zur ConnectionManager-Klasse hinzu:
    createConnectionData(fromId, toId, type = 'dataflow') {
        const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
        return {
            id: connectionId,
            from: fromId,
            to: toId,
        
            type: type, 
        
            style: {
                color: ConnectionManager.CONNECTION_TYPES[type]?.color || '#3498db',
                width: 2,
                strokeStyle: ConnectionManager.CONNECTION_TYPES[type]?.style || 'solid', // solid, dashed, dotted
                arrowType: 'standard' 
            },
        
            geometry: {
                startPoint: null, // Wird beim Rendering berechnet
                endPoint: null,   // Wird beim Rendering berechnet
                controlPoints: [], // Eckpunkte für orthogonale Linien
                pathData: null     // SVG path string
            },
        
            metadata: {
                // Grundlegende Eigenschaften
                label: '',
                description: '',
                weight: 5,              // 1-100 (Wichtigkeit/Stärke der Verbindung)
                priority: 'normal',      // low, normal, high, critical
                strength: 'medium',      // weak, medium, strong (abgeleitet von weight)
                frequency: 'occasional', // rare, occasional, regular, frequent, continuous
                duration: 0,             // Durchschnittliche Dauer in Minute 
                cost: 0,                // Kosten pro Durchlauf in Euro
                dependencyType: 'sequential', // sequential, parallel, conditional
                isRequired: true,             // Ist diese Verbindung zwingend erforderlich?
                canBeOptimized: true,         // Kann die KI diese Verbindung optimieren?
                aiAnalysis: {
                    bottleneck: false,       // Ist dies ein Engpass?
                    redundant: false,        // Ist diese Verbindung redundant?
                    optimizationPotential: 0, // 0-100 Optimierungspotential
                    suggestedImprovements: [], // Array von KI-Vorschlägen
                    lastAnalyzed: null       // Timestamp der letzten KI-Analyse
                },
                businessRules: {
                    automatizable: false,    // Kann automatisiert werden?
                    complianceRequired: false, // Compliance-relevant?
                    auditTrail: false,      // Audit-Trail erforderlich?
                    errorRate: 0,           // Fehlerrate in %
                    sla: null               // Service Level Agreement
                },
                technical: {
                    protocol: null,         // HTTP, FTP, Database, etc.
                    dataFormat: null,       // JSON, XML, CSV, etc.
                    dataVolume: 0,         // Datenvolumen pro Transfer
                    encryption: false,      // Verschlüsselt?
                },
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                lastUsed: null
            },
            state: {
                isSelected: false,
                isDirty: true,
                isVisible: true,
                isValid: true
            }
        };
    }
}

// Global function to save connection type
window.saveConnectionType = function(connectionId, dialog) {
    const manager = getConnectionManager();
    const connection = manager.connections.get(connectionId);
    if (!connection) return;
    
    // Get selected type
    const selectedOption = dialog.querySelector('.connection-type-option.selected');
    const newType = selectedOption ? selectedOption.dataset.type : connection.type;
    const newColor = dialog.querySelector('#colorPicker').value;
    const newWidth = parseInt(dialog.querySelector('#widthSlider').value);
    
    // Update connection
    connection.type = newType;
    connection.style = {
        ...connection.style,
        color: newColor,
        width: newWidth,
        strokeStyle: ConnectionManager.CONNECTION_TYPES[newType]?.style || 'solid'
    };
    
    // Update metadata
    connection.metadata.connectionType = newType;
    connection.metadata.lastModified = new Date().toISOString();
    
    // Mark for visual update
    manager.markForUpdate(connectionId);
    
    // Update project data for export
    const projectConnection = projectData.connections.find(conn => conn.id === connectionId);
    if (projectConnection) {
        projectConnection.type = newType;
        projectConnection.style = { ...connection.style };
        projectConnection.metadata = { ...connection.metadata };
    }
    
    // Save to history
    import('../data/history.js').then(module => {
        module.saveToHistory('Update Connection Type');
    });
    
    // Show success
    import('../ui/toast.js').then(module => {
        module.showToast(`Verbindungstyp geändert zu: ${ConnectionManager.CONNECTION_TYPES[newType]?.label}`, 'success');
    });
    
    // Close dialog
    dialog.remove();
    document.querySelector('.connection-type-dialog')?.parentElement?.remove(); // Remove backdrop
};

// Global function to save connection properties
window.saveConnectionProperties = function(connectionId, dialog) {
    const manager = getConnectionManager();
    const connection = manager.connections.get(connectionId);
    if (!connection) return;
    
    // Get values from dialog
    const weight = parseInt(dialog.querySelector('#weightInput').value, 10);
    const priority = dialog.querySelector('#prioritySelect').value;
    const frequency = dialog.querySelector('#frequencySelect').value;
    const cost = parseFloat(dialog.querySelector('#costInput').value) || 0;
    const duration = parseInt(dialog.querySelector('#durationInput').value) || 0;
    const description = dialog.querySelector('#descriptionInput').value.trim();
    
    // Update connection metadata
    connection.metadata = {
        ...connection.metadata,
        weight: weight,
        priority: priority,
        frequency: frequency,
        cost: cost,
        duration: duration,
        description: description,
        lastModified: new Date().toISOString()
    };
    
    // Update strength field for backwards compatibility
    if (weight <= 30) connection.metadata.strength = 'weak';
    else if (weight <= 70) connection.metadata.strength = 'medium';
    else connection.metadata.strength = 'strong';
    
    // Mark for visual update
    manager.markForUpdate(connectionId);
    
    // Save to project data for export
    const projectConnection = projectData.connections.find(conn => conn.id === connectionId);
    if (projectConnection) {
        projectConnection.metadata = { ...connection.metadata };
    }
    
    // Save to history
    import('../data/history.js').then(module => {
        module.saveToHistory('Update Connection Properties');
    });
    
    // Show success
    import('../ui/toast.js').then(module => {
        module.showToast(`Verbindungseigenschaften aktualisiert`, 'success');
    });
    
    // Close dialog
    dialog.remove();
    document.querySelector('.connection-properties-dialog')?.parentElement?.remove(); // Remove backdrop
};

// Global function to save connection label
window.saveConnectionLabel = function(connectionId, dialog) {
    const manager = getConnectionManager();
    const connection = manager.connections.get(connectionId);
    if (!connection) return;
    
    // Get values
    const label = dialog.querySelector('#labelInput').value.trim();
    const description = dialog.querySelector('#descriptionInput').value.trim();
    const position = dialog.querySelector('.position-btn.selected').dataset.position;
    const background = dialog.querySelector('#backgroundSelect').value;
    const fontSize = dialog.querySelector('#fontSizeSelect').value;
    
    // Update connection metadata
    connection.metadata.label = label;
    connection.metadata.description = description;
    connection.metadata.labelStyle = {
        position: position,
        background: background,
        fontSize: parseInt(fontSize)
    };
    connection.metadata.lastModified = new Date().toISOString();
    
    // Update project data
    const projectConnection = projectData.connections.find(conn => conn.id === connectionId);
    if (projectConnection) {
        projectConnection.metadata = { ...connection.metadata };
    }
    
    // Mark for visual update
    manager.markForUpdate(connectionId);
    
    // Save to history
    import('../data/history.js').then(module => {
        module.saveToHistory('Update Connection Label');
    });
    
    // Show success
    import('../ui/toast.js').then(module => {
        if (label) {
            module.showToast(`Label gesetzt: "${label}"`, 'success');
        } else {
            module.showToast('Label entfernt', 'success');
        }
    });
    
    // Close dialog
    dialog.remove();
    document.querySelector('.connection-label-dialog')?.parentElement?.remove();
};

let globalConnectionManager = null;

export function getConnectionManager() {
    if (!globalConnectionManager) {
        globalConnectionManager = new ConnectionManager();
    }
    return globalConnectionManager;
}

export function migrateConnectionData(oldConnection) {
    return {
        id: oldConnection.id || `conn-migrated-${Date.now()}`,
        from: oldConnection.from,
        to: oldConnection.to,
        type: oldConnection.type || 'dataflow',
        
        style: {
            color: oldConnection.style?.color || '#3498db',
            width: oldConnection.style?.width || 2,
            strokeStyle: oldConnection.style?.style || 'solid',
            arrowType: oldConnection.style?.arrowType || 'standard'
        },
        
        geometry: {
            startPoint: oldConnection.startPoint || null,
            endPoint: oldConnection.endPoint || null,
            controlPoints: oldConnection.cornerPoints || [],
            pathData: null
        },
        metadata: {
            label: oldConnection.label || oldConnection.metadata?.label || '',
            dependencyType: oldConnection.dependencyType || oldConnection.metadata?.dependencyType || 'sequential',
            isRequired: oldConnection.isRequired !== false && oldConnection.metadata?.isRequired !== false,
            strength: oldConnection.metadata?.strength || 'strong',
            createdAt: oldConnection.metadata?.createdAt || new Date().toISOString(),
            weight: oldConnection.metadata?.weight || 5,
            priority: oldConnection.metadata?.priority || 'normal',
            frequency: oldConnection.metadata?.frequency || 'occasional',
            duration: oldConnection.metadata?.duration || 0,
            cost: oldConnection.metadata?.cost || 0,
            description: oldConnection.metadata?.description || oldConnection.description || '',
            labelStyle: oldConnection.metadata?.labelStyle || {
                position: 'middle',
                background: 'white',
                fontSize: 12
            },
            aiAnalysis: oldConnection.metadata?.aiAnalysis || {
                bottleneck: false,
                redundant: false,
                optimizationPotential: 0,
                suggestedImprovements: [],
                lastAnalyzed: null
            },
            businessRules: oldConnection.metadata?.businessRules || {
                automatizable: false,
                complianceRequired: false,
                auditTrail: false,
                errorRate: 0,
                sla: null
            },
            technical: oldConnection.metadata?.technical || {
                protocol: null,
                dataFormat: null,
                dataVolume: 0,
                encryption: false,
                authentication: false
            },
            lastModified: oldConnection.metadata?.lastModified || new Date().toISOString(),
            lastUsed: oldConnection.metadata?.lastUsed || null
        },
        state: {
            isSelected: false,
            isDirty: true,
            isVisible: true
        }
    };
}

export function needsMigration(connection) {
    return !connection.metadata || 
           connection.metadata.weight === undefined || 
           connection.metadata.priority === undefined;
}

export function migrateAllConnections() {
    if (!projectData.connections) return;
   
    //console.log(`Migrating ${projectData.connections.length} connections...`);
   
    const manager = getConnectionManager();
    let migrated = 0;
   
    projectData.connections.forEach(conn => {
        const needsBasicMigration = !conn.state || !conn.geometry;
        const needsMetadataMigration = !conn.metadata || 
                                     conn.metadata.weight === undefined || 
                                     conn.metadata.priority === undefined;
        
        if (needsBasicMigration || needsMetadataMigration) {
            //console.log(`Migrating connection: ${conn.id}`);
            
            // Deine bewährte Migration anwenden
            const migratedConn = migrateConnectionData(conn);
           
            Object.assign(conn, migratedConn);
           
            manager.connections.set(migratedConn.id, migratedConn);
            migrated++;
            if (needsBasicMigration) {
                //console.log(`Basic structure migrated`);
            }
            if (needsMetadataMigration) {
                //console.log(`Extended metadata added`);
            }
        } else {
            if (!manager.connections.has(conn.id)) {
                manager.connections.set(conn.id, conn);
                //console.log(`Loaded existing connection: ${conn.id}`);
            }
        }
    });
   
    //console.log(`Migration complete: ${migrated} connections migrated`);
    

    if (migrated > 0) {
        //console.log(` Connection Statistics:`);
        //console.log(`   Total: ${projectData.connections.length}`);
        //console.log(`   Migrated: ${migrated}`);
        //console.log(`   Up-to-date: ${projectData.connections.length - migrated}`);
        
        // Zeige verfügbare Connection-Types
        const types = projectData.connections.reduce((acc, conn) => {
            acc[conn.type] = (acc[conn.type] || 0) + 1;
            return acc;
        }, {});
        //console.log(`   Types:`, types);
    }
    
    return migrated;
}

export function getConnectionMigrationStatus() {
    if (!projectData.connections) {
        return { total: 0, migrated: 0, needsMigration: 0 };
    }
    
    let migrated = 0;
    let needsMigration = 0;
    
    projectData.connections.forEach(conn => {
        const hasBasicStructure = conn.state && conn.geometry;
        const hasExtendedMetadata = conn.metadata && 
                                  conn.metadata.weight !== undefined && 
                                  conn.metadata.priority !== undefined;
        
        if (hasBasicStructure && hasExtendedMetadata) {
            migrated++;
        } else {
            needsMigration++;
        }
    });
    
    return {
        total: projectData.connections.length,
        migrated: migrated,
        needsMigration: needsMigration,
        isFullyMigrated: needsMigration === 0
    };
}

export function debugConnectionStructure(connectionId) {
    const conn = projectData.connections.find(c => c.id === connectionId);
    if (!conn) {
        //console.log('Connection not found:', connectionId);
        return;
    }
    
    //console.log(` Connection Structure Debug: ${connectionId}`);
    //console.log(`   ID: ${conn.id}`);
    //console.log(`   Type: ${conn.type}`);
    //console.log(`   Has Style: ${!!conn.style}`);
    //console.log(`   Has Geometry: ${!!conn.geometry}`);
    //console.log(`   Has State: ${!!conn.state}`);
    //console.log(`   Has Basic Metadata: ${!!conn.metadata}`);
    
    if (conn.metadata) {
        //console.log(`   Has Weight: ${conn.metadata.weight !== undefined}`);
        //console.log(`   Has Priority: ${conn.metadata.priority !== undefined}`);
        //console.log(`   Has Frequency: ${conn.metadata.frequency !== undefined}`);
        //console.log(`   Label: "${conn.metadata.label || 'empty'}"`);
    }
    
    //console.log(`   Full Object:`, conn);
}

export function createConnection(startEl, endEl, options = {}) {
    const manager = getConnectionManager();
    
    // Extract IDs if elements are passed
    const startId = typeof startEl === 'string' ? startEl : startEl.id;
    const endId = typeof endEl === 'string' ? endEl : endEl.id;
    
    return manager.createConnection(startId, endId, options);
}

export function updateConnections(specificElementId = null) {
    const manager = getConnectionManager();
    manager.updateConnections(specificElementId);
}

export function deselectConnections() {
    const manager = getConnectionManager();
    manager.deselectAllConnections();
}

export function deleteSelectedConnection() {
    const manager = getConnectionManager();
    if (manager.selectedConnection) {
        return manager.deleteConnection(manager.selectedConnection.id);
    }
    return false;
}

export function stopConnectionDragging() {
    const manager = getConnectionManager();
    
    if (manager.isDragging) {
        manager.isDragging = false;
        manager.dragData = null;
        //console.log('Connection dragging stopped');
    }
}

export function createConnectionLine(conn, index) {
    const manager = getConnectionManager();
    
    const connectionData = {
        id: conn.id || `conn-legacy-${index}`,
        from: conn.from,
        to: conn.to,
        type: conn.type || 'dataflow',
        style: {
            color: conn.style?.color || '#3498db',
            width: conn.style?.width || 2,
            strokeStyle: conn.style?.style || 'solid',
            arrowType: conn.style?.arrowType || 'standard',
            ...conn.style
        },
        geometry: {
            startPoint: conn.startPoint || null,
            endPoint: conn.endPoint || null,
            controlPoints: conn.cornerPoints || [],
            pathData: null
        },
        metadata: {
            label: conn.label || '',
            dependencyType: conn.dependencyType || 'sequential',
            isRequired: conn.isRequired !== false,
            strength: conn.metadata?.strength || 'strong',
            createdAt: conn.metadata?.createdAt || new Date().toISOString(),
            ...conn.metadata
        },
        state: {
            isSelected: false,
            isDirty: true,
            isVisible: true
        }
    };
    
    // Store in new system
    manager.connections.set(connectionData.id, connectionData);
    
    // Calculate geometry and render
    if (manager.calculateConnectionGeometry(connectionData)) {
        manager.renderConnection(connectionData);
    }
    
    //console.log(`Legacy connection converted: ${connectionData.id}`);
}

export function selectConnection(connectionGroup, conn) {
    const manager = getConnectionManager();
    const connectionId = conn.id || connectionGroup.getAttribute('data-connection-id');
    
    if (connectionId) {
        manager.selectConnection(connectionId);
    }
}

export function updateSingleConnection(conn, index) {
    const manager = getConnectionManager();
    
    if (conn.id) {
        manager.markForUpdate(conn.id);
        manager.performUpdates();
    }
}

export function getSelectedConnection() {
    const manager = getConnectionManager();
    return manager.selectedConnection;
}

export function connectionExists(fromId, toId) {
    const manager = getConnectionManager();
    
    for (let connection of manager.connections.values()) {
        if (connection.from === fromId && connection.to === toId) {
            return true;
        }
    }
    return false;
}

export function getAllConnections() {
    const manager = getConnectionManager();
    return Array.from(manager.connections.values());
}

export function removeConnection(connectionId) {
    const manager = getConnectionManager();
    return manager.deleteConnection(connectionId);
}

export function updateConnectionStyle(connectionId, style) {
    const manager = getConnectionManager();
    const connection = manager.connections.get(connectionId);
    
    if (connection) {
        Object.assign(connection.style, style);
        manager.markForUpdate(connectionId);
        manager.performUpdates();
        return true;
    }
    return false;
}

export function setConnectionLabel(connectionId, label) {
    const manager = getConnectionManager();
    const connection = manager.connections.get(connectionId);
    
    if (connection) {
        connection.metadata.label = label;
        manager.markForUpdate(connectionId);
        manager.performUpdates();
        return true;
    }
    return false;
}

export function cleanup() {
    if (globalConnectionManager) {
        globalConnectionManager.cleanup();
        globalConnectionManager = null;
    }
}

export function batchUpdateConnections(connectionUpdates) {
    const manager = getConnectionManager();
    
    //console.log(`Batch updating ${connectionUpdates.length} connections...`);
    
    // Suspend rendering during batch operations
    const renderQueue = new Set();
    
    connectionUpdates.forEach(update => {
        const connection = manager.connections.get(update.connectionId);
        if (connection) {
            // Apply updates
            if (update.style) {
                Object.assign(connection.style, update.style);
            }
            if (update.geometry) {
                Object.assign(connection.geometry, update.geometry);
            }
            if (update.metadata) {
                Object.assign(connection.metadata, update.metadata);
            }
            
            renderQueue.add(update.connectionId);
        }
    });
    
    // Batch render all updated connections
    renderQueue.forEach(connectionId => {
        manager.markForUpdate(connectionId);
    });
    
    // Trigger batch update
    manager.performUpdates();
    
    //console.log(`Batch update complete: ${renderQueue.size} connections updated`);
    
    return {
        updated: renderQueue.size,
        failed: connectionUpdates.length - renderQueue.size
    };
}

export function recalculateAllConnections() {
    const manager = getConnectionManager();
    
    //console.log('Instant recalculating all connections...');
    
    let recalculated = 0;
    manager.connections.forEach(connection => {
        if (manager.calculateConnectionGeometry(connection)) {
            manager.renderConnectionInstant(connection); 
            recalculated++;
        }
    });
    
    //console.log(`Instant recalculated ${recalculated} connections`);
    return recalculated;
}

export function updateConnectionsForElement(elementId) {
    const manager = getConnectionManager();
    manager.updateConnectionsForMovingElement(elementId);
}

export function getConnectionStats() {
    const manager = getConnectionManager();
    
    const stats = {
        total: manager.connections.size,
        byType: {},
        byState: {
            selected: 0,
            dirty: 0,
            visible: 0
        },
        performance: {
            renderQueueSize: manager.renderQueue.size,
            domElementsCount: manager.domElements.size,
            eventListenersCount: manager.eventListeners.size
        }
    };
    
    manager.connections.forEach(conn => {
        // Count by type
        stats.byType[conn.type] = (stats.byType[conn.type] || 0) + 1;
        
        // Count by state
        if (conn.state.isSelected) stats.byState.selected++;
        if (conn.state.isDirty) stats.byState.dirty++;
        if (conn.state.isVisible) stats.byState.visible++;
    });
    
    return stats;
}


export function exportConnectionsForAI() {
    const manager = getConnectionManager();
    const connections = [];
    
    manager.connections.forEach(connection => {
        // Bereite Connection-Data für KI vor
        const aiData = {
            // Basis-Identifikation
            id: connection.id,
            from: connection.from,
            to: connection.to,
            type: connection.type,
            
            // Gewichtete Eigenschaften für KI-Algorithmen
            weight: connection.metadata.weight,
            priority_numeric: {
                'low': 1,
                'normal': 2, 
                'high': 3,
                'critical': 4
            }[connection.metadata.priority] || 2,
            
            frequency_numeric: {
                'rare': 1,
                'occasional': 2,
                'regular': 3,
                'frequent': 4,
                'continuous': 5
            }[connection.metadata.frequency] || 2,
            
            // Kosten-Nutzen-Verhältnis
            cost_per_use: connection.metadata.cost,
            duration_minutes: connection.metadata.duration,
            efficiency_score: connection.metadata.duration > 0 ? 
                (connection.metadata.weight / connection.metadata.duration) : connection.metadata.weight,
            
            // Abhängigkeits-Informationen
            dependency_type: connection.metadata.dependencyType,
            is_required: connection.metadata.isRequired,
            can_be_optimized: connection.metadata.canBeOptimized,
            
            // Business-Eigenschaften
            is_automatizable: connection.metadata.businessRules.automatizable,
            error_rate: connection.metadata.businessRules.errorRate,
            compliance_required: connection.metadata.businessRules.complianceRequired,
            
            // Geometrische Eigenschaften (für Layout-Optimierung)
            geometry: {
                start_point: connection.geometry.startPoint,
                end_point: connection.geometry.endPoint,
                control_points: connection.geometry.controlPoints,
                path_length: calculatePathLength(connection.geometry)
            },
            
            // Aktuelle KI-Analysis
            ai_analysis: connection.metadata.aiAnalysis,
            
            // Labels und Beschreibungen für NLP
            label: connection.metadata.label,
            description: connection.metadata.description,
            
            // Zeitstempel
            created_at: connection.metadata.createdAt,
            last_modified: connection.metadata.lastModified
        };
        
        connections.push(aiData);
    });
    
    return {
        connections: connections,
        connection_types: ConnectionManager.CONNECTION_TYPES,
        export_timestamp: new Date().toISOString(),
        version: "1.0"
    };
}

function calculatePathLength(geometry) {
    if (!geometry.startPoint || !geometry.endPoint) return 0;
    
    let totalLength = 0;
    let currentPoint = geometry.startPoint;
    
    // Über alle Control-Points
    if (geometry.controlPoints && geometry.controlPoints.length > 0) {
        geometry.controlPoints.forEach(point => {
            totalLength += Math.sqrt(
                Math.pow(point.x - currentPoint.x, 2) + 
                Math.pow(point.y - currentPoint.y, 2)
            );
            currentPoint = point;
        });
    }
    
    // Zum Endpunkt
    totalLength += Math.sqrt(
        Math.pow(geometry.endPoint.x - currentPoint.x, 2) + 
        Math.pow(geometry.endPoint.y - currentPoint.y, 2)
    );
    
    return Math.round(totalLength);
}

export function importConnectionsFromAI(connectionsData) {
    const manager = getConnectionManager();
    
    //console.log(`Importing ${connectionsData.connections.length} connections from AI...`);
    
    try {
        // Clear existing connections
        manager.cleanup();
        
        // Re-initialize
        globalConnectionManager = new ConnectionManager();
        const newManager = getConnectionManager();
        
        // Import new connections
        let imported = 0;
        connectionsData.connections.forEach(connData => {
            if (newManager.validateConnection(connData)) {
                newManager.connections.set(connData.id, connData);
                
                // Add to projectData
                const existingIndex = projectData.connections.findIndex(c => c.id === connData.id);
                if (existingIndex >= 0) {
                    projectData.connections[existingIndex] = connData;
                } else {
                    projectData.connections.push(connData);
                }
                
                imported++;
            }
        });
        
        // Render all connections
        newManager.connections.forEach(conn => {
            if (newManager.calculateConnectionGeometry(conn)) {
                newManager.renderConnection(conn);
            }
        });
        
        //console.log(`AI Import complete: ${imported} connections imported`);
        showToast(`${imported} connections imported from AI`, 'success');
        
        return { imported, total: connectionsData.connections.length };
        
    } catch (error) {
        console.error('AI Import failed:', error);
        showToast('AI connection import failed', 'error');
        return { imported: 0, total: 0, error: error.message };
    }
}

window.getConnectionAnalysisData = () => ConnectionManager.prepareConnectionAnalysis();
window.applyConnectionAIResults = (results) => ConnectionManager.applyAIAnalysisResults(results);
window.getConnectionStats = () => ConnectionManager.exportConnectionsForAI();
window.getEnhancedConnectionData = function() {
    const manager = getConnectionManager();
    const analysisData = ConnectionManager.prepareConnectionAnalysis();
    const metrics = {
        total_connections: analysisData.connections.length,
        connection_types: Object.keys(ConnectionManager.CONNECTION_TYPES).reduce((acc, type) => {
            acc[type] = analysisData.connections.filter(conn => conn.type === type).length;
            return acc;
        }, {}),
        avg_weight: analysisData.connections.reduce((sum, conn) => sum + conn.weight, 0) / analysisData.connections.length,
        high_priority_count: analysisData.connections.filter(conn => conn.priority_numeric >= 3).length,
        optimization_candidates: analysisData.connections.filter(conn => conn.can_be_optimized).length
    };
    
    return {
        ...analysisData,
        metrics: metrics
    };
};

export function debugConnections() {
    const manager = getConnectionManager();
    
    //console.group(' Connection Debug Info');
    //console.log(' Stats:', getConnectionStats());
    //console.log(' Connections:', Array.from(manager.connections.entries()));
    //console.log(' Selected:', manager.selectedConnection);
    //console.log(' DOM Elements:', Array.from(manager.domElements.entries()));
    //console.log(' Render Queue:', Array.from(manager.renderQueue));
    console.groupEnd();
    
    return {
        stats: getConnectionStats(),
        connections: Array.from(manager.connections.entries()),
        selected: manager.selectedConnection,
        domElements: manager.domElements.size,
        renderQueue: manager.renderQueue.size
    };
}

export function forceRerenderAll() {
    const manager = getConnectionManager();
    
    //console.log('Force re-rendering all connections...');
    
    manager.connections.forEach((conn, id) => {
        manager.markForUpdate(id);
    });
    
    manager.performUpdates();
    
    //console.log('Force re-render complete');
}

export function handleSegmentTouch(segmentElement, connection, connectionGroup) {
    const manager = getConnectionManager();
    
    //console.log('Touch on connection segment:', connection.id);
    
    // Select the connection
    if (connection.id) {
        manager.selectConnection(connection.id);
        showToast('Connection selected', 'info');
    } else {
        // Fallback for old connection format
        const connId = connectionGroup?.getAttribute('data-connection-id');
        if (connId) {
            manager.selectConnection(connId);
        }
    }
}

export function showMobileConnectionMenu(connectionId, x, y) {
    const manager = getConnectionManager();
    const connection = manager.connections.get(connectionId);
    
    if (!connection) return;
    
    // Create mobile-optimized context menu
    const menu = document.createElement('div');
    menu.className = 'mobile-connection-menu';
    menu.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.9);
        border-radius: 12px;
        padding: 16px;
        z-index: 10000;
        display: flex;
        gap: 12px;
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    `;
    
    const actions = [
        {
            icon: '🎨',
            label: 'Style',
            action: () => manager.showTypeDialog(connectionId)
        },
        {
            icon: '🏷️',
            label: 'Label',
            action: () => manager.addConnectionLabel(connectionId)
        },
        {
            icon: '🗑️',
            label: 'Delete',
            action: () => {
                if (confirm('Delete this connection?')) {
                    manager.deleteConnection(connectionId);
                }
            },
            danger: true
        }
    ];
    
    actions.forEach(action => {
        const button = document.createElement('button');
        button.innerHTML = `${action.icon}<br><span style="font-size:10px;">${action.label}</span>`;
        button.style.cssText = `
            background: ${action.danger ? '#e74c3c' : '#3498db'};
            border: none;
            border-radius: 8px;
            color: white;
            padding: 12px;
            font-size: 16px;
            cursor: pointer;
            min-width: 60px;
            text-align: center;
            transition: all 0.2s ease;
        `;
        
        button.addEventListener('click', () => {
            action.action();
            menu.remove();
        });
        
        button.addEventListener('touchstart', (e) => {
            button.style.transform = 'scale(0.95)';
        });
        
        button.addEventListener('touchend', (e) => {
            button.style.transform = 'scale(1)';
        });
        
        menu.appendChild(button);
    });
    
    document.body.appendChild(menu);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (menu.parentNode) {
            menu.remove();
        }
    }, 5000);
    
    // Remove when touching outside
    const removeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('touchstart', removeMenu);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('touchstart', removeMenu);
    }, 100);
}

if (typeof window !== 'undefined') {
    window.debugConnections = debugConnections;
    window.connectionManager = getConnectionManager;
}