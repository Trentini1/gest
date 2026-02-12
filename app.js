// Importando do CDN para funcionar direto no browser sem build step
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    onSnapshot, 
    query, 
    orderBy,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD5gV6Fwsc_Uouxg-_NNIR5OYfHAiAIag0",
    authDomain: "gest-806b3.firebaseapp.com",
    projectId: "gest-806b3",
    storageBucket: "gest-806b3.firebasestorage.app",
    messagingSenderId: "565058702608",
    appId: "1:565058702608:web:05c40f1af436c41cbca995"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COLLECTION_NAME = "servicos_retifica";

// --- CONFIGURAÇÃO ---
const STAGES = [
    { id: 'desmontagem', label: 'Desmontagem', color: 'border-slate-500' },
    { id: 'lavacao', label: 'Lavação', color: 'border-blue-500' },
    { id: 'metrologia', label: 'Metrologia', color: 'border-yellow-500' },
    { id: 'cilindro', label: 'Cilindro', color: 'border-orange-500' },
    { id: 'cabecote', label: 'Cabeçote', color: 'border-purple-500' },
    { id: 'montagem', label: 'Montagem', color: 'border-emerald-500' }
];

let workOrders = []; // Cache local para referência

// --- INICIALIZAÇÃO ---
function init() {
    // Escuta em tempo real do Firestore
    const q = query(collection(db, COLLECTION_NAME), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        workOrders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderBoard();
    }, (error) => {
        console.error("Erro ao ler dados:", error);
        showToast("Erro de conexão com o banco!", "error");
    });

    setupEventListeners();
}

// --- RENDERIZAÇÃO ---
function renderBoard() {
    const container = document.getElementById('board-container');
    container.innerHTML = ''; // Limpa tudo para redesenhar

    STAGES.forEach(stage => {
        // Cria estrutura da coluna
        const column = document.createElement('div');
        column.className = `stage-column flex flex-col h-full bg-slate-800/50 rounded-xl border border-slate-700 backdrop-blur-sm`;
        
        const ordersInStage = workOrders.filter(o => o.stage === stage.id);
        
        column.innerHTML = `
            <div class="p-3 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl sticky top-0 z-10 shadow-md">
                <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full ${getStageColor(stage.id)}"></div>
                    <h3 class="font-bold text-slate-200 uppercase tracking-wider text-sm">${stage.label}</h3>
                </div>
                <span class="bg-slate-700 text-xs px-2 py-1 rounded-full text-slate-300 font-mono">
                    ${ordersInStage.length}
                </span>
            </div>
            <div class="flex-1 p-2 overflow-y-auto space-y-3 custom-scrollbar" id="col-${stage.id}">
                <!-- Cards serão inseridos aqui -->
            </div>
        `;
        container.appendChild(column);

        // Preenche os cards da coluna
        const list = column.querySelector(`#col-${stage.id}`);
        ordersInStage.forEach(os => {
            list.appendChild(createCardElement(os));
        });
    });

    // Re-ativa os ícones
    if(window.lucide) window.lucide.createIcons();
}

function createCardElement(os) {
    const el = document.createElement('div');
    const isUrgent = os.priority;
    const isPending = os.pending;

    el.className = `service-card card-enter bg-slate-700 p-3 rounded-lg border-l-4 shadow-lg relative group select-none 
        ${isUrgent ? 'urgent-pulse border-red-500' : 'border-slate-500'} 
        ${isPending ? 'border-yellow-500 blocked-overlay' : ''}`;
    
    el.id = `card-${os.id}`;

    // Lógica para saber se é o último estágio
    const currentIdx = STAGES.findIndex(s => s.id === os.stage);
    const hasNext = currentIdx < STAGES.length - 1;

    el.innerHTML = `
        <div class="flex justify-between items-start mb-1">
            <span class="text-[10px] font-mono text-slate-500 truncate w-20" title="${os.id}">${os.id.slice(0,6)}...</span>
            ${isUrgent ? '<span class="text-[10px] font-bold bg-red-500/20 text-red-400 px-1 rounded uppercase">Urgente</span>' : ''}
        </div>
        <h4 class="font-bold text-slate-100 leading-tight mb-1">${os.motor}</h4>
        <p class="text-xs text-slate-300 mb-2 truncate">${os.cliente}</p>
        
        ${isPending ? `
            <div class="bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-xs p-1 rounded mb-2 flex items-center gap-1">
                <i data-lucide="alert-triangle" class="w-3 h-3"></i> ${os.pendingReason || 'Pendente'}
            </div>
        ` : ''}

        <div class="flex justify-between items-center mt-3 pt-2 border-t border-slate-600/50">
            <button class="btn-pending p-1.5 rounded hover:bg-slate-600 text-slate-400 hover:text-yellow-400 transition-colors" title="Travar/Destravar">
                <i data-lucide="${isPending ? 'lock' : 'unlock'}" class="w-4 h-4"></i>
            </button>
            
            ${hasNext ? `
                <button class="btn-next flex items-center gap-1 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white px-2 py-1 rounded text-xs font-bold transition-all">
                    Próximo <i data-lucide="chevron-right" class="w-3 h-3"></i>
                </button>
            ` : `
                <button class="btn-finish flex items-center gap-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white px-2 py-1 rounded text-xs font-bold transition-all">
                    Entregar <i data-lucide="check" class="w-3 h-3"></i>
                </button>
            `}
        </div>
    `;

    // Event Listeners (evita onclick inline para manter módulo limpo)
    el.querySelector('.btn-pending').addEventListener('click', () => togglePending(os));
    if (hasNext) {
        el.querySelector('.btn-next').addEventListener('click', () => advanceStage(os));
    } else {
        el.querySelector('.btn-finish').addEventListener('click', () => finishOS(os));
    }

    return el;
}

function getStageColor(stageId) {
    const map = {
        'desmontagem': 'bg-slate-400',
        'lavacao': 'bg-blue-400',
        'metrologia': 'bg-yellow-400',
        'cilindro': 'bg-orange-400',
        'cabecote': 'bg-purple-400',
        'montagem': 'bg-emerald-400'
    };
    return map[stageId] || 'bg-slate-500';
}

// --- ACTIONS (Lógica de Banco de Dados) ---

async function advanceStage(os) {
    if (os.pending) {
        shakeCard(os.id);
        showToast("Resolva a pendência antes de avançar!", "error");
        return;
    }

    const currentIdx = STAGES.findIndex(s => s.id === os.stage);
    const nextStage = STAGES[currentIdx + 1].id;

    // Animação Visual antes de enviar pro banco
    const card = document.getElementById(`card-${os.id}`);
    if(card) card.classList.add('card-exit');

    // Pequeno delay para a animação rodar
    setTimeout(async () => {
        try {
            const osRef = doc(db, COLLECTION_NAME, os.id);
            await updateDoc(osRef, { stage: nextStage });
            showToast(`Movido para ${STAGES[currentIdx + 1].label}`);
        } catch (error) {
            console.error(error);
            showToast("Erro ao mover card", "error");
        }
    }, 300);
}

async function togglePending(os) {
    const osRef = doc(db, COLLECTION_NAME, os.id);

    if (os.pending) {
        await updateDoc(osRef, { pending: false, pendingReason: "" });
        showToast("Liberado!");
    } else {
        const reason = prompt("Motivo da pendência (Ex: Falta pistão):");
        if (reason) {
            await updateDoc(osRef, { pending: true, pendingReason: reason });
            showToast("Card travado com pendência.");
        }
    }
}

async function finishOS(os) {
    if (!confirm(`Entregar serviço do motor ${os.motor}?`)) return;

    const card = document.getElementById(`card-${os.id}`);
    if(card) {
        card.style.transform = "scale(1.1)";
        card.style.opacity = "0";
    }

    setTimeout(async () => {
        try {
            await deleteDoc(doc(db, COLLECTION_NAME, os.id));
            showToast("Serviço finalizado e arquivado!");
            confettiEffect();
        } catch (error) {
            console.error(error);
            showToast("Erro ao finalizar", "error");
        }
    }, 300);
}

async function createNewOS(e) {
    e.preventDefault();
    const btn = document.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Salvando...";

    const newOS = {
        cliente: document.getElementById('input-cliente').value,
        motor: document.getElementById('input-motor').value,
        tipo: document.getElementById('input-tipo').value,
        priority: document.getElementById('input-prioridade').checked,
        stage: 'desmontagem',
        pending: false,
        pendingReason: '',
        timestamp: serverTimestamp() // Importante para ordenação
    };

    try {
        await addDoc(collection(db, COLLECTION_NAME), newOS);
        closeModal();
        showToast("Nova O.S. criada!");
        // Scroll para o início
        document.querySelector('.stage-column').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error("Erro ao criar:", error);
        showToast("Erro ao criar O.S.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Lançar no Sistema";
    }
}

// --- UI HELPERS ---

function setupEventListeners() {
    // Modal Controls
    document.getElementById('btn-new-os').onclick = openModal;
    document.getElementById('btn-cancel').onclick = closeModal;
    document.getElementById('modal').onclick = (e) => {
        if(e.target.id === 'modal') closeModal();
    };

    // Form Submit
    document.getElementById('new-os-form').onsubmit = createNewOS;
}

function openModal() {
    const modal = document.getElementById('modal');
    const content = document.getElementById('modal-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-90');
        content.classList.add('scale-100');
    }, 10);
}

function closeModal() {
    const modal = document.getElementById('modal');
    const content = document.getElementById('modal-content');
    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-90');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('new-os-form').reset();
    }, 300);
}

function shakeCard(id) {
    const card = document.getElementById(`card-${id}`);
    if(!card) return;
    card.classList.remove('shake-animation');
    void card.offsetWidth; 
    card.classList.add('shake-animation');
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const text = document.getElementById('toast-msg');
    const icon = toast.querySelector('i');
    
    text.textContent = msg;
    
    if(type === 'error') {
        toast.classList.replace('border-emerald-500', 'border-red-500');
        icon.setAttribute('data-lucide', 'alert-circle');
        icon.classList.replace('text-emerald-500', 'text-red-500');
    } else {
        toast.classList.replace('border-red-500', 'border-emerald-500');
        icon.setAttribute('data-lucide', 'check-circle');
        icon.classList.replace('text-red-500', 'text-emerald-500');
    }
    if(window.lucide) window.lucide.createIcons();

    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

function confettiEffect() {
    const flash = document.createElement('div');
    flash.className = 'fixed inset-0 bg-emerald-500/20 z-50 pointer-events-none transition-opacity duration-500';
    document.body.appendChild(flash);
    setTimeout(() => {
        flash.classList.add('opacity-0');
        setTimeout(() => flash.remove(), 500);
    }, 100);
}

// Inicia o app
init();