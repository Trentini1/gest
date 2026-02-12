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
const COLLECTION_NAME = "servicos_retifica_v5"; // V5 para resetar a ordem e colunas

// --- GPS DE PEÇAS (ROTEAMENTO) ---
// Define para onde cada peça vai quando sai do Orçamento
const PART_ROUTING = {
    "Cabeçote": "cabecote",
    "Bloco": "bloco",
    "Virabrequim": "virabrequim",
    "Bielas": "bielas",
    "Comando": "virabrequim", // Comando geralmente fica no setor de virabrequim/bielas
    "Peças Diversas": "bielas" // Ou cria um setor "Geral"
};

// --- CATÁLOGO DE SERVIÇOS ---
const SERVICE_CATALOG = {
    "Cabeçote": [
        "Plaina de cabeçote",
        "Retificar sede válvulas",
        "Retificar válvulas",
        "Substituir guias",
        "Substituir sedes",
        "Teste de trinca (Hidrostático)",
        "Costura de cabeçote",
        "Troca camisa de bico",
        "Regular válvulas",
        "Montagem completa",
        "Jato de areia/microesfera"
    ],
    "Bloco": [
        "Banho Químico (Limpeza)",
        "Teste de trinca",
        "Plaina de face",
        "Retificar cilindros",
        "Brunir cilindros",
        "Encamisar cilindros",
        "Retificar ferro de mancal",
        "Embuchar aloj. comando",
        "Troca de selos/bujões",
        "Projeção de camisa"
    ],
    "Virabrequim": [
        "Retificar colos (Biela/Mancal)",
        "Polimento",
        "Alinhamento",
        "Teste de trinca (Magnaflux)",
        "Nitretar"
    ],
    "Bielas": [
        "Retificar buchas",
        "Retificar alojamento (Ferros)",
        "Alinhar biela",
        "Trocar buchas"
    ],
    "Comando": [
        "Polimento",
        "Retificar colos",
        "Recuperar cames"
    ],
    "Montagem": [
        "Montagem Parcial (Bloco)",
        "Montagem Completa",
        "Metrologia Completa",
        "Pintura"
    ],
    "Peças Diversas": [
        "Solda em alumínio",
        "Solda em ferro fundido",
        "Serviço de torno",
        "Recuperar roscas"
    ]
};

// --- ESTADO ---
let workOrders = [];
let currentMonth = new Date();
let activeStageMobile = null;
let editingId = null;
let resizeTimeout; 

// NOVAS COLUNAS E ORDEM CORRIGIDA
const DEFAULT_STAGES = [
    { id: 'lavacao', label: 'Lavação / Entrada', color: 'text-blue-400', isGrouped: true },
    { id: 'orcamento', label: 'Inspeção & Orçamento', color: 'text-red-400', isGrouped: true },
    // Setores de Produção (Paralelos)
    { id: 'cabecote', label: 'Setor de Cabeçote', color: 'text-purple-400', isGrouped: false },
    { id: 'bloco', label: 'Setor de Bloco', color: 'text-orange-400', isGrouped: false },
    { id: 'virabrequim', label: 'Setor de Virabrequim', color: 'text-indigo-400', isGrouped: false },
    { id: 'bielas', label: 'Setor de Bielas', color: 'text-pink-400', isGrouped: false },
    // Finalização
    { id: 'montagem', label: 'Montagem', color: 'text-emerald-400', isGrouped: false },
    { id: 'metrologia', label: 'Metrologia Final', color: 'text-yellow-400', isGrouped: false }, // PENÚLTIMO
];

// Tenta recuperar ordem salva, mas se faltar colunas novas (Vira/Biela), reseta
let currentStages = JSON.parse(localStorage.getItem('retifica_stages_order_v5')) || DEFAULT_STAGES;
if (currentStages.length < DEFAULT_STAGES.length) currentStages = DEFAULT_STAGES;

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

// --- FUNÇÕES GLOBAIS ---
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
        localStorage.setItem('retifica_stages_order_v5', JSON.stringify(currentStages));
        document.getElementById('modal-settings').classList.add('hidden');
        renderApp();
        showToast("Ordem salva!");
    };

    window.resetSettings = () => {
        localStorage.removeItem('retifica_stages_order_v5');
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
        if(!confirm("Aprovar orçamento? Isso distribuirá as peças para seus setores.")) return;
        try {
            await updateDoc(doc(db, COLLECTION_NAME, id), { approved: true });
            showToast("✅ Orçamento Aprovado!");
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

        // --- GERAÇÃO DO CHECKLIST ---
        Object.keys(SERVICE_CATALOG).forEach(part => {
            const isChecked = os.components && os.components[part];
            const savedServices = (os.services && os.services[part]) 
                ? (Array.isArray(os.services[part]) ? os.services[part] : [os.services[part]]) 
                : [];
            
            const pendencyReason = os.pendencies && os.pendencies[part] ? os.pendencies[part] : '';

            const details = document.createElement('details');
            details.className = `group rounded-lg border ${isChecked ? 'border-blue-500/50 bg-blue-900/5' : 'border-slate-700 bg-slate-900'} transition-all open:bg-slate-800 open:border-blue-500 mb-2`;
            if (isChecked) details.open = true;

            const summary = document.createElement('summary');
            summary.className = "flex items-center gap-3 p-3 cursor-pointer list-none select-none";
            summary.innerHTML = `
                <input type="checkbox" name="parts" value="${part}" class="w-5 h-5 accent-blue-500" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation()">
                <span class="text-sm font-bold ${isChecked ? 'text-blue-300' : 'text-slate-400'} flex-1">${part}</span>
                ${pendencyReason ? '<i data-lucide="alert-triangle" class="w-4 h-4 text-red-500 animate-pulse"></i>' : ''}
                <i data-lucide="chevron-down" class="w-4 h-4 text-slate-500 transition-transform group-open:rotate-180"></i>
            `;
            
            const content = document.createElement('div');
            content.className = "p-3 pt-0 border-t border-slate-700/50 space-y-3";
            
            // Serviços
            const servicesDiv = document.createElement('div');
            servicesDiv.className = "space-y-2";
            SERVICE_CATALOG[part].forEach(service => {
                const serviceChecked = savedServices.includes(service);
                const label = document.createElement('label');
                label.className = "flex items-center gap-2 hover:bg-slate-700/50 p-1 rounded cursor-pointer";
                label.innerHTML = `
                    <input type="checkbox" name="service-${part}" value="${service}" class="w-4 h-4 rounded border-slate-600 bg-slate-800 accent-emerald-500" ${serviceChecked ? 'checked' : ''}>
                    <span class="text-xs text-slate-300">${service}</span>
                `;
                servicesDiv.appendChild(label);
            });
            content.appendChild(servicesDiv);

            // Outros
            const customService = savedServices.find(s => !SERVICE_CATALOG[part].includes(s)) || "";
            content.innerHTML += `
                <input type="text" name="extra-${part}" value="${customService}" 
                class="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-blue-500 outline-none" 
                placeholder="Outro serviço...">
            `;

            // ÁREA DE PENDÊNCIA (BLOQUEIO) - BEM VISÍVEL
            const pendencyDiv = document.createElement('div');
            pendencyDiv.className = "mt-3 pt-3 border-t border-slate-700/50";
            pendencyDiv.innerHTML = `
                <label class="flex items-center gap-2 text-red-400 font-bold text-xs mb-2 cursor-pointer bg-red-900/10 p-2 rounded border border-red-900/30 hover:bg-red-900/20">
                    <input type="checkbox" class="accent-red-500" onchange="const input = this.parentElement.nextElementSibling; input.classList.toggle('hidden'); if(!this.checked) input.value = '';" ${pendencyReason ? 'checked' : ''}>
                    <i data-lucide="lock" class="w-3 h-3"></i> TRAVAR PEÇA (Falta algo?)
                </label>
                <input type="text" name="pendency-${part}" value="${pendencyReason}" 
                    class="${pendencyReason ? '' : 'hidden'} w-full bg-red-900/20 border border-red-500/50 rounded p-2 text-xs text-red-200 focus:border-red-500 outline-none placeholder-red-400/50 animate-pulse"
                    placeholder="DIGITE O MOTIVO DA PENDÊNCIA AQUI...">
            `;
            content.appendChild(pendencyDiv);

            details.appendChild(summary);
            details.appendChild(content);
            partsContainer.appendChild(details);
        });

        const btn = document.getElementById('btn-submit');
        btn.innerHTML = `Salvar Alterações`;
        
        let delBtn = document.getElementById('btn-delete-os');
        if(!delBtn) {
            delBtn = document.createElement('button');
            delBtn.id = 'btn-delete-os';
            delBtn.className = 'w-full mt-3 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white font-bold py-3 rounded-xl border border-red-900/50 transition-colors flex items-center justify-center gap-2';
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
        if(!confirm(`Peça chegou? Liberar ${partName} para produção?`)) return;
        try {
            const os = workOrders.find(o => o.id === osId);
            const newPendencies = { ...os.pendencies };
            delete newPendencies[partName];
            await updateDoc(doc(db, COLLECTION_NAME, osId), { pendencies: newPendencies });
            showToast("Pendência resolvida! Peça liberada.");
        } catch(e) { console.error(e); }
    };
}

function resetForm() {
    const form = document.getElementById('new-os-form');
    form.reset();
    
    const partsContainer = document.getElementById('parts-selection');
    partsContainer.innerHTML = ''; 
    
    Object.keys(SERVICE_CATALOG).forEach(part => {
        const details = document.createElement('details');
        details.className = `group rounded-lg border border-slate-700 bg-slate-900 mb-2`;
        
        const summary = document.createElement('summary');
        summary.className = "flex items-center gap-3 p-3 cursor-pointer list-none";
        summary.innerHTML = `
            <input type="checkbox" name="parts" value="${part}" class="w-5 h-5 accent-blue-500" onclick="event.stopPropagation()">
            <span class="text-sm font-medium text-slate-300 flex-1">${part}</span>
            <i data-lucide="chevron-down" class="w-4 h-4 text-slate-500"></i>
        `;
        
        details.appendChild(summary);
        partsContainer.appendChild(details);
    });

    const btn = document.getElementById('btn-submit');
    btn.innerHTML = `Criar Nova O.S.`;
    
    const delBtn = document.getElementById('btn-delete-os');
    if(delBtn) delBtn.classList.add('hidden');
}

// --- RENDERIZAÇÃO ---
function renderApp() {
    renderMobileTabs();
    renderBoard();
    if(document.getElementById('calendar-view').classList.contains('translate-x-0')) {
        renderCalendar();
    }
}

function renderMobileTabs() {
    const nav = document.getElementById('mobile-tabs');
    if (!nav) return;
    nav.innerHTML = '';
    currentStages.forEach(stage => {
        let count = 0;
        workOrders.forEach(os => {
            if(stage.isGrouped) {
                const hasPartHere = os.components && Object.values(os.components).includes(stage.id);
                if(hasPartHere) count++;
            } else {
                if(os.components) {
                    Object.values(os.components).forEach(s => { if(s === stage.id) count++; });
                }
            }
        });

        const isActive = activeStageMobile === stage.id;
        const btn = document.createElement('button');
        btn.className = `whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-bold border transition-all flex-shrink-0 ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-slate-800 text-slate-400 border-slate-700'}`;
        btn.innerHTML = `${stage.label} <span class="ml-1 opacity-70 text-xs">${count}</span>`;
        btn.onclick = () => {
            activeStageMobile = stage.id;
            renderApp();
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        };
        nav.appendChild(btn);
    });
}

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

// --- CARD: AGRUPADO (Lavação/Orçamento) ---
function createGroupedCard(os, stageId) {
    const el = document.createElement('div');
    
    let borderClass = 'border-slate-700';
    if(stageId === 'orcamento') {
        borderClass = os.approved ? 'border-emerald-500' : 'border-red-500';
    }

    const partsHere = Object.entries(os.components)
        .filter(([_, st]) => st === stageId)
        .map(([name]) => name);

    el.className = `relative p-4 rounded-lg border-l-4 ${borderClass} bg-slate-800 transition-all active:scale-[0.99] group shadow-sm`;
    
    // RENDERIZAÇÃO DOS SERVIÇOS
    const servicesListHTML = partsHere.map(p => {
        const servs = os.services && os.services[p];
        const isPending = os.pendencies && os.pendencies[p];
        if (!servs && !isPending) return '';
        
        let servText = Array.isArray(servs) ? servs.join(', ') : servs || '';
        if (servText.length > 50) servText = servText.substring(0, 50) + '...';

        return `
            <div class="mt-1 border-t border-slate-700/50 pt-1">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold ${isPending ? 'text-red-400' : 'text-slate-300'}">${p}:</span>
                    ${isPending ? '<i data-lucide="lock" class="w-3 h-3 text-red-500"></i>' : ''}
                </div>
                ${isPending ? `<span class="text-[10px] text-red-400 font-bold block bg-red-900/20 rounded p-1">⚠️ FALTA: ${os.pendencies[p]}</span>` : ''}
                <span class="text-[10px] text-slate-500 leading-tight block">${servText}</span>
            </div>
        `;
    }).join('');

    let actionButtons = '';
    
    if (stageId === 'orcamento' && !os.approved) {
        actionButtons = `
            <div class="flex gap-2 mt-4">
                <button onclick="editOS('${os.id}')" class="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 rounded font-bold text-xs">
                    <i data-lucide="list-checks" class="w-3 h-3 inline mr-1"></i> SERVIÇOS
                </button>
                <button onclick="approveOS('${os.id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded font-bold text-xs shadow-lg shadow-emerald-900/20">
                    <i data-lucide="thumbs-up" class="w-3 h-3 inline mr-1"></i> APROVAR
                </button>
            </div>
        `;
    } 
    else if (stageId === 'orcamento' && os.approved) {
         actionButtons = `
            <div class="mt-3 p-2 bg-emerald-900/20 border border-emerald-900/50 rounded text-center mb-2">
                <span class="text-[10px] text-emerald-400 font-bold tracking-wide">PRODUÇÃO AUTORIZADA</span>
            </div>
            <button onclick="advanceGroup('${os.id}', '${stageId}')" class="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded font-bold text-xs shadow-lg shadow-blue-900/20 flex justify-center items-center gap-2">
                Distribuir p/ Setores <i data-lucide="arrow-right-circle" class="w-4 h-4"></i>
            </button>
        `;
    } 
    else {
        actionButtons = `
            <button onclick="advanceGroup('${os.id}', '${stageId}')" class="w-full mt-3 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-bold text-xs shadow-lg shadow-blue-900/20 flex justify-center items-center gap-2">
                Finalizar Lavação <i data-lucide="arrow-right-circle" class="w-4 h-4"></i>
            </button>
        `;
    }

    el.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="font-mono text-xs font-bold text-slate-400 bg-slate-950 px-2 py-1 rounded cursor-pointer hover:text-white" onclick="editOS('${os.id}')">
                #${os.osNumber}
            </span>
            ${stageId === 'orcamento' ? 
                (os.approved ? '<i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i>' 
                             : '<i data-lucide="clock" class="w-4 h-4 text-red-400 animate-pulse"></i>') 
                : ''}
        </div>
        
        <h4 class="text-white font-bold text-lg leading-tight mb-1">${os.motor}</h4>
        <p class="text-slate-400 text-xs uppercase font-semibold mb-2 tracking-wide">${os.cliente}</p>

        ${servicesListHTML}

        ${actionButtons}
    `;
    return el;
}

// --- CARD: PEÇA INDIVIDUAL (Produção com BLOQUEIO) ---
function createPartCard(os, partName, currentStageId) {
    const el = document.createElement('div');
    const servs = os.services && os.services[partName];
    const serviceNote = (Array.isArray(servs) ? servs.join(', ') : servs) || 'Serviço Padrão';
    
    // VERIFICA PENDÊNCIA (BLOQUEIO)
    const pendencyReason = os.pendencies && os.pendencies[partName];
    const isLocked = !!pendencyReason;

    const stageIdx = currentStages.findIndex(s => s.id === currentStageId);
    const hasNext = stageIdx < currentStages.length - 1;

    // Estilo visual de bloqueio: Fundo listrado de vermelho ou sólido
    const bgClass = isLocked 
        ? 'bg-[repeating-linear-gradient(45deg,#3f1a1a,#3f1a1a_10px,#4f2020_10px,#4f2020_20px)] border-red-500' 
        : 'bg-slate-800 border-slate-700';

    el.className = `part-card relative p-3 rounded-lg border-l-4 ${bgClass} transition-all active:scale-[0.99] group`;
    
    el.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="text-[10px] font-bold text-slate-500 hover:text-white cursor-pointer" onclick="editOS('${os.id}')">#${os.osNumber}</span>
            <div class="flex items-center gap-2">
                ${isLocked ? '<i data-lucide="lock" class="w-3 h-3 text-red-500"></i>' : ''}
                <span class="part-badge" data-type="${partName}">${partName}</span>
            </div>
        </div>
        
        <div class="mb-2">
            <h4 class="text-white font-bold text-sm leading-tight truncate">${os.motor}</h4>
            
            ${isLocked ? `
                <div class="text-red-200 text-[10px] font-bold mt-1 bg-red-950 p-2 rounded border border-red-500/50 flex items-start gap-1 shadow-lg">
                   <span>🛑 PENDÊNCIA: ${pendencyReason}</span>
                </div>
            ` : `
                <div class="text-blue-300 text-[10px] font-medium mt-1 bg-blue-900/10 p-1.5 rounded border border-blue-900/30 leading-snug">
                    ${serviceNote}
                </div>
            `}
        </div>

        <div class="flex items-center gap-2 mt-3">
            ${isLocked ? `
                <button class="btn-resolve w-full bg-orange-600 hover:bg-orange-500 text-white py-1.5 rounded text-xs font-bold transition-colors flex justify-center gap-1 shadow-lg shadow-orange-900/20">
                    <i data-lucide="unlock" class="w-3 h-3"></i> RESOLVER PENDÊNCIA
                </button>
            ` : (hasNext ? `
                <button class="btn-move flex-1 bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white py-1.5 rounded text-xs font-bold transition-colors flex justify-center gap-1">
                    Próx <i data-lucide="arrow-right" class="w-3 h-3"></i>
                </button>
            ` : `
                <button class="btn-finish flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 rounded text-xs font-bold flex justify-center gap-1">
                    Pronto <i data-lucide="check" class="w-3 h-3"></i>
                </button>
            `)}
        </div>
    `;

    // Event Listeners
    if(isLocked) {
        el.querySelector('.btn-resolve').onclick = (e) => { e.stopPropagation(); resolvePendency(os.id, partName); };
    } else {
        if(hasNext) {
            el.querySelector('.btn-move').onclick = (e) => { e.stopPropagation(); movePart(os, partName, currentStages[stageIdx + 1].id); };
        } else {
            el.querySelector('.btn-finish').onclick = (e) => { e.stopPropagation(); finishPart(os, partName); };
        }
    }

    return el;
}

// --- AÇÕES DB ---
async function handleOSSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit');
    const originalText = btn.innerHTML;
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
                const serviceChecks = document.querySelectorAll(`input[name="service-${part}"]:checked`);
                serviceChecks.forEach(sc => selectedServices.push(sc.value));
                
                const extraInput = document.querySelector(`input[name="extra-${part}"]`);
                if(extraInput && extraInput.value.trim()) selectedServices.push(extraInput.value.trim());

                if(selectedServices.length > 0) servicesMap[part] = selectedServices;

                // Captura Pendência (Corrigido para garantir que não pegue valor vazio)
                const pendencyInput = document.querySelector(`input[name="pendency-${part}"]`);
                const hasPendency = pendencyInput && !pendencyInput.classList.contains('hidden') && pendencyInput.value.trim().length > 0;
                
                if(hasPendency) {
                    pendenciesMap[part] = pendencyInput.value.trim();
                }
            }
        });

        if (Object.keys(componentsMap).length === 0) throw new Error("Selecione pelo menos uma peça!");

        const payload = {
            ...osData,
            components: componentsMap,
            services: servicesMap,
            pendencies: pendenciesMap
        };

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
        btn.innerHTML = originalText;
        btn.disabled = false;
        if(window.lucide) window.lucide.createIcons();
    }
}

// --- INTELEGÊNCIA DE ROTEAMENTO (DISTRIBUIR PEÇAS) ---
window.advanceGroup = async (osId, currentStageId) => {
    try {
        const os = workOrders.find(o => o.id === osId);
        if(!os) return;

        const idx = currentStages.findIndex(s => s.id === currentStageId);
        // Se estiver no orçamento, usa o roteador inteligente. Se não, vai pro próximo.
        const nextStageDefault = currentStages[idx + 1].id;

        const newComponents = { ...os.components };
        
        Object.keys(newComponents).forEach(key => {
            if(newComponents[key] === currentStageId) {
                if (currentStageId === 'orcamento') {
                    // AQUI A MÁGICA: Distribui para o setor correto
                    newComponents[key] = PART_ROUTING[key] || 'montagem';
                } else {
                    newComponents[key] = nextStageDefault;
                }
            }
        });

        await updateDoc(doc(db, COLLECTION_NAME, osId), { components: newComponents });
        showToast("Peças Distribuídas!");
    } catch(e) { console.error(e); }
};

async function deleteOS(id) {
    if(!confirm("Apagar O.S. permanentemente?")) return;
    try { await deleteDoc(doc(db, COLLECTION_NAME, id)); window.closeModal(); showToast("Apagado", "error"); }
    catch(e) { console.error(e); }
}

async function movePart(os, partName, nextStageId) {
    if (os.pendencies && os.pendencies[partName]) {
        alert(`❌ AÇÃO BLOQUEADA!\n\nPeça: ${partName}\nMotivo: ${os.pendencies[partName]}`);
        return;
    }
    try {
        const osRef = doc(db, COLLECTION_NAME, os.id);
        const newComponents = { ...os.components };
        newComponents[partName] = nextStageId;
        await updateDoc(osRef, { components: newComponents });
    } catch(e) { console.error(e); }
}

async function finishPart(os, partName) {
    if (os.pendencies && os.pendencies[partName]) {
        alert("❌ Resolva a pendência antes de finalizar!");
        return;
    }
    if(!confirm(`Finalizar ${partName}?`)) return;
    try {
        const osRef = doc(db, COLLECTION_NAME, os.id);
        const newComponents = { ...os.components };
        delete newComponents[partName];
        if (Object.keys(newComponents).length === 0) await deleteDoc(osRef);
        else await updateDoc(osRef, { components: newComponents });
        showToast(`${partName} Concluído!`);
    } catch(e) { console.error(e); }
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
        if(type==='error') {
            t.classList.replace('border-slate-600', 'border-red-500');
            icon.setAttribute('data-lucide', 'alert-circle');
            icon.classList.add('text-red-500');
        } else {
            t.classList.replace('border-red-500', 'border-slate-600');
            icon.setAttribute('data-lucide', 'check-circle');
            icon.classList.replace('text-red-500', 'text-emerald-400');
        }
    }
    
    t.classList.remove('translate-y-[-150%]');
    setTimeout(() => t.classList.add('translate-y-[-150%]'), 3000);
    if(window.lucide) window.lucide.createIcons();
}

function setupUI() {
    document.getElementById('fab-new-os').onclick = window.openModal;
    document.getElementById('new-os-form').onsubmit = handleOSSubmit;
    document.getElementById('view-board').onclick = () => { document.getElementById('calendar-view').classList.add('translate-x-full'); renderBoard(); };
    document.getElementById('view-calendar').onclick = () => { document.getElementById('calendar-view').classList.remove('translate-x-full'); renderCalendar(); };
    document.getElementById('cal-prev').onclick = () => { currentMonth.setMonth(currentMonth.getMonth()-1); renderCalendar(); };
    document.getElementById('cal-next').onclick = () => { currentMonth.setMonth(currentMonth.getMonth()+1); renderCalendar(); };
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
