import { projectData } from '../utils/state.js';
import { showToast } from '../ui/toast.js';
import { updateElementStatus, PROCESS_STATUS } from './status.js';

// Abhängigkeits-Engine
export class DependencyEngine {
    constructor() {
        this.rules = new Map();
        this.watchers = new Set();
        this.processingQueue = [];
        this.isProcessing = false;
        
        // Standard-Regeln registrieren
        this.registerDefaultRules();
        //console.log('Dependency Engine initialisiert');
    }
    
    // Standard-Abhängigkeitsregeln
    registerDefaultRules() {
        this.addRule('unlock_successors', {
            trigger: 'status_change',
            condition: (element, newStatus) => newStatus === PROCESS_STATUS.COMPLETED,
            action: (element) => this.unlockSuccessors(element.id)
        });
    
        this.addRule('cascade_blocking', {
            trigger: 'status_change',
            condition: (element, newStatus) => newStatus === PROCESS_STATUS.BLOCKED,
            action: (element) => this.cascadeBlocking(element.id)
        });
    
    // Zusätzliche Regel die bei jeder Änderung die Entsperrung prüft
        this.addRule('check_unblock_opportunities', {
            trigger: 'status_change',
            condition: (element, newStatus, oldStatus) => 
                newStatus === PROCESS_STATUS.COMPLETED || oldStatus === PROCESS_STATUS.BLOCKED,
            action: (element) => this.checkUnblockOpportunities(element.id)
        });
    
        this.addRule('auto_activation', {
            trigger: 'dependency_check',
            condition: (element) => this.canBeActivated(element.id),
            action: (element) => this.autoActivateElement(element.id)
        });
    
        this.addRule('deadlock_detection', {
            trigger: 'status_change',
            condition: () => true,
            action: () => this.detectDeadlocks()
        });
        this.addRule('unlock_on_archive', {
        trigger: 'status_change',
        condition: (element, newStatus) => newStatus === PROCESS_STATUS.ARCHIVED,
        action: (element) => this.unlockSuccessors(element.id)
        });
    }
    
    // Regel hinzufügen
    addRule(name, rule) {
        this.rules.set(name, {
            ...rule,
            id: name,
            enabled: true,
            created: new Date(),
            executionCount: 0
        });
    }

    getElementStatus(element) {
        if (!element) return null;

        const status = element.processStatus || 
                      element.status || 
                      PROCESS_STATUS.PENDING;
        
        const validStatuses = Object.values(PROCESS_STATUS);
        if (!validStatuses.includes(status)) {
            //console.warn(`Invalid status "${status}" for element ${element.id}, using PENDING`);
            return PROCESS_STATUS.PENDING;
        }
        
        return status;
    }
    
    // Status-Änderung verarbeiten
    onStatusChange(elementId, oldStatus, newStatus) {
    const element = projectData.elements.find(el => el.id === elementId);
    if (!element) {
        //console.warn(`Element ${elementId} not found for dependency check`);
        return;
    }
    
    //console.log(`Dependency Check: ${element.text} ${oldStatus} → ${newStatus}`);
    
    if (newStatus === PROCESS_STATUS.BLOCKED) {
        //console.log(`Direct cascade blocking from ${element.text}`);
        this.cascadeBlocking(elementId);
        return; // sofortige Ausführung ohne Queue
    }
    
    if (newStatus === PROCESS_STATUS.COMPLETED) {
        //console.log(`Direct unlock successors from ${element.text}`);
        this.unlockSuccessors(elementId);
        
        setTimeout(() => {
            this.checkUnblockOpportunities(elementId);
        }, 100);
        return; 
    }
    
    // Für andere Regeln: Queue verwenden (aber weniger kritisch)
    this.processingQueue.push({
        type: 'status_change',
        elementId,
        element,
        oldStatus,
        newStatus,
        timestamp: Date.now()
    });
    
    this.processQueue();
}
    
    // Verarbeitungsqueue abarbeiten
    async processQueue() {
    if (this.isProcessing || this.processingQueue.length === 0) return;
    
    this.isProcessing = true;
    const events = [...this.processingQueue];
    this.processingQueue = [];
    
    try {
        for (const event of events) {
            await this.processEvent(event);
        }
    } catch (error) {
        //console.error('Fehler in Dependency Engine:', error);
    } finally {
        this.isProcessing = false;
        
        // Falls neue Events eingetroffen sind
        if (this.processingQueue.length > 0) {
            setTimeout(() => this.processQueue(), 50); 
        }
    }
}
    
    // Einzelnes Event verarbeiten
    async processEvent(event) {
        const applicableRules = Array.from(this.rules.values())
            .filter(rule => rule.enabled && rule.trigger === event.type);
        
        for (const rule of applicableRules) {
            try {
                if (rule.condition(event.element, event.newStatus, event)) {
                    //console.log(`Executing rule: ${rule.id}`);
                    await rule.action(event.element, event);
                    rule.executionCount++;
                }
            } catch (error) {
                console.error(`Fehler in Regel ${rule.id}:`, error);
            }
        }
    }
    
    // Nachfolger freischalten
    unlockSuccessors(elementId) {
        const successors = this.getDirectSuccessors(elementId);
        const unlockedElements = [];
        
        //console.log(`Unlocking successors of ${elementId}:`, successors);
        
        successors.forEach(successorId => {
            const successor = projectData.elements.find(el => el.id === successorId);
            if (!successor) return;
            
            const successorStatus = this.getElementStatus(successor);
            //console.log(`Checking successor: ${successor.text} (${successorStatus})`);
            
            // Prüfe ob alle Vorgänger abgeschlossen sind
            const predecessors = this.getDirectPredecessors(successorId);
            const allPredecessorsCompleted = predecessors.every(predId => {
                const pred = projectData.elements.find(el => el.id === predId);
                const predStatus = this.getElementStatus(pred);
                //console.log(`Predecessor: ${pred?.text} (${predStatus})`);
                return pred && predStatus === PROCESS_STATUS.COMPLETED;
            });
            
            //console.log(`All predecessors completed: ${allPredecessorsCompleted}`);
            
            // Direkte Entsperrung
            if (allPredecessorsCompleted && 
                (successorStatus === PROCESS_STATUS.PENDING || 
                 successorStatus === PROCESS_STATUS.BLOCKED)) {
                
                //console.log(`Unlocking: ${successor.text} (was ${successorStatus})`);
                if (this.unlockElementImmediately(successorId)) {
                    unlockedElements.push(successor.text);
                }
            } else {
                //console.log(`Skipping: ${successor.text} - not ready or already active`);
            }
        });
        
        if (unlockedElements.length > 0) {
            showToast(`${unlockedElements.length} Prozess(e) freigeschaltet: ${unlockedElements.join(', ')}`, 'success');
        } else {
            //console.log(`No elements to unlock from ${elementId}`);
        }
    }

    
    // Blockierung kaskadieren
    cascadeBlocking(elementId) {
        const element = projectData.elements.find(el => el.id === elementId);
        if (!element) {
            //console.warn(`Element ${elementId} not found for cascade blocking`);
            return;
        }
        
        //console.log(`Cascading blocking from: ${element.text}`);
        
        const successors = this.getAllSuccessors(elementId, new Set());
        const blockedElements = [];
        
        //console.log(`Found ${successors.length} total successors to check:`, successors);
        
        successors.forEach(successorId => {
            const successor = projectData.elements.find(el => el.id === successorId);
            if (successor) {
                const currentStatus = this.getElementStatus(successor);
                //console.log(`Checking successor: ${successor.text} (current: ${currentStatus})`);
                
                // Blockiere ACTIVE und PENDING Elemente
                if (currentStatus === PROCESS_STATUS.ACTIVE ||
                    currentStatus === PROCESS_STATUS.PENDING) {
                    
                    //console.log(`Blocking: ${successor.text} (was ${currentStatus})`);
                    updateElementStatus(successorId, PROCESS_STATUS.BLOCKED);
                    blockedElements.push(successor.text);
                } else {
                    //console.log(`⏭Skipping: ${successor.text} (already ${currentStatus})`);
                }
            }
        });
        
        if (blockedElements.length > 0) {
            showToast(`${blockedElements.length} abhängige Prozess(e) blockiert: ${blockedElements.join(', ')}`, 'warning');
            //console.log(`Cascade blocking completed: ${blockedElements.length} elements blocked`);
        } else {
            //console.log(`ℹNo elements needed blocking from ${element.text}`);
        }
    }

    // Prüfe Entsperrungsmöglichkeiten für alle verbundenen Elemente
    checkUnblockOpportunities(elementId) {
        //console.log(`Checking unblock opportunities for ${elementId}`);
        
        const successors = this.getDirectSuccessors(elementId);
        
        successors.forEach(successorId => {
            const successor = projectData.elements.find(el => el.id === successorId);
            if (!successor) return;
            
            // Sichere Status-Abfrage
            const successorStatus = this.getElementStatus(successor);
            
            // Nur blockierte Elemente prüfen
            if (successorStatus === PROCESS_STATUS.BLOCKED) {
                //console.log(`Checking blocked successor: ${successor.text}`);
                
                // Prüft ob alle Vorgänger jetzt abgeschlossen sind
                const allPredecessors = this.getDirectPredecessors(successorId);
                const allCompleted = allPredecessors.every(predId => {
                    const pred = projectData.elements.find(el => el.id === predId);
                    const predStatus = this.getElementStatus(pred);
                    return pred && predStatus === PROCESS_STATUS.COMPLETED;
                });
                
                if (allCompleted) {
                    //console.log(`All predecessors completed, unlocking: ${successor.text}`);
                    if (this.unlockElementImmediately(successorId)) {
                        showToast(`${successor.text} entsperrt - alle Vorgänger abgeschlossen`, 'success');
                    }
                } else {
                    //console.log(`${successor.text} still has incomplete predecessors`);
                }
            }
        });
    }


    
    // Element automatisch aktivieren
    autoActivateElement(elementId) {
        const element = projectData.elements.find(el => el.id === elementId);
        if (!element) return;
        
        // Sicherheitscheck
        if (this.canBeActivated(elementId)) {
            this.scheduleActivation(elementId, 2000); 
        }
    }
    
    // Aktivierung planen (mit Verzögerung)
    scheduleActivation(elementId, delay = 1000) {
    setTimeout(() => {
        const element = projectData.elements.find(el => el.id === elementId);
        if (!element) {
            //console.warn(`Element ${elementId} not found for activation`);
            return;
        }
        
        //console.log(`Attempting to activate: ${element.text} (current: ${element.processStatus})`);
        
        // Aktiviere sowohl PENDING als auch BLOCKED Elemente
        if (element.processStatus === PROCESS_STATUS.PENDING || 
            element.processStatus === PROCESS_STATUS.BLOCKED) {
            
            //console.log(`Activating: ${element.text} (was ${element.processStatus})`);
            updateElementStatus(elementId, PROCESS_STATUS.ACTIVE);
            
            this.highlightAutoActivation(elementId);
            
            //console.log(`Auto-aktiviert: ${element.text}`);
        } else {
            //console.log(`Skipping activation: ${element.text} is already ${element.processStatus}`);
        }
    }, delay);
}
    //  Element sofort entsperren 
    unlockElementImmediately(elementId) {
    const element = projectData.elements.find(el => el.id === elementId);
    if (!element) {
        //console.warn(`Element ${elementId} not found for unlocking`);
        return false;
    }
    
    //console.log(`Unlocking immediately: ${element.text} (current: ${element.processStatus})`);
    
    // Prüfe ob Element wirklich entsperrt werden kann
    if (!this.canBeActivated(elementId)) {
        //console.warn(`Cannot unlock ${element.text}: dependencies not satisfied`);
        return false;
    }
    
    // Entsperre sowohl PENDING als auch BLOCKED Elemente
    if (element.processStatus === PROCESS_STATUS.PENDING || 
        element.processStatus === PROCESS_STATUS.BLOCKED) {
        
        updateElementStatus(elementId, PROCESS_STATUS.ACTIVE);
        
        this.highlightAutoActivation(elementId);
        
        //console.log(`Successfully unlocked immediately: ${element.text}`);
        return true;
        
    } else {
        //console.log(`Skipping unlock: ${element.text} is already ${element.processStatus}`);
        return false;
    }
}

    canBeActivated(elementId) {
        const element = projectData.elements.find(el => el.id === elementId);
        if (!element) return false;
        
        const currentStatus = this.getElementStatus(element);
        
        // Nur PENDING und BLOCKED können aktiviert werden
        if (currentStatus !== PROCESS_STATUS.PENDING && 
            currentStatus !== PROCESS_STATUS.BLOCKED) {
            return false;
        }
        
        // Alle direkten Vorgänger müssen abgeschlossen ODER archiviert sein
        const predecessors = this.getDirectPredecessors(elementId);
        const allCompleted = predecessors.every(predId => {
            const pred = projectData.elements.find(el => el.id === predId);
            const predStatus = this.getElementStatus(pred);
            
            // archiviert als erfüllt betrachtenn
            const isFulfilled = pred && (
                predStatus === PROCESS_STATUS.COMPLETED ||
                predStatus === PROCESS_STATUS.ARCHIVED
            );
            
            if (!isFulfilled) {
                //console.log(`Predecessor ${pred?.text || predId} is not fulfilled (${predStatus})`);
            }
            return isFulfilled;
        });
        
        return allCompleted;
    }
    
    getDirectSuccessors(elementId) {
        return projectData.connections
            .filter(conn => conn.from === elementId)
            .map(conn => conn.to);
    }
    
    getDirectPredecessors(elementId) {
        return projectData.connections
            .filter(conn => conn.to === elementId)
            .map(conn => conn.from);
    }
    
    // Alle Nachfolger (rekursiv)
    getAllSuccessors(elementId, visited = new Set()) {
        if (visited.has(elementId)) return [];
        visited.add(elementId);
        
        const directSuccessors = this.getDirectSuccessors(elementId);
        let allSuccessors = [...directSuccessors];
        
        directSuccessors.forEach(successorId => {
            allSuccessors = allSuccessors.concat(
                this.getAllSuccessors(successorId, visited)
            );
        });
        
        return [...new Set(allSuccessors)]; // Duplikate entfernen
    }
    
    // Alle Vorgänger (rekursiv)
    getAllPredecessors(elementId, visited = new Set()) {
        if (visited.has(elementId)) return [];
        visited.add(elementId);
        
        const directPredecessors = this.getDirectPredecessors(elementId);
        let allPredecessors = [...directPredecessors];
        
        directPredecessors.forEach(predId => {
            allPredecessors = allPredecessors.concat(
                this.getAllPredecessors(predId, visited)
            );
        });
        
        return [...new Set(allPredecessors)];
    }
    
    detectDeadlocks() {
        const deadlocks = this.findCircularDependencies();
        
        if (deadlocks.length > 0) {
            //console.warn('Zirkuläre Abhängigkeiten erkannt:', deadlocks);
            this.handleDeadlocks(deadlocks);
        }
    }
    
    findCircularDependencies() {
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = [];
        
        projectData.elements.forEach(element => {
            if (!visited.has(element.id)) {
                this.detectCycle(element.id, visited, recursionStack, [], cycles);
            }
        });
        
        return cycles;
    }
    
    detectCycle(elementId, visited, recursionStack, path, cycles) {
        visited.add(elementId);
        recursionStack.add(elementId);
        path.push(elementId);
        
        const successors = this.getDirectSuccessors(elementId);
        
        for (const successorId of successors) {
            if (!visited.has(successorId)) {
                this.detectCycle(successorId, visited, recursionStack, path, cycles);
            } else if (recursionStack.has(successorId)) {
                // Zyklus gefunden
                const cycleStart = path.indexOf(successorId);
                const cycle = path.slice(cycleStart);
                cycles.push(cycle);
            }
        }
        
        recursionStack.delete(elementId);
        path.pop();
    }
    
    handleDeadlocks(deadlocks) {
        deadlocks.forEach((cycle, index) => {
            const elementNames = cycle.map(id => {
                const el = projectData.elements.find(e => e.id === id);
                return el ? el.text : id;
            });
            
            showToast(`Zirkuläre Abhängigkeit: ${elementNames.join(' → ')}`, 'error');
        });
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    highlightAutoActivation(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        // Grüner Glow-Effekt
        element.style.transition = 'all 0.5s ease';
        element.style.boxShadow = '0 0 20px #27ae60';
        element.style.transform = 'scale(1.05)';
        
        setTimeout(() => {
            element.style.boxShadow = '';
            element.style.transform = '';
        }, 2000);
    }
    
    generateDependencyReport() {
        const report = {
            timestamp: new Date().toISOString(),
            totalElements: projectData.elements.length,
            totalConnections: projectData.connections.length,
            ruleExecutions: {},
            dependencyMetrics: this.calculateDependencyMetrics(),
            criticalPath: this.findCriticalPath(),
            bottlenecks: this.findDependencyBottlenecks(),
            recommendations: this.generateRecommendations()
        };
        
        // Regel-Ausführungsstatistiken
        this.rules.forEach((rule, name) => {
            report.ruleExecutions[name] = rule.executionCount;
        });
        
        return report;
    }
    
    calculateDependencyMetrics() {
        const metrics = {
            avgInDegree: 0,
            avgOutDegree: 0,
            maxInDegree: 0,
            maxOutDegree: 0,
            isolatedElements: 0,
            cyclicDependencies: this.findCircularDependencies().length
        };
        
        const inDegrees = [];
        const outDegrees = [];
        
        projectData.elements.forEach(element => {
            const inDegree = this.getDirectPredecessors(element.id).length;
            const outDegree = this.getDirectSuccessors(element.id).length;
            
            inDegrees.push(inDegree);
            outDegrees.push(outDegree);
            
            metrics.maxInDegree = Math.max(metrics.maxInDegree, inDegree);
            metrics.maxOutDegree = Math.max(metrics.maxOutDegree, outDegree);
            
            if (inDegree === 0 && outDegree === 0) {
                metrics.isolatedElements++;
            }
        });
        
        metrics.avgInDegree = inDegrees.reduce((a, b) => a + b, 0) / inDegrees.length || 0;
        metrics.avgOutDegree = outDegrees.reduce((a, b) => a + b, 0) / outDegrees.length || 0;
        
        return metrics;
    }
    
    findCriticalPath() {
        // Implementierung des Critical Path Method (CPM)
        // Vereinfacht für unser Use-Case
        const elements = projectData.elements;
        const paths = [];
        
        // Finde alle Start-Knoten (keine Vorgänger)
        const startNodes = elements.filter(el => 
            this.getDirectPredecessors(el.id).length === 0
        );
        
        startNodes.forEach(startNode => {
            const path = this.findLongestPath(startNode.id, new Set());
            if (path.length > 0) {
                paths.push({
                    startElement: startNode.text,
                    length: path.length,
                    elements: path.map(id => {
                        const el = elements.find(e => e.id === id);
                        return el ? el.text : id;
                    })
                });
            }
        });
        
        return paths.sort((a, b) => b.length - a.length)[0] || null;
    }
    
    findLongestPath(elementId, visited) {
        if (visited.has(elementId)) return [];
        visited.add(elementId);
        
        const successors = this.getDirectSuccessors(elementId);
        let longestPath = [elementId];
        
        successors.forEach(successorId => {
            const path = this.findLongestPath(successorId, new Set(visited));
            if (path.length + 1 > longestPath.length) {
                longestPath = [elementId, ...path];
            }
        });
        
        return longestPath;
    }
    
    findDependencyBottlenecks() {
        const bottlenecks = [];
        
        projectData.elements.forEach(element => {
            const inDegree = this.getDirectPredecessors(element.id).length;
            const outDegree = this.getDirectSuccessors(element.id).length;
            
            // Bottleneck: Viele eingehende oder ausgehende Abhängigkeiten
            if (inDegree >= 3 || outDegree >= 3) {
                bottlenecks.push({
                    elementId: element.id,
                    elementText: element.text,
                    inDegree,
                    outDegree,
                    type: inDegree >= 3 ? 'convergence' : 'divergence',
                    risk: Math.max(inDegree, outDegree) >= 5 ? 'high' : 'medium'
                });
            }
        });
        
        return bottlenecks.sort((a, b) => 
            Math.max(b.inDegree, b.outDegree) - Math.max(a.inDegree, a.outDegree)
        );
    }
    
    generateRecommendations() {
        const recommendations = [];
        const metrics = this.calculateDependencyMetrics();
        const bottlenecks = this.findDependencyBottlenecks();
        
        // Empfehlungen basierend auf Metriken
        if (metrics.cyclicDependencies > 0) {
            recommendations.push({
                type: 'circular_dependencies',
                priority: 'high',
                title: 'Zirkuläre Abhängigkeiten auflösen',
                description: `${metrics.cyclicDependencies} zirkuläre Abhängigkeit(en) blockieren den Workflow.`,
                action: 'Analysieren und brechen Sie die Zyklen durch Neuorganisation der Prozesse.'
            });
        }
        
        if (metrics.isolatedElements > 0) {
            recommendations.push({
                type: 'isolated_elements',
                priority: 'medium',
                title: 'Isolierte Elemente integrieren',
                description: `${metrics.isolatedElements} Element(e) haben keine Abhängigkeiten.`,
                action: 'Prüfen Sie ob diese Elemente in den Workflow integriert werden sollten.'
            });
        }
        
        if (bottlenecks.length > 0) {
            recommendations.push({
                type: 'dependency_bottlenecks',
                priority: 'high',
                title: 'Abhängigkeits-Bottlenecks reduzieren',
                description: `${bottlenecks.length} Element(e) haben zu viele Abhängigkeiten.`,
                action: 'Reduzieren Sie komplexe Abhängigkeiten durch Prozess-Aufspaltung.'
            });
        }
        
        return recommendations;
    }

    //  Initial Check Funktionen direkt in der Klasse
    performInitialCheck() {
        //console.log('Performing initial dependency check...');
        
        setTimeout(() => {
            const blockedElements = [];
            const unlockedElements = [];
            
            // Finde alle bereits blockierten Elemente und kaskadiere
            projectData.elements.forEach(element => {
                const currentStatus = element.processStatus || PROCESS_STATUS.PENDING;
                
                if (currentStatus === PROCESS_STATUS.BLOCKED) {
                    //console.log(`Found blocked element: ${element.text} - cascading block`);
                    
                    // Verwende die normale cascadeBlocking Funktion
                    const successors = this.getAllSuccessors(element.id, new Set());
                    successors.forEach(successorId => {
                        const successor = projectData.elements.find(el => el.id === successorId);
                        if (successor && successor.processStatus !== PROCESS_STATUS.BLOCKED) {
                            //console.log(`Initial blocking dependent element: ${successor.text}`);
                            updateElementStatus(successorId, PROCESS_STATUS.BLOCKED);
                            blockedElements.push(successor.text);
                        }
                    });
                }
            });
            
            //  Prüfe abgeschlossene Elemente für Freischaltungen
            setTimeout(() => {
                projectData.elements.forEach(element => {
                    const currentStatus = element.processStatus || PROCESS_STATUS.PENDING;
                    
                    if (currentStatus === PROCESS_STATUS.COMPLETED) {
                        //console.log(`Found completed element: ${element.text} - checking successors`);
                        this.unlockSuccessors(element.id);
                    }
                });
                
                // Feedback geben
                if (blockedElements.length > 0) {
                    showToast(`${blockedElements.length} abhängige Prozesse aufgrund Blockierungen gesperrt`, 'warning');
                }
                
                //console.log('Initial dependency check completed');
            }, 100); 
            
        }, 300);
    }

    checkAllDependencies(elementId) {
        const element = projectData.elements.find(el => el.id === elementId);
        if (!element) return;
        
        const currentStatus = element.processStatus || PROCESS_STATUS.PENDING;
        //console.log(`Checking all dependencies for: ${element.text} (${currentStatus})`);
        
        // Prüfe Vorgänger
        const predecessors = this.getDirectPredecessors(elementId);
        predecessors.forEach(predId => {
            const predecessor = projectData.elements.find(el => el.id === predId);
            if (predecessor) {
                //console.log(`Predecessor: ${predecessor.text} (${predecessor.processStatus})`);
                
                // Wenn Vorgänger blockiert ist und aktuelles Element nicht blockiert ist
                if (predecessor.processStatus === PROCESS_STATUS.BLOCKED && 
                    currentStatus !== PROCESS_STATUS.BLOCKED) {
                    //console.log(`Blocking ${element.text} due to blocked predecessor ${predecessor.text}`);
                    updateElementStatus(elementId, PROCESS_STATUS.BLOCKED);
                }
            }
        });
        
        // Prüfe Nachfolger
        const successors = this.getDirectSuccessors(elementId);
        successors.forEach(succId => {
            const successor = projectData.elements.find(el => el.id === succId);
            if (successor) {
                //console.log(`Successor: ${successor.text} (${successor.processStatus})`);
                
                // Wenn aktuelles Element blockiert ist und Nachfolger nicht blockiert ist
                if (currentStatus === PROCESS_STATUS.BLOCKED && 
                    successor.processStatus !== PROCESS_STATUS.BLOCKED) {
                    //console.log(`Blocking ${successor.text} due to blocked predecessor ${element.text}`);
                    updateElementStatus(succId, PROCESS_STATUS.BLOCKED);
                }
                
                // Wenn aktuelles Element abgeschlossen ist, prüfe ob Nachfolger freigeschaltet werden kann
                if (currentStatus === PROCESS_STATUS.COMPLETED) {
                    const canActivate = this.canBeActivated(succId);
                    if (canActivate && successor.processStatus === PROCESS_STATUS.PENDING) {
                        //console.log(`Can unlock ${successor.text}`);
                        this.scheduleActivation(succId);
                    }
                }
            }
        });
    }
}

export let dependencyEngine = null;

export function initializeDependencyEngine() {
    if (!dependencyEngine) {
        dependencyEngine = new DependencyEngine();
        //console.log('Dependency Engine gestartet');
    }
    return dependencyEngine;
}

// Nur eine getDependencyEngine Funktion
export function getDependencyEngine() {
    return dependencyEngine || initializeDependencyEngine();
}
