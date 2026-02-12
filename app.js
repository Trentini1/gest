import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURAÇÃO ---
const firebaseConfig = {
    apiKey: "AIzaSyD5gV6Fwsc_Uouxg-_NNIR5OYfHAiAIag0",
    authDomain: "gest-806b3.firebaseapp.com",
    projectId: "gest-806b3",
    storageBucket: "gest-806b3.firebasestorage.app",
    messagingSenderId: "565058702608",
    appId: "1:565058702608:web:05c40f1af436c41cbca995"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COLLECTION_NAME = "servicos_retifica_v5";

// --- ROTEAMENTO E SERVIÇOS ---
const PART_ROUTING = {
    "Cabeçote": "cabecote",
    "Bloco": "bloco",
    "Virabrequim": "virabrequim",
    "Bielas": "bielas",
    "Comando": "virabrequim",
    "Peças Diversas": "bielas"
};

const SERVICE_CATALOG = {
    "Cabeçote": [ "Plaina", "Sede Válvulas", "Ret. Válvulas", "Trocar Guias", "Trocar Sedes", "Teste Trinca", "Costura", "Camisa Bico", "Regular", "Montagem", "Jato" ],
    "Bloco": [ "Banho Químico", "Teste Trinca", "Plaina Face", "Ret. Cilindro", "Brunir", "Encamisar", "Ret. Mancal", "Bucha Comando", "Troca Selos", "Projeção" ],
    "Virabrequim": [ "Ret. Colos", "Polimento", "Alinhamento", "Magnaflux", "Nitretar" ],
    "Bielas": [ "Ret. Buchas", "Ret. Alojamento", "Alinhar", "Trocar Buchas" ],
    "Comando": [ "Polimento", "Ret. Colos", "Recuperar Cames" ],
    "Peças Diversas": [ "Solda Alumínio", "Solda Ferro", "Torno", "Roscas" ]
};

// --- ESTADO GLOBAL ---
let workOrders = [];
let currentMonth = new Date();
let activeStageMobile = null;
let editingId = null;
let currentView = 'board'; // 'board', 'dashboard', 'calendar'
let resizeTimeout;

// ORDEM CORRIGIDA: Metrologia ANTES de Montagem
const DEFAULT_STAGES = [
    { id: 'lavacao', label: 'Lavação', color: 'text-blue-400', isGrouped: true },
    { id: 'orcamento', label: 'Inspeção', color: 'text-red-400', isGrouped: true },
    { id: 'cabecote', label: 'Cabeçote', color: 'text-purple-400', isGrouped: false },
    { id: 'bloco', label: 'Bloco', color: 'text-orange-400', isGrouped: false },
    { id: 'virabrequim', label: 'Virabrequim', color: 'text-indigo-400', isGrouped: false },
    { id: 'bielas', label: 'Bielas', color: 'text-pink-400', isGrouped: false },
    { id: 'metrologia', label: 'Metrologia', color: 'text-yellow-400', isGrouped: false }, // Agora antes
    { id: 'montagem', label: 'Montagem', color: 'text-emerald-400', isGrouped: false },
];

let currentStages = JSON.parse(localStorage.getItem('retifica_stages_order_v6')) || DEFAULT_STAGES;
if(currentStages.length < DEFAULT_STAGES.length) currentStages = DEFAULT_STAGES; // Safety check
if(!activeStageMobile && currentStages.length > 0) activeStageMobile = currentStages[0].id;

// --- INICIALIZAÇÃO ---
function init() {
    setupGlobalFunctions();
    setupUI();
    
    const q = query(collection(db, COLLECTION_NAME), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        workOrders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            deadlineDate: doc.data().deadline ? new Date(doc.data().deadline) : null
        }));
        renderApp();
    }, (err) => {
        console.error(err);
        showToast("Erro de conexão", "error");
    });

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(renderApp, 150);
    });
}

// --- RENDERIZAÇÃO CENTRAL ---
function renderApp() {
    if (currentView === 'board') {
        renderMobileTabs();
        renderBoard();
    } else if (currentView === 'dashboard') {
        renderDashboard();
    } else {
        renderCalendar();
    }
}

// --- DASHBOARD (NOVA FUNCIONALIDADE) ---
function renderDashboard() {
    const container = document.getElementById('dashboard-view');
    if (!container) return;

    // Estatísticas
    const totalOS = workOrders.length;
    const waitingApproval = workOrders.filter(o => o.components && Object.values(o.components).includes('orcamento') && !o.approved).length;
    const delayed = workOrders.filter(o => getDeadlineStatus(o.deadlineDate) === 'late').length;
    
    // Contagem por setor
    const sectorCounts = {};
    currentStages.forEach(s => sectorCounts[s.id] = 0);
    workOrders.forEach(o => {
        if(o.components) Object.values(o.components).forEach(stage => {
            if(sectorCounts[stage] !== undefined) sectorCounts[stage]++;
        });
    });

    // Peças em Produção (exclui lavação, orçamento e entregues)
    const productionCount = Object.entries(sectorCounts).reduce((acc, [key, val]) => {
        return (key !== 'lavacao' && key !== 'orcamento') ? acc + val : acc;
    }, 0);

    container.innerHTML = `
        <div class="max-w-5xl mx-auto space-y-6">
            <h2 class="text-2xl font-bold text-white mb-4">Visão Geral da Oficina</h2>
            
            <!-- Cards KPI -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <p class="text-xs text-slate-400 uppercase font-bold">Total O.S.</p>
                    <p class="text-3xl font-bold text-white mt-1">${totalOS}</p>
                </div>
                <div class="bg-slate-800 p-4 rounded-xl border border-red-900/30">
                    <p class="text-xs text-red-400 uppercase font-bold">Atrasados</p>
                    <p class="text-3xl font-bold text-red-500 mt-1">${delayed}</p>
                </div>
                <div class="bg-slate-800 p-4 rounded-xl border border-yellow-900/30">
                    <p class="text-xs text-yellow-400 uppercase font-bold">Aprovação</p>
                    <p class="text-3xl font-bold text-yellow-500 mt-1">${waitingApproval}</p>
                </div>
                <div class="bg-slate-800 p-4 rounded-xl border border-blue-900/30">
                    <p class="text-xs text-blue-400 uppercase font-bold">Em Produção</p>
                    <p class="text-3xl font-bold text-blue-500 mt-1">${productionCount} <span class="text-xs text-slate-500 font-normal">peças</span></p>
                </div>
            </div>

            <!-- Gráfico de Setores (Barras CSS) -->
            <div class="bg-slate-800 p-5 rounded-xl border border-slate-700">
                <h3 class="text-sm font-bold text-slate-300 mb-4 uppercase">Distribuição por Setor</h3>
                <div class="space-y-3">
                    ${currentStages.map(stage => {
                        const count = sectorCounts[stage.id];
                        const percentage = totalOS > 0 ? (count / (totalOS * 2)) * 100 : 0; // Estimativa visual
                        const width = Math.min(percentage * 5, 100); // Scale up a bit
                        return `
                            <div class="flex items-center gap-3">
                                <div class="w-24 text-xs font-bold ${stage.color} text-right shrink-0">${stage.label}</div>
                                <div class="flex-1 bg-slate-900/50 h-3 rounded-full overflow-hidden">
                                    <div class="h-full bg-current opacity-80 rounded-full transition-all duration-1000 ${stage.color.replace('text-', 'bg-')}" style="width: ${count > 0 ? Math.max(width, 2) : 0}%"></div>
                                </div>
                                <div class="w-8 text-xs font-mono text-slate-400">${count}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Lista de Prioridades -->
            <div class="bg-slate-800 p-5 rounded-xl border border-slate-700">
                <h3 class="text-sm font-bold text-red-400 mb-4 uppercase flex items-center gap-2"><i data-lucide="alert-circle" class="w-4 h-4"></i> Atenção Imediata</h3>
                <div class="space-y-2">
                    ${workOrders.filter(o => o.priority || getDeadlineStatus(o.deadlineDate) === 'late').length === 0 ? 
                        '<p class="text-slate-500 text-xs italic">Nenhuma urgência no momento.</p>' : 
                        workOrders.filter(o => o.priority || getDeadlineStatus(o.deadlineDate) === 'late')
                        .sort((a,b) => (a.deadlineDate || 0) - (b.deadlineDate || 0))
                        .slice(0, 5) // Top 5
                        .map(o => `
                            <div class="flex items-center justify-between p-2 bg-slate-900/50 rounded border-l-2 ${o.priority ? 'border-red-500' : 'border-orange-500'}">
                                <div>
                                    <p class="font-bold text-xs text-slate-200">#${o.osNumber} - ${o.motor}</p>
                                    <p class="text-[10px] text-slate-500">${o.cliente}</p>
                                </div>
                                <button onclick="editOS('${o.id}')" class="text-xs bg-slate-800 px-2 py-1 rounded text-slate-300 hover:text-white border border-slate-700">Ver</button>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
        </div>
    `;
}

// --- FUNÇÕES DE LAYOUT DO MODAL (CLEAN MOBILE) ---
function renderServiceChecklist(os, partsContainer) {
    Object.keys(SERVICE_CATALOG).forEach(part => {
        const isChecked = os.components && os.components[part];
        const savedServices = (os.services && os.services[part]) 
            ? (Array.isArray(os.services[part]) ? os.services[part] : [os.services[part]]) 
            : [];
        
        const pendencyReason = os.pendencies && os.pendencies[part] ? os.pendencies[part] : '';

        // Container da Peça
        const wrapper = document.createElement('div');
        // Estilo: Se marcado, borda azul e fundo leve. Se não, escuro.
        wrapper.className = `rounded-xl border transition-all duration-200 overflow-hidden ${isChecked ? 'border-blue-500/40 bg-blue-950/10' : 'border-slate-800 bg-slate-900/40 opacity-70 hover:opacity-100'}`;

        // Header (Nome da Peça + Toggle)
        const header = document.createElement('div');
        header.className = "flex items-center gap-3 p-3 cursor-pointer select-none";
        header.onclick = (e) => {
            // Toggle manual do checkbox principal se clicar no header
            if (e.target.type !== 'checkbox') {
                const cb = header.querySelector('input[type="checkbox"]');
                cb.checked = !cb.checked;
                toggleContent(wrapper, cb.checked);
            }
        };

        header.innerHTML = `
            <input type="checkbox" name="parts" value="${part}" class="w-5 h-5 accent-blue-500 rounded cursor-pointer" ${isChecked ? 'checked' : ''} onchange="toggleContent(this.closest('div').parentElement, this.checked)">
            <span class="text-sm font-bold ${isChecked ? 'text-blue-100' : 'text-slate-400'} flex-1">${part}</span>
            ${pendencyReason ? '<i data-lucide="alert-triangle" class="w-4 h-4 text-red-500 animate-pulse"></i>' : ''}
        `;

        // Conteúdo (Serviços) - Inicialmente escondido se não marcado
        const content = document.createElement('div');
        content.className = `content-area p-3 pt-0 border-t border-blue-500/20 ${isChecked ? '' : 'hidden'}`;
        
        // Grid de Serviços (2 colunas no mobile para economizar espaço)
        const servicesGrid = document.createElement('div');
        servicesGrid.className = "grid grid-cols-2 gap-2 mt-2";
        
        SERVICE_CATALOG[part].forEach(service => {
            const serviceChecked = savedServices.includes(service);
            const label = document.createElement('label');
            label.className = "flex items-start gap-2 p-1.5 rounded hover:bg-slate-800/50 cursor-pointer border border-transparent hover:border-slate-700 transition-colors";
            label.innerHTML = `
                <input type="checkbox" name="service-${part}" value="${service}" class="mt-0.5 w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 accent-emerald-500" ${serviceChecked ? 'checked' : ''}>
                <span class="text-[11px] text-slate-300 leading-tight">${service}</span>
            `;
            servicesGrid.appendChild(label);
        });
        content.appendChild(servicesGrid);

        // Input Extra
        const customService = savedServices.find(s => !SERVICE_CATALOG[part].includes(s)) || "";
        content.innerHTML += `
            <input type="text" name="extra-${part}" value="${customService}" 
            class="w-full mt-3 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none placeholder-slate-600" 
            placeholder="Outro serviço...">
        `;

        // Bloqueio
        const pendencyDiv = document.createElement('div');
        pendencyDiv.className = "mt-3 pt-2 border-t border-dashed border-slate-700/50";
        pendencyDiv.innerHTML = `
            <label class="flex items-center gap-2 text-xs font-bold text-red-400/80 hover:text-red-400 cursor-pointer mb-2">
                <input type="checkbox" class="accent-red-500 w-3.5 h-3.5" onchange="const input = this.parentElement.nextElementSibling; input.classList.toggle('hidden'); if(!this.checked) input.value = '';" ${pendencyReason ? 'checked' : ''}>
                <span>Bloquear (Peça Faltando)</span>
            </label>
            <input type="text" name="pendency-${part}" value="${pendencyReason}" 
                class="${pendencyReason ? '' : 'hidden'} w-full bg-red-900/10 border border-red-500/30 rounded p-2 text-xs text-red-200 focus:border-red-500 outline-none placeholder-red-500/30"
                placeholder="Motivo...">
        `;
        content.appendChild(pendencyDiv);

        wrapper.appendChild(header);
        wrapper.appendChild(content);
        partsContainer.appendChild(wrapper);
    });
}

// Função auxiliar global para o toggle do layout
window.toggleContent = (wrapper, isChecked) => {
    const content = wrapper.querySelector('.content-area');
    const title = wrapper.querySelector('span');
    
    if (isChecked) {
        content.classList.remove('hidden');
        wrapper.classList.remove('opacity-70', 'border-slate-800', 'bg-slate-900/40');
        wrapper.classList.add('border-blue-500/40', 'bg-blue-950/10');
        title.classList.replace('text-slate-400', 'text-blue-100');
    } else {
        content.classList.add('hidden');
        wrapper.classList.add('opacity-70', 'border-slate-800', 'bg-slate-900/40');
        wrapper.classList.remove('border-blue-500/40', 'bg-blue-950/10');
        title.classList.replace('text-blue-100', 'text-slate-400');
    }
};

// --- ROTEAMENTO E LÓGICA DE PLACAS ---
function renderBoard() {
    const container = document.getElementById('board-view');
    if (!container) return;
    container.innerHTML = '';

    const isMobile = window.innerWidth < 768;

    currentStages.forEach(stage => {
        if (isMobile && stage.id !== activeStageMobile) return;

        const column = document.createElement('div');
        column.className = `flex-shrink-0 flex flex-col h-full ${isMobile ? 'w-full' : 'w-[360px] bg-slate-900 rounded-xl border border-slate-800'}`;
        
        if (!isMobile) {
            column.innerHTML = `
                <div class="p-3 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900 z-10 rounded-t-xl">
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full stage-dot ${stage.color} bg-current"></div>
                        <h3 class="font-bold text-slate-300 text-sm uppercase">${stage.label}</h3>
                    </div>
                </div>
                <div class="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar list-container"></div>
            `;
        } else {
            column.innerHTML = `<div class="flex-1 overflow-y-auto pb-20 space-y-3 list-container"></div>`;
        }

        const list = column.querySelector('.list-container');
        let hasItems = false;

        if (stage.isGrouped) {
            const relevantOS = workOrders.filter(os => os.components && Object.values(os.components).includes(stage.id));
            relevantOS.forEach(os => {
                list.appendChild(createGroupedCard(os, stage.id));
                hasItems = true;
            });
        } else {
            workOrders.forEach(os => {
                if (!os.components) return;
                Object.entries(os.components).forEach(([partName, partStage]) => {
                    if (partStage === stage.id) {
                        list.appendChild(createPartCard(os, partName, stage.id));
                        hasItems = true;
                    }
                });
            });
        }

        if (!hasItems) {
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center h-40 text-slate-700">
                    <i data-lucide="inbox" class="w-8 h-8 mb-2 opacity-50"></i>
                    <p class="text-xs font-medium">Vazio</p>
                </div>
            `;
        }
        container.appendChild(column);
    });
    if(window.lucide) window.lucide.createIcons();
}

// --- OUTRAS FUNÇÕES GLOBAIS DE SETUP ---
function setupGlobalFunctions() {
    window.openSettings = () => {
        const modal = document.getElementById('modal-settings');
        const list = document.getElementById('settings-list');
        if(!modal || !list) return;
        list.innerHTML = '';
        currentStages.forEach((stage, idx) => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between bg-slate-700 p-3 rounded mb-2 border border-slate-600';
            item.innerHTML = `
                <span class="text-sm font-bold text-white">${stage.label}</span>
                <div class="flex gap-1">
                    <button onclick="moveOrder(${idx}, -1)" class="p-1 hover:bg-slate-600 rounded opacity-70 hover:opacity-100"><i data-lucide="arrow-up" class="w-4 h-4"></i></button>
                    <button onclick="moveOrder(${idx}, 1)" class="p-1 hover:bg-slate-600 rounded opacity-70 hover:opacity-100"><i data-lucide="arrow-down" class="w-4 h-4"></i></button>
                </div>
            `;
            list.appendChild(item);
        });
        modal.classList.remove('hidden');
        if(window.lucide) window.lucide.createIcons();
    };

    window.moveOrder = (idx, dir) => {
        if ((idx === 0 && dir === -1) || (idx === currentStages.length-1 && dir === 1)) return;
        const temp = currentStages[idx];
        currentStages[idx] = currentStages[idx + dir];
        currentStages[idx + dir] = temp;
        window.openSettings(); 
    };

    window.closeSettings = () => {
        localStorage.setItem('retifica_stages_order_v6', JSON.stringify(currentStages));
        document.getElementById('modal-settings').classList.add('hidden');
        renderApp();
        showToast("Ordem salva!");
    };

    window.resetSettings = () => {
        localStorage.removeItem('retifica_stages_order_v6');
        currentStages = DEFAULT_STAGES;
        window.openSettings();
    };

    window.openModal = () => {
        editingId = null;
        resetForm();
        document.getElementById('modal').classList.remove('hidden');
    };

    window.closeModal = () => {
        document.getElementById('modal').classList.add('hidden');
        resetForm();
    };

    window.approveOS = async (id) => {
        if(!confirm("Aprovar orçamento? Isso distribuirá as peças.")) return;
        try {
            await updateDoc(doc(db, COLLECTION_NAME, id), { approved: true });
            showToast("✅ Aprovado!");
        } catch(e) { console.error(e); }
    };

    window.editOS = (id) => {
        const os = workOrders.find(o => o.id === id);
        if(!os) return;

        editingId = id;
        document.getElementById('input-os-num').value = os.osNumber;
        document.getElementById('input-motor').value = os.motor;
        document.getElementById('input-cliente').value = os.cliente;
        document.getElementById('input-prazo').value = os.deadline || '';
        document.getElementById('input-prioridade').checked = os.priority;

        const partsContainer = document.getElementById('parts-selection');
        partsContainer.innerHTML = '';
        renderServiceChecklist(os, partsContainer);

        const btn = document.getElementById('btn-submit');
        btn.innerHTML = `Salvar Alterações`;
        
        let delBtn = document.getElementById('btn-delete-os');
        if(!delBtn) {
            delBtn = document.createElement('button');
            delBtn.id = 'btn-delete-os';
            delBtn.className = 'w-full bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white font-bold py-3 rounded-xl border border-red-900/50 transition-colors flex items-center justify-center gap-2 text-sm';
            delBtn.innerHTML = `<i data-lucide="trash-2" class="w-4 h-4"></i> Excluir O.S.`;
            delBtn.type = 'button';
            delBtn.onclick = () => deleteOS(id);
            document.getElementById('new-os-form').appendChild(delBtn);
        } else {
            delBtn.onclick = () => deleteOS(id);
            delBtn.classList.remove('hidden');
        }

        document.getElementById('modal').classList.remove('hidden');
        if(window.lucide) window.lucide.createIcons();
    };

    window.resolvePendency = async (osId, partName) => {
        if(!confirm(`Liberar ${partName}?`)) return;
        try {
            const os = workOrders.find(o => o.id === osId);
            const newPendencies = { ...os.pendencies };
            delete newPendencies[partName];
            await updateDoc(doc(db, COLLECTION_NAME, osId), { pendencies: newPendencies });
            showToast("Pendência resolvida!");
        } catch(e) { console.error(e); }
    };
}

// --- MÉTODOS DE RENDERIZAÇÃO DE CARD (MANTIDOS E OTIMIZADOS) ---
// (Resumido pois a lógica principal não mudou, apenas layout)
function createGroupedCard(os, stageId) {
    const el = document.createElement('div');
    let borderClass = stageId === 'orcamento' ? (os.approved ? 'border-emerald-500' : 'border-red-500') : 'border-slate-700';
    
    const partsHere = Object.entries(os.components)
        .filter(([_, st]) => st === stageId)
        .map(([name]) => name);

    el.className = `relative p-4 rounded-lg border-l-4 ${borderClass} bg-slate-800 transition-all active:scale-[0.99] group shadow-sm`;
    
    // Lista de peças compacta
    const servicesListHTML = partsHere.map(p => {
        const servs = os.services && os.services[p];
        const isPending = os.pendencies && os.pendencies[p];
        if (!servs && !isPending) return '';
        let servText = Array.isArray(servs) ? servs.join(', ') : servs || '';
        return `
            <div class="mt-1 border-t border-slate-700/50 pt-1">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold ${isPending ? 'text-red-400' : 'text-slate-300'}">${p}:</span>
                    ${isPending ? '<i data-lucide="lock" class="w-3 h-3 text-red-500"></i>' : ''}
                </div>
                ${isPending ? `<span class="text-[10px] text-red-400 font-bold block bg-red-900/20 rounded px-1">FALTA: ${os.pendencies[p]}</span>` : ''}
                <span class="text-[10px] text-slate-500 leading-tight block truncate">${servText}</span>
            </div>
        `;
    }).join('');

    let actionButtons = '';
    if (stageId === 'orcamento' && !os.approved) {
        actionButtons = `
            <div class="flex gap-2 mt-3">
                <button onclick="editOS('${os.id}')" class="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded font-bold text-xs"><i data-lucide="edit" class="w-3 h-3 inline"></i></button>
                <button onclick="approveOS('${os.id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded font-bold text-xs">APROVAR</button>
            </div>`;
    } else if (stageId === 'orcamento' && os.approved) {
         actionButtons = `<button onclick="advanceGroup('${os.id}', '${stageId}')" class="w-full mt-3 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-bold text-xs">Distribuir <i data-lucide="arrow-right" class="w-3 h-3 inline"></i></button>`;
    } else {
        actionButtons = `<button onclick="advanceGroup('${os.id}', '${stageId}')" class="w-full mt-3 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-bold text-xs">Finalizar <i data-lucide="arrow-right" class="w-3 h-3 inline"></i></button>`;
    }

    el.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="font-mono text-xs font-bold text-slate-400 bg-slate-950 px-2 py-1 rounded cursor-pointer" onclick="editOS('${os.id}')">#${os.osNumber}</span>
            ${stageId === 'orcamento' ? (os.approved ? '<i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i>' : '<i data-lucide="clock" class="w-4 h-4 text-red-400"></i>') : ''}
        </div>
        <h4 class="text-white font-bold text-sm mb-1">${os.motor}</h4>
        <p class="text-slate-500 text-[10px] uppercase font-bold mb-2">${os.cliente}</p>
        ${servicesListHTML}
        ${actionButtons}
    `;
    return el;
}

function createPartCard(os, partName, currentStageId) {
    const el = document.createElement('div');
    const servs = os.services && os.services[partName];
    const serviceNote = (Array.isArray(servs) ? servs.join(', ') : servs) || 'Padrão';
    const pendencyReason = os.pendencies && os.pendencies[partName];
    const isLocked = !!pendencyReason;
    
    const bgClass = isLocked ? 'bg-[repeating-linear-gradient(45deg,#3f1a1a,#3f1a1a_10px,#4f2020_10px,#4f2020_20px)] border-red-500' : 'bg-slate-800 border-slate-700';
    const stageIdx = currentStages.findIndex(s => s.id === currentStageId);
    const hasNext = stageIdx < currentStages.length - 1;

    el.className = `relative p-3 rounded-lg border-l-4 ${bgClass} transition-all active:scale-[0.99] group shadow-sm`;
    el.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="text-[10px] font-bold text-slate-500 cursor-pointer" onclick="editOS('${os.id}')">#${os.osNumber}</span>
            <div class="flex items-center gap-2">
                ${isLocked ? '<i data-lucide="lock" class="w-3 h-3 text-red-500"></i>' : ''}
                <span class="text-[9px] font-bold uppercase bg-slate-900 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700">${partName}</span>
            </div>
        </div>
        <div class="mb-2">
            <h4 class="text-white font-bold text-xs leading-tight mb-1">${os.motor}</h4>
            ${isLocked ? `<div class="text-red-200 text-[9px] font-bold bg-red-950 p-1 rounded border border-red-500/50">🛑 ${pendencyReason}</div>` 
                       : `<div class="text-blue-300 text-[9px] bg-blue-900/10 p-1 rounded border border-blue-900/30 truncate">${serviceNote}</div>`}
        </div>
        <div class="flex items-center gap-2 mt-2">
            ${isLocked ? `<button class="btn-resolve w-full bg-orange-600 text-white py-1 rounded text-[10px] font-bold">Resolver</button>` 
            : (hasNext ? `<button class="btn-move flex-1 bg-slate-700 hover:bg-blue-600 text-white py-1 rounded text-[10px] font-bold">Próx</button>` 
                       : `<button class="btn-finish flex-1 bg-emerald-600 text-white py-1 rounded text-[10px] font-bold">Fim</button>`)}
        </div>
    `;

    if(isLocked) el.querySelector('.btn-resolve').onclick = (e) => { e.stopPropagation(); resolvePendency(os.id, partName); };
    else if(hasNext) el.querySelector('.btn-move').onclick = (e) => { e.stopPropagation(); movePart(os, partName, currentStages[stageIdx + 1].id); };
    else el.querySelector('.btn-finish').onclick = (e) => { e.stopPropagation(); finishPart(os, partName); };

    return el;
}

// --- UI SETUP & NAVIGATION ---
function setupUI() {
    document.getElementById('fab-new-os').onclick = window.openModal;
    document.getElementById('new-os-form').onsubmit = handleOSSubmit;
    
    // View Switcher
    const setView = (view) => {
        currentView = view;
        const board = document.getElementById('board-view');
        const dash = document.getElementById('dashboard-view');
        const cal = document.getElementById('calendar-view');
        const mobTabs = document.getElementById('mobile-tabs');
        const btns = { board: document.getElementById('view-board'), dash: document.getElementById('view-dashboard'), cal: document.getElementById('view-calendar') };

        // Reset Styles
        Object.values(btns).forEach(b => b.classList.replace('text-blue-400', 'text-slate-400'));
        Object.values(btns).forEach(b => b.classList.replace('bg-slate-800', 'hover:bg-slate-700'));

        // Hide All
        board.classList.add('hidden');
        dash.classList.add('translate-x-full');
        cal.classList.add('translate-x-full');
        mobTabs.classList.add('hidden');

        // Show Active
        if (view === 'board') {
            board.classList.remove('hidden');
            mobTabs.classList.remove('hidden');
            btns.board.classList.add('text-blue-400', 'bg-slate-800');
            renderBoard();
            renderMobileTabs();
        } else if (view === 'dashboard') {
            dash.classList.remove('translate-x-full');
            btns.dash.classList.add('text-blue-400', 'bg-slate-800');
            renderDashboard();
        } else {
            cal.classList.remove('translate-x-full');
            btns.cal.classList.add('text-blue-400', 'bg-slate-800');
            renderCalendar();
        }
    };

    document.getElementById('view-board').onclick = () => setView('board');
    document.getElementById('view-dashboard').onclick = () => setView('dashboard');
    document.getElementById('view-calendar').onclick = () => setView('calendar');
    
    document.getElementById('cal-prev').onclick = () => { currentMonth.setMonth(currentMonth.getMonth()-1); renderCalendar(); };
    document.getElementById('cal-next').onclick = () => { currentMonth.setMonth(currentMonth.getMonth()+1); renderCalendar(); };
}

// --- AÇÕES DB e UTILS (Mantidos iguais ao anterior para economizar espaço, lógica já validada) ---
// (Incluir aqui: handleOSSubmit, advanceGroup, deleteOS, movePart, finishPart, getDeadlineStatus, showToast, renderCalendar, resetForm)
// ... [Repetir funções DB e Utils da versão anterior, garantindo que usem COLLECTION_NAME correto]

async function handleOSSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit');
    btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i>`;
    btn.disabled = true;

    try {
        const osData = {
            osNumber: document.getElementById('input-os-num').value || '---',
            deadline: document.getElementById('input-prazo').value,
            motor: document.getElementById('input-motor').value,
            cliente: document.getElementById('input-cliente').value,
            priority: document.getElementById('input-prioridade').checked,
            timestamp: serverTimestamp()
        };

        const componentsMap = {};
        const servicesMap = {};
        const pendenciesMap = {}; 
        
        let currentComponents = {};
        if (editingId) {
            const oldOS = workOrders.find(o => o.id === editingId);
            currentComponents = oldOS.components || {};
        }

        Object.keys(SERVICE_CATALOG).forEach(part => {
            const partCheckbox = document.querySelector(`input[name="parts"][value="${part}"]`);
            if (partCheckbox && partCheckbox.checked) {
                componentsMap[part] = currentComponents[part] || currentStages[0].id;
                const selectedServices = [];
                document.querySelectorAll(`input[name="service-${part}"]:checked`).forEach(sc => selectedServices.push(sc.value));
                const extra = document.querySelector(`input[name="extra-${part}"]`);
                if(extra && extra.value.trim()) selectedServices.push(extra.value.trim());
                if(selectedServices.length > 0) servicesMap[part] = selectedServices;
                
                const pendency = document.querySelector(`input[name="pendency-${part}"]`);
                if(pendency && !pendency.classList.contains('hidden') && pendency.value.trim()) {
                    pendenciesMap[part] = pendency.value.trim();
                }
            }
        });

        if (Object.keys(componentsMap).length === 0) throw new Error("Selecione peças!");

        const payload = { ...osData, components: componentsMap, services: servicesMap, pendencies: pendenciesMap };

        if (editingId) {
            await updateDoc(doc(db, COLLECTION_NAME, editingId), payload);
            showToast("Atualizado!");
        } else {
            await addDoc(collection(db, COLLECTION_NAME), { ...payload, approved: false });
            showToast("O.S. Criada!");
        }
        window.closeModal();
    } catch (err) {
        console.error(err);
        alert(err.message);
    } finally {
        btn.innerHTML = "Salvar O.S.";
        btn.disabled = false;
        if(window.lucide) window.lucide.createIcons();
    }
}

window.advanceGroup = async (osId, currentStageId) => {
    try {
        const os = workOrders.find(o => o.id === osId);
        if(!os) return;
        const idx = currentStages.findIndex(s => s.id === currentStageId);
        const nextStageDefault = currentStages[idx + 1].id;
        const newComponents = { ...os.components };
        
        Object.keys(newComponents).forEach(key => {
            if(newComponents[key] === currentStageId) {
                if (currentStageId === 'orcamento') newComponents[key] = PART_ROUTING[key] || 'montagem';
                else newComponents[key] = nextStageDefault;
            }
        });
        await updateDoc(doc(db, COLLECTION_NAME, osId), { components: newComponents });
        showToast("Peças Distribuídas!");
    } catch(e) { console.error(e); }
};

async function deleteOS(id) {
    if(!confirm("Apagar?")) return;
    try { await deleteDoc(doc(db, COLLECTION_NAME, id)); window.closeModal(); showToast("Apagado", "error"); } catch(e) {}
}

async function movePart(os, partName, nextStageId) {
    if (os.pendencies && os.pendencies[partName]) return alert(`PENDÊNCIA: ${os.pendencies[partName]}`);
    try {
        const newComponents = { ...os.components };
        newComponents[partName] = nextStageId;
        await updateDoc(doc(db, COLLECTION_NAME, os.id), { components: newComponents });
    } catch(e) {}
}

async function finishPart(os, partName) {
    if (os.pendencies && os.pendencies[partName]) return alert("Resolva a pendência!");
    if(!confirm(`Finalizar ${partName}?`)) return;
    try {
        const newComponents = { ...os.components };
        delete newComponents[partName];
        if (Object.keys(newComponents).length === 0) await deleteDoc(doc(db, COLLECTION_NAME, os.id));
        else await updateDoc(doc(db, COLLECTION_NAME, os.id), { components: newComponents });
        showToast("Concluído!");
    } catch(e) {}
}

function getDeadlineStatus(date) {
    if(!date) return 'ok';
    return (date - new Date() < 0) ? 'late' : 'ok';
}

function showToast(msg, type='success') {
    const t = document.getElementById('toast');
    if(!t) return;
    document.getElementById('toast-msg').innerText = msg;
    const icon = t.querySelector('i');
    if(icon) {
        if(type==='error') icon.setAttribute('data-lucide', 'alert-circle');
        else icon.setAttribute('data-lucide', 'check-circle');
    }
    t.classList.remove('translate-y-[-150%]');
    setTimeout(() => t.classList.add('translate-y-[-150%]'), 3000);
    if(window.lucide) window.lucide.createIcons();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if(!grid) return;
    grid.innerHTML = '';
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    document.getElementById('calendar-month-title').innerText = firstDay.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    for(let i=0; i<firstDay.getDay(); i++) grid.innerHTML += `<div></div>`;
    for(let i=1; i<=lastDay.getDate(); i++) {
        const div = document.createElement('div');
        div.className = 'calendar-day p-1';
        div.innerHTML = `<div class="text-[10px] text-slate-500 font-bold mb-1">${i}</div>`;
        workOrders.forEach(os => {
             if(os.deadlineDate && os.deadlineDate.getDate()===i && os.deadlineDate.getMonth()===month) {
                 div.innerHTML += `<div class="cal-event bg-blue-900/40 text-blue-200 border border-blue-800 cursor-pointer" onclick="editOS('${os.id}')">#${os.osNumber}</div>`;
             }
        });
        grid.appendChild(div);
    }
}

init();
