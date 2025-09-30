import { aiPanelOpen, setAiPanelOpen, projectData } from '../utils/state.js';
import { showToast } from './toast.js';
import { isMistralConfigured, showMistralAPISettings } from '../utils/settings.js';

// ===== AI PANEL TOGGLE =====
export function toggleAI() {
    const panel = document.getElementById('aiPanel');
    setAiPanelOpen(!aiPanelOpen);
    
    if (aiPanelOpen) {
        panel.style.display = 'block';
        addCloseButtonToAIPanel();
        generateCleanAISuggestions();
    } else {
        panel.style.display = 'none';
    }
}

function addCloseButtonToAIPanel() {
    const panel = document.getElementById('aiPanel');
    const header = panel.querySelector('h4');
    
    if (panel.querySelector('.ai-panel-close-btn')) return;
    
    const closeButton = document.createElement('button');
    closeButton.className = 'ai-panel-close-btn';
    closeButton.innerHTML = '<i class="fas fa-times"></i>';
    closeButton.title = 'AI-Panel schließen';
    
    closeButton.style.cssText = `
        position: absolute; top: 15px; right: 15px;
        background: none; border: none; color: #666; font-size: 18px;
        cursor: pointer; width: 30px; height: 30px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s ease; z-index: 1001;
    `;
    
    closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAI();
    });
    
    panel.appendChild(closeButton);
    if (header) {
        header.style.paddingRight = '40px';
        header.style.position = 'relative';
    }
}

// AI SUGGESTIONS GENERIEREN 
export function generateCleanAISuggestions() {
    const suggestions = document.getElementById('aiSuggestions');

    let suggestionHTML = '';
    
    // Mistral AI Sektion
    suggestionHTML += generateMistralAISection();
    
    suggestions.innerHTML = suggestionHTML;
}

// MISTRAL AI SEKTION 
function generateMistralAISection() {
    if (!isMistralConfigured()) {
        return `
            <div class="suggestion-item mistral-setup" style="
                border: 2px solid #6f42c1; 
                background: #F8F9FA; 
                margin-bottom: 12px; padding: 16px; border-radius: 10px;
                box-shadow: 0 2px 8px rgba(255,193,7,0.15);
            ">
                <div style="margin-bottom: 12px;">
                    <strong style="font-size: 16px; color: #495057;">Intelligente KI-Analyse aktivieren</strong>
                </div>
                <p style="margin: 8px 0 12px 0; font-size: 14px; line-height: 1.4; color: #666;">
                    Professionelle Geschäftsprozess-Analyse mit Mistral AI
                </p>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                    <button onclick="showMistralAPISettings()" style="
                        padding: 12px 20px; 
                        background: #6f42c1; 
                        color: #FFF; border: none; border-radius: 6px; cursor: pointer;
                        font-weight: 600; font-size: 14px;
                        box-shadow: 0 2px 6px rgba(255,193,7,0.25);
                        transition: all 0.2s ease;
                    " onmouseover="this.style.transform='translateY(-1px)'" 
                       onmouseout="this.style.transform='none'">
                        Mistral AI einrichten
                    </button>
                </div>
                <small style="display: block; margin-top: 10px; font-size: 12px; color: #6c757d;">
                    Kostenlos nutzbar • EU-DSGVO-konform • Echte Intelligenz
                </small>
            </div>
        `;
    } else {
        return `
            <div class="suggestion-item mistral-active" style="
                border: 2px solid #dce0e3ff; 
                background: #F8F9FA; 
                margin-bottom: 12px; padding: 16px; border-radius: 10px;
                box-shadow: 0 2px 8px rgba(40,167,69,0.15);
            ">
                <div style="margin-bottom: 12px;">
                    <strong style="font-size: 16px; color: #495057;">Intelligente Prozessanalyse</strong>
                </div>
                <p style="margin: 8px 0 14px 0; font-size: 14px; line-height: 1.4; color: #666;">
                    Echte KI-Intelligenz für Ihre Geschäftsprozesse
                </p>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px;">
                    <button onclick="startMistralAnalysis()" style="
                        padding: 12px 18px; 
                        background: #6f42c1; 
                        color: white; border: none; border-radius: 6px; cursor: pointer;
                        font-weight: 600; font-size: 14px;
                        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
                        transition: all 0.2s ease;
                        width: 100%;
                    " onmouseover="this.style.transform='translateY(-1px)'" 
                       onmouseout="this.style.transform='none'">
                        KI-Analyse starten
                    </button>
                    <button onclick="showMistralAPISettings()" style="
                        padding: 10px 16px; background: #6c757d; color: white; 
                        border: none; border-radius: 5px; cursor: pointer; 
                        font-size: 13px; font-weight: 500;
                        transition: all 0.2s ease;
                        width: 100%;
                    " onmouseover="this.style.background='#5a6268'" 
                       onmouseout="this.style.background='#6c757d'">
                        Einstellungen
                    </button>
                </div>
            </div>
        `;
    }
}

// MISTRAL AI INTEGRATION 
window.startMistralAnalysis = async function() {
    if (!isMistralConfigured()) {
        showToast('Mistral AI noch nicht konfiguriert. Bitte einrichten.', 'warning');
        showMistralAPISettings();
        return;
    }
    
    if (projectData.elements.length === 0) {
        showToast('Erstellen Sie zuerst Prozesselemente für die Analyse', 'warning');
        return;
    }
    
    try {
        const analyzer = window.mistralAnalyzer;
        if (analyzer) {
            await analyzer.analyzeProject();
        } else {
            showToast('Mistral AI Analyzer nicht verfügbar', 'error');
        }
    } catch (error) {
        console.error('Mistral AI Analyse Fehler:', error);
        showToast('Fehler bei der KI-Analyse: ' + error.message, 'error');
    }
};

// ===== GLOBALE ZUWEISUNGEN =====
window.toggleAI = toggleAI;
