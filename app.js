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
const COLLECTION_NAME = "servicos_retifica";

// --- ESTADO ---
let workOrders = [];
let currentMonth = new Date();
let activeStageMobile = 'desmontagem'; // Tab inicial no mobile

const DEFAULT_STAGES = [
    { id: 'desmontagem', label: 'Desmontagem', color: 'text-slate-400' },
    { id: 'lavacao', label: 'Lavação', color: 'text-blue-400' },
    { id: 'metrologia', label: 'Metrologia', color: 'text-yellow-400' },
    { id: 'cilindro', label: 'Cilindro', color: 'text-orange-400' },
    { id: 'cabecote', label: 'Cabeçote', color: 'text-purple-400' },
    { id: 'montagem', label: 'Montagem', color: 'text-emerald-400' }
];

let currentStages = JSON.parse(localStorage.getItem('retifica_stages_order')) || DEFAULT_STAGES;

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

    // Detecta resize para ajustar layout mobile/desktop
    window.addEventListener('resize', renderApp);
}

// --- RENDERIZAÇÃO PRINCIPAL ---
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
        const count = workOrders.filter(o => o.stage === stage.id).length;
        const isActive = activeStageMobile === stage.id;
        
        const btn = document.createElement('button');
        btn.className = `whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-bold border transition-all ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-900/50' : 'bg-slate-800 text-slate-400 border-slate-700'}`;
        btn.innerHTML = `${stage.label} <span class="ml-1 opacity-70 text-xs">${count}</span>`;
        
        btn.onclick = () => {
            activeStageMobile = stage.id;
            renderApp(); // Re-renderiza para mostrar a coluna certa
            // Scroll suave da tab para o centro
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
        // No mobile, só renderiza a coluna ativa. No desktop, renderiza todas.
        if (isMobile && stage.id !== activeStageMobile) return;

        const column = document.createElement('div');
        // Mobile: Full width. Desktop: Fixed width.
        column.className = `flex-shrink-0 flex flex-col h-full ${isMobile ? 'w-full' : 'w-[340px] bg-slate-900/50 rounded-xl border border-slate-800'}`;
        
        // Header da Coluna (Só no desktop, pois no mobile já tem as tabs)
        if (!isMobile) {
            const count = workOrders.filter(o => o.stage === stage.id).length;
            column.innerHTML = `
                <div class="p-3 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900/90 backdrop-blur z-10 rounded-t-xl">
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full stage-dot ${stage.color} bg-current"></div>
                        <h3 class="font-bold text-slate-300 text-sm uppercase">${stage.label}</h3>
                    </div>
                    <span class="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full font-mono">${count}</span>
                </div>
                <div class="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar list-container"></div>
            `;
        } else {
            // No mobile é só a lista direta
            column.innerHTML = `<div class="flex-1 overflow-y-auto pb-20 space-y-3 list-container"></div>`;
        }

        const list = column.querySelector('.list-container');
        const orders = workOrders.filter(o => o.stage === stage.id);

        if (orders.length === 0) {
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center h-40 text-slate-600 opacity-50">
                    <i data-lucide="inbox" class="w-10 h-10 mb-2"></i>
                    <p class="text-sm">Sem serviços aqui</p>
                </div>
            `;
        } else {
            orders.forEach(os => list.appendChild(createCard(os, stage)));
        }

        container.appendChild(column);
    });
    
    if(window.lucide) window.lucide.createIcons();
}

function createCard(os, currentStage) {
    const el = document.createElement('div');
    const deadlineStatus = getDeadlineStatus(os.deadlineDate);
    
    // Classes de status
    let statusClass = 'border-slate-700';
    let statusBadge = '';
    
    if (os.priority) {
        statusClass = 'border-red-500/50 shadow-[0_0_15px_-3px_rgba(239,68,68,0.2)]';
        statusBadge = `<div class="absolute top-2 right-2 flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></div>`;
    }

    if (deadlineStatus === 'late') statusBadge += `<span class="bg-red-900/50 text-red-200 text-[10px] px-1.5 py-0.5 rounded border border-red-800 ml-2">ATRASADO</span>`;
    
    el.className = `mobile-card relative p-4 rounded-xl border-l-4 ${statusClass} ${os.pending ? 'opacity-80' : ''} bg-slate-800 transition-all active:scale-[0.98]`;
    
    // Botões de navegação
    const stageIdx = currentStages.findIndex(s => s.id === os.stage);
    const hasNext = stageIdx < currentStages.length - 1;

    el.innerHTML = `
        ${statusBadge}
        <div class="flex justify-between items-start mb-2 pr-4">
            <span class="font-mono text-xs font-bold text-slate-500 bg-slate-950 px-2 py-1 rounded">#${os.osNumber || '---'}</span>
        </div>
        
        <h4 class="text-white font-bold text-lg leading-tight mb-1">${os.motor}</h4>
        <p class="text-slate-400 text-xs uppercase font-semibold mb-3 tracking-wide">${os.cliente}</p>

        <div class="flex items-center gap-2 mb-4">
            <div class="flex items-center gap-1.5 bg-slate-900/50 px-2 py-1 rounded text-xs text-slate-400 border border-slate-700/50">
                <i data-lucide="clock" class="w-3 h-3"></i>
                ${os.deadlineDate ? os.deadlineDate.toLocaleDateString('pt-BR', {day:'2-digit', month:'short'}) : 'Sem prazo'}
            </div>
            ${os.pending ? `<div class="bg-yellow-900/30 text-yellow-500 px-2 py-1 rounded text-xs border border-yellow-700/30 flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3 h-3"></i> ${os.pendingReason}</div>` : ''}
        </div>

        <div class="flex items-center gap-2 mt-auto">
            <button class="btn-lock p-2.5 rounded-lg bg-slate-700 text-slate-400 hover:text-white transition-colors" title="Pendência">
                <i data-lucide="${os.pending ? 'lock' : 'unlock'}" class="w-4 h-4"></i>
            </button>
            
            ${hasNext ? `
                <button class="btn-move flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 transition-colors">
                    Avançar <i data-lucide="arrow-right" class="w-4 h-4"></i>
                </button>
            ` : `
                <button class="btn-finish flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-lg text-sm font-bold shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 transition-colors">
                    Entregar <i data-lucide="check" class="w-4 h-4"></i>
                </button>
            `}
        </div>
    `;

    // Actions
    el.querySelector('.btn-lock').onclick = () => togglePending(os);
    if(hasNext) el.querySelector('.btn-move').onclick = () => moveStage(os, currentStages[stageIdx + 1].id);
    else el.querySelector('.btn-finish').onclick = () => finishOS(os);

    return el;
}

// --- LOGICA CALENDARIO ---
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('calendar-month-title');
    if(!grid) return;
    
    grid.innerHTML = '';
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    title.innerText = firstDay.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    // Empty Slots
    for(let i=0; i<firstDay.getDay(); i++) {
        grid.innerHTML += `<div class="bg-transparent"></div>`;
    }

    // Days
    for(let i=1; i<=lastDay.getDate(); i++) {
        const date = new Date(year, month, i);
        const isToday = date.toDateString() === new Date().toDateString();
        
        const dayEl = document.createElement('div');
        dayEl.className = `calendar-day p-1 overflow-hidden ${isToday ? 'border-blue-500 bg-blue-900/10' : ''}`;
        dayEl.innerHTML = `<div class="text-xs font-bold text-slate-500 mb-1">${i}</div>`;

        // Events
        const events = workOrders.filter(o => o.deadlineDate && o.deadlineDate.getDate() === i && o.deadlineDate.getMonth() === month);
        events.forEach(ev => {
            const badge = document.createElement('div');
            badge.className = `cal-event ${ev.priority ? 'bg-red-900/50 text-red-200 border border-red-800' : 'bg-blue-900/30 text-blue-200 border border-blue-800'}`;
            badge.innerText = `#${ev.osNumber} ${ev.motor}`;
            dayEl.appendChild(badge);
        });

        grid.appendChild(dayEl);
    }
}

// --- CONTROLES UI ---
function setupUI() {
    // Modal
    window.openModal = () => {
        const m = document.getElementById('modal');
        m.classList.remove('hidden');
    };
    window.closeModal = () => document.getElementById('modal').classList.add('hidden');
    document.getElementById('fab-new-os').onclick = window.openModal;

    // Form
    document.getElementById('new-os-form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-submit');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin"></i> Salvando...`;
        btn.disabled = true;

        try {
            await addDoc(collection(db, COLLECTION_NAME), {
                osNumber: document.getElementById('input-os-num').value || '000',
                deadline: document.getElementById('input-prazo').value,
                motor: document.getElementById('input-motor').value,
                cliente: document.getElementById('input-cliente').value,
                priority: document.getElementById('input-prioridade').checked,
                stage: currentStages[0].id,
                pending: false,
                timestamp: serverTimestamp()
            });
            window.closeModal();
            showToast("Serviço lançado!");
            e.target.reset();
        } catch (err) {
            console.error(err);
            alert("Erro ao salvar");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };

    // View Toggles
    const boardV = document.getElementById('board-view');
    const calV = document.getElementById('calendar-view');
    
    document.getElementById('view-board').onclick = () => {
        calV.classList.add('translate-x-full');
    };
    document.getElementById('view-calendar').onclick = () => {
        calV.classList.remove('translate-x-full');
        renderCalendar();
    };
    
    // Calendar Nav
    document.getElementById('cal-prev').onclick = () => { currentMonth.setMonth(currentMonth.getMonth()-1); renderCalendar(); };
    document.getElementById('cal-next').onclick = () => { currentMonth.setMonth(currentMonth.getMonth()+1); renderCalendar(); };
}

// --- ACTIONS DB ---
async function moveStage(os, nextId) {
    if(os.pending) return showToast("Resolva a pendência!", "error");
    try { await updateDoc(doc(db, COLLECTION_NAME, os.id), { stage: nextId }); }
    catch(e) { console.error(e); }
}

async function finishOS(os) {
    if(!confirm("Finalizar serviço?")) return;
    try { await deleteDoc(doc(db, COLLECTION_NAME, os.id)); showToast("Finalizado!"); }
    catch(e) { console.error(e); }
}

async function togglePending(os) {
    const ref = doc(db, COLLECTION_NAME, os.id);
    if(os.pending) await updateDoc(ref, { pending: false, pendingReason: null });
    else {
        const reason = prompt("Motivo:");
        if(reason) await updateDoc(ref, { pending: true, pendingReason: reason });
    }
}

// Utils
function getDeadlineStatus(date) {
    if(!date) return 'ok';
    const diff = date - new Date();
    if(diff < 0) return 'late';
    return 'ok';
}

function showToast(msg, type='success') {
    const t = document.getElementById('toast');
    document.getElementById('toast-msg').innerText = msg;
    t.classList.remove('translate-y-[-150%]');
    setTimeout(() => t.classList.add('translate-y-[-150%]'), 3000);
}

// Boot
init();
