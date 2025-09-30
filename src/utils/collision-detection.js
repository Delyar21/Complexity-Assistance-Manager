import { CONSTANTS } from './constants.js';
import { projectData } from './state.js';

export class CollisionManager {
    constructor() {
        this.COLLISION_PADDING = 20; 
        this.MAX_ATTEMPTS = 50; 
    }

    validateAndCorrectPositions(optimizedPositions) {
        //console.log('Kollisionsprüfung für', optimizedPositions.length, 'Elemente');
        
        const correctedPositions = [];
        const occupiedSpaces = new Map();
        
        const sortedPositions = this.prioritizePositions(optimizedPositions);
        
        for (const position of sortedPositions) {
            const element = this.findElementById(position.element_id);
            if (!element) continue;
            
            // Berechne Element-Dimensionen
            const dimensions = this.getElementDimensions(element);
            
            // Finde kollisionsfreie Position
            const safePosition = this.findCollisionFreePosition(
                position, 
                dimensions, 
                occupiedSpaces, 
                position.swimlane
            );
            
            if (safePosition) {
                correctedPositions.push(safePosition);
                
                // Markiere Bereich als belegt
                this.markSpaceAsOccupied(occupiedSpaces, safePosition, dimensions);
                
                /*console.log(`Kollisionsfreie Position gefunden für ${position.element_id}:`, 
                           `(${safePosition.x}, ${safePosition.y})`);*/
            } else {
                //console.warn(`Keine kollisionsfreie Position gefunden für ${position.element_id}`);
                // Fallback: Originalposition beibehalten
                correctedPositions.push(position);
            }
        }
        
        //console.log('Kollisionsprüfung abgeschlossen:', correctedPositions.length, 'Positionen korrigiert');
        return correctedPositions;
    }

    prioritizePositions(positions) {
        return positions.sort((a, b) => {
            // Start-Elemente haben höchste Priorität
            const aIsStart = this.isStartElement(a.element_id);
            const bIsStart = this.isStartElement(b.element_id);
            
            if (aIsStart && !bIsStart) return -1;
            if (!aIsStart && bIsStart) return 1;
            
            // Dann nach X-Position sortieren (links nach rechts)
            return a.x - b.x;
        });
    }

    findCollisionFreePosition(targetPosition, dimensions, occupiedSpaces, swimlane) {
        const swimlaneBounds = this.getSwimlaneYBounds(swimlane);
        
        if (this.isPositionFree(targetPosition, dimensions, occupiedSpaces)) {
            return { ...targetPosition };
        }
        
        for (let attempt = 1; attempt < this.MAX_ATTEMPTS; attempt++) {
            const searchRadius = attempt * 30; 
            
            for (let angle = 0; angle < 360; angle += 45) {
                const radians = (angle * Math.PI) / 180;
                const testX = targetPosition.x + Math.cos(radians) * searchRadius;
                const testY = Math.max(
                    swimlaneBounds.minY,
                    Math.min(
                        swimlaneBounds.maxY - dimensions.height,
                        targetPosition.y + Math.sin(radians) * searchRadius * 0.3 // Weniger vertikale Bewegung
                    )
                );
                
                const testPosition = { 
                    ...targetPosition, 
                    x: Math.max(0, Math.min(CONSTANTS.CANVAS_WIDTH - dimensions.width, testX)),
                    y: testY
                };
                
                if (this.isPositionFree(testPosition, dimensions, occupiedSpaces)) {
                    //console.log(`Alternative Position gefunden nach ${attempt} Versuchen`);
                    return testPosition;
                }
            }
            
       
            const horizontalShift = attempt * 60;
            for (const direction of [1, -1]) {
                const testX = targetPosition.x + (horizontalShift * direction);
                const testPosition = {
                    ...targetPosition,
                    x: Math.max(0, Math.min(CONSTANTS.CANVAS_WIDTH - dimensions.width, testX))
                };
                
                if (this.isPositionFree(testPosition, dimensions, occupiedSpaces)) {
                    //console.log(`Horizontale Alternative gefunden`);
                    return testPosition;
                }
            }
        }
        
        return null; 
    }

    isPositionFree(position, dimensions, occupiedSpaces) {
        const rect1 = {
            left: position.x - this.COLLISION_PADDING,
            right: position.x + dimensions.width + this.COLLISION_PADDING,
            top: position.y - this.COLLISION_PADDING,
            bottom: position.y + dimensions.height + this.COLLISION_PADDING
        };

        for (const [id, occupiedRect] of occupiedSpaces) {
            if (this.rectanglesOverlap(rect1, occupiedRect)) {
                return false;
            }
        }
        
        return true;
    }

    rectanglesOverlap(rect1, rect2) {
        return !(
            rect1.right <= rect2.left ||
            rect2.right <= rect1.left ||
            rect1.bottom <= rect2.top ||
            rect2.bottom <= rect1.top
        );
    }

    markSpaceAsOccupied(occupiedSpaces, position, dimensions) {
        const rect = {
            left: position.x - this.COLLISION_PADDING,
            right: position.x + dimensions.width + this.COLLISION_PADDING,
            top: position.y - this.COLLISION_PADDING,
            bottom: position.y + dimensions.height + this.COLLISION_PADDING
        };
        
        occupiedSpaces.set(position.element_id, rect);
    }

    getElementDimensions(element) {
        const defaultSizes = {
            rectangle: { width: 120, height: 80 },
            ellipse: { width: 120, height: 80 },
            diamond: { width: 100, height: 100 },
            parallelogram: { width: 140, height: 80 },
            cylinder: { width: 120, height: 90 },
            document: { width: 100, height: 120 }
        };
        
        const elementType = element.type || 'rectangle';
        return defaultSizes[elementType] || defaultSizes.rectangle;
    }
  
    getSwimlaneYBounds(swimlaneId) {
        if (!window.swimLanes || !swimlaneId) {
            return { minY: 50, maxY: 600 };
        }
        
        let currentY = 0;
        for (const lane of window.swimLanes) {
            if (lane.id === swimlaneId) {
                return {
                    minY: currentY + 20,
                    maxY: currentY + lane.height - 20
                };
            }
            currentY += lane.height;
        }
        
        return { minY: 50, maxY: 600 };
    }

    findElementById(elementId) {
        return projectData.elements.find(el => el.id === elementId);
    }

    isStartElement(elementId) {
        const element = this.findElementById(elementId);
        return element && element.text && 
               element.text.toLowerCase().includes('start');
    }
}


export function applyCollisionSafeOptimization(analysis) {
    if (!analysis.layout_optimierung?.optimized_positions) {
        //console.log('Keine Layout-Optimierungen zum Prüfen');
        return analysis;
    }
    
    const collisionManager = new CollisionManager();
    
    // Korrigiere Positionen für Kollisionsfreiheit
    const safePositions = collisionManager.validateAndCorrectPositions(
        analysis.layout_optimierung.optimized_positions
    );
    
    // Update der Analyse mit sicheren Positionen
    analysis.layout_optimierung.optimized_positions = safePositions;
    analysis.layout_optimierung.collision_checked = true;
    analysis.layout_optimierung.collision_fixes = safePositions.length;
    
    return analysis;
}

// Globale Instanz für direkten Zugriff
window.collisionManager = new CollisionManager();