import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURAÇÃO FIREBASE ---
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
const COLLECTION_NAME = "servicos_retifica";

// --- ESTADO GLOBAL ---
let workOrders = [];
let currentMonth = new Date();
let viewMode = 'board'; // 'board' or 'calendar'

// Definição Padrão das Colunas
const DEFAULT_STAGES = [
    { id: 'desmontagem', label: 'Desmontagem', color: 'border-slate-500' },
    { id: 'lavacao', label: 'Lavação', color: 'border-blue-500' },
    { id: 'metrologia', label: 'Metrologia', color: 'border-yellow-500' },
    { id: 'cilindro', label: 'Cilindro', color: 'border-orange-500' },
    { id: 'cabecote', label: 'Cabeçote', color: 'border-purple-500' },
    { id: 'montagem', label: 'Montagem', color: 'border-emerald-500' }
];

// Carrega ordem salva ou usa padrão
let currentStages = JSON.parse(localStorage.getItem('retifica_stages_order')) || DEFAULT_STAGES;

// --- INICIALIZAÇÃO ---
function init() {
    // Tenta configurar listeners, mas só se os elementos existirem
    setupEventListeners();
    setupClock();
    
    // Listener Realtime
    const q = query(collection(db, COLLECTION_NAME), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        workOrders = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // Converte timestamp do Firestore ou string para Date object para cálculos
                deadlineDate: data.deadline ? new Date(data.deadline) : null
            };
        });
        
        refreshView();
    }, (error) => {
        console.error("Erro Firebase:", error);
        showToast("Erro de conexão com servidor", "error");
    });
}

function refreshView() {
    if (viewMode === 'board') {
        renderBoard();
    } else {
        renderCalendar();
    }
}

// --- KANBAN LOGIC ---

function renderBoard() {
    const container = document.getElementById('board-view');
    // AQUI ESTAVA O ERRO: Se o HTML não tiver um id="board-view", ele crashava.
    if (!container) {
        console.warn("Elemento 'board-view' não encontrado no HTML. Verifique os IDs.");
        return;
    }
    
    container.innerHTML = '';

    currentStages.forEach(stage => {
        const column = document.createElement('div');
        // Ajustei as classes para ficarem mais responsivas
        column.className = `min-w-[300px] w-[320px] flex flex-col h-full bg-slate-800/40 rounded-xl border border-slate-700/50 backdrop-blur-md transition-colors hover:border-slate-600`;
        
        const ordersInStage = workOrders.filter(o => o.stage === stage.id);
        
        column.innerHTML = `
            <div class="p-4 border-b border-slate-700/50 flex justify-between items-center bg-slate-900/50 rounded-t-xl sticky top-0 z-10">
                <div class="flex items-center gap-3">
                    <div class="w-3 h-3 shadow shadow-${stage.color.replace('border-', '')}/50 rounded-full ${getStageColor(stage.id)}"></div>
                    <h3 class="font-bold text-slate-100 uppercase tracking-wider text-xs">${stage.label}</h3>
                </div>
                <span class="bg-slate-700/50 text-xs font-bold px-2 py-0.5 rounded text-slate-300 border border-slate-600">${ordersInStage.length}</span>
            </div>
            <div class="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar" id="col-${stage.id}"></div>
        `;

        const list = column.querySelector(`#col-${stage.id}`);
        ordersInStage.forEach(os => list.appendChild(createCard(os)));
        container.appendChild(column);
    });

    if(window.lucide) window.lucide.createIcons();
}

function createCard(os) {
    const el = document.createElement('div');
    const status = checkDeadlineStatus(os.deadlineDate);
    
    // Design visual melhorado
    el.className = `bg-slate-800 p-4 rounded-lg border-l-[6px] shadow-lg relative group select-none transition-all hover:-translate-y-1 hover:shadow-xl
        ${os.priority ? 'urgent-pulse border-red-600 bg-red-900/10' : 'border-slate-600 hover:border-blue-500'} 
        ${os.pending ? 'border-yellow-500 opacity-90 bg-yellow-900/5' : ''}`;
    
    // Status visual do prazo (Badge mais bonito)
    let badgeHtml = '';
    if (status === 'late') badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1"><i data-lucide="alert-circle" class="w-3 h-3"></i> ATRASADO</span>`;
    else if (status === 'warning') badgeHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">HOJE</span>`;
    
    // Botões de ação
    const nextStageIdx = currentStages.findIndex(s => s.id === os.stage) + 1;
    const hasNext = nextStageIdx < currentStages.length;

    el.innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <span class="font-mono text-xs font-bold text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-700">#${os.osNumber || '000'}</span>
            ${badgeHtml}
        </div>
        
        <h4 class="font-bold text-slate-100 text-lg leading-tight mb-1 tracking-tight">${os.motor}</h4>
        <p class="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wide">${os.cliente}</p>
        
        <div class="flex items-center gap-2 text-[11px] text-slate-400 mb-3 bg-slate-900/30 p-1.5 rounded w-full border border-slate-700/30">
            <i data-lucide="calendar-clock" class="w-3 h-3 text-blue-400"></i> 
            ${os.deadlineDate ? os.deadlineDate.toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Sem prazo definido'}
        </div>

        ${os.pending ? `
            <div class="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-xs p-2 rounded mb-3 flex items-start gap-2">
                <i data-lucide="lock" class="w-3 h-3 mt-0.5 text-yellow-500"></i> 
                <span class="font-medium">${os.pendingReason}</span>
            </div>
        ` : ''}

        <div class="flex justify-between items-center pt-3 border-t border-slate-700/50 mt-auto">
            <button class="btn-lock p-2 rounded-full hover:bg-slate-700 text-slate-500 hover:text-yellow-400 transition-colors" title="${os.pending ? 'Destravar' : 'Travar com Pendência'}">
                <i data-lucide="${os.pending ? 'lock' : 'unlock'}" class="w-4 h-4"></i>
            </button>
            
            ${hasNext ? `
                <button class="btn-next bg-blue-600/90 hover:bg-blue-500 text-white pl-3 pr-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow hover:shadow-blue-500/20">
                    Avançar <i data-lucide="chevron-right" class="w-4 h-4"></i>
                </button>
            ` : `
                <button class="btn-finish bg-emerald-600/90 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow hover:shadow-emerald-500/20">
                    Concluir <i data-lucide="check-circle-2" class="w-4 h-4"></i>
                </button>
            `}
        </div>
    `;

    // Event Listeners isolados
    el.querySelector('.btn-lock').onclick = () => togglePending(os);
    if(hasNext) el.querySelector('.btn-next').onclick = () => moveStage(os, currentStages[nextStageIdx].id);
    else el.querySelector('.btn-finish').onclick = () => finishOS(os);

    return el;
}

// --- CALENDAR LOGIC ---

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('calendar-month-title');
    
    // Proteção contra erro de null
    if (!grid || !title) return;

    grid.innerHTML = '';
    
    // Configura datas
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay(); // 0 = Dom
    
    title.textContent = firstDay.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    // Dias vazios antes do dia 1
    for(let i=0; i<startPadding; i++) {
        const div = document.createElement('div');
        div.className = 'calendar-day inactive bg-slate-800/20 border-slate-800';
        grid.appendChild(div);
    }

    // Dias do mês
    const todayStr = new Date().toDateString();

    for(let i=1; i<=lastDay.getDate(); i++) {
        const date = new Date(year, month, i);
        const dayDiv = document.createElement('div');
        const isToday = date.toDateString() === todayStr;
        
        dayDiv.className = `calendar-day ${isToday ? 'today ring-2 ring-blue-500 bg-slate-800' : 'bg-slate-800/50'} border-slate-700`;
        dayDiv.innerHTML = `<span class="text-xs font-bold ${isToday ? 'text-blue-400' : 'text-slate-500'} mb-1">${i}</span>`;

        // Encontrar OS deste dia
        const daysOS = workOrders.filter(os => {
            if(!os.deadlineDate) return false;
            return os.deadlineDate.getDate() === i && 
                   os.deadlineDate.getMonth() === month &&
                   os.deadlineDate.getFullYear() === year;
        });

        daysOS.forEach(os => {
            const event = document.createElement('div');
            const status = checkDeadlineStatus(os.deadlineDate);
            let colorClass = status === 'late' ? 'bg-red-900/50 border-red-700 text-red-200' : (status === 'warning' ? 'bg-orange-900/50 border-orange-700 text-orange-200' : 'bg-emerald-900/50 border-emerald-700 text-emerald-200');
            
            event.className = `cal-event ${colorClass} text-[10px] border p-1 rounded mb-1 truncate cursor-pointer hover:scale-105 transition-transform`;
            event.innerHTML = `<span class="font-bold opacity-70">#${os.osNumber}</span> ${os.motor}`;
            event.title = `${os.cliente} - ${os.stage.toUpperCase()}`;
            dayDiv.appendChild(event);
        });

        grid.appendChild(dayDiv);
    }
}

// --- AÇÕES DO USUÁRIO ---

async function createNewOS(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit');
    
    // Se o botão não existir (erro de HTML), sai fora
    if (!btn) {
        console.error("Botão submit não encontrado");
        return;
    }

    const originalText = btn.innerHTML;
    
    // Feedback visual imediato (Loading)
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i> Processando...`;

    try {
        const data = {
            osNumber: document.getElementById('input-os-num')?.value || '000',
            deadline: document.getElementById('input-prazo')?.value || new Date().toISOString(), 
            cliente: document.getElementById('input-cliente')?.value || 'Sem nome',
            motor: document.getElementById('input-motor')?.value || 'Motor n/d',
            tipo: document.getElementById('input-tipo')?.value || 'Geral',
            priority: document.getElementById('input-prioridade')?.checked || false,
            stage: currentStages[0].id, 
            pending: false,
            timestamp: serverTimestamp()
        };

        await addDoc(collection(db, COLLECTION_NAME), data);
        
        closeModal();
        showToast("O.S. Criada com Sucesso!");
    } catch (error) {
        console.error("Erro ao criar OS:", error);
        showToast("Erro ao salvar! Verifique se está logado/internet.", "error");
    } finally {
        // GARANTE QUE O BOTÃO VOLTA AO NORMAL
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
        // Recria ícones caso o botão tenha ícones novos
        if(window.lucide) window.lucide.createIcons();
    }
}

async function moveStage(os, nextStageId) {
    if(os.pending) {
        showToast("Resolva a pendência antes de mover!", "error");
        return;
    }
    try {
        await updateDoc(doc(db, COLLECTION_NAME, os.id), { stage: nextStageId });
    } catch (e) {
        console.error(e);
        showToast("Erro ao mover card", "error");
    }
}

async function finishOS(os) {
    if(confirm(`Finalizar a OS #${os.osNumber}?`)) {
        try {
            await deleteDoc(doc(db, COLLECTION_NAME, os.id));
            showToast("OS Finalizada e Arquivada");
        } catch (e) {
            console.error(e);
            showToast("Erro ao finalizar", "error");
        }
    }
}

async function togglePending(os) {
    const ref = doc(db, COLLECTION_NAME, os.id);
    if(os.pending) {
        await updateDoc(ref, { pending: false, pendingReason: null });
    } else {
        const reason = prompt("Motivo da Pendência (Ex: Falta Peça):");
        if(reason) await updateDoc(ref, { pending: true, pendingReason: reason });
    }
}

// --- UTILITÁRIOS ---

function checkDeadlineStatus(dateObj) {
    if(!dateObj) return 'ok';
    const now = new Date();
    const diff = dateObj - now;
    
    if (diff < 0) return 'late'; // Já passou
    if (diff < 86400000) return 'warning'; // Menos de 24h
    return 'ok';
}

function getStageColor(id) {
    const map = {
        'desmontagem': 'bg-slate-400', 'lavacao': 'bg-blue-400', 'metrologia': 'bg-yellow-400',
        'cilindro': 'bg-orange-400', 'cabecote': 'bg-purple-400', 'montagem': 'bg-emerald-400'
    };
    return map[id] || 'bg-slate-500';
}

function setupClock() {
    const clockEl = document.getElementById('clock');
    if (!clockEl) return;
    
    setInterval(() => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    }, 1000);
}

// --- GERENCIAMENTO DE TABS/VIEW ---

function setupEventListeners() {
    // Helper para adicionar evento com check de null
    const addEvent = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
        else console.warn(`Elemento ${id} não encontrado para evento ${event}`);
    };

    // Forms
    const form = document.getElementById('new-os-form');
    if(form) form.onsubmit = createNewOS;
    
    // Modals
    const modal = document.getElementById('modal');
    addEvent('btn-new-os', 'click', () => {
        if(modal) {
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.remove('opacity-0'), 10);
        }
    });
    
    addEvent('btn-cancel', 'click', closeModal);
    addEvent('modal-close-x', 'click', closeModal);
    
    // View Switcher
    const btnBoard = document.getElementById('view-board');
    const btnCal = document.getElementById('view-calendar');
    const divBoard = document.getElementById('board-view');
    const divCal = document.getElementById('calendar-view');

    if(btnBoard && btnCal && divBoard && divCal) {
        btnBoard.onclick = () => {
            viewMode = 'board';
            btnBoard.classList.add('view-active', 'bg-slate-600', 'text-white');
            btnBoard.classList.remove('text-slate-400');
            btnCal.classList.remove('view-active', 'bg-slate-600', 'text-white');
            btnCal.classList.add('text-slate-400');
            
            divBoard.classList.remove('-translate-x-full', 'hidden');
            divCal.classList.add('translate-x-full');
            setTimeout(() => divCal.classList.add('hidden'), 300); // Esconde depois da animação
            divBoard.classList.remove('hidden');
            
            renderBoard();
        };

        btnCal.onclick = () => {
            viewMode = 'calendar';
            btnCal.classList.add('view-active', 'bg-slate-600', 'text-white');
            btnCal.classList.remove('text-slate-400');
            btnBoard.classList.remove('view-active', 'bg-slate-600', 'text-white');
            btnBoard.classList.add('text-slate-400');
            
            divBoard.classList.add('-translate-x-full');
            divCal.classList.remove('hidden', 'translate-x-full');
            
            renderCalendar();
        };
    }

    // Calendar Nav
    addEvent('cal-prev', 'click', () => {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        renderCalendar();
    });
    addEvent('cal-next', 'click', () => {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        renderCalendar();
    });

    // Settings (Reorder)
    addEvent('btn-settings', 'click', openSettings);
    
    // Globals para o HTML inline
    window.closeSettings = () => {
        const setModal = document.getElementById('modal-settings');
        if(setModal) setModal.classList.add('hidden');
    };
    
    window.resetSettings = () => {
        localStorage.removeItem('retifica_stages_order');
        currentStages = DEFAULT_STAGES;
        renderBoard();
        window.closeSettings();
        showToast("Ordem padrão restaurada");
    };
}

function openSettings() {
    const list = document.getElementById('settings-list');
    const modal = document.getElementById('modal-settings');
    
    if(!list || !modal) return;
    
    list.innerHTML = '';
    
    currentStages.forEach((stage, index) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between bg-slate-700/50 p-3 rounded border border-slate-600 mb-2';
        item.innerHTML = `
            <span class="text-sm font-bold text-slate-200">${stage.label}</span>
            <div class="flex gap-1">
                <button class="order-btn p-1 hover:bg-slate-600 rounded" onclick="moveStageOrder(${index}, -1)" ${index === 0 ? 'disabled class="opacity-30"' : ''}>
                    <i data-lucide="arrow-up" class="w-4 h-4"></i>
                </button>
                <button class="order-btn p-1 hover:bg-slate-600 rounded" onclick="moveStageOrder(${index}, 1)" ${index === currentStages.length - 1 ? 'disabled class="opacity-30"' : ''}>
                    <i data-lucide="arrow-down" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        list.appendChild(item);
    });

    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.moveStageOrder = (index, direction) => {
    const newStages = [...currentStages];
    const temp = newStages[index];
    newStages[index] = newStages[index + direction];
    newStages[index + direction] = temp;
    
    currentStages = newStages;
    localStorage.setItem('retifica_stages_order', JSON.stringify(currentStages));
    openSettings(); // Re-render lista
    renderBoard(); // Re-render quadro
};

function closeModal() {
    const modal = document.getElementById('modal');
    if (!modal) return;
    
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        const form = document.getElementById('new-os-form');
        if(form) form.reset();
    }, 300);
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-msg');
    
    if (!toast || !msgEl) {
        console.log("Toast:", msg); // Fallback
        return;
    }

    msgEl.innerText = msg;
    const color = type === 'error' ? 'red' : 'emerald';
    
    // Reseta classes e adiciona as novas
    toast.className = `fixed bottom-5 right-5 z-50 transform transition-all duration-300 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-xl border-l-4 border-${color}-500 flex items-center gap-3`;
    
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
}

// Iniciar
init();
