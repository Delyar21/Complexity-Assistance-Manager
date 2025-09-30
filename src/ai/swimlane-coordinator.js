// Koordiniert alle Swimlane- und Position-Operationen ohne Konflikte
import { showToast } from '../ui/toast.js';
import { recalculateAllConnections } from '../canvas/connections.js';
import { projectData } from '../utils/state.js';

export class SwimlaneCoordinator {
    constructor() {
        this.processedElements = new Set();
        this.swimlaneMapping = new Map(); // Element-ID -> finale Swimlane
        this.positionMapping = new Map();  // Element-ID -> finale Position
    }
    
    // Hauptfunktion: Koordinierte Optimierung
    async coordinateOptimization(analysis) {
        // console.log('Koordinierte Swimlane + Position Optimierung startet...');
        
        this.processedElements.clear();
        this.swimlaneMapping.clear();
        this.positionMapping.clear();
        
        let totalChanges = 0;
        
        try {
            // Phase 1: Analysiere und plane alle Änderungen
            await this.analyzeOptimizations(analysis);
            
            // Phase 2: Führe geplante Änderungen aus
            totalChanges = await this.executeOptimizations();
            
            // Phase 3: Finalisierung
            await this.finalizeOptimizations();
            
            return totalChanges;
            
        } catch (error) {
            console.error('Koordinierte Optimierung fehlgeschlagen:', error);
            showToast('Optimierung teilweise fehlgeschlagen', 'warning');
            return 0;
        }
    }
    
    async analyzeOptimizations(analysis) {
        // console.log('Analysiere Optimierungsplan...');
        
        if (analysis.swimlane_optimierung?.lane_assignments) {
            analysis.swimlane_optimierung.lane_assignments.forEach(assignment => {
                const element = this.findElementByTextContent(assignment.element_id);
                if (element) {
                    // Erstelle Swimlane falls nötig
                    this.ensureSwimlaneExists(assignment.recommended_lane);
                    
                    this.swimlaneMapping.set(element.id, {
                        swimlane: assignment.recommended_lane,
                        reason: assignment.reason,
                        element: element
                    });
                    
                    // console.log(`Geplant: ${element.text} -> ${assignment.recommended_lane}`);
                }
            });
        }
        
        // Position-Optimierungen sammeln
        if (analysis.layout_optimierung?.optimized_positions) {
            analysis.layout_optimierung.optimized_positions.forEach(pos => {
                const element = this.findElementByTextContent(pos.element_id);
                if (element) {
                    // Bestimme finale Swimlane (Swimlane-Zuordnung hat Priorität)
                    let finalSwimlane = this.swimlaneMapping.get(element.id)?.swimlane || 
                                       pos.swimlane || 
                                       element.swimLane;
                    
                    // Berechne korrekte Y-Position basierend auf finaler Swimlane
                    let correctedY = pos.y; // Erstmal Original-Y verwenden
                    if (finalSwimlane && window.swimLanes) {
                        // Prüfe ob Swimlane existiert und sichtbar ist
                        const lane = window.swimLanes.find(l => l.id === finalSwimlane);
                        if (lane) {
                            correctedY = this.calculateSwimlaneYPosition(finalSwimlane, 0); // 0 = Mitte der Lane
                        }
                    }
                    
                    this.positionMapping.set(element.id, {
                        x: pos.x,
                        y: correctedY,
                        originalY: pos.y,
                        swimlane: finalSwimlane,
                        reason: pos.reason,
                        element: element
                    });
                    
                    // console.log(`Geplant: ${element.text} -> (${pos.x}, ${correctedY}) in ${finalSwimlane}`);
                }
            });
        }
        
        this.detectConflicts();
    }
    
    // Führe alle geplanten Änderungen aus
    async executeOptimizations() {
        // console.log('Führe geplante Optimierungen aus...');
        
        let totalChanges = 0;
        const processedElements = new Set();
        
        // Swimlane-Zuordnungen anwenden
        for (const [elementId, swimlaneData] of this.swimlaneMapping) {
            const { element, swimlane, reason } = swimlaneData;
            
            if (element.swimLane !== swimlane) {
                element.swimLane = swimlane;
                
                const domElement = document.getElementById(elementId);
                if (domElement) {
                    domElement.setAttribute('data-swimlane', swimlane);
                }
                
                processedElements.add(elementId);
                totalChanges++;
                // console.log(`Swimlane angewendet: ${element.text} -> ${swimlane} (${reason})`);
            }
        }
        
        // Positionen anwenden
        for (const [elementId, positionData] of this.positionMapping) {
            const { element, x, y, swimlane, reason } = positionData;
            
            // DOM aktualisieren
            const domElement = document.getElementById(elementId);
            if (domElement) {
                domElement.style.left = x + 'px';
                domElement.style.top = y + 'px';
            }
            
            // Projektdaten aktualisieren
            element.x = x;
            element.y = y;
            
            if (!processedElements.has(elementId)) {
                totalChanges++;
            }
            
            // console.log(`Position angewendet: ${element.text} -> (${x}, ${y}) in ${swimlane} (${reason})`);
        }
        
        return totalChanges;
    }
    
    async finalizeOptimizations() {
       // console.log('Finalisiere Optimierungen...');
        
        // Verbindungen neu berechnen
        await this.recalculateConnectionsWithDelay();
        
        // UI-Updates
        this.updateSwimlaneVisuals();
    }
    
    // Hilfsfunktionen
    findElementByTextContent(searchText) {
        const elements = projectData.elements || [];
        
        // Direkte ID-Suche
        if (searchText.startsWith('element-')) {
            const directMatch = elements.find(el => el.id === searchText);
            if (directMatch) return directMatch;
        }
        
        // Text-basierte Suche
        const normalizedSearch = searchText.toLowerCase().trim();
        return elements.find(element => {
            if (!element.text) return false;
            const normalizedElementText = element.text.toLowerCase().trim();
            return normalizedElementText === normalizedSearch ||
                   normalizedElementText.includes(normalizedSearch) ||
                   normalizedSearch.includes(normalizedElementText);
        });
    }
    
    ensureSwimlaneExists(swimlaneId) {
        if (window.ensureSwimlaneExists) {
            const capitalizedName = swimlaneId.charAt(0).toUpperCase() + swimlaneId.slice(1);
            return window.ensureSwimlaneExists(swimlaneId, capitalizedName);
        }
        return null;
    }
    
    calculateSwimlaneYPosition(swimlaneId, relativeY = 0) {
        if (window.calculateSwimlaneYPosition) {
            return window.calculateSwimlaneYPosition(swimlaneId, relativeY - 100);
        }
        
        // Fallback: Einfache Berechnung
        if (!window.swimLanes) return relativeY;
        
        let currentY = 0;
        for (const lane of window.swimLanes) {
            if (lane.id === swimlaneId) {
                return currentY + (lane.height / 2);
            }
            currentY += lane.height;
        }
        
        return relativeY;
    }
    
    detectConflicts() {
        // console.log('Prüfe auf Konflikte...');
        
        let conflicts = 0;
        
        // Prüfe Position vs Swimlane Konflikte
        for (const [elementId, positionData] of this.positionMapping) {
            const swimlaneData = this.swimlaneMapping.get(elementId);
            
            if (swimlaneData && positionData.swimlane !== swimlaneData.swimlane) {
                // console.warn(`Konflikt bei ${positionData.element.text}: Position will ${positionData.swimlane}, Swimlane-Zuordnung will ${swimlaneData.swimlane}`);
                
                // Swimlane-Zuordnung hat Priorität
                positionData.swimlane = swimlaneData.swimlane;
                positionData.y = this.calculateSwimlaneYPosition(swimlaneData.swimlane, positionData.originalY);
                
                conflicts++;
            }
        }
        
        if (conflicts > 0) {
            // console.log(`${conflicts} Konflikte automatisch gelöst`);
        }
    }
    
    async recalculateConnectionsWithDelay() {
        const delays = [100, 150, 250];
        
        for (const delay of delays) {
            await new Promise(resolve => setTimeout(resolve, delay));
            const result = recalculateAllConnections();
            // console.log(`Verbindungen neu berechnet (${delay}ms): ${result}`);
        }
    }
    
    updateSwimlaneVisuals() {
        // Swimlane-Darstellung aktualisieren falls sichtbar
        if (window.swimLanesVisible && window.showSwimLanes) {
            window.showSwimLanes();
        }
        
        // Element-Zähler aktualisieren
        if (window.updateAllLaneInfoBadges) {
            window.updateAllLaneInfoBadges();
        }
    }
    
    /* Debug-Funktionen
    getOptimizationSummary() {
        return {
            plannedSwimlaneChanges: this.swimlaneMapping.size,
            plannedPositionChanges: this.positionMapping.size,
            affectedElements: new Set([
                ...this.swimlaneMapping.keys(),
                ...this.positionMapping.keys()
            ]).size
        };
    }
    
    debugOptimizationPlan() {
        console.group('OPTIMIERUNGS-PLAN DEBUG');
        
        console.log('Geplante Swimlane-Änderungen:');
        for (const [elementId, data] of this.swimlaneMapping) {
            console.log(`  ${data.element.text} -> ${data.swimlane} (${data.reason})`);
        }
        
        console.log('Geplante Position-Änderungen:');
        for (const [elementId, data] of this.positionMapping) {
            console.log(`  ${data.element.text} -> (${data.x}, ${data.y}) in ${data.swimlane}`);
        }
        
        console.log('Zusammenfassung:', this.getOptimizationSummary());
        
        console.groupEnd();
    }
    */
}

// Exportiere Singleton-Instanz
export const swimlaneCoordinator = new SwimlaneCoordinator();

// Global verfügbare Funktionen
window.debugOptimizationPlan = () => swimlaneCoordinator.debugOptimizationPlan();
window.coordinateOptimization = (analysis) => swimlaneCoordinator.coordinateOptimization(analysis);
