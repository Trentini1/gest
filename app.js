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
const COLLECTION_NAME = "servicos_retifica_v2"; // Mudança de coleção para evitar conflito de dados antigos

// --- ESTADO ---
let workOrders = [];
let currentMonth = new Date();
let activeStageMobile = null; // Definido dinamicamente no init

// Ordem Padrão (Pode ser alterada nas settings)
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
        // Conta quantas PEÇAS estão neste estágio, não quantas OS
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
        // Filtro Mobile
        if (isMobile && stage.id !== activeStageMobile) return;

        const column = document.createElement('div');
        column.className = `flex-shrink-0 flex flex-col h-full ${isMobile ? 'w-full' : 'w-[340px] bg-slate-900/50 rounded-xl border border-slate-800'}`;
        
        // Header Desktop
        if (!isMobile) {
            // Conta peças neste estágio
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
        
        // --- AQUI A MÁGICA DE SEPARAÇÃO ---
        let hasItems = false;
        
        workOrders.forEach(os => {
            if (!os.components) return;

            // Itera sobre as peças dessa OS
            Object.entries(os.components).forEach(([partName, partStage]) => {
                // Se a peça estiver no estágio atual, renderiza o card DELA
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
    
    // Status visual
    let borderClass = 'border-slate-700';
    if (os.priority) borderClass = 'border-red-500/50 shadow-[0_0_15px_-3px_rgba(239,68,68,0.2)]';
    else if (deadlineStatus === 'late') borderClass = 'border-red-900';

    // Navegação
    const stageIdx = currentStages.findIndex(s => s.id === currentStageId);
    const hasNext = stageIdx < currentStages.length - 1;

    el.className = `part-card relative p-3 rounded-lg border-l-4 ${borderClass} bg-slate-800 transition-all active:scale-[0.98] group`;
    
    el.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="font-mono text-[10px] font-bold text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded">#${os.osNumber}</span>
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

    // Actions
    if(hasNext) {
        el.querySelector('.btn-move').onclick = () => movePart(os, partName, currentStages[stageIdx + 1].id);
    } else {
        el.querySelector('.btn-finish').onclick = () => finishPart(os, partName);
    }

    return el;
}

// --- LÓGICA DE DADOS ---

async function createNewOS(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i>`;
    btn.disabled = true;

    try {
        // Pega as peças marcadas
        const checkboxes = document.querySelectorAll('input[name="parts"]:checked');
        const componentsMap = {};
        const initialStage = currentStages[0].id;
        
        checkboxes.forEach(cb => {
            componentsMap[cb.value] = initialStage;
        });

        if (Object.keys(componentsMap).length === 0) throw new Error("Selecione pelo menos uma peça");

        await addDoc(collection(db, COLLECTION_NAME), {
            osNumber: document.getElementById('input-os-num').value || '---',
            deadline: document.getElementById('input-prazo').value,
            motor: document.getElementById('input-motor').value,
            cliente: document.getElementById('input-cliente').value,
            priority: document.getElementById('input-prioridade').checked,
            components: componentsMap, // Mapa de Peças -> Estágio
            timestamp: serverTimestamp()
        });

        window.closeModal();
        showToast("OS Lançada! Peças na " + currentStages[0].label);
        e.target.reset();
        // Reseta checkboxes para padrão
        document.querySelectorAll('input[name="parts"]').forEach(c => c.checked = ['Bloco','Cabeçote'].includes(c.value));
        
    } catch (err) {
        console.error(err);
        alert(err.message || "Erro ao salvar");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        if(window.lucide) window.lucide.createIcons();
    }
}

async function movePart(os, partName, nextStageId) {
    try {
        // Atualiza SÓ o status daquela peça específica
        const osRef = doc(db, COLLECTION_NAME, os.id);
        const newComponents = { ...os.components };
        newComponents[partName] = nextStageId;
        
        await updateDoc(osRef, { components: newComponents });
        // Feedback visual não é necessário pois o onSnapshot cuida disso
    } catch(e) { console.error(e); showToast("Erro ao mover", "error"); }
}

async function finishPart(os, partName) {
    if(!confirm(`Finalizar ${partName} da OS #${os.osNumber}?`)) return;
    try {
        const osRef = doc(db, COLLECTION_NAME, os.id);
        const newComponents = { ...os.components };
        
        // Remove a peça do mapa (ou poderia mover para um status 'finalizado')
        delete newComponents[partName];

        // Se não sobrar peças, deleta a OS inteira ou arquiva
        if (Object.keys(newComponents).length === 0) {
            await deleteDoc(osRef); // Ou mover para coleção 'arquivados'
            showToast(`OS #${os.osNumber} Completa!`);
        } else {
            await updateDoc(osRef, { components: newComponents });
            showToast(`${partName} finalizado!`);
        }
    } catch(e) { console.error(e); }
}

// --- SETTINGS (REORDER) ---
window.openSettings = () => {
    const list = document.getElementById('settings-list');
    const modal = document.getElementById('modal-settings');
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
    window.openSettings(); // Re-render list
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

// --- UTILS ---
function getDeadlineStatus(date) {
    if(!date) return 'ok';
    const diff = date - new Date();
    if(diff < 0) return 'late';
    return 'ok';
}

function showToast(msg, type='success') {
    const t = document.getElementById('toast');
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

// UI Binds
window.openModal = () => document.getElementById('modal').classList.remove('hidden');
window.closeModal = () => document.getElementById('modal').classList.add('hidden');
document.getElementById('fab-new-os').onclick = window.openModal;
document.getElementById('new-os-form').onsubmit = createNewOS;
document.getElementById('view-board').onclick = () => { document.getElementById('calendar-view').classList.add('translate-x-full'); renderBoard(); };
document.getElementById('view-calendar').onclick = () => { document.getElementById('calendar-view').classList.remove('translate-x-full'); renderCalendar(); };

// Calendar Logic (Simplified for brevity as main logic changed little)
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
                 div.innerHTML += `<div class="cal-event bg-blue-900/40 text-blue-200 border border-blue-800">#${os.osNumber}</div>`;
             }
        });
        grid.appendChild(div);
    }
}
document.getElementById('cal-prev').onclick = () => { currentMonth.setMonth(currentMonth.getMonth()-1); renderCalendar(); };
document.getElementById('cal-next').onclick = () => { currentMonth.setMonth(currentMonth.getMonth()+1); renderCalendar(); };

// Boot
init();
