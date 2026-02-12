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
const COLLECTION_NAME = "servicos_retifica_v3"; // Nova versão para limpar dados antigos incompatíveis

// --- ESTADO ---
let workOrders = [];
let currentMonth = new Date();
let activeStageMobile = null;
let editingId = null;

// NOVOS ESTÁGIOS: Fluxo Funil
const DEFAULT_STAGES = [
    { id: 'lavacao', label: 'Lavação', color: 'text-blue-400', isGrouped: true },
    { id: 'orcamento', label: 'Inspeção/Orçamento', color: 'text-red-400', isGrouped: true },
    { id: 'metrologia', label: 'Metrologia', color: 'text-yellow-400', isGrouped: false },
    { id: 'cilindro', label: 'Cilindro/Bloco', color: 'text-orange-400', isGrouped: false },
    { id: 'cabecote', label: 'Cabeçote', color: 'text-purple-400', isGrouped: false },
    { id: 'montagem', label: 'Montagem', color: 'text-emerald-400', isGrouped: false }
];

let currentStages = JSON.parse(localStorage.getItem('retifica_stages_order')) || DEFAULT_STAGES;
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

    window.addEventListener('resize', renderApp);
}

// --- FUNÇÕES GLOBAIS ---
function setupGlobalFunctions() {
    // Configurações
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
        localStorage.setItem('retifica_stages_order', JSON.stringify(currentStages));
        document.getElementById('modal-settings').classList.add('hidden');
        renderApp();
        showToast("Ordem salva!");
    };

    window.resetSettings = () => {
        localStorage.removeItem('retifica_stages_order');
        currentStages = DEFAULT_STAGES;
        window.openSettings();
    };

    // Modal Nova/Edit OS
    window.openModal = () => {
        editingId = null;
        resetForm();
        document.getElementById('modal').classList.remove('hidden');
    };

    window.closeModal = () => {
        document.getElementById('modal').classList.add('hidden');
        resetForm();
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

        // Limpa lista de peças
        const partsContainer = document.getElementById('parts-selection');
        partsContainer.innerHTML = '';

        // Gera inputs de serviços para cada peça existente ou padrão
        const allParts = ['Bloco', 'Cabeçote', 'Virabrequim', 'Bielas', 'Comando', 'Peças Diversas'];
        
        allParts.forEach(part => {
            const isChecked = os.components && os.components[part];
            const serviceNote = (os.services && os.services[part]) || '';
            
            const div = document.createElement('div');
            div.className = `p-3 rounded-lg border ${isChecked ? 'border-blue-500/50 bg-blue-900/10' : 'border-slate-700 bg-slate-900'} transition-all`;
            div.innerHTML = `
                <label class="flex items-center gap-3 cursor-pointer mb-2">
                    <input type="checkbox" name="parts" value="${part}" class="w-4 h-4 accent-blue-500" ${isChecked ? 'checked' : ''}>
                    <span class="text-sm font-bold ${isChecked ? 'text-blue-300' : 'text-slate-400'}">${part}</span>
                </label>
                <input type="text" name="service-${part}" value="${serviceNote}" 
                    class="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-blue-500 outline-none placeholder-slate-600"
                    placeholder="O que fazer? (Ex: Retífica 0.50)">
            `;
            partsContainer.appendChild(div);
        });

        // Toggle Aprovação
        const statusContainer = document.getElementById('status-container');
        if (statusContainer) {
            statusContainer.innerHTML = `
                <label class="flex items-center gap-3 p-3 rounded-lg border ${os.approved ? 'border-emerald-500 bg-emerald-900/20' : 'border-red-500 bg-red-900/20'} cursor-pointer transition-all">
                    <input type="checkbox" id="input-approved" class="w-5 h-5 accent-emerald-500" ${os.approved ? 'checked' : ''}>
                    <span class="font-bold ${os.approved ? 'text-emerald-400' : 'text-red-400'}">
                        ${os.approved ? 'ORÇAMENTO APROVADO - LIBERADO' : 'AGUARDANDO APROVAÇÃO DO CLIENTE'}
                    </span>
                </label>
            `;
        }

        const btn = document.getElementById('btn-submit');
        btn.innerHTML = `Salvar Alterações`;
        
        // Botão Excluir
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
}

function resetForm() {
    const form = document.getElementById('new-os-form');
    form.reset();
    
    // Reset Peças
    const partsContainer = document.getElementById('parts-selection');
    partsContainer.innerHTML = ''; // Recria padrão no edit, ou vazio no create
    // Recria padrão simples para New OS
    const defaultParts = ['Bloco', 'Cabeçote', 'Virabrequim', 'Bielas', 'Comando', 'Peças Diversas'];
    defaultParts.forEach(part => {
        const div = document.createElement('div');
        div.className = 'p-3 rounded-lg border border-slate-700 bg-slate-900';
        div.innerHTML = `
            <label class="flex items-center gap-3 cursor-pointer mb-2">
                <input type="checkbox" name="parts" value="${part}" class="w-4 h-4 accent-blue-500" ${['Bloco','Cabeçote'].includes(part) ? 'checked' : ''}>
                <span class="text-sm font-medium text-slate-300">${part}</span>
            </label>
            <input type="text" name="service-${part}" class="hidden w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs" placeholder="Serviço...">
        `;
        partsContainer.appendChild(div);
    });

    const statusContainer = document.getElementById('status-container');
    if(statusContainer) statusContainer.innerHTML = ''; // Novo não tem status, nasce pendente

    const btn = document.getElementById('btn-submit');
    btn.innerHTML = `Lançar O.S. na Entrada`;
    
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
        // Contagem inteligente
        let count = 0;
        workOrders.forEach(os => {
            if(stage.isGrouped) {
                // Se o estágio é agrupado (Lavação/Orçamento), conta 1 por O.S. se tiver QUALQUER peça lá
                const hasPartHere = os.components && Object.values(os.components).includes(stage.id);
                if(hasPartHere) count++;
            } else {
                // Se é produção, conta as peças individuais
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
        column.className = `flex-shrink-0 flex flex-col h-full ${isMobile ? 'w-full' : 'w-[350px] bg-slate-900/50 rounded-xl border border-slate-800'}`;
        
        if (!isMobile) {
            column.innerHTML = `
                <div class="p-3 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900/90 backdrop-blur z-10 rounded-t-xl">
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

        // LÓGICA DE RENDERIZAÇÃO MISTA (AGRUPADO VS PEÇAS)
        if (stage.isGrouped) {
            // Estágios de Gestão (Lavação/Orçamento): Mostra 1 Card por O.S.
            const relevantOS = workOrders.filter(os => os.components && Object.values(os.components).includes(stage.id));
            
            relevantOS.forEach(os => {
                list.appendChild(createGroupedCard(os, stage.id));
                hasItems = true;
            });
        } else {
            // Estágios de Produção (Metrologia, etc): Mostra Peças Individuais
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
    const deadlineStatus = getDeadlineStatus(os.deadlineDate);
    
    let borderClass = 'border-slate-700';
    if(stageId === 'orcamento') {
        borderClass = os.approved ? 'border-emerald-500 shadow-[0_0_15px_-3px_rgba(16,185,129,0.2)]' : 'border-red-500 shadow-[0_0_15px_-3px_rgba(239,68,68,0.2)]';
    }

    // Lista de peças que estão NESTE estágio
    const partsHere = Object.entries(os.components)
        .filter(([_, st]) => st === stageId)
        .map(([name]) => name);

    el.className = `relative p-4 rounded-lg border-l-4 ${borderClass} bg-slate-800 transition-all active:scale-[0.98] group`;
    
    el.innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <span class="font-mono text-xs font-bold text-slate-400 bg-slate-950 px-2 py-1 rounded cursor-pointer hover:text-white" onclick="editOS('${os.id}')">
                <i data-lucide="edit-2" class="w-3 h-3 inline mr-1"></i>#${os.osNumber}
            </span>
            ${stageId === 'orcamento' ? 
                (os.approved ? '<span class="text-[10px] font-bold bg-emerald-900/30 text-emerald-400 px-2 py-1 rounded border border-emerald-800">APROVADO</span>' 
                             : '<span class="text-[10px] font-bold bg-red-900/30 text-red-400 px-2 py-1 rounded border border-red-800 animate-pulse">AGUARDANDO</span>') 
                : ''}
        </div>
        
        <h4 class="text-white font-bold text-lg leading-tight mb-1">${os.motor}</h4>
        <p class="text-slate-400 text-xs uppercase font-semibold mb-3 tracking-wide">${os.cliente}</p>

        <!-- Lista de Peças no Card -->
        <div class="space-y-1 mb-4">
            ${partsHere.map(p => `
                <div class="flex justify-between items-center text-xs text-slate-300 bg-slate-900/50 px-2 py-1 rounded">
                    <span>${p}</span>
                    <span class="text-slate-500 italic truncate max-w-[100px]">${(os.services && os.services[p]) || ''}</span>
                </div>
            `).join('')}
        </div>

        <div class="flex gap-2">
            ${stageId === 'orcamento' && !os.approved ? 
                `<button onclick="editOS('${os.id}')" class="w-full bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-900 py-2 rounded font-bold text-xs transition-colors">
                    <i data-lucide="file-signature" class="w-3 h-3 inline mr-1"></i> ANALISAR / APROVAR
                </button>` :
                `<button onclick="advanceGroup('${os.id}', '${stageId}')" class="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-bold text-xs shadow-lg shadow-blue-900/20 transition-colors flex justify-center items-center gap-2">
                    Avançar Todos <i data-lucide="arrow-right-circle" class="w-4 h-4"></i>
                </button>`
            }
        </div>
    `;
    return el;
}

// --- CARD: PEÇA INDIVIDUAL (Produção) ---
function createPartCard(os, partName, currentStageId) {
    const el = document.createElement('div');
    const deadlineStatus = getDeadlineStatus(os.deadlineDate);
    
    // Serviço Específico
    const serviceNote = (os.services && os.services[partName]) || 'Serviço Padrão';
    
    const stageIdx = currentStages.findIndex(s => s.id === currentStageId);
    const hasNext = stageIdx < currentStages.length - 1;

    el.className = `part-card relative p-3 rounded-lg border-l-4 border-slate-700 bg-slate-800 transition-all active:scale-[0.98] group`;
    
    el.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="text-[10px] font-bold text-slate-500 hover:text-white cursor-pointer" onclick="editOS('${os.id}')">#${os.osNumber}</span>
            <span class="part-badge" data-type="${partName}">${partName}</span>
        </div>
        
        <div class="mb-2">
            <h4 class="text-white font-bold text-sm leading-tight truncate">${os.motor}</h4>
            <div class="text-blue-400 text-[10px] font-mono mt-1 bg-blue-900/10 p-1 rounded border border-blue-900/30 truncate">
                ${serviceNote}
            </div>
        </div>

        <div class="flex items-center gap-2 mt-3">
            ${hasNext ? `
                <button class="btn-move flex-1 bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white py-1.5 rounded text-xs font-bold transition-colors flex justify-center gap-1">
                    Próx <i data-lucide="arrow-right" class="w-3 h-3"></i>
                </button>
            ` : `
                <button class="btn-finish flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 rounded text-xs font-bold flex justify-center gap-1">
                    Pronto <i data-lucide="check" class="w-3 h-3"></i>
                </button>
            `}
        </div>
    `;

    if(hasNext) {
        el.querySelector('.btn-move').onclick = (e) => { e.stopPropagation(); movePart(os, partName, currentStages[stageIdx + 1].id); };
    } else {
        el.querySelector('.btn-finish').onclick = (e) => { e.stopPropagation(); finishPart(os, partName); };
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

        // Captura serviços e peças
        const partsInputs = document.querySelectorAll('input[name="parts"]:checked');
        const componentsMap = {};
        const servicesMap = {};
        
        // Determina estágio inicial/atual
        let currentComponents = {};
        if (editingId) {
            const oldOS = workOrders.find(o => o.id === editingId);
            currentComponents = oldOS.components || {};
        }

        partsInputs.forEach(cb => {
            const part = cb.value;
            // Se já existe, mantém o estágio. Se é novo, vai para Lavação (Estágio 0)
            componentsMap[part] = currentComponents[part] || currentStages[0].id;
            
            // Captura o serviço escrito
            const serviceInput = document.querySelector(`input[name="service-${part}"]`);
            if(serviceInput && serviceInput.value) servicesMap[part] = serviceInput.value;
        });

        // Captura Aprovação (só se estiver editando e o campo existir)
        const approvedInput = document.getElementById('input-approved');
        const isApproved = approvedInput ? approvedInput.checked : false;

        if (Object.keys(componentsMap).length === 0) throw new Error("Selecione peças!");

        if (editingId) {
            await updateDoc(doc(db, COLLECTION_NAME, editingId), {
                ...osData,
                components: componentsMap,
                services: servicesMap,
                approved: isApproved
            });
            showToast("Atualizado!");
        } else {
            await addDoc(collection(db, COLLECTION_NAME), {
                ...osData,
                components: componentsMap,
                services: servicesMap,
                approved: false // Nasce não aprovado
            });
            showToast("O.S. Criada na Lavação!");
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

// Avança TODOS os componentes de um estágio para o próximo (Para Lavação -> Orçamento)
window.advanceGroup = async (osId, currentStageId) => {
    try {
        const os = workOrders.find(o => o.id === osId);
        if(!os) return;

        // Descobre o próximo estágio
        const idx = currentStages.findIndex(s => s.id === currentStageId);
        const nextStage = currentStages[idx + 1].id;

        // Move APENAS as peças que estão no estágio atual
        const newComponents = { ...os.components };
        Object.keys(newComponents).forEach(key => {
            if(newComponents[key] === currentStageId) {
                newComponents[key] = nextStage;
            }
        });

        await updateDoc(doc(db, COLLECTION_NAME, osId), { components: newComponents });
        showToast("Avançado para " + currentStages[idx + 1].label);
    } catch(e) { console.error(e); }
};

async function deleteOS(id) {
    if(!confirm("Apagar O.S. permanentemente?")) return;
    try { await deleteDoc(doc(db, COLLECTION_NAME, id)); window.closeModal(); showToast("Apagado", "error"); }
    catch(e) { console.error(e); }
}

async function movePart(os, partName, nextStageId) {
    try {
        const osRef = doc(db, COLLECTION_NAME, os.id);
        const newComponents = { ...os.components };
        newComponents[partName] = nextStageId;
        await updateDoc(osRef, { components: newComponents });
    } catch(e) { console.error(e); }
}

async function finishPart(os, partName) {
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

// --- UTILS ---
function getDeadlineStatus(date) {
    if(!date) return 'ok';
    return (date - new Date() < 0) ? 'late' : 'ok';
}

function showToast(msg, type='success') {
    const t = document.getElementById('toast');
    if(!t) return;
    document.getElementById('toast-msg').innerText = msg;
    const icon = t.querySelector('i');
    
    // Safety check para ícone
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

// UI SETUP
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

// Boot
init();
