import { 
    projectData,
    setProjectData,
    elementCounter,
    setElementCounter,
    storage,
    panOffset,
    zoomLevel 
} from '../utils/state.js';
import { CONSTANTS } from '../utils/constants.js';
import { createElementDOM, deselectAll } from '../canvas/elements.js';
import { cleanup, getConnectionManager, migrateConnectionData   } from '../canvas/connections.js';
import { showToast } from '../ui/toast.js';
import { saveToHistory } from '../data/history.js'; 
import { loadSwimLanes, updateElementLaneAssignments } from '../canvas/swimlanes.js';
import { getDependencyEngine } from '../canvas/dependencies.js';

const SAVE_FEEDBACK_DURATION = 2000; 
const SAVE_ANIMATION_DURATION = 200;  

// GLOBAL VARIABLES für Export-State Management
let isExporting = false;
let lastExportElement = null;
let exportCache = new Map();

// JSON Export
export function exportProject() {
    try {
        updateElementPositions();
        
        const swimLaneInfo = getSwimLaneAnalysis();
        
        // Metadata
        const enhancedMetadata = {
            // Deine bestehenden Metadaten (UNVERÄNDERT)
            title: "Complexity Assistance Manager Export",
            exportDate: new Date().toISOString(),
            version: CONSTANTS.EXPORT_CONFIG.VERSION,
            appVersion: "1.0",
            elementsCount: projectData.elements.length,
            connectionsCount: projectData.connections.length,
            swimLanesEnabled: swimLaneInfo.enabled,
            swimLanesCount: swimLaneInfo.totalLanes,
            
            // die neuen connection Metadata
            connectionFeatures: {
                enabled: true,
                version: "2.0",
                supportedTypes: ["dataflow", "dependency", "process_step", "physical_transport", "resource_flow"],
                extendedMetadata: true
            },
            
            // Deine bestehenden KI-Metadaten (UNVERÄNDERT)
            aiContext: {
                canvasContext: getCanvasContextData(),
                businessContext: getBusinessContextData(),
                performanceContext: getPerformanceContextData(),
                
                normalizedElements: projectData.elements.map(el => ({
                    id: el.id,
                    type: el.type,
                    normalizedPosition: {
                        x: parseFloat((el.x / CONSTANTS.CANVAS_WIDTH).toFixed(4)),
                        y: parseFloat((el.y / CONSTANTS.CANVAS_HEIGHT).toFixed(4))
                    },
                    relativeSize: {
                        width: parseFloat(((el.width || 120) / CONSTANTS.CANVAS_WIDTH).toFixed(4)),
                        height: parseFloat(((el.height || 80) / CONSTANTS.CANVAS_HEIGHT).toFixed(4))
                    },
                    businessProperties: {
                        status: el.processStatus || 'pending',
                        priority: el.properties?.priority || 'Normal',
                        swimLane: el.swimLane || null,
                        hasDescription: !!(el.properties?.description?.trim())
                    }
                })),
                
                // erweiterte connection analyzis
                connectionPatterns: analyzeConnectionPatterns(),
                
                // erweiterte connection metadata für KI
                enhancedConnections: analyzeConnectionsForAI(),
                
                spatialRelationships: analyzeSpatialRelationships(),
                semanticTags: generateSemanticTags(),
                
                analysisContext: {
                    primaryGoal: "optimize_business_process",
                    focusAreas: ["layout_optimization", "workflow_efficiency", "visual_clarity"],
                    userPreferences: {
                        maintainSwimLanes: swimLaneInfo.enabled,
                        preserveBusinessLogic: true,
                        allowAutomaticRepositioning: true
                    }
                }
            }
        };
        
        // erweiterte connection daten für Export
        const enhancedConnections = projectData.connections.filter(conn => conn && conn.id).map(conn => {
            // stellt die neuen daten sicher
            if (!conn.metadata.weight) {
                const migrated = migrateConnectionData(conn);
                return migrated;
            }
            return conn;
        });
        
        const exportData = {
            metadata: enhancedMetadata,
            project: {
                ...projectData,
                elements: projectData.elements.filter(el => el && el.id).map(el => ({
                    ...el,
                    swimLaneInfo: el.swimLane ? {
                        lane: el.swimLane,
                        laneTitle: el.swimLaneTitle || `Lane ${el.swimLane}`
                    } : null
                })),
                // erweiterte connection daten (ist neu)
                connections: enhancedConnections,
                swimLanes: swimLaneInfo.lanes,
                dependencies: exportDependenciesSafely()
            }
        };
        
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], {
            type: CONSTANTS.EXPORT_CONFIG.MIME_TYPE
        });
        
        const fileName = generateExportFileName();
        downloadFile(URL.createObjectURL(blob), fileName);
        
        // erweiterte success message
        const connectionInfo = enhancedConnections.length > 0 ? 
            ` (${enhancedConnections.length} Verbindungen mit erweiterten Eigenschaften)` : '';
        showToast(`KI-optimiertes Projekt als ${fileName} exportiert${connectionInfo}`, 'success');
        
        //console.log('KI-Metadaten hinzugefügt:', enhancedMetadata.aiContext);
        //console.log('Connection-Features aktiviert:', enhancedMetadata.connectionFeatures);
        
    } catch (error) {
        //console.error('Export-Fehler:', error);
        showToast('Export fehlgeschlagen: ' + error.message, 'error');
    }
}

function analyzeConnectionsForAI() {
    if (!projectData.connections || projectData.connections.length === 0) {
        return { totalConnections: 0, typeDistribution: {}, avgWeight: 0 };
    }
    
    const typeDistribution = {};
    let totalWeight = 0;
    let weightedConnections = 0;
    
    projectData.connections.forEach(conn => {
        // Type-Verteilung
        typeDistribution[conn.type] = (typeDistribution[conn.type] || 0) + 1;
        
        // Gewicht-Analyse (falls vorhanden)
        if (conn.metadata && conn.metadata.weight) {
            totalWeight += conn.metadata.weight;
            weightedConnections++;
        }
    });
    
    return {
        totalConnections: projectData.connections.length,
        typeDistribution: typeDistribution,
        avgWeight: weightedConnections > 0 ? Math.round(totalWeight / weightedConnections) : 0,
        weightedConnectionsCount: weightedConnections,
        hasExtendedMetadata: weightedConnections > 0
    };
}



function loadScript(src) {
    return new Promise((resolve, reject) => {
        // Prüfe ob bereits geladen
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            // Warte kurz falls gerade geladen wird
            setTimeout(resolve, 100);
            return;
        }
        
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        
        script.onload = () => {
            console.log(`Script erfolgreich geladen: ${src}`);
            setTimeout(resolve, 50); // Kurze Verzögerung für Initialisierung
        };
        
        script.onerror = () => {
            console.error(`Script konnte nicht geladen werden: ${src}`);
            reject(new Error(`Failed to load: ${src}`));
        };
        
        document.head.appendChild(script);
    });
}

// PNG Export
export function exportOptimizedPNG() {
    // Prevent concurrent exports
    if (isExporting) {
        showToast('Export bereits in Bearbeitung...', 'warning');
        return Promise.resolve();
    }
    
    isExporting = true;
    
    try {
        updateElementPositions();
        
        const canvas = document.getElementById('canvas');
        const elements = canvas.querySelectorAll('.element-wrapper');
        
        if (elements.length === 0) {
            showToast('Keine Elemente zum Exportieren vorhanden.', 'warning');
            isExporting = false;
            return Promise.resolve();
        }
        
        showToast('Optimiertes PNG wird erstellt...', 'info');
        
        // Cleanup before starting
        cleanupExportElements();
        
        return loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js')
        .then(() => {
            const allConnectionSelectors = `
                .connection-container,
                .connection-group,
                .connection-svg,
                svg[class*="connection"],
                .connection-line
            `;
            const connections = canvas.querySelectorAll(allConnectionSelectors);
            
            const bounds = calculatePreciseBounds(elements, connections);
            //console.log('PNG Export: Elements:', elements.length, 'Connections:', connections.length);
            //console.log('Export Bounds:', bounds);
            
            const exportElement = createPerfectExportElement(bounds);
            
            return window.html2canvas(exportElement, {
                backgroundColor: '#ffffff',
                scale: Math.min(2, 8192 / Math.max(bounds.width, bounds.height)), 
                useCORS: true,
                allowTaint: true,
                logging: false,
                width: bounds.width,
                height: bounds.height,
                x: 0,
                y: 0,
                foreignObjectRendering: false, 
                imageTimeout: 30000,
                ignoreElements: (element) => {
                    return element.tagName === 'IFRAME' || 
                           element.classList.contains('floating-option') ||
                           element.classList.contains('properties-panel') ||
                           element.classList.contains('corner-point-handle');
                }
            }).then(canvasElement => {
                cleanupExportElements();
                return canvasElement;
            });
        })
        .then(canvasElement => {
            if (!canvasElement) {
                throw new Error('Canvas element konnte nicht erstellt werden');
            }
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('PNG-Erstellung timeout'));
                }, 30000);
                
                try {
                    canvasElement.toBlob(blob => {
                        clearTimeout(timeout);
                        
                        if (!blob) {
                            reject(new Error('Blob konnte nicht erstellt werden'));
                            return;
                        }
                        
                        const fileName = generateExportFileNameWithFormat('png');
                        const url = URL.createObjectURL(blob);
                        downloadFile(url, fileName);
                        
                        // Cleanup URL nach download
                        setTimeout(() => {
                            URL.revokeObjectURL(url);
                        }, 1000);
                        
                        showToast(`PNG exportiert: ${fileName}`, 'success');
                        resolve();
                        
                    }, 'image/png', 0.92); 
                    
                } catch (error) {
                    clearTimeout(timeout);
                    reject(error);
                }
            });
        })
        .catch(error => {
            //console.error('PNG-Export-Fehler:', error);
            showToast(`PNG-Export fehlgeschlagen: ${error.message}`, 'error');
            throw error;
        })
        .finally(() => {
            isExporting = false;
            cleanupExportElements();
        });
        
    } catch (error) {
        //console.error('Fehler beim PNG-Export:', error);
        showToast('PNG-Export fehlgeschlagen.', 'error');
        isExporting = false;
        cleanupExportElements();
        return Promise.reject(error);
    }
}


// PDF Export
export function exportWorkingPDF() {
    if (isExporting) {
        showToast('Export bereits in Bearbeitung...', 'warning');
        return;
    }
    
    isExporting = true;
    
    try {
        updateElementPositions();
        
        const canvas = document.getElementById('canvas');
        const elements = canvas.querySelectorAll('.element-wrapper');
        
        if (elements.length === 0) {
            showToast('Keine Elemente zum Exportieren vorhanden.', 'warning');
            isExporting = false;
            return;
        }
        
        showToast('PDF wird erstellt...', 'info');
        
        // Cleanup 
        cleanupExportElements();
        
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
        .then(() => {
            //console.log('jsPDF geladen');
            
            const allConnectionSelectors = `
                .connection-container,
                .connection-group,
                .connection-svg,
                svg
            `;
            const connections = canvas.querySelectorAll(allConnectionSelectors);
            const bounds = calculatePreciseBounds(elements, connections);
            const exportElement = createPerfectExportElement(bounds);
            
            return loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js')
            .then(() => {
                return window.html2canvas(exportElement, {
                    backgroundColor: '#ffffff',
                    scale: 1.2, // Lower scale for PDF
                    useCORS: true,
                    allowTaint: true,
                    width: bounds.width,
                    height: bounds.height,
                    foreignObjectRendering: false
                });
            })
            .then(canvasElement => {
                cleanupExportElements();
                
                if (!canvasElement) {
                    throw new Error('Canvas für PDF konnte nicht erstellt werden');
                }
                
                let imgData;
                try {
                    imgData = canvasElement.toDataURL('image/png', 0.85); 
                    
                    // image data verifizieren
                    if (!imgData || imgData.length < 100 || !imgData.startsWith('data:image/png')) {
                        throw new Error('Ungültige PNG-Daten generiert');
                    }
                    
                } catch (error) {
                    throw new Error(`PNG-Daten-Erstellung fehlgeschlagen: ${error.message}`);
                }
                
                let jsPDF = window.jsPDF || window.jspdf?.jsPDF || window.jspdf;
                
                if (!jsPDF) {
                    throw new Error('jsPDF konnte nicht gefunden werden');
                }
                
                const pdf = new jsPDF({
                    orientation: bounds.width > bounds.height ? 'landscape' : 'portrait',
                    unit: 'mm',
                    format: 'a4'
                });
                
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                const margin = 15;
                
                const imgWidth = pdfWidth - (2 * margin);
                const imgHeight = (bounds.height * imgWidth) / bounds.width;
                
                try {
                    if (imgHeight <= pdfHeight - 40) {
                        pdf.addImage(imgData, 'PNG', margin, 30, imgWidth, imgHeight);
                    } else {
                        const scaledHeight = pdfHeight - 40;
                        const scaledWidth = (bounds.width * scaledHeight) / bounds.height;
                        pdf.addImage(imgData, 'PNG', (pdfWidth - scaledWidth) / 2, 30, scaledWidth, scaledHeight);
                    }
                } catch (pdfError) {
                    throw new Error(`PDF-Bild-Integration fehlgeschlagen: ${pdfError.message}`);
                }
                
                pdf.setFontSize(16);
                pdf.text('Complexity Assistance Manager', margin, 20);
                
                const fileName = generateExportFileNameWithFormat('pdf');
                pdf.save(fileName);
                
                showToast(`PDF exportiert: ${fileName}`, 'success');
                
                // Cleanup image data
                imgData = null;
            });
        })
        .catch(error => {
            //console.error('PDF-Export-Fehler:', error);
            showToast(`PDF-Export fehlgeschlagen: ${error.message}`, 'error');
        })
        .finally(() => {
            isExporting = false;
            cleanupExportElements();
        });
        
    } catch (error) {
        //console.error('Fehler beim PDF-Export:', error);
        showToast('PDF-Export fehlgeschlagen.', 'error');
        isExporting = false;
        cleanupExportElements();
    }
}


function calculatePreciseBounds(elements, connections) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    elements.forEach(element => {
        const rect = element.getBoundingClientRect();
        const canvasRect = document.getElementById('canvas').getBoundingClientRect();
        
        const x = rect.left - canvasRect.left;
        const y = rect.top - canvasRect.top;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + rect.width);
        maxY = Math.max(maxY, y + rect.height);
    });
    
    // Connection bounds
    const connectionSelectors = [
        '.connection-container',
        '.connection-group',
        '.connection-svg',
        'svg',
        '.connection-line'
    ];
    
    let allConnections = [];
    connectionSelectors.forEach(selector => {
        const found = document.querySelectorAll(selector);
        allConnections = [...allConnections, ...Array.from(found)];
    });
    
    allConnections = [...new Set(allConnections)];
    
    allConnections.forEach(conn => {
        if (conn && conn.getBoundingClientRect) {
            const rect = conn.getBoundingClientRect();
            const canvasRect = document.getElementById('canvas').getBoundingClientRect();
            
            if (rect.width > 0 && rect.height > 0) {
                const x = rect.left - canvasRect.left;
                const y = rect.top - canvasRect.top;
                
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + rect.width);
                maxY = Math.max(maxY, y + rect.height);
            }
        }
    });
    
    if (minX === Infinity) {
        return { x: 0, y: 0, width: 800, height: 600 };
    }
    
    const padding = 20;
    let bounds = {
        x: Math.max(0, minX - padding),
        y: Math.max(0, minY - padding),
        width: (maxX - minX) + (2 * padding),
        height: (maxY - minY) + (2 * padding)
    };
    
    // MEMORY LIMIT: Begrenze Canvas-Größe
    const MAX_DIMENSION = 4096;
    const MAX_PIXELS = 16777216; // 4096x4096 = 16MP limit
    
    if (bounds.width > MAX_DIMENSION) {
        //console.warn(`Width zu groß (${bounds.width}), limitiere auf ${MAX_DIMENSION}`);
        bounds.width = MAX_DIMENSION;
    }
    
    if (bounds.height > MAX_DIMENSION) {
        //console.warn(`Height zu groß (${bounds.height}), limitiere auf ${MAX_DIMENSION}`);
        bounds.height = MAX_DIMENSION;
    }
    
    const totalPixels = bounds.width * bounds.height;
    if (totalPixels > MAX_PIXELS) {
        const scale = Math.sqrt(MAX_PIXELS / totalPixels);
        bounds.width = Math.floor(bounds.width * scale);
        bounds.height = Math.floor(bounds.height * scale);
        //console.warn(`Canvas zu groß, skaliere runter: ${bounds.width}x${bounds.height}`);
    }
    
    //console.log('Safe PDF Export Bounds:', bounds);
    return bounds;
}

function createPerfectExportElement(bounds) {
    cleanupExportElements();
    
    const canvas = document.getElementById('canvas');
    
    const exportDiv = document.createElement('div');
    exportDiv.className = 'pdf-export-element'; 
    exportDiv.style.cssText = `
        position: absolute;
        top: -20000px;
        left: -20000px;
        width: ${bounds.width}px;
        height: ${bounds.height}px;
        background: white;
        overflow: hidden;
        transform: none;
        z-index: -1000;
        pointer-events: none;
    `;
    
    const canvasClone = canvas.cloneNode(true);
    canvasClone.style.cssText = `
        position: relative;
        left: ${-bounds.x}px;
        top: ${-bounds.y}px;
        width: ${canvas.offsetWidth}px;
        height: ${canvas.offsetHeight}px;
        transform: none;
        background: transparent;
        pointer-events: none;
    `;
    
    const connectionElements = canvasClone.querySelectorAll(`
        .connection-container,
        .connection-group,
        .connection-svg,
        svg
    `);
    
    connectionElements.forEach(connEl => {
        if (connEl) {
            connEl.style.position = 'absolute';
            connEl.style.zIndex = '1';
            connEl.style.pointerEvents = 'none';
            
            if (connEl.tagName === 'svg' || connEl.querySelector('svg')) {
                const svgs = connEl.tagName === 'svg' ? [connEl] : connEl.querySelectorAll('svg');
                svgs.forEach(svg => {
                    svg.style.cssText += `
                        position: absolute;
                        overflow: visible;
                        pointer-events: none;
                        width: 100%;
                        height: 100%;
                    `;
                    
                    const paths = svg.querySelectorAll('path');
                    paths.forEach(path => {
                        path.style.cssText += `
                            pointer-events: none;
                            stroke-width: ${path.style.strokeWidth || '2'};
                            stroke: ${path.style.stroke || '#3498db'};
                            fill: none;
                        `;
                    });
                    
                    const arrows = svg.querySelectorAll('polygon, .connection-arrow');
                    arrows.forEach(arrow => {
                        arrow.style.cssText += `
                            pointer-events: none;
                            fill: ${arrow.style.fill || '#3498db'};
                        `;
                    });
                });
            }
        }
    });
    
    const toRemove = canvasClone.querySelectorAll(`
        .floating-option,
        .properties-panel,
        .corner-point-handle,
        .line-segment,
        .connection-handle,
        .resize-handle
    `);
    
    toRemove.forEach(el => el.remove());
    
    exportDiv.appendChild(canvasClone);
    document.body.appendChild(exportDiv);
    lastExportElement = exportDiv;
    
    return exportDiv;
}

function cleanupExportElements() {
    if (lastExportElement && lastExportElement.parentNode) {
        lastExportElement.parentNode.removeChild(lastExportElement);
        lastExportElement = null;
    }
    
    const orphanedExports = document.querySelectorAll('.pdf-export-element');
    orphanedExports.forEach(el => {
        if (el.parentNode) {
            el.parentNode.removeChild(el);
        }
    });
    
    exportCache.clear();
    
    if (window.gc) {
        setTimeout(() => window.gc(), 100);
    }
}

function downloadFile(dataUri, fileName) {
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', fileName);
    linkElement.style.display = 'none'; 
    
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);
}

function generateExportFileName() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; 
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); 
    
    return `${CONSTANTS.EXPORT_CONFIG.FILE_PREFIX}_${dateStr}_${timeStr}.json`;
}

function generateExportFileNameWithFormat(format = 'json') {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; 
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); 
    
    const extension = format.toLowerCase();
    return `${CONSTANTS.EXPORT_CONFIG.FILE_PREFIX}_${dateStr}_${timeStr}.${extension}`;
}

// JSON Import Funktion
export function importProjectFromFile() {
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json'; // Nur JSON-Dateien werden akzeptiert
        input.style.display = 'none';
        
        input.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            // Validierung
            const maxSize = 10 * 1024 * 1024; // 10MB Limit für JSON
            if (file.size > maxSize) {
                showToast('JSON-Datei ist zu groß. Maximum 10MB erlaubt.', 'error');
                return;
            }
            
            // Prüfe Dateiendung
            if (!file.name.toLowerCase().endsWith('.json')) {
                showToast('Bitte wählen Sie eine gültige JSON-Datei aus.', 'error');
                return;
            }
            
            processJSONImport(file);
        });
        
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
        
    } catch (error) {
        //console.error('Fehler beim JSON-Import:', error);
        showToast('JSON-Import fehlgeschlagen. Bitte versuchen Sie es erneut.', 'error');
    }
}

function processJSONImport(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const fileContent = e.target.result;
            
            // Backup vom aktuellen Projekt erstellen
            if (projectData.elements.length > 0 || projectData.connections.length > 0) {
                const backupName = `before_import_${Date.now()}`;
                storage.createBackup(projectData, backupName);
                //console.log('Backup erstellt:', backupName);
            }
            
            const success = importProject(fileContent);
            
            if (success) {
                showToast(`Projekt "${file.name}" erfolgreich importiert!`, 'success');
                saveToHistory(`Import Project: ${file.name}`);
            }
            
        } catch (error) {
            //console.error('Fehler beim Verarbeiten der JSON-Datei:', error);
            showToast('JSON-Datei konnte nicht verarbeitet werden. Überprüfen Sie das Format.', 'error');
        }
    };
    
    reader.onerror = () => {
        showToast('Fehler beim Lesen der JSON-Datei.', 'error');
    };
    
    reader.readAsText(file); // Als Text lesen, nicht als DataURL
}

// Image Upload Funktion
export function uploadImage() {
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        
        input.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            // Validierung
            const maxSize = 5 * 1024 * 1024; 
            if (file.size > maxSize) {
                showToast('Bild ist zu groß. Maximum 5MB erlaubt.', 'error');
                return;
            }
            
            const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'];
            if (!allowedTypes.includes(file.type)) {
                showToast('Unterstützte Formate: JPEG, PNG, GIF, SVG', 'error');
                return;
            }
            
            processImageUpload(file);
        });
        
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
        
    } catch (error) {
        //console.error('Fehler beim Bild-Upload:', error);
        showToast('Bild-Upload fehlgeschlagen. Bitte versuchen Sie es erneut.', 'error');
    }
}

function processImageUpload(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const imageData = e.target.result;
            createImageElement(imageData, file.name);
            showToast(`Bild "${file.name}" erfolgreich hinzugefügt`, 'success');
            
        } catch (error) {
            //console.error('Fehler beim Verarbeiten des Bildes:', error);
            showToast('Bild konnte nicht verarbeitet werden.', 'error');
        }
    };
    
    reader.onerror = () => {
        showToast('Fehler beim Lesen der Datei.', 'error');
    };
    
    reader.readAsDataURL(file);
}

function createImageElement(imageSrc, fileName) {
    // Bestimme Position für neues Bild (Mitte des sichtbaren Canvas-Bereichs)
    const canvasContainer = document.querySelector('.canvas-container');
    const containerRect = canvasContainer.getBoundingClientRect();
    
    const x = Math.max(0, (containerRect.width / 2) - 60);
    const y = Math.max(0, (containerRect.height / 2) - 60);
    
    // Element Counter erhöhen
    const newCounter = elementCounter + 1;
    setElementCounter(newCounter);
    
    // Element-Daten erstellen
    const elementData = {
        id: `element-${newCounter}`,
        type: 'image',
        x: x,
        y: y,
        text: fileName.substring(0, 20), // Kurzer Dateiname als Text
        imageSrc: imageSrc,
        width: 120,
        height: 120,
        properties: {
            description: `Hochgeladenes Bild: ${fileName}`,
            category: 'image',
            priority: 'Normal',
            originalFileName: fileName
        }
    };
    
    // DOM-Element erstellen
    const wrapper = createImageDOM(elementData);
    document.getElementById('canvas').appendChild(wrapper);
    
    // Zu Projektdaten hinzufügen
    projectData.elements.push(elementData);
    
    saveToHistory(`Upload Image: ${fileName}`);
}

function createImageDOM(elementData) {
    const wrapper = document.createElement('div');
    wrapper.className = 'element-wrapper image-element';
    wrapper.setAttribute('data-type', 'image');
    wrapper.id = elementData.id;
    wrapper.style.cssText = `
        position: absolute;
        left: ${elementData.x}px;
        top: ${elementData.y}px;
        width: ${elementData.width}px;
        height: ${elementData.height}px;
        cursor: move;
        z-index: 10;
    `;
    
    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-container';
    imageContainer.style.cssText = `
        width: 100%;
        height: 100%;
        border: 2px solid #3498db;
        border-radius: 8px;
        overflow: hidden;
        background: white;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    `;
    
    const img = document.createElement('img');
    img.src = elementData.imageSrc;
    img.style.cssText = `
        max-width: 100%;
        max-height: 80%;
        object-fit: contain;
    `;
    img.alt = elementData.text;
    
    const label = document.createElement('span');
    label.textContent = elementData.text;
    label.style.cssText = `
        font-size: 10px;
        text-align: center;
        padding: 2px;
        word-break: break-word;
        max-height: 20%;
        overflow: hidden;
    `;
    
    imageContainer.appendChild(img);
    imageContainer.appendChild(label);
    wrapper.appendChild(imageContainer);
    
    return wrapper;
}

// synchronisation von DOM und Daten 
function updateElementPositions() {
    projectData.elements.forEach(elementData => {
        const element = document.getElementById(elementData.id);
        if (element && elementData) {
            // Nur Position, Größe und Text synchronisieren
            elementData.x = Math.max(0, Math.min(5000, element.offsetLeft || 0));
            elementData.y = Math.max(0, Math.min(5000, element.offsetTop || 0));
            elementData.width = Math.max(20, element.offsetWidth || 80);
            elementData.height = Math.max(20, element.offsetHeight || 60);
            
            // Text aus DOM synchronisieren
            const textElement = element.querySelector('span');
            if (textElement && textElement.textContent) {
                elementData.text = textElement.textContent;
            }
            
            // Farbe synchronisieren  
            const colorElement = element.querySelector('.shape');
            if (colorElement) {
                const borderColor = window.getComputedStyle(colorElement).borderColor;
                if (borderColor && borderColor !== 'rgb(44, 62, 80)') {
                    elementData.color = borderColor;
                }
            }
        }
    });
}

export function saveProject() {
    const saveBtn = document.querySelector('.save-btn');
    if (!saveBtn) {
        //console.error('Save-Button nicht gefunden');
        return;
    }
    
    const originalText = saveBtn.innerHTML;
    const originalBackground = saveBtn.style.background;
    
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    
    try {
        // Element-Positionen UND Texte vor dem Speichern aktualisieren
        updateElementPositions();
        
        storage.saveProject(projectData); 
        
        const storageInfo = storage.getStorageInfo();
        
        if (storageInfo.persistent) {
            updateSaveButton(saveBtn, 'Projekt gespeichert (dauerhaft)');
            showToast('Projekt erfolgreich gespeichert', 'success');
        } else {
            updateSaveButton(saveBtn, 'Projekt gespeichert (temporär - geht bei Reload verloren)');
            showToast('Projekt temporär gespeichert (geht bei Reload verloren)', 'warning');
        }
        
        saveToHistory('Save Project');
        
    } catch (error) {
        //console.error('Fehler beim Speichern:', error);
        
        updateSaveButton(saveBtn, 'Speichern fehlgeschlagen - Versuchen Sie es erneut');
        showToast('Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.', 'error');
    }
    
    setTimeout(() => {
        resetSaveButton(saveBtn, originalText, originalBackground);
    }, SAVE_FEEDBACK_DURATION);
}

function updateSaveButton(iconButton, text, backgroundColor, title) {
    iconButton.innerHTML = text;
    iconButton.style.background = backgroundColor;
    iconButton.title = title;
    
    iconButton.style.transform = 'scale(1.1)';
    setTimeout(() => {
        iconButton.style.transform = 'scale(1)';
    }, SAVE_ANIMATION_DURATION);
}

function resetSaveButton(iconButton, originalText, originalBackground) {
    iconButton.innerHTML = originalText;
    iconButton.style.background = originalBackground || '#27ae60';
    iconButton.style.transform = 'scale(1)';
    iconButton.title = 'Projekt speichern';
    iconButton.disabled = false; 
}

export function loadProject() {
    try {
        
        const savedProject = storage.loadProject();
        
        //console.log('Geladene Daten aus Storage:', savedProject);
        //console.log('Elemente im Storage:', savedProject?.elements?.length || 0);
        //console.log('Verbindungen im Storage:', savedProject?.connections?.length || 0);
        
        if (!savedProject || !Array.isArray(savedProject.elements)) {
            console.warn('Keine gültigen Projektdaten gefunden, erstelle leeres Projekt');
            setProjectData({ elements: [], connections: [] });
            return;
        }
        
        cleanup();
        
        setProjectData(savedProject);
        
        //console.log('ProjectData nach setProjectData:', projectData);
        
        const canvas = document.getElementById('canvas');
        if (canvas) {
            canvas.innerHTML = '';
        } else {
            //console.error('Canvas nicht gefunden');
            return;
        }
        
        let loadedElements = 0;
        let maxElementId = 0;
        
        savedProject.elements.forEach(elementData => {
            if (elementData && elementData.id) {
                const idMatch = elementData.id.match(/element-(\d+)/);
                if (idMatch) {
                    const id = parseInt(idMatch[1]);
                    if (!isNaN(id) && id > maxElementId) {
                        maxElementId = id;
                    }
                }
            }
        });
        
        if (maxElementId > 0) {
            setElementCounter(maxElementId);
        }
        
        const elementPromises = savedProject.elements.map(elementData => {
            return new Promise((resolve) => {
                try {
                    if (elementData && elementData.id) {
                        let wrapper;
                        
                        if (elementData.type === 'image') {
                            //console.warn('Bild-Elemente werden nicht mehr unterstützt:', elementData);
                            resolve(null);
                            return;
                        }
                        
                        wrapper = createElementDOM(elementData);
                        
                        if (wrapper) {
                            canvas.appendChild(wrapper);
                            loadedElements++;
                            
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    resolve(elementData.id);
                                });
                            });
                        } else {
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                } catch (error) {
                    console.error('Fehler beim Laden von Element:', elementData, error);
                    resolve(null);
                }
            });
        });
        
        // Warte bis ALLE Elemente geladen sind, dann lade Verbindungen
        Promise.all(elementPromises).then((elementIds) => {
            const validElementIds = elementIds.filter(id => id !== null);
            //console.log('Alle Elemente geladen:', validElementIds);
            
            setTimeout(() => {
                loadConnectionsSafely(savedProject.connections);
                
                if (savedProject.connections && savedProject.connections.length > 0) {
                    //console.log('Checking connections for migration...');
                    // Import der Migration-Funktion
                    import('../canvas/connections.js').then(module => {
                        const migrated = module.migrateAllConnections();
                        if (migrated > 0) {
                            //console.log(`Migrated ${migrated} connections to new format`);
                        }
                    }).catch(error => {
                        console.error('Migration import failed:', error);
                    });
                }
                
                if (savedProject.swimLanes) {
                    loadSwimLanes(savedProject.swimLanes);
                }
                
                if (savedProject.dependencies) {
                    importDependenciesSafely(savedProject.dependencies);
                }
                
                initializeDependenciesSafely();
                
            }, 200);
        });
        
        //console.log(`Projekt geladen: ${loadedElements} Elemente, ${savedProject.connections?.length || 0} Verbindungen`);
        
    } catch (error) {
        console.error('Laden fehlgeschlagen:', error);
        showToast('Laden fehlgeschlagen: ' + error.message, 'error');
        
        setProjectData({ elements: [], connections: [] });
        setElementCounter(1);
    }
}

// Sichere Connection-Loading-Funktion
function loadConnectionsSafely(connections) {
    if (!connections || !Array.isArray(connections) || connections.length === 0) {
        //console.log('Keine Verbindungen zu laden');
        return;
    }
    
    //console.log(`Lade ${connections.length} Verbindungen...`);
    
    // Clear existing connections from DOM
    document.querySelectorAll('.connection-group, .connection-line, .connection-container, [data-connection-index]').forEach(conn => {
        conn.remove();
    });
    
    const manager = getConnectionManager();
    manager.cleanup(); // old connections entfernen
    
    let loadedConnections = 0;
    let failedConnections = 0;
    let migratedConnections = 0;
    
    connections.forEach((connData, index) => {
        try {
            if (!connData || !connData.id) {
                //console.warn('Ungültige Connection-Daten:', connData);
                failedConnections++;
                return;
            }
            
            // Check if source and target elements exist
            const fromElement = document.getElementById(connData.from || connData.fromId);
            const toElement = document.getElementById(connData.to || connData.toId);
            
            if (!fromElement) {
                //console.error(`Element nicht gefunden: ${connData.from || connData.fromId}`);
                failedConnections++;
                return;
            }
            
            if (!toElement) {
                //console.error(`Element nicht gefunden: ${connData.to || connData.toId}`);
                failedConnections++;
                return;
            }
            
            // Normalize connection data format
            let normalizedConnection = { ...connData };
            
            // Check if migration needed (old format)
            if (!connData.state || !connData.geometry) {
                normalizedConnection = {
                    id: connData.id,
                    from: connData.from || connData.fromId,
                    to: connData.to || connData.toId,
                    type: connData.type || 'dataflow',
                    style: {
                        color: connData.style?.color || '#3498db',
                        width: connData.style?.width || 2,
                        strokeStyle: connData.style?.style || 'solid',
                        arrowType: connData.style?.arrowType || 'standard'
                    },
                    geometry: {
                        startPoint: connData.startPoint || null,
                        endPoint: connData.endPoint || null,
                        controlPoints: connData.cornerPoints || [],
                        pathData: null
                    },
                    metadata: {
                        label: connData.label || '',
                        dependencyType: connData.dependencyType || 'sequential',
                        isRequired: connData.isRequired !== false,
                        strength: connData.metadata?.strength || 'strong',
                        createdAt: connData.metadata?.createdAt || new Date().toISOString()
                    },
                    state: {
                        isSelected: false,
                        isDirty: true,
                        isVisible: true
                    }
                };
                
                // Update original data
                Object.assign(connData, normalizedConnection);
                migratedConnections++;
            }
            
            // Store in connection manager
            manager.connections.set(normalizedConnection.id, normalizedConnection);
            
            // Calculate geometry and render
            if (manager.calculateConnectionGeometry(normalizedConnection)) {
                manager.renderConnection(normalizedConnection);
                loadedConnections++;
            } else {
                console.warn(`Failed to calculate geometry for connection: ${normalizedConnection.id}`);
                failedConnections++;
            }
            
        } catch (error) {
            //console.error('Fehler beim Laden von Verbindung:', connData, error);
            failedConnections++;
        }
    });
    
    /*
    console.log(`Connection Loading Summary:
        - Loaded: ${loadedConnections}
        - Failed: ${failedConnections} 
        - Migrated: ${migratedConnections}
        - Total: ${connections.length}`); */
    
    return {
        loaded: loadedConnections,
        failed: failedConnections,
        migrated: migratedConnections,
        total: connections.length
    };
}

function exportDependenciesSafely() {
    try {
        const depEngine = getDependencyEngine();
        if (depEngine && typeof depEngine.exportDependencies === 'function') {
            return depEngine.exportDependencies();
        }
        //console.warn('Dependency Engine nicht verfügbar oder exportDependencies() nicht implementiert');
        return [];
    } catch (error) {
        console.error('Fehler beim Exportieren der Dependencies:', error);
        return [];
    }
}

function importDependenciesSafely(dependencies) {
    try {
        if (!dependencies || !Array.isArray(dependencies)) {
            return;
        }
        
        const depEngine = getDependencyEngine();
        if (depEngine && typeof depEngine.importDependencies === 'function') {
            depEngine.importDependencies(dependencies);
        } else {
            //console.warn('Dependency Engine nicht verfügbar für Import');
        }
    } catch (error) {
        console.error('Fehler beim Importieren der Dependencies:', error);
    }
}

function initializeDependenciesSafely() {
    try {
        const depEngine = getDependencyEngine();
        if (depEngine && typeof depEngine.performInitialCheck === 'function') {
            //console.log('Initializing dependencies after project load...');
            setTimeout(() => {
                depEngine.performInitialCheck();
            }, 500);
        }
    } catch (error) {
        console.error('Fehler bei Dependency-Initialisierung:', error);
    }
}

function getSwimLaneAnalysis() {
    const swimLanes = new Set();
    let enabled = false;
    
    projectData.elements.forEach(el => {
        if (el.swimLane) {
            swimLanes.add(el.swimLane);
            enabled = true;
        }
    });
    
    return {
        enabled,
        totalLanes: swimLanes.size,
        lanes: Array.from(swimLanes).sort()
    };
}

function validateProject(data) {
    const errors = [];
    const warnings = [];
    
    if (!data || typeof data !== 'object') {
        errors.push('Ungültiges Datenformat');
        return { valid: false, errors, warnings };
    }
    
    if (!Array.isArray(data.elements)) {
        errors.push('Elemente-Array fehlt oder ist ungültig');
    }
    
    if (!Array.isArray(data.connections)) {
        errors.push('Verbindungen-Array fehlt oder ist ungültig');
    }
    
    data.elements?.forEach((el, index) => {
        if (!el.id) {
            warnings.push(`Element ${index} hat keine ID`);
        }
    });
    
    return { 
        valid: errors.length === 0, 
        errors, 
        warnings,
        elementCount: data.elements?.length || 0,
        connectionCount: data.connections?.length || 0
    };
}

export function importProject(fileContent) {
    try {
        const importData = JSON.parse(fileContent);
        
        const validation = validateProject(importData.project || importData);
        
        if (!validation.valid) {
            showToast(`Import-Fehler: ${validation.errors.join(', ')}`, 'error');
            return false;
        }
        
        if (validation.warnings.length > 0) {
            //console.warn('Import-Warnungen:', validation.warnings);
        }
        
        const projectToImport = importData.project || importData;

        if (projectData.elements.length > 0 || projectData.connections.length > 0) {
            const backupName = `before_import_${Date.now()}`;
            storage.createBackup(projectData, backupName);
        }
        
        cleanup();
        const canvas = document.getElementById('canvas');
        if (canvas) {
            canvas.innerHTML = '';
        }
        
        loadImportedProject(projectToImport);
        
        showToast(`Projekt importiert: ${validation.elementCount} Elemente, ${validation.connectionCount} Verbindungen`, 'success');
        return true;
        
    } catch (error) {
        console.error('Import-Fehler:', error);
        showToast('Import fehlgeschlagen: Ungültige Datei', 'error');
        return false;
    }
}

function loadImportedProject(projectToLoad) {
    try {
        //console.log('=== IMPORT LOAD DEBUG ===');
        //console.log('Lade importiertes Projekt:', projectToLoad);
        
        if (!projectToLoad || !Array.isArray(projectToLoad.elements)) {
            //console.error('Ungültige Projektdaten für Import:', projectToLoad);
            setProjectData({ elements: [], connections: [] });
            return;
        }
        
        // Setze die Daten direkt im State
        setProjectData(projectToLoad);
        
        const canvas = document.getElementById('canvas');
        if (!canvas) {
            console.error('Canvas nicht gefunden');
            return;
        }
        
        let loadedElements = 0;
        let maxElementId = 0;
        
        // Element-Counter berechnen
        projectToLoad.elements.forEach(elementData => {
            if (elementData && elementData.id) {
                const idMatch = elementData.id.match(/element-(\d+)/);
                if (idMatch) {
                    const id = parseInt(idMatch[1]);
                    if (!isNaN(id) && id > maxElementId) {
                        maxElementId = id;
                    }
                }
            }
        });
        
        if (maxElementId > 0) {
            setElementCounter(maxElementId);
        }
        
        //console.log('Erstelle Elemente:', projectToLoad.elements.length);
        
        projectToLoad.elements.forEach((elementData, index) => {
            try {
                if (elementData && elementData.id) {
                    if (elementData.type === 'image') {
                        //console.warn('Bild-Elemente werden nicht mehr unterstützt:', elementData);
                        return;
                    }
                    
                    //console.log(`Erstelle Element ${index + 1}/${projectToLoad.elements.length}:`, elementData.id);
                    
                    const wrapper = createElementDOM(elementData);
                    
                    if (wrapper) {
                        canvas.appendChild(wrapper);
                        loadedElements++;
                        
                        // Position sofort setzen
                        wrapper.style.left = (elementData.x || 0) + 'px';
                        wrapper.style.top = (elementData.y || 0) + 'px';
                        
                        //console.log('Element erfolgreich erstellt:', elementData.id);
                    } 
                }
            } catch (error) {
                console.error('Fehler beim Erstellen von Element:', elementData, error);
            }
        });
        
      //console.log(`Elemente erstellt: ${loadedElements}/${projectToLoad.elements.length}`);
        
        // Nach kurzer Verzögerung Verbindungen laden
        setTimeout(() => {
          //console.log('Lade Verbindungen...');
            loadConnectionsSafely(projectToLoad.connections);
            
            // Weitere Features laden
            if (projectToLoad.swimLanes) {
                loadSwimLanes(projectToLoad.swimLanes);
            }
            
            if (projectToLoad.dependencies) {
                importDependenciesSafely(projectToLoad.dependencies);
            }
            
            // Nach dem Import in Storage speichern
            storage.saveProject(projectToLoad);
            
            // UI Updates
            setTimeout(() => {
                updateElementLaneAssignments();
                initializeDependenciesSafely();
                deselectAll();
                
             // console.log('Import abgeschlossen!');
            }, 100);
            
        }, 100);
        
    } catch (error) {
        console.error('Fehler beim Laden des importierten Projekts:', error);
        showToast('Fehler beim Laden: ' + error.message, 'error');
    }
}


function getStatusStatistics() {
    const stats = {
        pending: 0,
        active: 0,
        completed: 0,
        blocked: 0,
        archived: 0,
        total: projectData.elements.length
    };
    
    projectData.elements.forEach(element => {
        const status = element.processStatus || 'pending';
        if (stats.hasOwnProperty(status)) {
            stats[status]++;
        }
    });
    
    return stats;
}

function calculateCompletionRate() {
    const total = projectData.elements.length;
    if (total === 0) return 0;
    
    const completed = projectData.elements.filter(el => el.processStatus === 'completed').length;
    return Math.round((completed / total) * 100);
}

function calculateWorkflowHealth() {
    const stats = getStatusStatistics();
    const total = stats.total;
    
    if (total === 0) return 100;
    
    // Gesunde Verteilung: wenige blockierte, viele aktive/abgeschlossene
    const healthScore = Math.max(0, Math.min(100, 
        100 - (stats.blocked / total * 50) + (stats.completed / total * 30)
    ));
    
    return Math.round(healthScore);
}

function calculateAvgProcessingTime() {
    const completedElements = projectData.elements.filter(el => 
        el.processStatus === 'completed' && 
        el.processMetadata?.startDate && 
        el.processMetadata?.endDate
    );
    
    if (completedElements.length === 0) return 0;
    
    const totalTime = completedElements.reduce((sum, el) => {
        const start = new Date(el.processMetadata.startDate);
        const end = new Date(el.processMetadata.endDate);
        return sum + (end - start);
    }, 0);
    
    const avgMilliseconds = totalTime / completedElements.length;
    return Math.round(avgMilliseconds / (1000 * 60 * 60 * 24)); // Tage
}

function calculateWorkflowEfficiency() {
    const stats = getStatusStatistics();
    const total = stats.total;
    
    if (total === 0) return 100;
    
    // Effizienz basiert auf Verhältnis von completed/active zu blocked
    const productive = stats.completed + stats.active;
    const efficiency = Math.round((productive / total) * 100);
    
    return Math.max(0, Math.min(100, efficiency));
}


// CANVAS & LAYOUT-KONTEXT (für räumliche KI-Analyse)
function getCanvasContextData() {
    const containerRect = document.querySelector('.canvas-container')?.getBoundingClientRect();
    
    return {
        canvasSize: {
            width: CONSTANTS.CANVAS_WIDTH,
            height: CONSTANTS.CANVAS_HEIGHT
        },
        viewportInfo: {
            currentZoom: zoomLevel,
            panOffset: { ...panOffset },
            containerSize: containerRect ? {
                width: Math.round(containerRect.width),
                height: Math.round(containerRect.height)
            } : null
        },
        layoutMetrics: {
            elementDensity: calculateElementDensity(),
            averageConnectionDistance: calculateAverageConnectionDistance(),
            elementClusters: detectElementClusters().length,
            overlappingElements: findOverlappingElements().length
        }
    };
}

// BUSINESS-KONTEXT (für prozessspezifische KI-Analyse)
function getBusinessContextData() {
    const depEngine = getDependencyEngine();
    const dependencyReport = depEngine ? depEngine.generateDependencyReport() : null;
    
    return {
        domainInfo: {
            processType: determineProcessType(),
            complexityLevel: calculateProcessComplexity(),
            estimatedDuration: "unknown", // Kann später erweitert werden
            industryContext: "general"
        },
        processMetrics: {
            criticalPathLength: dependencyReport?.criticalPath?.length || 0,
            parallelismPotential: calculateParallelismPotential(),
            bottleneckCount: dependencyReport?.bottlenecks?.length || 0,
            cyclicDependencies: dependencyReport?.dependencyMetrics?.cyclicDependencies || 0
        },
        statusDistribution: getStatusDistribution(),
        swimLaneAnalysis: getSwimLaneAnalysis()
    };
}


// PERFORMANCE & QUALITÄTSDATEN (für optimierungsspezifische KI-Analyse)
function getPerformanceContextData() {
    const issues = {
        overlappingElements: findOverlappingElements(),
        longConnections: findLongConnections(),
        isolatedElements: findIsolatedElements(),
        layoutIssues: detectLayoutIssues()
    };
    
    return {
        currentIssues: {
            overlappingCount: issues.overlappingElements.length,
            longConnectionCount: issues.longConnections.length, 
            isolatedElementCount: issues.isolatedElements.length,
            layoutScore: calculateLayoutScore(issues)
        },
        optimizationTargets: {
            primary: "reduce_visual_complexity",
            secondary: ["minimize_overlaps", "optimize_connections", "improve_flow"],
            constraints: ["maintain_business_logic", "preserve_swim_lanes"]
        },
        qualityMetrics: {
            readabilityScore: calculateReadabilityScore(),
            efficiencyScore: calculateEfficiencyScore(),
            maintenanceScore: calculateMaintenanceScore()
        }
    };
}


// ERWEITERTE EXPORT-FUNKTION MIT KI-OPTIMIERTEN METADATEN
export function exportProjectWithKIMetadata() {
    try {
        updateElementPositions();
        
        // Ihre bestehenden Metadaten + KI-Erweiterungen
        const enhancedMetadata = {
            ...getBasicMetadata(), // Ihre aktuelle metadata-Struktur
            
            // NEUE KI-OPTIMIERTE METADATEN:
            aiContext: {
                canvasContext: getCanvasContextData(),
                businessContext: getBusinessContextData(),
                performanceContext: getPerformanceContextData(),
                
                // Normalisierte Koordinaten für KI (0-1 Bereich)
                normalizedElements: projectData.elements.map(el => ({
                    id: el.id,
                    normalizedPosition: {
                        x: el.x / 1920, // Normalisiert auf Canvas-Breite
                        y: el.y / 1080  // Normalisiert auf Canvas-Höhe
                    },
                    relativeSize: {
                        width: el.width / 1920,
                        height: el.height / 1080
                    }
                })),
                
                // Verbindungs-Analyse für KI
                connectionAnalysis: analyzeConnectionPatterns(),
                
                // Räumliche Beziehungen für Layout-Optimierung
                spatialRelationships: analyzeSpatialRelationships(),
                
                // Semantische Tags für besseres KI-Verständnis
                semanticTags: generateSemanticTags()
            }
        };
        
        const exportData = {
            metadata: enhancedMetadata,
            project: {
                ...projectData,
                // Zusätzliche KI-relevante Daten
                processFlow: generateProcessFlowDescription(),
                businessRules: extractBusinessRules(),
                optimizationTargets: defineOptimizationTargets()
            }
        };
        
        // Export wie gewohnt
        downloadJSON(exportData, `CAM_Export_Enhanced_${new Date().toISOString().slice(0,10)}.json`);
        
        showToast('KI-optimierter Export erfolgreich!', 'success');
        return exportData;
        
    } catch (error) {
        console.error('Fehler beim KI-optimierten Export:', error);
        showToast('Export fehlgeschlagen', 'error');
        return null;
    }
}

function defineOptimizationTargets() {
    return {
        primary: "reduce_cycle_time",      // Hauptziel: Zykluszeit reduzieren
        secondary: [
            "minimize_bottlenecks",        // Engpässe minimieren
            "improve_parallelization",     // Parallelisierung verbessern
            "optimize_layout"              // Layout optimieren
        ],
        constraints: [
            "maintain_compliance",         // Compliance beibehalten
            "preserve_dependencies",       // Abhängigkeiten erhalten
            "keep_swim_lanes"             // SwimLanes beibehalten
        ]
    };
}

function calculateElementDensity() {
    if (projectData.elements.length === 0) return 0;
    const totalArea = CONSTANTS.CANVAS_WIDTH * CONSTANTS.CANVAS_HEIGHT;
    const occupiedArea = projectData.elements.reduce((sum, el) => 
        sum + (el.width || 120) * (el.height || 80), 0
    );
    return parseFloat((occupiedArea / totalArea).toFixed(4));
}

function calculateAverageConnectionDistance() {
    if (projectData.connections.length === 0) return 0;
    
    const totalDistance = projectData.connections.reduce((sum, conn) => {
        const fromEl = projectData.elements.find(el => el.id === conn.from);
        const toEl = projectData.elements.find(el => el.id === conn.to);
        
        if (fromEl && toEl) {
            const dx = toEl.x - fromEl.x;
            const dy = toEl.y - fromEl.y;
            return sum + Math.sqrt(dx * dx + dy * dy);
        }
        return sum;
    }, 0);
    
    return Math.round(totalDistance / projectData.connections.length);
}

function detectElementClusters() {
    const clusters = [];
    const processed = new Set();
    const clusterDistance = 200; // Pixel
    
    projectData.elements.forEach(el1 => {
        if (processed.has(el1.id)) return;
        
        const cluster = [el1];
        processed.add(el1.id);
        
        projectData.elements.forEach(el2 => {
            if (processed.has(el2.id)) return;
            
            const distance = Math.sqrt(
                Math.pow(el1.x - el2.x, 2) + Math.pow(el1.y - el2.y, 2)
            );
            
            if (distance < clusterDistance) {
                cluster.push(el2);
                processed.add(el2.id);
            }
        });
        
        if (cluster.length > 1) {
            clusters.push(cluster);
        }
    });
    
    return clusters;
}

function findOverlappingElements() {
    const overlapping = [];
    for (let i = 0; i < projectData.elements.length; i++) {
        for (let j = i + 1; j < projectData.elements.length; j++) {
            const el1 = projectData.elements[i];
            const el2 = projectData.elements[j];
            
            if (elementsOverlap(el1, el2)) {
                overlapping.push({ el1: el1.id, el2: el2.id });
            }
        }
    }
    return overlapping;
}

function elementsOverlap(el1, el2) {
    const buffer = 10; 
    return !(
        el1.x + (el1.width || 120) + buffer < el2.x ||
        el2.x + (el2.width || 120) + buffer < el1.x ||
        el1.y + (el1.height || 80) + buffer < el2.y ||
        el2.y + (el2.height || 80) + buffer < el1.y
    );
}

function findLongConnections() {
    const longConnections = [];
    const maxDistance = 400; // Pixel
    
    projectData.connections.forEach(conn => {
        const fromEl = projectData.elements.find(el => el.id === conn.from);
        const toEl = projectData.elements.find(el => el.id === conn.to);
        
        if (fromEl && toEl) {
            const distance = Math.sqrt(
                Math.pow(toEl.x - fromEl.x, 2) + Math.pow(toEl.y - fromEl.y, 2)
            );
            
            if (distance > maxDistance) {
                longConnections.push({
                    connectionId: conn.id,
                    distance: Math.round(distance)
                });
            }
        }
    });
    
    return longConnections;
}

function findIsolatedElements() {
    return projectData.elements.filter(el => {
        const hasConnections = projectData.connections.some(conn => 
            conn.from === el.id || conn.to === el.id
        );
        return !hasConnections;
    });
}

function calculateProcessComplexity() {
    const elementCount = projectData.elements.length;
    const connectionCount = projectData.connections.length;
    const depEngine = getDependencyEngine();
    const cyclicDeps = depEngine ? (depEngine.findCircularDependencies()?.length || 0) : 0;
    
    // Score 1-10
    const score = Math.min(10, Math.max(1,
        Math.round(
            (elementCount * 0.1) + 
            (connectionCount * 0.15) + 
            (cyclicDeps * 2) + 
            (projectData.swimLanes?.length || 0) * 0.5
        )
    ));
    
    return score;
}

function determineProcessType() {
    const hasDecisions = projectData.elements.some(el => el.type === 'diamond');
    const hasMultipleLanes = (projectData.swimLanes?.length || 0) > 1;
    const hasApprovals = projectData.elements.some(el => 
        el.text?.toLowerCase().includes('approval') || 
        el.text?.toLowerCase().includes('genehmigung')
    );
    
    if (hasApprovals) return 'approval_workflow';
    if (hasDecisions) return 'decision_process';
    if (hasMultipleLanes) return 'cross_functional_workflow';
    return 'linear_workflow';
}

function calculateParallelismPotential() {
    // Vereinfachte Berechnung: Zähle Elemente ohne eingehende Abhängigkeiten
    const elementsWithoutDependencies = projectData.elements.filter(el => {
        return !projectData.connections.some(conn => conn.to === el.id);
    });
    
    return Math.min(5, elementsWithoutDependencies.length);
}

function getStatusDistribution() {
    const distribution = { pending: 0, active: 0, completed: 0, blocked: 0, archived: 0 };
    
    projectData.elements.forEach(el => {
        const status = el.processStatus || 'pending';
        if (distribution.hasOwnProperty(status)) {
            distribution[status]++;
        }
    });
    
    return distribution;
}

function analyzeConnectionPatterns() {
    const patterns = {
        totalConnections: projectData.connections.length,
        averageConnections: projectData.elements.length > 0 ? 
            Math.round(projectData.connections.length / projectData.elements.length * 10) / 10 : 0,
        hubElements: [],
        sequentialChains: 0,
        parallelBranches: 0
    };
    
    // Hub-Elemente identifizieren
    projectData.elements.forEach(el => {
        const inDegree = projectData.connections.filter(c => c.to === el.id).length;
        const outDegree = projectData.connections.filter(c => c.from === el.id).length;
        
        if (inDegree + outDegree >= 4) {
            patterns.hubElements.push({
                id: el.id,
                name: el.text,
                totalConnections: inDegree + outDegree
            });
        }
    });
    
    return patterns;
}

function analyzeSpatialRelationships() {
    return {
        elementDistribution: {
            leftHalf: projectData.elements.filter(el => el.x < CONSTANTS.CANVAS_WIDTH / 2).length,
            rightHalf: projectData.elements.filter(el => el.x >= CONSTANTS.CANVAS_WIDTH / 2).length,
            topHalf: projectData.elements.filter(el => el.y < CONSTANTS.CANVAS_HEIGHT / 2).length,
            bottomHalf: projectData.elements.filter(el => el.y >= CONSTANTS.CANVAS_HEIGHT / 2).length
        },
        centerOfMass: calculateCenterOfMass(),
        boundingBox: calculateBoundingBox()
    };
}

function generateSemanticTags() {
    const tags = [];
    
    // Type-basierte Tags
    const typeDistribution = {};
    projectData.elements.forEach(el => {
        typeDistribution[el.type] = (typeDistribution[el.type] || 0) + 1;
    });
    
    Object.entries(typeDistribution).forEach(([type, count]) => {
        if (count >= 3) tags.push(`many_${type}s`);
        if (count === 1) tags.push(`single_${type}`);
    });
    
    // SwimLane Tags
    if (projectData.swimLanes?.length > 2) tags.push('complex_organization');
    if (projectData.swimLanes?.length === 2) tags.push('two_department_process');
    
    // Complexity Tags
    const complexity = calculateProcessComplexity();
    if (complexity >= 7) tags.push('high_complexity');
    else if (complexity >= 4) tags.push('medium_complexity');
    else tags.push('low_complexity');
    
    // Connection Tags
    const avgConnections = projectData.connections.length / Math.max(1, projectData.elements.length);
    if (avgConnections >= 2) tags.push('highly_connected');
    else if (avgConnections < 0.5) tags.push('loosely_connected');
    
    return tags;
}

function calculateCenterOfMass() {
    if (projectData.elements.length === 0) return { x: 0, y: 0 };
    
    const sumX = projectData.elements.reduce((sum, el) => sum + el.x, 0);
    const sumY = projectData.elements.reduce((sum, el) => sum + el.y, 0);
    
    return {
        x: Math.round(sumX / projectData.elements.length),
        y: Math.round(sumY / projectData.elements.length)
    };
}

function calculateBoundingBox() {
    if (projectData.elements.length === 0) return null;
    
    const xs = projectData.elements.map(el => el.x);
    const ys = projectData.elements.map(el => el.y);
    
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
    };
}

function detectLayoutIssues() {
    return {
        hasOverlaps: findOverlappingElements().length > 0,
        hasLongConnections: findLongConnections().length > 0,
        hasIsolatedElements: findIsolatedElements().length > 0,
        isUnbalanced: checkLayoutBalance()
    };
}

function checkLayoutBalance() {
    const centerOfMass = calculateCenterOfMass();
    const canvasCenter = { 
        x: CONSTANTS.CANVAS_WIDTH / 2, 
        y: CONSTANTS.CANVAS_HEIGHT / 2 
    };
    
    const distance = Math.sqrt(
        Math.pow(centerOfMass.x - canvasCenter.x, 2) + 
        Math.pow(centerOfMass.y - canvasCenter.y, 2)
    );
    
    return distance > 300; // Unbalanced wenn Center of Mass > 300px vom Zentrum entfernt
}

function calculateLayoutScore(issues) {
    let score = 100;
    score -= issues.overlappingElements.length * 10;
    score -= issues.longConnections.length * 5;
    score -= issues.isolatedElements.length * 8;
    return Math.max(0, score);
}

function calculateReadabilityScore() {
    let score = 100;
    score -= findOverlappingElements().length * 15;
    score -= Math.max(0, findLongConnections().length - 2) * 10;
    if (calculateElementDensity() > 0.3) score -= 20;
    return Math.max(0, score);
}

function calculateEfficiencyScore() {
    const depEngine = getDependencyEngine();
    if (!depEngine) return 75; // Default wenn Dependency Engine nicht verfügbar
    
    let score = 100;
    const report = depEngine.generateDependencyReport();
    score -= (report.dependencyMetrics?.cyclicDependencies || 0) * 20;
    score -= (report.bottlenecks?.length || 0) * 15;
    score -= findIsolatedElements().length * 10;
    return Math.max(0, score);
}

function calculateMaintenanceScore() {
    let score = 100;
    const emptyDescriptions = projectData.elements.filter(el => 
        !el.properties?.description?.trim()
    ).length;
    
    score -= emptyDescriptions * 5;
    if (projectData.elements.length > 20) score -= 10; // Komplexitäts-Penalty
    return Math.max(0, score);
}

export { 
    getStatusStatistics, 
    calculateCompletionRate, 
    calculateWorkflowHealth, 
    calculateAvgProcessingTime, 
    calculateWorkflowEfficiency 
};