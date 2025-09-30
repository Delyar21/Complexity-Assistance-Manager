import { projectData } from './state.js';
import { showToast } from '../ui/toast.js';
import { recalculateAllConnections, getConnectionManager, createConnection, removeConnection  } from '../canvas/connections.js';
import { saveToHistory } from '../data/history.js';
import { CONSTANTS } from './constants.js';

export class MistralBusinessAnalyzer {
    constructor() {
        this.apiEndpoint = 'https://api.mistral.ai/v1/chat/completions';
        this.model = 'mistral-small-latest';
        this.isAnalyzing = false;
        this.usageStats = this.loadUsageStats();
        this.maxMonthlyUsage = 300;
        
        this.lastRequestTime = 0;
        this.minRequestInterval = 2000;
    }

    async analyzeProject() {
    try {
        if (!this.canMakeRequest()) {
            showToast('Bitte warten Sie 2 Sekunden zwischen Analysen', 'warning');
            return;
        }
        if (!this.checkUsageLimit()) {
            showToast('Monatliches Analyse-Limit erreicht. Upgrade empfohlen.', 'error');
            return;
        }
        this.isAnalyzing = true;
        showToast('Mistral AI analysiert Ihren Prozess...', 'info');
        
        const projectExport = await this.gatherOptimizedProjectData();
        const analysisPrompt = this.buildIntelligentPrompt(projectExport);
        const aiResponse = await this.callMistralAPI(analysisPrompt);
        let analysisResults = this.parseStructuredResponse(aiResponse);
        window.currentMistralAnalysis = analysisResults;
        if (analysisResults.connection_optimierung?.optimization_needed || 
            this.hasConnectionProblemsInMainProblems(analysisResults.hauptprobleme)) {
            
            console.log('Wende Connection-Optimierung an...');
            const connectionResults = await this.processConnectionOptimizations(analysisResults);
            
            if (connectionResults.removed > 0 || connectionResults.added > 0) {
                showToast(`Verbindungen optimiert: ${connectionResults.removed} entfernt, ${connectionResults.added} hinzugefuegt`, 'success');
            }
        }
        if (analysisResults.layout_optimierung?.optimized_positions) {
            const collisionManager = new CollisionManager();
            const safePositions = collisionManager.validateAndCorrectPositions(
                analysisResults.layout_optimierung.optimized_positions
            );
           
            analysisResults.layout_optimierung.optimized_positions = safePositions;
            analysisResults.layout_optimierung.collision_checked = true;
           
         
        }
        this.showIntelligentResults(analysisResults);
        this.updateUsageStats();
        //console.log('Kollisionssichere Mistral AI Analyse abgeschlossen:', analysisResults);
       
    } catch (error) {
        //console.error('Mistral AI Analyse fehlgeschlagen:', error);
        this.handleAPIError(error);
    } finally {
        this.isAnalyzing = false;
    }
}

hasConnectionProblemsInMainProblems(problems) {
    if (!problems) return false;
    return problems.some(p => 
        p.solution === 'add_connection' || 
        p.solution === 'remove_connection' ||
        p.problem.toLowerCase().includes('verbindung') ||
        p.problem.toLowerCase().includes('zyklus')
    );
}

async processConnectionOptimizations(analysisResults) {
    let removedCount = 0;
    let addedCount = 0;

    if (analysisResults.hauptprobleme) {
        for (const problem of analysisResults.hauptprobleme) {
            if (problem.solution === 'remove_connection' && problem.remove_connection_id) {
                if (removeConnection(problem.remove_connection_id)) {
                    removedCount++;
                    //console.log(`Connection entfernt: ${problem.remove_connection_id} (${problem.problem})`);
                }
            }
            
            if (problem.solution === 'add_connection' && problem.from_element && problem.to_element) {
                const fromElement = projectData.elements.find(el => 
                    el.text.toLowerCase().includes(problem.from_element.toLowerCase())
                );
                const toElement = projectData.elements.find(el => 
                    el.text.toLowerCase().includes(problem.to_element.toLowerCase())
                );
                
                if (fromElement && toElement) {
                    const newConnection = createConnection(
                        fromElement.id, 
                        toElement.id, 
                        { type: problem.connection_type || 'flow' }
                    );
                    
                    if (newConnection) {
                        addedCount++;
                        //console.log(`Connection hinzugefügt: ${fromElement.text} -> ${toElement.text}`);
                    }
                }
            }
        }
    }
    
    if (analysisResults.connection_optimierung?.optimization_needed) {
        const traditionalResult = await window.applyConnectionOptimizations(analysisResults.connection_optimierung);
        removedCount += traditionalResult.removed;
        addedCount += traditionalResult.added;
    }
    
    return { removed: removedCount, added: addedCount };
}
    gatherOptimizedProjectData() {
        const swimlanes = projectData.swimLanes || [];
        const elements = projectData.elements || [];
        const connections = projectData.connections || [];
        
        return {
            metadata: {
                elements_count: elements.length,
                connections_count: connections.length,
                swimlanes_count: swimlanes.length,
                export_timestamp: new Date().toISOString()
            },
            elements: elements.map(el => ({
                id: el.id,
                type: el.type,
                text: el.text?.substring(0, 50) || 'Unnamed',
                position: { x: el.x || 0, y: el.y || 0 },
                status: el.processStatus || 'pending',
                swimlane: el.swimLane || null,
                properties: {
                    priority: el.properties?.priority,
                    category: el.properties?.category
                }
            })),
            connections: connections.map(conn => {
                const fromEl = elements.find(el => el.id === conn.from);
                const toEl = elements.find(el => el.id === conn.to);
                return {
                    id: conn.id,
                    from: fromEl?.text?.substring(0, 30) || 'Unknown',
                    to: toEl?.text?.substring(0, 30) || 'Unknown',
                    type: conn.type || 'dataflow',
                    from_id: conn.from,
                    to_id: conn.to
                };
            }),
            swimlanes: swimlanes, 
            process_context: {
                industry: 'general',
                complexity_level: this.calculateComplexityLevel(),
                workflow_type: this.determineWorkflowType()
            }
        };
    }

    buildIntelligentPrompt(data) {
    const swimlaneInfo = window.swimLanes && window.swimLanes.length > 0
        ? window.swimLanes.map(lane => `- ${lane.name} (ID: ${lane.id}, Höhe: ${lane.height}px, Farbe: ${lane.color})`).join('\n')
        : '- Keine Swimlanes aktiv';
    
    let swimlaneYInfo = "";
    if (window.swimLanes && window.swimLanes.length > 0) {
        swimlaneYInfo = "\nSWIMLANE Y-BEREICHE:\n";
        let currentY = 0;
        window.swimLanes.forEach(lane => {
            const centerY = currentY + (lane.height / 2);
            swimlaneYInfo += `- ${lane.name}: Y-Bereich ${currentY}-${currentY + lane.height} (Mitte: ${centerY})\n`;
            currentY += lane.height;
        });
    }

    const elementsText = data.elements && data.elements.length > 0
        ? data.elements.map(el => {
            const status = el.processStatus || 'unbekannt';
            const swimlane = el.swimLane || 'unzugeordnet';
            const duration = el.processMetadata?.totalProcessingTime || 0;
            
            return `- Text: "${el.text}" | ID: ${el.id} | Status: ${status} | Swimlane: ${swimlane} | Position: (${el.position.x},${el.position.y}) | Dauer: ${duration}h`;
        }).join('\n')
        : '- Keine Elemente vorhanden';
    
    let connectionsText = "";
    let connectionProblems = "";
    
    if (data.connections && data.connections.length > 0) {
        connectionsText = data.connections.map(c => {
            const fromEl = data.elements.find(el => el.id === c.from_id);
            const toEl = data.elements.find(el => el.id === c.to_id);
            const fromStatus = fromEl?.processStatus || 'unbekannt';
            const toStatus = toEl?.processStatus || 'unbekannt';
            
            return `- ${c.from} (${fromStatus}) → ${c.to} (${toStatus}) [${c.type}] (ID: ${c.id})`;
        }).join('\n');
    
        const problems = [];
        
        const connectionMap = new Map();
        data.connections.forEach(c => {
            if (!connectionMap.has(c.from_id)) connectionMap.set(c.from_id, []);
            connectionMap.get(c.from_id).push({to: c.to_id, id: c.id, text: c.to, fromText: c.from});
        });
        
        for (let [fromId, connections] of connectionMap.entries()) {
            connections.forEach(conn => {
                const backConnections = connectionMap.get(conn.to) || [];
                const cycleConnection = backConnections.find(back => back.to === fromId);
                if (cycleConnection) {
                    const isHarmfulCycle = this.isHarmfulCycle(conn.fromText, conn.text);
                    if (isHarmfulCycle) {
                        problems.push(`SCHÄDLICHER ZYKLUS: "${conn.fromText}" ↔ "${conn.text}" (Entferne ID: ${cycleConnection.id})`);
                    } else {
                        problems.push(`MÖGLICHER RÜCKFLUSS: "${conn.fromText}" ↔ "${conn.text}" (Prüfe Notwendigkeit)`);
                    }
                }
            });
        }

        data.connections.forEach(c => {
            if (this.isLogicalContradiction(c.from, c.to)) {
                problems.push(`WIDERSPRUCH: "${c.from}" → "${c.to}" (Entferne ID: ${c.id})`);
            }
        });
        
        const missingConnections = this.findMissingCriticalConnections(data.elements, data.connections);
        missingConnections.forEach(missing => {
            problems.push(`FEHLENDE VERBINDUNG: "${missing.from}" → "${missing.to}" (${missing.reason})`);
        });
        
        connectionProblems = problems.length > 0 
            ? "\n🔍 CONNECTION-ANALYSE:\n" + problems.map(p => ` ${p}`).join('\n')
            : "\n✅ Keine kritischen Connection-Probleme erkannt";
            
    } else {
        connectionsText = '- Keine Verbindungen vorhanden';
        connectionProblems = "\n KRITISCH: Prozess hat keine Verbindungen - Workflow komplett unterbrochen!";
    }

    // Status-Statistiken
    const statusStats = {};
    data.elements.forEach(el => {
        const status = el.processStatus || 'unbekannt';
        statusStats[status] = (statusStats[status] || 0) + 1;
    });
    const statusSummary = Object.entries(statusStats)
        .map(([status, count]) => `${status}: ${count}`)
        .join(', ');

    return `Du bist ein KI-Experte für Geschäftsprozessoptimierung mit Fokus auf Swimlane-Organisation, Status-Management und INTELLIGENTE Connection-Optimierung.

WICHTIGER KONTEXT:
- Swimlanes repräsentieren Organisationseinheiten/Verantwortlichkeiten
- Status zeigt aktuellen Bearbeitungsstand der Prozesse
- Connections zeigen kritische Abhängigkeiten und Workflow-Fluss
- Verwende für "element_id" in optimized_positions IMMER echte Element-IDs (element-6, element-7, etc.)

AKTUELLER ZUSTAND:
- ${data.metadata.elements_count} Elemente, ${data.metadata.connections_count} Verbindungen
- Status-Verteilung: ${statusSummary}
- Komplexität: ${data.process_context.complexity_level}

SWIMLANES:
${swimlaneInfo}${swimlaneYInfo}

ELEMENTE (mit Status & Swimlane-Zuordnung):
${elementsText}

VERBINDUNGEN (mit Status-Kontext):
${connectionsText}${connectionProblems}

OPTIMIERUNGSAUFGABE:
Analysiere den Prozess und optimiere intelligent unter Berücksichtigung von:

1. **INTELLIGENTE CONNECTION-OPTIMIERUNG (KRITISCH):**
   
   ENTFERNE NUR diese Verbindungen:
   - SCHÄDLICHE Zyklen: "Start" ↔ "Prozess" (Endlosschleife)
   - LOGISCHE Widersprüche: "Ja" → "Nein", "Erfolg" → "Fehler"  
   - DEFEKTE Verbindungen: zu nicht-existierenden Elementen
   
   BEHALTE diese Verbindungen (NICHT löschen):
   - Prozess-Rückschleifen: "Korrektur" → "Prüfung" (normal bei Iterationen)
   - Entscheidungs-Zweige: "Entscheidung" → "Option A" + "Option B"
   - Datenfluss-Ketten: "Erstellen" → "Prüfen" → "Senden"
   
   FÜGE KRITISCHE fehlende Verbindungen hinzu:
   - Sequenzielle Abläufe: "Angebot erstellen" → "Kundenentscheidung"
   - Entscheidungspfade: "Entscheidung" → "Ja" + "Nein" (beide Pfade!)
   - Workflow-Kontinuität: Unterbrochene Prozessketten reparieren
   - Start/Ende-Verbindungen: Isolierte Prozessschritte anbinden

2. **SWIMLANE-OPTIMIERUNG:**
   - Ordne Elemente der logisch richtigen Swimlane zu
   - Beispiele: "Rechnung versenden" → Finanzen, "Kunde kontaktieren" → Vertrieb
   - Passe Swimlane-Höhen an, falls Elemente nicht passen
   - Minimiere Swimlane-übergreifende Verbindungen wo möglich

3. **STATUS-BASIERTE OPTIMIERUNG:**
   - Priorisiere "Aktive" und "Wartende" Prozesse sichtbar
   - Gruppiere "Blockierte" Prozesse für Problem-Analyse  
   - Positioniere "Abgeschlossene" Prozesse am Ende
   - "Archivierte" Prozesse minimieren oder ausblenden

4. **LAYOUT-INTELLIGENZ:**
   - Optimiere Positionen innerhalb korrekter Swimlanes
   - Reduziere Verbindungskreuzungen
   - Logischer Fluss: links → rechts chronologisch

5. **SWIMLANE-ANPASSUNGEN:**
   - Berechne benötigte Swimlane-Höhen basierend auf Element-Anzahl
   - Schlage Höhen-Anpassungen vor (minimal 120px, maximal 300px)

6. **WICHTIG FÜR POSITIONIERUNG:**
- Platziere Elemente in der MITTE ihrer zugewiesenen Swimlane
- Verwende die oben gezeigten Y-Bereiche für korrekte vertikale Positionierung
- Verteile Elemente vertikal innerhalb ihrer Swimlanes (NICHT alle auf Y=100-150!)

7. **VERBINDLICHE REGELN FÜR ALLE NEUEN POSITIONEN:**
- Mindestabstand zwischen Elementen: 150px horizontal, 100px vertikal
- Prüfe ALLE vorgeschlagenen Positionen auf Überlappungen
- Falls Kollision erkannt: verschiebe X um +/- 150px oder Y um +/- 80px (innerhalb Swimlane)
- Workflow-Logik beibehalten: Start links (X<200), Prozesse Mitte (X 200-800), Ende rechts (X>800)

8. KRITISCHE KOLLISIONS-CHECKS:
- Element A bei (200,150) blockiert Bereich 50-350 x 50-250  
- Element B darf NICHT in (50-350) x (50-250) platziert werden
- Sichere Alternative für B: (400,150) oder (200,300) oder (200,50)

ERWARTETE ANTWORT-STRUKTUR - füge in hauptprobleme Connection-Optimierungen hinzu:
{
  "efficiency_score": 1-10,
  "layout_score": 1-10,
  "hauptprobleme": [
    {
      "problem": "Fehlende kritische Verbindung", 
      "impact": "Workflow unterbrochen zwischen Angebot und Entscheidung", 
      "affected_elements": ["element-6", "element-7"],
      "solution": "add_connection",
      "from_element": "Angebot erstellen",
      "to_element": "Kundenentscheidung",
      "connection_type": "flow"
    },
    {
      "problem": "Schädlicher Zyklus erkannt",
      "impact": "Endlosschleife zwischen Start und Prozess", 
      "affected_elements": ["element-8", "element-9"],
      "solution": "remove_connection",
      "remove_connection_id": "conn-123"
    }
  ],
  "status_optimierung": {
    "blocked_elements": ["element-id"],
    "priority_elements": ["element-id"], 
    "recommendations": ["Beschreibung"]
  },
  "swimlane_optimierung": {
    "repositioning_needed": true/false,
    "lane_assignments": [
      {
        "element_id": "element-6",
        "current_lane": "produktion", 
        "recommended_lane": "finanzen",
        "reason": "Rechnungsprozess gehört zu Finanzen"
      }
    ],
    "lane_adjustments": [
      {
        "lane_id": "finanzen",
        "current_height": 150,
        "recommended_height": 200,
        "reason": "Mehr Platz für 3 Finanz-Prozesse benötigt"
      }
    ]
  },
  "layout_optimierung": {
    "repositioning_needed": true,
    "optimized_positions": [
      {
        "element_id": "element-6",
        "x": 100,
        "y": 180,
        "swimlane": "finanzen",
        "reason": "Finanz-Prozess in korrekte Lane"
      }
    ]
  },
  "quick_wins": [{"aktion": "", "zeitersparnis": "", "implementation": ""}],
  "naechste_schritte": [{"schritt": "", "prioritaet": "", "aufwand": ""}]
}

KRITISCH: 
1. Verwende echte Element-IDs (element-6, element-7, etc.) in allen Optimierungsvorschlägen!
2. Platziere Elemente in den korrekten Y-Bereichen ihrer Swimlanes!
3. Verwende NIEMALS identische oder zu nahe Koordinaten für verschiedene Elemente!
4. FÜR CONNECTION-OPTIMIERUNG: Nutze hauptprobleme mit solution: "add_connection" oder "remove_connection"!

ZUSÄTZLICH: Wenn Connection-Optimierung nötig ist, füge auch diesen Block hinzu:
"connection_optimierung": {
  "optimization_needed": true,
  "remove_connections": ["conn-id-aus-hauptprobleme"],
  "add_connections": [
    {
      "from_element": "Element Name aus hauptprobleme",
      "to_element": "Element Name aus hauptprobleme",
      "connection_type": "flow"
    }
  ]
}
`;
}

isHarmfulCycle(fromText, toText) {
    const from = fromText.toLowerCase();
    const to = toText.toLowerCase();
    
    if ((from.includes('start') && to.includes('start')) ||
        (from.includes('ende') && to.includes('ende'))) {
        return true;
    }
    
    if ((from.includes('erstell') && to.includes('erstell')) ||
        (from.includes('senden') && to.includes('senden'))) {
        return true;
    }
    
    return false;
}

isLogicalContradiction(fromText, toText) {
    const from = fromText.toLowerCase();
    const to = toText.toLowerCase();
    
    return (
        (from.includes('ja') && to.includes('nein')) ||
        (from.includes('nein') && to.includes('ja')) ||
        (from.includes('erfolg') && to.includes('fehler')) ||
        (from.includes('fehler') && to.includes('erfolg')) ||
        (from.includes('akzeptiert') && to.includes('abgelehnt')) ||
        (from.includes('abgelehnt') && to.includes('akzeptiert'))
    );
}

findMissingCriticalConnections(elements, connections) {
    const missing = [];
    const connectionMap = new Map();
    
    connections.forEach(c => {
        if (!connectionMap.has(c.from_id)) connectionMap.set(c.from_id, []);
        connectionMap.get(c.from_id).push(c.to_id);
    });

    elements.forEach(fromEl => {
        const fromText = fromEl.text.toLowerCase();
        
        elements.forEach(toEl => {
            if (fromEl.id === toEl.id) return;
            
            const toText = toEl.text.toLowerCase();
            const hasConnection = connectionMap.get(fromEl.id)?.includes(toEl.id);
            
            if (!hasConnection && this.shouldBeConnected(fromText, toText)) {
                missing.push({
                    from: fromEl.text,
                    to: toEl.text,
                    reason: this.getConnectionReason(fromText, toText)
                });
            }
        });
    });
    
    return missing;
}

shouldBeConnected(fromText, toText) {
    // Sequenzielle Abläufe
    const sequences = [
        ['angebot', 'entscheidung'],
        ['erstell', 'prüf'],
        ['erstell', 'senden'],
        ['prüf', 'entscheidung'],
        ['entscheidung', 'ja'],
        ['entscheidung', 'nein'],
        ['anfrage', 'bearbeitung'],
        ['bearbeitung', 'antwort']
    ];
    
    return sequences.some(([first, second]) => 
        fromText.includes(first) && toText.includes(second)
    );
}

getConnectionReason(fromText, toText) {
    if (fromText.includes('angebot') && toText.includes('entscheidung')) {
        return 'Angebot muss zu Entscheidung führen';
    }
    if (fromText.includes('entscheidung') && (toText.includes('ja') || toText.includes('nein'))) {
        return 'Entscheidung braucht Ja/Nein-Pfade';
    }
    return 'Logischer Workflow-Schritt';
}

analyzeConnectionProblems(data) {
    let analysis = "ERKANNTE CONNECTION-PROBLEME:\n";
    
    if (!data.connections || data.connections.length === 0) {
        analysis += "- Keine Verbindungen vorhanden - Prozess ist isoliert\n";
        analysis += "- Empfehlung: Logische Verbindungen zwischen Prozessschritten erstellen\n";
        return analysis;
    }
    
    const contradictions = data.connections.filter(conn => {
        const fromText = conn.from.toLowerCase();
        const toText = conn.to.toLowerCase();
        return (fromText.includes('ja') && toText.includes('nein')) ||
               (fromText.includes('nein') && toText.includes('ja')) ||
               (fromText.includes('erfolg') && toText.includes('fehler')) ||
               (fromText.includes('fehler') && toText.includes('erfolg'));
    });
    
    if (contradictions.length > 0) {
        analysis += `- ${contradictions.length} widersprüchliche Verbindungen erkannt (Ja→Nein, Erfolg→Fehler)\n`;
        contradictions.forEach(conn => {
            analysis += `  * ${conn.from} → ${conn.to} (ID: ${conn.id})\n`;
        });
    }
    
    const connectedElements = new Set();
    data.connections.forEach(conn => {
        connectedElements.add(conn.from_id);
        connectedElements.add(conn.to_id);
    });
    
    const isolatedCount = data.elements.length - connectedElements.size;
    if (isolatedCount > 0) {
        analysis += `- ${isolatedCount} isolierte Elemente ohne Verbindungen\n`;

        const isolatedElements = data.elements.filter(el => !connectedElements.has(el.id));
        isolatedElements.forEach(el => {
            analysis += `  * "${el.text}" (${el.id})\n`;
        });
    }
    
    const decisionElements = data.elements.filter(el => 
        el.text.toLowerCase().includes('?') || 
        el.text.toLowerCase().includes('entscheidung') ||
        el.text.toLowerCase().includes('prüf')
    );
    
    decisionElements.forEach(decisionEl => {
        const outgoingConnections = data.connections.filter(conn => conn.from_id === decisionEl.id);
        if (outgoingConnections.length < 2) {
            analysis += `- Entscheidungselement "${decisionEl.text}" hat nur ${outgoingConnections.length} ausgehende Verbindung(en)\n`;
            analysis += `  * Empfehlung: Ja/Nein-Pfade hinzufügen\n`;
        }
    });
    
    const connectionMap = new Map();
    data.connections.forEach(conn => {
        if (!connectionMap.has(conn.from_id)) {
            connectionMap.set(conn.from_id, []);
        }
        connectionMap.get(conn.from_id).push(conn.to_id);
    });
    
    let cyclesDetected = 0;
    for (let [fromId, toIds] of connectionMap.entries()) {
        toIds.forEach(toId => {
            const backConnections = connectionMap.get(toId) || [];
            if (backConnections.includes(fromId)) {
                cyclesDetected++;
            }
        });
    }
    
    if (cyclesDetected > 0) {
        analysis += `- ${Math.floor(cyclesDetected/2)} potenzielle Zyklen erkannt (können Endlosschleifen verursachen)\n`;
    }
    
    if (analysis === "ERKANNTE CONNECTION-PROBLEME:\n") {
        analysis += "- Keine offensichtlichen Connection-Probleme erkannt\n";
    }
    
    return analysis;
}


    async optimizeLayoutWithMistral(elements, connections) {
        const layoutPrompt = this.buildLayoutOptimizationPrompt(elements, connections);
        const response = await this.callMistralAPI(layoutPrompt);
        return this.parseStructuredResponse(response);
    }

    buildLayoutOptimizationPrompt(elements, connections) {
        const elementsText = elements && elements.length > 0
            ? elements.map(el => `- ${el.id}: "${el.text}" Position: (${el.x},${el.y}) Typ: ${el.type}`).join('\n')
            : '- Keine Elemente vorhanden';
            
        const connectionsText = connections && connections.length > 0
            ? connections.map(c => `- ${c.from} → ${c.to}`).join('\n')
            : '- Keine Verbindungen vorhanden';

        return `Optimiere das Layout dieser Geschäftsprozess-Elemente für maximale Klarheit und Workflow-Effizienz.

        AKTUELLE ELEMENTE:
        ${elementsText}

        VERBINDUNGEN:
        ${connectionsText}

        OPTIMIERUNGSZIELE:
        1. Minimiere Überschneidungen
        2. Logischer Workflow-Fluss (links → rechts oder top → bottom)
        3. Gruppierung verwandter Elemente
        4. Optimale Abstände (min 150px zwischen Elementen)
        5. Swimlane-Berücksichtigung

        Gib EXAKT dieses JSON-Format zurück:
        {
        "layout_improvements": {
            "score_before": 1-10,
            "score_after": 1-10,
            "improvements": ["Verbesserung 1", "Verbesserung 2"]
        },
        "optimized_positions": [
            {"id": "element_id", "x": 200, "y": 100, "reason": "Begründung für Position"}
        ],
        "flow_direction": "horizontal/vertical",
        "grouping_suggestions": [
            {"group_name": "Gruppe", "elements": ["id1", "id2"], "reason": "Begründung"}
        ]
        }`;
    }

    async callMistralAPI(prompt) {
        const apiKey = getMistralAPIKey();

        if (!apiKey) {
            throw new Error('Mistral AI API Key nicht konfiguriert. Bitte in Einstellungen hinzufügen.');
        }

        const response = await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                max_tokens: 2000,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            throw new Error(`Mistral API Fehler: ${response.status} - ${response.statusText}`);
        }

        const result = await response.json();
        return result.choices[0].message.content;
    }

    parseStructuredResponse(responseText) {
    try {
        //console.log('Raw AI Response:', responseText.substring(0, 500));
        
        const cleanText = responseText.trim();
        
        let jsonText = cleanText;
        
        if (cleanText.includes('```json')) {
            const jsonStart = cleanText.indexOf('```json') + 7;
            const jsonEnd = cleanText.indexOf('```', jsonStart);
            if (jsonEnd > jsonStart) {
                jsonText = cleanText.substring(jsonStart, jsonEnd).trim();
            }
        }
        else {
            const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
            }
        }
        
        //console.log('Extracted JSON:', jsonText.substring(0, 200));
        
        const parsed = JSON.parse(jsonText);
        this.validateResponseStructure(parsed);
        
        return parsed;
    } catch (error) {
        //console.warn('JSON Parse-Fehler, verwende Fallback:', error);
        //console.log('Failed text:', responseText.substring(0, 1000));
        return this.createFallbackResponse(responseText);
    }
}

    validateResponseStructure(response) {
    const requiredFields = ['efficiency_score', 'layout_score', 'hauptprobleme', 'layout_optimierung', 'swimlane_optimierung'];
   
    requiredFields.forEach(field => {
        if (!(field in response)) {
            //console.warn(`Fehlende Struktur in AI Response: ${field}`);
            switch(field) {
                case 'layout_optimierung':
                    response[field] = { repositioning_needed: false, optimized_positions: [] };
                    break;
                case 'swimlane_optimierung':
                    response[field] = { repositioning_needed: false, lane_assignments: [] };
                    break;
                case 'hauptprobleme':
                    response[field] = [];
                    break;
                default:
                    response[field] = null;
            }
        }
    });
}

    createFallbackResponse(text) {
        return {
            efficiency_score: 7,
            layout_score: 6,
            hauptprobleme: [
                {
                    problem: "KI-Antwort konnte nicht vollständig geparst werden",
                    severity: "medium",
                    affected_elements: []
                }
            ],
            layout_optimierung: {
                repositioning_needed: false,
                optimized_positions: []
            },
                swimlane_optimierung: {
                repositioning_needed: false,
                lane_assignments: []
            },
            status_optimierung: {
                blocked_elements: [],
                priority_elements: [],
                recommendations: ["Manuelle Überprüfung empfohlen - KI-Antwort war unvollständig"]
            },
            raw_response: text.substring(0, 500)
        };
    }

    showIntelligentResults(analysis) {
        this.createAdvancedResultsDialog(analysis);
        window.currentMistralAnalysis = analysis;
    }

    createAdvancedResultsDialog(analysis) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.8); z-index: 20000;
            display: flex; align-items: center; justify-content: center;
        `;
        
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white; border-radius: 16px; padding: 32px;
            max-width: 900px; max-height: 90vh; overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        `;
        
        dialog.innerHTML = `
            <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #2c3e50; margin-bottom: 12px;">
                    Mistral AI Intelligente Prozessanalyse
                </h2>
                <p style="color: #666; margin: 0;">Echte KI-Intelligenz für Ihre Geschäftsprozesse</p>
            </div>
            
            <!-- SCORES -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 12px;">
                    <div style="font-size: 36px; font-weight: bold; color: ${this.getScoreColor(analysis.efficiency_score)};">
                        ${analysis.efficiency_score || 'N/A'}/10
                    </div>
                    <div style="color: #666; margin-top: 8px;">Workflow-Effizienz</div>
                </div>
                <div style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 12px;">
                    <div style="font-size: 36px; font-weight: bold; color: ${this.getScoreColor(analysis.layout_score)};">
                        ${analysis.layout_score || 'N/A'}/10
                    </div>
                    <div style="color: #666; margin-top: 8px;">Layout-Qualität</div>
                </div>
            </div>
            
            <!-- HAUPTPROBLEME -->
            ${analysis.hauptprobleme && analysis.hauptprobleme.length > 0 ? `
            <div style="margin-bottom: 24px;">
                <h3 style="color: #495057; margin-bottom: 16px;">Erkannte Probleme</h3>
                ${analysis.hauptprobleme.map(problem => `
                    <div style="background: #F8F9FA; border-left: 4px solid #000; padding: 16px; margin-bottom: 12px; border-radius: 0 8px 8px 0;">
                        <strong>${problem.problem}</strong>
                        <br><small style="color: #495057;">Schweregrad: ${problem.severity}</small>
                        ${problem.affected_elements && problem.affected_elements.length > 0 ? 
                            `<br><small>Betroffene Elemente: ${problem.affected_elements.join(', ')}</small>` : ''}
                    </div>
                `).join('')}
            </div>
            ` : ''}
            
            <!-- STATUS OPTIMIERUNGEN -->
            ${analysis.status_optimierung?.recommendations && analysis.status_optimierung.recommendations.length > 0 ? `
            <div style="margin-bottom: 24px;">
                <h3 style="color: #495057; margin-bottom: 16px;">Status-Empfehlungen</h3>
                ${analysis.status_optimierung.recommendations.map(rec => `
                    <div style="background: #F8F9FA; border-left: 4px solid #000; padding: 14px; margin-bottom: 10px; border-radius: 0 6px 6px 0;">
                        ${rec}
                    </div>
                `).join('')}
            </div>
            ` : ''}

            <!-- SWIMLANE OPTIMIERUNGEN -->
            ${analysis.swimlane_optimierung?.lane_assignments && analysis.swimlane_optimierung.lane_assignments.length > 0 ? `
            <div style="margin-bottom: 24px;">
                <h3 style="color: #495057; margin-bottom: 16px;">Swimlane-Zuordnungen</h3>
                ${analysis.swimlane_optimierung.lane_assignments.map(assignment => `
                    <div style="background: #F8F9FA; border-left: 4px solid #000; padding: 14px; margin-bottom: 10px; border-radius: 0 6px 6px 0;">
                        <strong>${assignment.element_id}</strong> → ${assignment.recommended_lane}<br>
                        <small>${assignment.reason}</small>
                    </div>
                `).join('')}
            </div>
            ` : ''}
            
            <!-- QUICK WINS -->
            ${analysis.quick_wins && analysis.quick_wins.length > 0 ? `
            <div style="margin-bottom: 24px;">
                <h3 style="color: #495057; margin-bottom: 16px;">Sofort-Optimierungen</h3>
                ${analysis.quick_wins.map(win => `
                    <div style="background: #F8F9FA; border-left: 4px solid #000; padding: 14px; margin-bottom: 10px; border-radius: 0 6px 6px 0;">
                        <strong>${win.aktion}</strong><br>
                        <small>Zeitersparnis: ${win.zeitersparnis} | ${win.implementation}</small>
                    </div>
                `).join('')}
            </div>
            ` : ''}
            
            <!-- LAYOUT OPTIMIERUNG -->
            ${analysis.layout_optimierung && analysis.layout_optimierung.repositioning_needed ? `
            <div style="margin-bottom: 24px;">
                <h3 style="color: #6f42c1; margin-bottom: 16px;">Layout-Optimierung verfügbar</h3>
                <div style="background: #f8f5ff; border: 2px solid #6f42c1; padding: 16px; border-radius: 8px;">
                    <p style="margin-bottom: 12px;">Die KI hat ${analysis.layout_optimierung.optimized_positions?.length || 0} Positionsverbesserungen identifiziert.</p>
                    <button onclick="applyLayoutOptimization()" style="
                        padding: 12px 20px; background: #6f42c1; color: white;
                        border: none; border-radius: 8px; cursor: pointer; font-weight: bold;
                    ">Layout automatisch optimieren</button>
                </div>
            </div>
            ` : ''}
            
            <!-- AKTIONSPLAN -->
            ${analysis.naechste_schritte && analysis.naechste_schritte.length > 0 ? `
            <div style="margin-bottom: 24px;">
                <h3 style="color: #495057; margin-bottom: 16px;">Nächste Schritte</h3>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 16px;">
                    <ol style="margin: 0; padding-left: 20px;">
                        ${analysis.naechste_schritte.map(schritt => `
                            <li style="margin-bottom: 8px;">
                                <strong>${schritt.schritt}</strong>
                                <br><small>Zeitrahmen: ${schritt.zeitrahmen} | Priorität: ${schritt.priority}</small>
                            </li>
                        `).join('')}
                    </ol>
                </div>
            </div>
            ` : ''}
            
            <!-- BUTTONS -->
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button onclick="exportMistralAnalysis()" style="
                    padding: 12px 20px; background: #17a2b8; color: white; 
                    border: none; border-radius: 8px; cursor: pointer;
                ">Analyse exportieren</button>
                <button onclick="this.closest('.mistral-results-overlay').remove()" style="
                    padding: 12px 24px; background: #6c757d; color: white; 
                    border: none; border-radius: 8px; cursor: pointer;
                ">Schließen</button>
            </div>
        `;
        
        overlay.className = 'mistral-results-overlay';
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }

    getScoreColor(score) {
        if (score >= 8) return '#28a745';
        if (score >= 6) return '#ffc107';
        return '#dc3545';
    }

    getPriorityColor(priority) {
        switch (priority) {
            case 'high': return '#dc3545';
            case 'medium': return '#ffc107';
            case 'low': return '#6c757d';
            default: return '#17a2b8';
        }
    }

    calculateComplexityLevel() {
        const elementCount = (projectData.elements || []).length;
        if (elementCount <= 3) return 'low';
        if (elementCount <= 8) return 'medium';
        return 'high';
    }

    determineWorkflowType() {
        const elements = projectData.elements || [];
        const connections = projectData.connections || [];
        
        const hasDecisions = elements.some(el => el.type === 'diamond');
        const hasParallelPaths = connections.length > elements.length;
        
        if (hasParallelPaths) return 'parallel_workflow';
        if (hasDecisions) return 'decision_workflow';
        return 'linear_workflow';
    }

    handleAPIError(error) {
        if (error.message.includes('401')) {
            showToast('API-Key ungültig. Bitte in Einstellungen überprüfen.', 'error');
        } else if (error.message.includes('429')) {
            showToast('Rate-Limit erreicht. Bitte später versuchen.', 'warning');
        } else if (error.message.includes('fetch')) {
            showToast('Netzwerk-Fehler. Internetverbindung prüfen.', 'error');
        } else {
            showToast(`KI-Analyse fehlgeschlagen: ${error.message}`, 'error');
        }
    }

    canMakeRequest() {
        const now = Date.now();
        return (now - this.lastRequestTime) >= this.minRequestInterval;
    }

    checkUsageLimit() {
        const currentMonth = new Date().toISOString().slice(0, 7);
        if (this.usageStats.month !== currentMonth) {
            this.usageStats = { month: currentMonth, count: 0 };
        }
        return this.usageStats.count < this.maxMonthlyUsage;
    }

    loadUsageStats() {
        try {
            return JSON.parse(localStorage.getItem('mistral_usage_stats') || '{"month":"","count":0}');
        } catch {
            return { month: "", count: 0 };
        }
    }

    updateUsageStats() {
        this.usageStats.count++;
        this.lastRequestTime = Date.now();
        localStorage.setItem('mistral_usage_stats', JSON.stringify(this.usageStats));
    }
}

window.mistralAnalyzer = new MistralBusinessAnalyzer();

window.startMistralAnalysis = function() {
    window.mistralAnalyzer.analyzeProject();
};

window.applyOptimization = function(index) {
    const analysis = window.currentMistralAnalysis;
    if (!analysis || !analysis.optimierungen[index]) {
        showToast('Optimierung nicht gefunden', 'error');
        return;
    }
    
    const optimization = analysis.optimierungen[index];
    //console.log('Anwenden von KI-Optimierung:', optimization);
    
    showToast(`Optimierung wird angewendet: ${optimization.titel}`, 'info');
    saveToHistory(`KI-Optimierung: ${optimization.titel}`);
    
    try {
        if (isConnectionOptimization(optimization)) {
            applyAdvancedConnectionOptimization(optimization);
        } else if (isLayoutOptimization(optimization)) {
            applyAdvancedLayoutOptimization(optimization);
        } else if (isSwimlanesOptimization(optimization)) {
            applyAdvancedSwimlanesOptimization(optimization);
        } else {
            applyGenericOptimization(optimization);
        }
        
        setTimeout(() => {
            recalculateAllConnections();
            showToast(`Optimierung "${optimization.titel}" erfolgreich angewendet!`, 'success');
        }, 300);
        
    } catch (error) {
        console.error('Fehler bei KI-Optimierung:', error);
        showToast(`Fehler: ${error.message}`, 'error');
    }
};

function isConnectionOptimization(optimization) {
    const keywords = ['verbindung', 'entscheidungsfluss', 'zyklus', 'schleife', 'inkonsistenz', 'logik'];
    const text = (optimization.titel + ' ' + optimization.beschreibung).toLowerCase();
    return keywords.some(keyword => text.includes(keyword));
}

function isLayoutOptimization(optimization) {
    const keywords = ['layout', 'position', 'anordnung', 'überlappung'];
    const text = (optimization.titel + ' ' + optimization.beschreibung).toLowerCase();
    return keywords.some(keyword => text.includes(keyword));
}

function isSwimlanesOptimization(optimization) {
    const keywords = ['swimlane', 'verantwortlichkeit', 'zuständigkeit', 'abteilung'];
    const text = (optimization.titel + ' ' + optimization.beschreibung).toLowerCase();
    return keywords.some(keyword => text.includes(keyword));
}

function applyAdvancedConnectionOptimization(optimization) {
    console.log('Erweiterte Verbindungs-Optimierung:', optimization);
    
    const affectedElements = optimization.affected_elements || [];
    const manager = getConnectionManager();
    
    removeProblematicConnections(affectedElements, optimization);
    createLogicalConnections(affectedElements, optimization);
    if (optimization.beschreibung.toLowerCase().includes('entscheidung')) {
        fixDecisionFlow(affectedElements);
    }
    if (optimization.beschreibung.toLowerCase().includes('zyklus') || 
        optimization.beschreibung.toLowerCase().includes('schleife')) {
        removeCyclicConnections();
    }
}

function removeProblematicConnections(affectedElements, optimization) {
    const connections = projectData.connections || [];
    const manager = getConnectionManager();
    let removedCount = 0;
    
    const elementIds = findElementIdsByNames(affectedElements);
    
    //console.log('Suche problematische Verbindungen zwischen:', elementIds);
    
  
    for (let i = connections.length - 1; i >= 0; i--) {
        const conn = connections[i];
        
        if (shouldRemoveConnection(conn, elementIds, optimization)) {
            manager.deleteConnection(conn.id);
            
            connections.splice(i, 1);
            removedCount++;
            
            //console.log(`Problematische Verbindung entfernt: ${conn.from} -> ${conn.to}`);
        }
    }
    
    if (removedCount > 0) {
        showToast(`${removedCount} problematische Verbindung(en) entfernt`, 'info');
    }
}

function shouldRemoveConnection(connection, elementIds, optimization) {
    if (!elementIds.includes(connection.from) || !elementIds.includes(connection.to)) {
        return false;
    }
    
    const desc = optimization.beschreibung.toLowerCase();
    
    if (desc.includes('ja') && desc.includes('nein')) {
        // Entferne "Ja -> Nein" Verbindungen
        const fromElement = findElementById(connection.from);
        const toElement = findElementById(connection.to);
        
        if (fromElement && toElement) {
            const fromText = fromElement.text.toLowerCase();
            const toText = toElement.text.toLowerCase();
            
            if ((fromText.includes('ja') && toText.includes('nein')) ||
                (fromText.includes('nein') && toText.includes('ja'))) {
                return true;
            }
        }
    }
    
    if (desc.includes('schleife') || desc.includes('zyklus')) {
        return hasReverseConnection(connection);
    }
    
    return false;
}

function createLogicalConnections(affectedElements, optimization) {
    //console.log('Erstelle logische Verbindungen für:', affectedElements);
    
    const desc = optimization.beschreibung.toLowerCase();
    
    if (desc.includes('entscheidung')) {
        createDecisionConnections(affectedElements);
    }
    
    if (desc.includes('workflow') || desc.includes('prozess')) {
        createWorkflowConnections(affectedElements);
    }
}

function createDecisionConnections(affectedElements) {
    // Finde Entscheidungs-, Ja-, und Nein-Elemente
    const decisionElement = findElementByText(['entscheidung', 'decision']);
    const yesElement = findElementByText(['ja', 'yes'], ['nein', 'no']);
    const noElement = findElementByText(['nein', 'no'], ['ja', 'yes']);
    
    if (!decisionElement) {
        //console.warn('Kein Entscheidungs-Element gefunden');
        return;
    }
    
    const manager = getConnectionManager();
    
    // Erstelle Entscheidung -> Ja Verbindung
    if (yesElement && !connectionExists(decisionElement.id, yesElement.id)) {
        const yesConnId = manager.createConnection(decisionElement.id, yesElement.id, {
            style: { color: '#28a745', width: 2 },
            metadata: { label: 'Ja', optimized: true }
        });
        //console.log(`Logische Verbindung erstellt: ${decisionElement.text} -> ${yesElement.text}`);
    }
    
    // Erstelle Entscheidung -> Nein Verbindung
    if (noElement && !connectionExists(decisionElement.id, noElement.id)) {
        const noConnId = manager.createConnection(decisionElement.id, noElement.id, {
            style: { color: '#dc3545', width: 2 },
            metadata: { label: 'Nein', optimized: true }
        });
        //console.log(`Logische Verbindung erstellt: ${decisionElement.text} -> ${noElement.text}`);
    }
}

function createWorkflowConnections(affectedElements) {
    const elements = findElementsByNames(affectedElements);
    
    if (elements.length < 2) return;
    
    const manager = getConnectionManager();

    const sortedElements = sortElementsByWorkflowLogic(elements);
    
    for (let i = 0; i < sortedElements.length - 1; i++) {
        const fromElement = sortedElements[i];
        const toElement = sortedElements[i + 1];
        
        if (!connectionExists(fromElement.id, toElement.id)) {
            manager.createConnection(fromElement.id, toElement.id, {
                style: { color: '#3498db', width: 2 },
                metadata: { label: 'Workflow', optimized: true }
            });
            //console.log(`Workflow-Verbindung erstellt: ${fromElement.text} -> ${toElement.text}`);
        }
    }
}

function fixDecisionFlow(affectedElements) {
    //console.log('Repariere Entscheidungsfluss für:', affectedElements);
    
    const connections = projectData.connections || [];
    const manager = getConnectionManager();
    let fixedCount = 0;
    
    for (let i = connections.length - 1; i >= 0; i--) {
        const conn = connections[i];
        const fromElement = findElementById(conn.from);
        const toElement = findElementById(conn.to);
        
        if (fromElement && toElement) {
            const fromText = fromElement.text.toLowerCase();
            const toText = toElement.text.toLowerCase();
            
            // Entferne logisch inkonsistente Verbindungen
            if ((fromText.includes('ja') && toText.includes('nein')) ||
                (fromText.includes('nein') && toText.includes('ja'))) {
                
                manager.deleteConnection(conn.id);
                connections.splice(i, 1);
                fixedCount++;
                
                //console.log(`Inkonsistente Entscheidungsverbindung entfernt: ${fromElement.text} -> ${toElement.text}`);
            }
        }
    }
    
    if (fixedCount > 0) {
        showToast(`${fixedCount} inkonsistente Entscheidungsverbindung(en) repariert`, 'success');
    }
}

function removeCyclicConnections() {
    //console.log('Entferne zyklische Verbindungen...');
    
    const connections = projectData.connections || [];
    const manager = getConnectionManager();
    let removedCount = 0;
    
    
    const processedPairs = new Set();
    
    for (let i = connections.length - 1; i >= 0; i--) {
        const conn = connections[i];
        const pairKey = `${conn.from}-${conn.to}`;
        const reversePairKey = `${conn.to}-${conn.from}`;
        
        // Prüfe auf Rückverbindung
        const hasReverse = connections.some(c => 
            c.from === conn.to && c.to === conn.from && c.id !== conn.id
        );
        
        if (hasReverse && !processedPairs.has(pairKey)) {
            const reverseConn = connections.find(c => 
                c.from === conn.to && c.to === conn.from && c.id !== conn.id
            );
            
            if (reverseConn) {
                manager.deleteConnection(reverseConn.id);
                const reverseIndex = connections.indexOf(reverseConn);
                if (reverseIndex > -1) {
                    connections.splice(reverseIndex, 1);
                }
                removedCount++;
                
                processedPairs.add(pairKey);
                processedPairs.add(reversePairKey);
                
                //console.log(`Zyklische Verbindung entfernt: ${reverseConn.from} -> ${reverseConn.to}`);
            }
        }
    }
    
    if (removedCount > 0) {
        showToast(`${removedCount} zyklische Verbindung(en) entfernt`, 'success');
    }
}

function applyAdvancedLayoutOptimization(optimization) {
    //console.log('Erweiterte Layout-Optimierung:', optimization);
    
    const affectedElements = optimization.affected_elements || [];
    const elements = findElementsByNames(affectedElements);
    
    if (elements.length === 0) {
        showToast('Keine betroffenen Elemente für Layout-Optimierung gefunden', 'warning');
        return;
    }
    
    // Intelligente Positionierung basierend auf Workflow-Logik
    applyIntelligentPositioning(elements);
    
    showToast(`Layout für ${elements.length} Elemente optimiert`, 'success');
}

function applyIntelligentPositioning(elements) {
    // Sortiere Elemente nach Workflow-Logik
    const sortedElements = sortElementsByWorkflowLogic(elements);
    
    const baseX = 200;
    const baseY = 300;
    const spacingX = 300;
    const spacingY = 150;
    
    sortedElements.forEach((element, index) => {
        let newPosition;
        
        // Spezielle Positionierung für Entscheidungsstrukturen
        if (element.text.toLowerCase().includes('entscheidung')) {
            newPosition = { x: baseX + spacingX, y: baseY };
        } else if (element.text.toLowerCase().includes('ja') && !element.text.toLowerCase().includes('nein')) {
            newPosition = { x: baseX + spacingX * 2, y: baseY - spacingY };
        } else if (element.text.toLowerCase().includes('nein')) {
            newPosition = { x: baseX + spacingX * 2, y: baseY + spacingY };
        } else if (element.text.toLowerCase().includes('start') || index === 0) {
            newPosition = { x: baseX, y: baseY };
        } else {
            // Sequenzielle Positionierung
            const row = Math.floor(index / 3);
            const col = index % 3;
            newPosition = {
                x: baseX + col * spacingX,
                y: baseY + row * spacingY
            };
        }
        
        updateElementPosition(element, newPosition);
    });
}

function updateElementPosition(element, newPosition) {
    element.x = newPosition.x;
    element.y = newPosition.y;
    
    const domElement = document.getElementById(element.id);
    if (domElement) {
        domElement.style.left = newPosition.x + 'px';
        domElement.style.top = newPosition.y + 'px';
    }
    
    //console.log(`Element "${element.text}" repositioniert: (${newPosition.x}, ${newPosition.y})`);
}

function applyGenericOptimization(optimization) {
    //console.log('Generische Optimierung:', optimization);
    
    const affectedElements = optimization.affected_elements || [];
    
    affectedElements.forEach(elementName => {
        const element = findElementByText([elementName]);
        if (element) {
            if (!element.properties) {
                element.properties = {};
            }
            
            element.properties.optimized = true;
            element.properties.optimizationType = optimization.titel;
            element.properties.optimizationDate = new Date().toISOString();
            
            // Visueller Indikator
            const domElement = document.getElementById(element.id);
            if (domElement) {
                domElement.style.boxShadow = '0 0 10px rgba(40, 167, 69, 0.3)';
                domElement.title = `Optimiert: ${optimization.titel}`;
            }
        }
    });
    
    showToast(`Generische Optimierung "${optimization.titel}" angewendet`, 'info');
}

window.applyLayoutOptimization = async function() {
    const analysis = window.currentMistralAnalysis;
    
    if (!analysis) {
        showToast('Keine Analysedaten verfügbar', 'warning');
        return;
    }
    
    showToast('Koordinierte Optimierung wird angewendet...', 'info');
    saveToHistory('KI: Koordinierte Swimlane- & Layout-Optimierung');
    
    // Importiere und verwende den Coordinator
    const { swimlaneCoordinator } = await import('../ai/swimlane-coordinator.js');
    
    try {
        const changes = await swimlaneCoordinator.coordinateOptimization(analysis);
        
        if (changes > 0) {
            showToast(`Koordinierte Optimierung abgeschlossen! ${changes} Änderungen angewendet`, 'success');
        } else {
            showToast('Keine Optimierungen angewendet', 'info');
        }
    } catch (error) {
        //console.error('Koordinierte Optimierung fehlgeschlagen:', error);
        showToast('Optimierung fehlgeschlagen', 'error');
    }
};

if (!document.getElementById('status-animations-style')) {
    const style = document.createElement('style');
    style.id = 'status-animations-style';
    style.textContent = `
        @keyframes pulse-red {
            0% { box-shadow: 0 0 15px rgba(220, 53, 69, 0.5); }
            50% { box-shadow: 0 0 25px rgba(220, 53, 69, 0.8); }
            100% { box-shadow: 0 0 15px rgba(220, 53, 69, 0.5); }
        }
        
        @keyframes pulse-green {
            0% { box-shadow: 0 0 15px rgba(40, 167, 69, 0.5); }
            50% { box-shadow: 0 0 25px rgba(40, 167, 69, 0.8); }
            100% { box-shadow: 0 0 15px rgba(40, 167, 69, 0.5); }
        }
    `;
    document.head.appendChild(style);
}

function findElementByTextContent(searchText) {
    const elements = projectData.elements || [];
    
    //console.log(`Suche Element: "${searchText}"`);
    //console.log('Verfügbare Elemente:', elements.map(el => `${el.id}: "${el.text}"`));
   
    if (searchText.startsWith('element-')) {
        const directMatch = elements.find(el => el.id === searchText);
        if (directMatch) {
            //console.log(`Direkter ID-Match: ${searchText} -> "${directMatch.text}"`);
            return directMatch;
        }
    }
    
    const normalizedSearch = searchText.toLowerCase().trim();
    
    // Exakte Textübereinstimmung
    let textMatch = elements.find(element => {
        if (!element.text) return false;
        const normalizedElementText = element.text.toLowerCase().trim();
        return normalizedElementText === normalizedSearch;
    });
    
    if (textMatch) {
        //console.log(`Exakter Text-Match: "${searchText}" -> ${textMatch.id}`);
        return textMatch;
    }
    
    textMatch = elements.find(element => {
        if (!element.text) return false;
        const normalizedElementText = element.text.toLowerCase().trim();
        return normalizedElementText.includes(normalizedSearch) || 
               normalizedSearch.includes(normalizedElementText);
    });
    
    if (textMatch) {
        //console.log(`Teil-Match: "${searchText}" -> ${textMatch.id} ("${textMatch.text}")`);
        return textMatch;
    }

    for (const element of elements) {
        if (!element.text) continue;
        const normalizedElementText = element.text.toLowerCase().trim();
        if (fuzzyMatch(normalizedElementText, normalizedSearch)) {
            //console.log(`Fuzzy-Match: "${searchText}" -> ${element.id} ("${element.text}")`);
            return element;
        }
    }
    
    //console.warn(`Kein Match gefunden für: "${searchText}"`);
    return null;
}

function fuzzyMatch(str1, str2, threshold = 0.8) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return true;
    
    const editDistance = levenshteinDistance(longer, shorter);
    const similarity = (longer.length - editDistance) / longer.length;
    
    return similarity >= threshold;
}

function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

function findElementIdsByNames(names) {
    const elements = projectData.elements || [];
    const ids = [];
    
    names.forEach(name => {
        const element = elements.find(el => 
            el.text && el.text.toLowerCase().includes(name.toLowerCase())
        );
        if (element) {
            ids.push(element.id);
        }
    });
    
    return ids;
}

function findElementsByNames(names) {
    const elements = projectData.elements || [];
    const foundElements = [];
    
    names.forEach(name => {
        const element = elements.find(el => 
            el.text && el.text.toLowerCase().includes(name.toLowerCase())
        );
        if (element) {
            foundElements.push(element);
        }
    });
    
    return foundElements;
}

function findElementById(id) {
    const elements = projectData.elements || [];
    return elements.find(el => el.id === id);
}

function findElementByText(includeWords, excludeWords = []) {
    const elements = projectData.elements || [];
    
    return elements.find(el => {
        if (!el.text) return false;
        
        const text = el.text.toLowerCase();
    
        const hasInclude = includeWords.some(word => text.includes(word.toLowerCase()));
        if (!hasInclude) return false;
        
        const hasExclude = excludeWords.some(word => text.includes(word.toLowerCase()));
        return !hasExclude;
    });
}

function sortElementsByWorkflowLogic(elements) {
    return elements.sort((a, b) => {
        const aText = a.text.toLowerCase();
        const bText = b.text.toLowerCase();
        
        // Start-Elemente zuerst
        if (aText.includes('start') || aText.includes('kunde ruft')) return -1;
        if (bText.includes('start') || bText.includes('kunde ruft')) return 1;
        
        // Entscheidungen in der Mitte
        if (aText.includes('entscheidung') && !bText.includes('entscheidung')) return -1;
        if (bText.includes('entscheidung') && !aText.includes('entscheidung')) return 1;
        
        // Ende-Elemente zuletzt
        if (aText.includes('ende') || aText.includes('rechnung')) return 1;
        if (bText.includes('ende') || bText.includes('rechnung')) return -1;
        
        // Rest nach Position
        return a.x - b.x;
    });
}

function connectionExists(fromId, toId) {
    const connections = projectData.connections || [];
    return connections.some(conn => conn.from === fromId && conn.to === toId);
}

function hasReverseConnection(connection) {
    const connections = projectData.connections || [];
    return connections.some(conn => 
        conn.from === connection.to && 
        conn.to === connection.from && 
        conn.id !== connection.id
    );
}

function applyAdvancedSwimlanesOptimization(optimization) {
    //console.log('Erweiterte Swimlanes-Optimierung:', optimization);
    
    if (!projectData.swimLanes || !Array.isArray(projectData.swimLanes)) {
        projectData.swimLanes = [];
    }
    
    // Standard-Swimlanes hinzufügen
    const standardLanes = ['Vertrieb', 'Finanzen', 'Kundenservice', 'Management'];
    standardLanes.forEach(lane => {
        if (!projectData.swimLanes.includes(lane)) {
            projectData.swimLanes.push(lane);
        }
    });
    
    const affectedElements = optimization.affected_elements || [];
    let assignedCount = 0;
    
    affectedElements.forEach(elementName => {
        const element = findElementByText([elementName]);
        if (element) {
            const swimlane = determineSwimLane(element.text);
            element.swimLane = swimlane;
            
            const domElement = document.getElementById(element.id);
            if (domElement) {
                domElement.setAttribute('data-swimlane', swimlane);
            }
            
            assignedCount++;
            //console.log(`Swimlane zugewiesen: ${element.text} -> ${swimlane}`);
        }
    });
    
    showToast(`Swimlanes für ${assignedCount} Elemente optimiert`, 'success');
}

function determineSwimLane(elementText) {
    const text = elementText.toLowerCase();
    
    if (text.includes('angebot') || text.includes('kunde') || text.includes('verkauf')) {
        return 'Vertrieb';
    } else if (text.includes('rechnung') || text.includes('bezahlung') || text.includes('geld')) {
        return 'Finanzen';
    } else if (text.includes('service') || text.includes('support') || text.includes('hilfe')) {
        return 'Kundenservice';
    } else {
        return 'Management';
    }
}

window.exportMistralAnalysis = function() {
    const analysis = window.currentMistralAnalysis;
    if (!analysis) return;
    
    const exportData = {
        analysis_type: 'mistral_ai',
        timestamp: new Date().toISOString(),
        ...analysis
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    
    const link = document.createElement('a');
    link.setAttribute('href', dataUri);
    link.setAttribute('download', `mistral-ai-analysis-${new Date().toISOString().split('T')[0]}.json`);
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Mistral AI Analyse exportiert', 'success');
};

export function showMistralAPISettings() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.6); z-index: 15000;
        display: flex; align-items: center; justify-content: center;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white; border-radius: 16px; padding: 32px;
        max-width: 650px; box-shadow: 0 12px 40px rgba(0,0,0,0.3);
        max-height: 90vh; overflow-y: auto;
    `;
    
    dialog.innerHTML = `
        <h2 style="margin: 0 0 24px 0; color: #495057; text-align: center;">
            Mistral AI API-Key Konfiguration
        </h2>
        
        <div style="
            background: #F8F9FA; border: 1px solid black; border-radius: 8px; 
            padding: 16px; margin-bottom: 24px; color: #495057;
        ">
            <h4 style="margin: 0 0 12px 0; color: #495057;">Warum eigener API-Key?</h4>
            <ul style="margin: 8px 0; padding-left: 20px; font-size: 14px; line-height: 1.5; color: #495057;">
                <li><strong>Kostenlose Software:</strong> Diese App bleibt komplett kostenlos</li>
                <li><strong>Volle Kontrolle:</strong> Sie bestimmen Nutzung und Kosten</li>
                <li><strong>Transparenz:</strong> Keine versteckten Gebühren</li>
                <li><strong>EU-Datenschutz:</strong> Direkte Verbindung zu Mistral AI (Frankreich)</li>
            </ul>
        </div>
        
        <div style="background: #F8F9FA; border: 1px solid black; border-radius: 8px; padding: 16px; margin-bottom: 20px; color: #495057;">
            <h4 style="margin: 0 0 12px 0; color: #495057;">API-Key erhalten (2 Minuten):</h4>
            <ol style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: #495057;">
                <li>Gehen Sie zu <a href="https://console.mistral.ai" target="_blank" style="color: #495057; text-decoration: underline;">console.mistral.ai</a></li>
                <li>Kostenlose Registrierung (keine Kreditkarte)</li>
                <li>"API Keys" → "Create new key"</li>
                <li>Schlüssel kopieren und unten einfügen</li>
            </ol>
        </div>
        
        <div style="background: #F8F9FA; border: 1px solid black; border-radius: 8px; padding: 16px; margin-bottom: 20px; color: #495057;">
            <h4 style="margin: 0 0 8px 0; color: #495057;">Realistische Kosten:</h4>
            <div style="font-size: 14px; line-height: 1.4; color: #495057;">
                <strong>Mistral Small:</strong> ~0,08€ - 0,12€ pro Analyse<br>
                <strong>10 Analysen:</strong> ~1,00€<br>
                <strong>50 Analysen:</strong> ~4,00€<br>
                <em style="font-size: 13px;">Oft kostenloses Startkontingent verfügbar.</em>
            </div>
        </div>
        
        <div style="margin-bottom: 20px; color: #495057;">
            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #495057;">
                Mistral AI API-Key:
            </label>
            <input type="password" id="mistralApiKey" placeholder="Ihr API-Key von console.mistral.ai" style="
                width: 100%; padding: 12px; border: 2px solid black; border-radius: 8px;
                font-family: monospace; font-size: 14px; color: #495057;
            ">
            <small style="color: #495057; display: block; margin-top: 4px;">
                Wird nur lokal in Ihrem Browser gespeichert
            </small>
        </div>
        
        <div style="margin-bottom: 20px; color: #495057;">
            <label style="display: block; margin-bottom: 8px; font-weight: bold; color: #495057;">
                KI-Modell:
            </label>
            <select id="mistralModel" style="
                width: 100%; padding: 12px; border: 2px solid black; border-radius: 8px; color: #495057;
            ">
                <option value="mistral-small-latest">Mistral Small (Empfohlen, kostengünstig)</option>
                <option value="mistral-medium-latest">Mistral Medium (Bessere Qualität)</option>
                <option value="mistral-large-latest">Mistral Large (Beste Qualität)</option>
            </select>
        </div>
        
        <div style="background: #F8F9FA; border: 1px solid black; border-radius: 6px; padding: 12px; margin-bottom: 20px; font-size: 13px; color: #495057;">
            <strong>Datenschutz:</strong><br>
            • API-Key nur in Ihrem Browser gespeichert<br>
            • Prozessdaten gehen direkt zu Mistral AI<br>
            • Mistral AI (EU) ist DSGVO-konform<br>
            • Key jederzeit löschbar/widerrufbar
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end; align-items: center; flex-wrap: wrap;">
            <button onclick="this.closest('.mistral-settings-overlay').remove()" style="
                padding: 12px 20px; background: #495057; color: white; 
                border: none; border-radius: 8px; cursor: pointer; font-size: 14px;
            ">Abbrechen</button>
            
            <button onclick="testMistralConnection()" style="
                padding: 12px 20px; background: #495057; color: white; 
                border: none; border-radius: 8px; cursor: pointer; font-size: 14px;
            ">Verbindung testen</button>
            
            <button onclick="saveMistralSettings()" style="
                padding: 12px 24px; background: #495057; color: white; 
                border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;
            ">Speichern</button>
        </div>
    `;
    
    overlay.className = 'mistral-settings-overlay';
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const savedKey = localStorage.getItem('mistral_api_key');
    const savedModel = localStorage.getItem('mistral_model') || 'mistral-small-latest';
    
    if (savedKey) {
        document.getElementById('mistralApiKey').value = savedKey;
    }
    document.getElementById('mistralModel').value = savedModel;
}


window.saveMistralSettings = function() {
    const apiKey = document.getElementById('mistralApiKey').value.trim();
    const model = document.getElementById('mistralModel').value;
    
    if (!apiKey) {
        showToast('Bitte geben Sie einen API-Key ein', 'warning');
        return;
    }
    
    if (apiKey.length < 20) {
        const proceed = confirm('Der API-Key scheint sehr kurz. Trotzdem speichern?');
        if (!proceed) return;
    }
    
    localStorage.setItem('mistral_api_key', apiKey);
    localStorage.setItem('mistral_model', model);
    
    showToast('Mistral AI erfolgreich konfiguriert!', 'success');
    document.querySelector('.mistral-settings-overlay').remove();
    
    //console.log('Mistral AI Setup abgeschlossen:', model);
};

window.testMistralConnection = async function() {
    const apiKey = document.getElementById('mistralApiKey').value.trim();
    const model = document.getElementById('mistralModel').value;
    
    if (!apiKey) {
        showToast('Bitte geben Sie zuerst einen API-Key ein', 'warning');
        return;
    }
    
    const testBtn = event.target;
    const originalText = testBtn.textContent;
    testBtn.textContent = 'Teste...';
    testBtn.disabled = true;
    
    try {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [{
                    role: 'user',
                    content: 'Test: Antworte nur mit "Verbindung OK".'
                }],
                max_tokens: 20
            })
        });
        
        if (response.ok) {
            showToast('Mistral AI Verbindung erfolgreich!', 'success');
            //console.log('Mistral AI Test erfolgreich');
        } else {
            const errorText = await response.text();
            showToast('Verbindung fehlgeschlagen. API-Key prüfen.', 'error');
            //console.error('Mistral Test Fehler:', response.status, errorText);
        }
        
    } catch (error) {
        showToast('Netzwerk-Fehler. Internetverbindung prüfen.', 'error');
        //console.error('Mistral Test Fehler:', error);
    } finally {
        testBtn.textContent = originalText;
        testBtn.disabled = false;
    }
};

export function getMistralAPIKey() {
    return localStorage.getItem('mistral_api_key');
}

export function getMistralModel() {
    return localStorage.getItem('mistral_model') || 'mistral-small-latest';
}

export function isMistralConfigured() {
    return !!getMistralAPIKey();
}

class CollisionManager {
    constructor() {
        this.COLLISION_PADDING = 25; // Mindestabstand zwischen Elementen
        this.MAX_ATTEMPTS = 40;      // Maximale Versuche für Positionsfindung
    }

    validateAndCorrectPositions(optimizedPositions) {
        //console.log('Kollisionsprüfung für', optimizedPositions.length, 'Elemente startet...');
        
        const correctedPositions = [];
        const occupiedSpaces = new Map();
        const sortedPositions = this.prioritizePositions(optimizedPositions);
        
        for (const position of sortedPositions) {
            const element = this.findElementById(position.element_id);
            if (!element) {
                //console.warn(`Element nicht gefunden: ${position.element_id}`);
                continue;
            }
            
            const dimensions = this.getElementDimensions(element.type);
            
            // Finde kollisionsfreie Position
            const safePosition = this.findCollisionFreePosition(
                position, 
                dimensions, 
                occupiedSpaces, 
                position.swimlane
            );
            
            if (safePosition) {
                correctedPositions.push(safePosition);
                this.markSpaceAsOccupied(occupiedSpaces, safePosition, dimensions);
                
                //console.log(`Kollisionsfreie Position: ${position.element_id} -> (${safePosition.x}, ${safePosition.y})`);
            } else {
                //console.warn(`Keine sichere Position gefunden für: ${position.element_id}`);
                correctedPositions.push(position); // Fallback: Original beibehalten
            }
        }
        
        //console.log(`Kollisionsprüfung abgeschlossen: ${correctedPositions.length}/${optimizedPositions.length} Positionen gesichert`);
        return correctedPositions;
    }

    prioritizePositions(positions) {
        return positions.sort((a, b) => {
            // Start-Elemente haben Priorität
            const aIsStart = this.isStartElement(a.element_id);
            const bIsStart = this.isStartElement(b.element_id);
            
            if (aIsStart && !bIsStart) return -1;
            if (!aIsStart && bIsStart) return 1;
            return a.x - b.x;
        });
    }

    findCollisionFreePosition(targetPosition, dimensions, occupiedSpaces, swimlane) {
        const swimlaneBounds = this.getSwimlaneYBounds(swimlane);
        
        // Teste zuerst die ursprüngliche Position
        if (this.isPositionFree(targetPosition, dimensions, occupiedSpaces)) {
            return { ...targetPosition };
        }
        
        //console.log(`Suche Alternative für ${targetPosition.element_id}...`);
        
        for (let attempt = 1; attempt < this.MAX_ATTEMPTS; attempt++) {
            const searchRadius = attempt * 40;
            for (let angle = 0; angle < 360; angle += 60) {
                const radians = (angle * Math.PI) / 180;
                const testX = Math.max(0, Math.min(
                    CONSTANTS.CANVAS_WIDTH - dimensions.width,
                    targetPosition.x + Math.cos(radians) * searchRadius
                ));
                const testY = Math.max(
                    swimlaneBounds.minY,
                    Math.min(
                        swimlaneBounds.maxY - dimensions.height,
                        targetPosition.y + Math.sin(radians) * searchRadius * 0.4
                    )
                );
                
                const testPosition = { ...targetPosition, x: testX, y: testY };
                
                if (this.isPositionFree(testPosition, dimensions, occupiedSpaces)) {
                    //console.log(`Alternative gefunden nach ${attempt} Versuchen`);
                    return testPosition;
                }
            }
            
            for (const direction of [1, -1]) {
                const testX = Math.max(0, Math.min(
                    CONSTANTS.CANVAS_WIDTH - dimensions.width,
                    targetPosition.x + (searchRadius * direction)
                ));
                const testPosition = { ...targetPosition, x: testX };
                
                if (this.isPositionFree(testPosition, dimensions, occupiedSpaces)) {
                    //console.log(`Horizontale Alternative gefunden`);
                    return testPosition;
                }
            }
        }
        
        return null;
    }

    isPositionFree(position, dimensions, occupiedSpaces) {
        const testRect = {
            left: position.x - this.COLLISION_PADDING,
            right: position.x + dimensions.width + this.COLLISION_PADDING,
            top: position.y - this.COLLISION_PADDING,
            bottom: position.y + dimensions.height + this.COLLISION_PADDING
        };

        for (const [id, occupiedRect] of occupiedSpaces) {
            if (this.rectanglesOverlap(testRect, occupiedRect)) {
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

    getElementDimensions(elementType) {
        const defaultSizes = {
            rectangle: { width: 120, height: 80 },
            ellipse: { width: 120, height: 80 },
            diamond: { width: 100, height: 100 },
            parallelogram: { width: 140, height: 80 },
            cylinder: { width: 120, height: 90 },
            document: { width: 100, height: 120 }
        };
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
                    minY: currentY + 25,
                    maxY: currentY + lane.height - 105 // Platz für Element-Höhe
                };
            }
            currentY += lane.height;
        }
        
        return { minY: 50, maxY: 600 };
    }

    findElementById(elementId) {
        return projectData.elements?.find(el => el.id === elementId);
    }

    isStartElement(elementId) {
        const element = this.findElementById(elementId);
        if (!element) return false;
        
        const text = element.text?.toLowerCase() || '';
        return text.includes('start') || text.includes('begin') || text.includes('anfang');
    }
}

window.applyConnectionOptimizations = function(optimizationData) {
    console.log('Connection optimization called:', optimizationData);
    
    let removedCount = 0;
    let addedCount = 0;
    
    if (optimizationData && optimizationData.remove_connections) {
        removedCount = optimizationData.remove_connections.length || 0;
    }
    
    if (optimizationData && optimizationData.add_connections) {
        addedCount = optimizationData.add_connections.length || 0;
    }
    
    return { removed: removedCount, added: addedCount };
};
