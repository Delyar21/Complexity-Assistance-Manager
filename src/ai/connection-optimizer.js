// AI-basierte Connection-Optimierung
import { projectData } from '../utils/state.js';
import { showToast } from '../ui/toast.js';
import { saveToHistory } from '../data/history.js';
// KORREKTUR: Verwende die richtigen verfügbaren Funktionen
import { createConnection, removeConnection, getConnectionManager } from '../canvas/connections.js';

export class ConnectionOptimizer {
    constructor() {
        this.problematicConnections = new Set();
        this.missingConnections = new Set();
        this.analysisResults = null;
    }

    // Hauptfunktion: Analysiere alle Verbindungen
    analyzeConnections() {
        console.group('CONNECTION ANALYSIS');
        
        const elements = projectData.elements || [];
        const connections = projectData.connections || [];
        
        // 1. Finde problematische Verbindungen
        this.findProblematicConnections(elements, connections);
        
        // 2. Finde fehlende Verbindungen
        this.findMissingConnections(elements, connections);
        
        // 3. Erstelle Analyse-Report
        this.analysisResults = {
            problematic: Array.from(this.problematicConnections),
            missing: Array.from(this.missingConnections),
            total_connections: connections.length,
            elements_count: elements.length
        };
        
        console.log('Problematische Verbindungen:', this.problematicConnections.size);
        console.log('Fehlende Verbindungen:', this.missingConnections.size);
        console.groupEnd();
        
        return this.analysisResults;
    }

    findProblematicConnections(elements, connections) {
        this.problematicConnections.clear();
        
        connections.forEach(conn => {
            const fromElement = elements.find(el => el.id === conn.from);
            const toElement = elements.find(el => el.id === conn.to);
            
            if (!fromElement || !toElement) {
                this.problematicConnections.add({
                    id: conn.id,
                    reason: 'missing_element',
                    details: `From: ${conn.from}, To: ${conn.to}`
                });
                return;
            }
            
            // Prüfe auf logische Widersprüche (Ja -> Nein)
            if (this.isLogicalContradiction(fromElement, toElement)) {
                this.problematicConnections.add({
                    id: conn.id,
                    reason: 'logical_contradiction',
                    from_text: fromElement.text,
                    to_text: toElement.text,
                    details: `Widersprüchliche Verbindung: "${fromElement.text}" -> "${toElement.text}"`
                });
            }
            
            // Prüfe auf Zyklen
            if (this.createsCycle(conn, connections)) {
                this.problematicConnections.add({
                    id: conn.id,
                    reason: 'creates_cycle',
                    details: 'Verbindung erzeugt Zyklus im Prozess'
                });
            }
            
            // Prüfe auf Selbst-Verbindungen
            if (conn.from === conn.to) {
                this.problematicConnections.add({
                    id: conn.id,
                    reason: 'self_connection',
                    details: 'Element verbindet mit sich selbst'
                });
            }
        });
    }

    findMissingConnections(elements, connections) {
        this.missingConnections.clear();
        
        // Finde Entscheidungs-Elemente ohne Ja/Nein Pfade
        elements.forEach(element => {
            if (this.isDecisionElement(element)) {
                const outgoingConnections = connections.filter(conn => conn.from === element.id);
                
                if (outgoingConnections.length < 2) {
                    this.missingConnections.add({
                        element_id: element.id,
                        reason: 'missing_decision_branches',
                        text: element.text,
                        current_connections: outgoingConnections.length,
                        details: 'Entscheidungselement braucht mindestens 2 ausgehende Verbindungen'
                    });
                }
            }
            
            // Finde isolierte Elemente
            const hasIncoming = connections.some(conn => conn.to === element.id);
            const hasOutgoing = connections.some(conn => conn.from === element.id);
            
            if (!hasIncoming && !hasOutgoing && !this.isStartElement(element)) {
                this.missingConnections.add({
                    element_id: element.id,
                    reason: 'isolated_element',
                    text: element.text,
                    details: 'Element hat keine Verbindungen'
                });
            }
        });
    }

    // Hilfsfunktionen für Analyse
    isLogicalContradiction(fromElement, toElement) {
        const fromText = fromElement.text.toLowerCase();
        const toText = toElement.text.toLowerCase();
        
        return (
            (fromText.includes('ja') && toText.includes('nein')) ||
            (fromText.includes('nein') && toText.includes('ja')) ||
            (fromText.includes('yes') && toText.includes('no')) ||
            (fromText.includes('no') && toText.includes('yes'))
        );
    }

    createsCycle(newConnection, existingConnections) {
        // Vereinfachte Zyklus-Erkennung
        const visited = new Set();
        const path = new Set();
        
        const hasCycle = (nodeId) => {
            if (path.has(nodeId)) return true;
            if (visited.has(nodeId)) return false;
            
            visited.add(nodeId);
            path.add(nodeId);
            
            // Finde alle ausgehenden Verbindungen
            const outgoing = existingConnections
                .concat([newConnection])
                .filter(conn => conn.from === nodeId);
            
            for (const conn of outgoing) {
                if (hasCycle(conn.to)) {
                    return true;
                }
            }
            
            path.delete(nodeId);
            return false;
        };
        
        return hasCycle(newConnection.from);
    }

    isDecisionElement(element) {
        const text = element.text.toLowerCase();
        return (
            element.type === 'decision' ||
            text.includes('?') ||
            text.includes('entscheidung') ||
            text.includes('prüfung') ||
            text.includes('check')
        );
    }

    isStartElement(element) {
        const text = element.text.toLowerCase();
        return (
            element.type === 'start' ||
            text.includes('start') ||
            text.includes('beginn') ||
            text.includes('anfang')
        );
    }

    // Hauptfunktion für Optimierung
    async applyOptimizations(optimizationData) {
        console.group('CONNECTION OPTIMIZATION');
        
        try {
            let removedCount = 0;
            let addedCount = 0;
            
            // Hole ConnectionManager für erweiterte Operationen
            const manager = getConnectionManager();
            
            // Entferne problematische Verbindungen
            if (optimizationData.remove_connections) {
                for (const connId of optimizationData.remove_connections) {
                    if (removeConnection(connId)) {
                        removedCount++;
                        console.log(`Verbindung entfernt: ${connId}`);
                    }
                }
            }
            
            // Füge fehlende Verbindungen hinzu
            if (optimizationData.add_connections) {
                for (const connData of optimizationData.add_connections) {
                    const fromElement = projectData.elements.find(el => 
                        el.text.toLowerCase().includes(connData.from_element.toLowerCase())
                    );
                    const toElement = projectData.elements.find(el => 
                        el.text.toLowerCase().includes(connData.to_element.toLowerCase())
                    );
                    
                    if (fromElement && toElement) {
                        // KORREKTUR: Verwende createConnection statt addConnection
                        const newConnection = createConnection(
                            fromElement.id, 
                            toElement.id, 
                            {
                                type: connData.connection_type || 'flow',
                                label: connData.label || '',
                                style: {
                                    color: connData.color || '#3498db'
                                }
                            }
                        );
                        
                        if (newConnection) {
                            addedCount++;
                            console.log(`Verbindung hinzugefügt: ${fromElement.text} -> ${toElement.text}`);
                        }
                    } else {
                        console.warn(`Elemente nicht gefunden für Verbindung: ${connData.from_element} -> ${connData.to_element}`);
                    }
                }
            }
            
            // Repariere spezielle Verbindungstypen
            if (optimizationData.repair_decision_flows) {
                addedCount += this.repairDecisionFlows();
            }
            
            if (optimizationData.remove_cycles) {
                removedCount += this.removeCyclicConnections();
            }
            
            const message = `Verbindungen optimiert: ${removedCount} entfernt, ${addedCount} hinzugefügt`;
            showToast(message, 'success');
            saveToHistory('KI: Connection-Optimierung');
            
            console.log(message);
            console.groupEnd();
            
            return { removed: removedCount, added: addedCount };
            
        } catch (error) {
            console.error('Fehler bei Connection-Optimierung:', error);
            showToast('Connection-Optimierung fehlgeschlagen', 'error');
            console.groupEnd();
            return { removed: 0, added: 0 };
        }
    }

    // Erweiterte Reparatur-Funktionen
    repairDecisionFlows() {
        let addedCount = 0;
        const elements = projectData.elements || [];
        const connections = projectData.connections || [];
        
        elements.forEach(element => {
            if (this.isDecisionElement(element)) {
                const outgoing = connections.filter(conn => conn.from === element.id);
                
                if (outgoing.length < 2) {
                    console.log(`Repariere Entscheidungsfluss für Element: ${element.text}`);
                    // Hier könnten automatische Verbindungen erstellt werden
                    // Zum Beispiel zu häufig verwendeten nachgelagerten Elementen
                }
            }
        });
        
        return addedCount;
    }

    removeCyclicConnections() {
        let removedCount = 0;
        const connections = projectData.connections || [];
        
        // Einfache Zyklus-Entfernung: entferne Rückwärts-Verbindungen
        connections.forEach(conn => {
            if (this.createsCycle(conn, connections.filter(c => c.id !== conn.id))) {
                if (removeConnection(conn.id)) {
                    removedCount++;
                    console.log(`Zyklische Verbindung entfernt: ${conn.id}`);
                }
            }
        });
        
        return removedCount;
    }

    // Export-Funktionen für andere Module
    getOptimizationSuggestions() {
        if (!this.analysisResults) {
            this.analyzeConnections();
        }
        
        return {
            suggestions: [
                ...Array.from(this.problematicConnections).map(conn => ({
                    type: 'remove',
                    target: conn.id,
                    reason: conn.reason,
                    description: `Entferne problematische Verbindung: ${conn.details}`
                })),
                ...Array.from(this.missingConnections).map(conn => ({
                    type: 'add',
                    target: conn.element_id,
                    reason: conn.reason,
                    description: `Füge fehlende Verbindung hinzu: ${conn.details}`
                }))
            ],
            stats: this.analysisResults
        };
    }
}

// Exportiere Singleton-Instanz
export const connectionOptimizer = new ConnectionOptimizer();

// Global verfügbare Funktionen
window.analyzeConnections = () => connectionOptimizer.analyzeConnections();
window.applyConnectionOptimizations = (data) => connectionOptimizer.applyOptimizations(data);

console.log('Connection-Optimizer geladen (korrigiert)');