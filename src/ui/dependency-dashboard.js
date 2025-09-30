import { getDependencyEngine } from '../canvas/dependencies.js';
import { showToast } from './toast.js';

export function showDependencyDashboard() {
    const depEngine = getDependencyEngine();
    if (!depEngine) {
        showToast('Dependency Engine nicht verfügbar', 'error');
        return;
    }
    
    const report = depEngine.generateDependencyReport();
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.6); z-index: 15000;
        display: flex; align-items: center; justify-content: center;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
        background: white; border-radius: 16px; padding: 24px;
        max-width: 800px; max-height: 90vh; overflow-y: auto;
        box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    `;
    
    dialog.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <h2 style="margin: 0; color: #2c3e50;">
                Abhängigkeits-Dashboard
            </h2>
        </div>
        
        <!-- Metriken Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div style="background: #F8F9FA; padding: 16px; border-radius: 8px; text-align: center; border-left: 4px solid;">
                <div style="font-size: 24px; font-weight: bold; color: #495057;">${report.totalElements}</div>
                <div style="font-size: 12px; color: #495057;">Gesamt Elemente</div>
            </div>
            <div style="background: #F8F9FA; padding: 16px; border-radius: 6px; border-left: 4px solid; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #495057;">${report.totalConnections}</div>
                <div style="font-size: 12px; color: #495057;">Abhängigkeiten</div>
            </div>
            <div style="background: ${report.dependencyMetrics.cyclicDependencies > 0 ? '#F8F9FA' : '#F8F9FA'}; padding: 16px; border-radius: 8px; text-align: center; border-left: 4px solid;">
                <div style="font-size: 24px; font-weight: bold; color: ${report.dependencyMetrics.cyclicDependencies > 0 ? '#495057' : '#495057'};">
                    ${report.dependencyMetrics.cyclicDependencies}
                </div>
                <div style="font-size: 12px; color: #495057;">Zyklen</div>
            </div>
            <div style="background: #F8F9FA; padding: 16px; border-radius: 6px; border-left: 4px solid; text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #495057;">${report.bottlenecks.length}</div>
                <div style="font-size: 12px; color: #495057;">Bottlenecks</div>
            </div>
        </div>
        
        <!-- Critical Path -->
        ${report.criticalPath ? `
        <div style="background: #F8F9FA; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 12px 0; color: #495057;">
                Kritischer Pfad
            </h4>
            <div style="background: white; padding: 12px; border-radius: 6px; border-left: 4px solid; border-right: 4px solid;">
                <strong>${report.criticalPath.startElement}</strong><br>
                <small style="color: #6c757d;">Länge: ${report.criticalPath.length} Elemente</small><br>
                <div style="margin-top: 8px; font-size: 12px;">
                    ${report.criticalPath.elements.join(' → ')}
                </div>
            </div>
        </div>
        ` : ''}
        
        <!-- Empfehlungen -->
        ${report.recommendations.length > 0 ? `
        <div style="margin-bottom: 20px;">
            <h4 style="margin: 0 0 12px 0; color: #495057;">
                Empfehlungen
            </h4>
            ${report.recommendations.map(rec => `
                <div style="background: ${rec.priority === 'high' ? '#f8d7da' : '#fff3cd'}; 
                           border-left: 4px solid ${rec.priority === 'high' ? '#dc3545' : '#ffc107'}; 
                           padding: 12px; margin-bottom: 8px; border-radius: 0 6px 6px 0;">
                    <strong>${rec.title}</strong><br>
                    <small>${rec.description}</small><br>
                    <em style="font-size: 11px; color: #6c757d;">${rec.action}</em>
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        <!-- Regel-Ausführungen -->
        <div style="margin-bottom: 20px;">
            <h4 style="margin: 0 0 12px 0; color: #495057;">
                Regel-Ausführungen
            </h4>
            <div style="background: #f8f9fa; border-radius: 8px; padding: 16px;">
                ${Object.entries(report.ruleExecutions).map(([rule, count]) => `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>${rule.replace('_', ' ').toUpperCase()}</span>
                        <span style="font-weight: bold;">${count}x</span>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button onclick="exportDependencyReport()" style="
                padding: 8px 16px; background: #17a2b8; color: white; 
                border: none; border-radius: 6px; cursor: pointer;
            ">
                <i class="fa-solid fa-download"></i> Bericht exportieren
            </button>
            <button onclick="this.closest('.dependency-dashboard-overlay').remove()" style="
                padding: 8px 16px; background: #6c757d; color: white; 
                border: none; border-radius: 6px; cursor: pointer;
            ">Schließen</button>
        </div>
    `;
    
    overlay.className = 'dependency-dashboard-overlay';
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
}

export function exportDependencyReport() {
    const depEngine = getDependencyEngine();
    const report = depEngine.generateDependencyReport();
    
    const dataStr = JSON.stringify(report, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `dependency-report-${new Date().toISOString().split('T')[0]}.json`);
    linkElement.style.display = 'none';
    
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);
    
    showToast('Dependency Report exportiert', 'success');
}

window.showDependencyDashboard = showDependencyDashboard;
window.exportDependencyReport = exportDependencyReport;