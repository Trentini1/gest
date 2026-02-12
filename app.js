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
const COLLECTION_NAME = "servicos_retifica_v2";

// --- ESTADO ---
let workOrders = [];
let currentMonth = new Date();
let activeStageMobile = null;
let editingId = null; // Para controlar se estamos criando ou editando

const DEFAULT_STAGES = [
    { id: 'desmontagem', label: 'Desmontagem', color: 'text-slate-400' },
    { id: 'lavacao', label: 'Lavação', color: 'text-blue-400' },
    { id: 'metrologia', label: 'Metrologia', color: 'text-yellow-400' },
    { id: 'cilindro', label: 'Cilindro', color: 'text-orange-400' },
    { id: 'cabecote', label: 'Cabeçote', color: 'text-purple-400' },
    { id: 'montagem', label: 'Montagem', color: 'text-emerald-400' }
];

let currentStages = JSON.parse(localStorage.getItem('retifica_stages_order')) || DEFAULT_STAGES;
if(!activeStageMobile && currentStages.length > 0) activeStageMobile = currentStages[0].id;

// --- INICIALIZAÇÃO ---
function init() {
    setupGlobalFunctions(); // Resolve o erro de ReferenceError
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

// --- EXPOR FUNÇÕES PARA O HTML (FIX ERRO CONSOLE) ---
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
                    <button onclick="moveOrder(${idx}, -1)" class="p-1 hover:bg-slate-600 rounded ${idx===0?'opacity-30':''}"><i data-lucide="arrow-up" class="w-4 h-4"></i></button>
                    <button onclick="moveOrder(${idx}, 1)" class="p-1 hover:bg-slate-600 rounded ${idx===currentStages.length-1?'opacity-30':''}"><i data-lucide="arrow-down" class="w-4 h-4"></i></button>
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

    window.openModal = () => {
        editingId = null; // Modo criação
        resetForm();
        document.getElementById('modal').classList.remove('hidden');
    };

    window.closeModal = () => {
        document.getElementById('modal').classList.add('hidden');
        resetForm();
    };

    // Nova função de Edição
    window.editOS = (id) => {
        const os = workOrders.find(o => o.id === id);
        if(!os) return;

        editingId = id; // Modo edição
        
        // Preenche formulário
        document.getElementById('input-os-num').value = os.osNumber;
        document.getElementById('input-motor').value = os.motor;
        document.getElementById('input-cliente').value = os.cliente;
        document.getElementById('input-prazo').value = os.deadline || '';
        document.getElementById('input-prioridade').checked = os.priority;

        // Marca checkboxes das peças existentes
        document.querySelectorAll('input[name="parts"]').forEach(cb => {
            cb.checked = os.components && os.components.hasOwnProperty(cb.value);
        });

        // UI Updates
        const btn = document.getElementById('btn-submit');
        btn.innerHTML = `Atualizar O.S.`;
        btn.classList.replace('bg-blue-600', 'bg-orange-600');
        btn.classList.replace('hover:bg-blue-500', 'hover:bg-orange-500');

        // Botão Excluir (Adiciona se não existir)
        let delBtn = document.getElementById('btn-delete-os');
        if(!delBtn) {
            delBtn = document.createElement('button');
            delBtn.id = 'btn-delete-os';
            delBtn.className = 'w-full mt-3 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white font-bold py-3 rounded-xl border border-red-900/50 transition-colors flex items-center justify-center gap-2';
            delBtn.innerHTML = `<i data-lucide="trash-2" class="w-4 h-4"></i> Excluir O.S. Permanentemente`;
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
    document.getElementById('new-os-form').reset();
    
    // Reset Botão Submit
    const btn = document.getElementById('btn-submit');
    btn.innerHTML = `Lançar Serviço no Sistema`;
    btn.classList.remove('bg-orange-600', 'hover:bg-orange-500');
    btn.classList.add('bg-blue-600', 'hover:bg-blue-500');
    
    // Esconde Botão Excluir
    const delBtn = document.getElementById('btn-delete-os');
    if(delBtn) delBtn.classList.add('hidden');
    
    // Checkboxes padrão
    document.querySelectorAll('input[name="parts"]').forEach(c => c.checked = ['Bloco','Cabeçote'].includes(c.value));
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
        let partCount = 0;
        workOrders.forEach(os => {
            if (os.components) {
                Object.values(os.components).forEach(compStage => {
                    if (compStage === stage.id) partCount++;
                });
            }
        });

        const isActive = activeStageMobile === stage.id;
        
        const btn = document.createElement('button');
        btn.className = `whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-bold border transition-all flex-shrink-0 ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-900/50' : 'bg-slate-800 text-slate-400 border-slate-700'}`;
        btn.innerHTML = `${stage.label} <span class="ml-1 opacity-70 text-xs">${partCount}</span>`;
        
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
        column.className = `flex-shrink-0 flex flex-col h-full ${isMobile ? 'w-full' : 'w-[340px] bg-slate-900/50 rounded-xl border border-slate-800'}`;
        
        if (!isMobile) {
            let partCount = 0;
            workOrders.forEach(os => {
                if (os.components) {
                    Object.values(os.components).forEach(s => { if (s === stage.id) partCount++; });
                }
            });

            column.innerHTML = `
                <div class="p-3 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900/90 backdrop-blur z-10 rounded-t-xl">
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full stage-dot ${stage.color} bg-current"></div>
                        <h3 class="font-bold text-slate-300 text-sm uppercase">${stage.label}</h3>
                    </div>
                    <span class="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full font-mono border border-slate-700">${partCount}</span>
                </div>
                <div class="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar list-container"></div>
            `;
        } else {
            column.innerHTML = `<div class="flex-1 overflow-y-auto pb-20 space-y-3 list-container"></div>`;
        }

        const list = column.querySelector('.list-container');
        let hasItems = false;
        
        workOrders.forEach(os => {
            if (!os.components) return;
            Object.entries(os.components).forEach(([partName, partStage]) => {
                if (partStage === stage.id) {
                    list.appendChild(createPartCard(os, partName, stage.id));
                    hasItems = true;
                }
            });
        });

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

function createPartCard(os, partName, currentStageId) {
    const el = document.createElement('div');
    const deadlineStatus = getDeadlineStatus(os.deadlineDate);
    
    let borderClass = 'border-slate-700';
    if (os.priority) borderClass = 'border-red-500/50 shadow-[0_0_15px_-3px_rgba(239,68,68,0.2)]';
    else if (deadlineStatus === 'late') borderClass = 'border-red-900';

    const stageIdx = currentStages.findIndex(s => s.id === currentStageId);
    const hasNext = stageIdx < currentStages.length - 1;

    el.className = `part-card relative p-3 rounded-lg border-l-4 ${borderClass} bg-slate-800 transition-all active:scale-[0.98] group`;
    
    el.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div class="flex items-center gap-2">
                <span class="font-mono text-[10px] font-bold text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded cursor-pointer hover:text-blue-400 hover:bg-slate-900 transition-colors" onclick="editOS('${os.id}')" title="Editar OS">
                    <i data-lucide="edit-2" class="w-3 h-3 inline mr-1"></i>#${os.osNumber}
                </span>
            </div>
            <span class="part-badge" data-type="${partName}">${partName}</span>
        </div>
        
        <div class="mb-3">
            <h4 class="text-white font-bold text-sm leading-tight truncate">${os.motor}</h4>
            <p class="text-slate-400 text-[10px] uppercase font-semibold truncate">${os.cliente}</p>
        </div>

        <div class="flex items-center gap-2 mb-3">
            ${deadlineStatus === 'late' ? 
                `<div class="text-[10px] text-red-400 font-bold flex items-center gap-1 bg-red-900/20 px-1.5 py-0.5 rounded"><i data-lucide="alert-circle" class="w-3 h-3"></i> Atrasado</div>` : 
                `<div class="text-[10px] text-slate-500 flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i> ${os.deadlineDate ? os.deadlineDate.toLocaleDateString('pt-BR') : 's/d'}</div>`
            }
        </div>

        <div class="flex items-center gap-2">
            ${hasNext ? `
                <button class="btn-move flex-1 bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 transition-colors">
                    Avançar <i data-lucide="arrow-right" class="w-3 h-3"></i>
                </button>
            ` : `
                <button class="btn-finish flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1 transition-colors">
                    Pronto <i data-lucide="check" class="w-3 h-3"></i>
                </button>
            `}
        </div>
    `;

    if(hasNext) {
        // Correção de escopo no onclick
        el.querySelector('.btn-move').onclick = (e) => {
            e.stopPropagation();
            movePart(os, partName, currentStages[stageIdx + 1].id);
        };
    } else {
        el.querySelector('.btn-finish').onclick = (e) => {
            e.stopPropagation();
            finishPart(os, partName);
        };
    }

    return el;
}

// --- AÇÕES DB ---

async function handleOSSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> Processando...`;
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

        const checkboxes = document.querySelectorAll('input[name="parts"]:checked');
        const componentsMap = {};
        
        // Se estiver editando, precisamos preservar o status das peças existentes
        if (editingId) {
            const existingOS = workOrders.find(o => o.id === editingId);
            // Mantém as peças antigas com seus status atuais se ainda estiverem marcadas
            checkboxes.forEach(cb => {
                if (existingOS.components && existingOS.components[cb.value]) {
                    componentsMap[cb.value] = existingOS.components[cb.value];
                } else {
                    componentsMap[cb.value] = currentStages[0].id; // Nova peça entra no início
                }
            });

            await updateDoc(doc(db, COLLECTION_NAME, editingId), {
                ...osData,
                components: componentsMap
            });
            showToast("O.S. Atualizada!");

        } else {
            // Criação
            const initialStage = currentStages[0].id;
            checkboxes.forEach(cb => componentsMap[cb.value] = initialStage);
            
            if (Object.keys(componentsMap).length === 0) throw new Error("Selecione peças!");

            await addDoc(collection(db, COLLECTION_NAME), {
                ...osData,
                components: componentsMap
            });
            showToast("O.S. Criada!");
        }

        window.closeModal();
    } catch (err) {
        console.error(err);
        alert(err.message || "Erro ao salvar");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        if(window.lucide) window.lucide.createIcons();
    }
}

async function deleteOS(id) {
    if(!confirm("TEM CERTEZA? Isso apagará todo o histórico dessa O.S.")) return;
    try {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
        window.closeModal();
        showToast("O.S. Excluída", "error");
    } catch(e) { console.error(e); alert("Erro ao excluir"); }
}

async function movePart(os, partName, nextStageId) {
    try {
        const osRef = doc(db, COLLECTION_NAME, os.id);
        const newComponents = { ...os.components };
        newComponents[partName] = nextStageId;
        await updateDoc(osRef, { components: newComponents });
    } catch(e) { console.error(e); showToast("Erro ao mover", "error"); }
}

async function finishPart(os, partName) {
    if(!confirm(`Finalizar ${partName}?`)) return;
    try {
        const osRef = doc(db, COLLECTION_NAME, os.id);
        const newComponents = { ...os.components };
        delete newComponents[partName];

        if (Object.keys(newComponents).length === 0) {
            await deleteDoc(osRef);
            showToast(`O.S. #${os.osNumber} Concluída!`);
        } else {
            await updateDoc(osRef, { components: newComponents });
            showToast(`${partName} pronto!`);
        }
    } catch(e) { console.error(e); }
}

// --- UTILS ---
function getDeadlineStatus(date) {
    if(!date) return 'ok';
    const diff = date - new Date();
    if(diff < 0) return 'late';
    return 'ok';
}

function showToast(msg, type='success') {
    const t = document.getElementById('toast');
    if(!t) return;
    document.getElementById('toast-msg').innerText = msg;
    const icon = t.querySelector('i');
    if(type==='error') {
        t.classList.replace('border-slate-600', 'border-red-500');
        icon.setAttribute('data-lucide', 'alert-circle');
        icon.classList.add('text-red-500');
    } else {
        t.classList.replace('border-red-500', 'border-slate-600');
        icon.setAttribute('data-lucide', 'check-circle');
        icon.classList.replace('text-red-500', 'text-emerald-400');
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
    
    // Calendar Nav
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
