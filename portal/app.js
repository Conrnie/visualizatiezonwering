import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

console.log('App initializing...');

// Check if Supabase script loaded
if (!window.supabase) {
    console.error('Supabase SDK not loaded!');
    document.getElementById('app').innerHTML = '<div style="color:red; padding:20px;">Error: Supabase SDK failed to load. Please check your internet connection.</div>';
    throw new Error('Supabase SDK not loaded');
}

// Initialize Supabase Client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('Supabase initialized');

// --- State Management ---
const state = {
    user: null,
    credits: 3,
    currentView: 'login', // 'login', 'dashboard', 'config'
    isDragging: false,
    isProcessing: false,
    files: [],
    config: {
        projectName: '',
        image: null, // The file object
        imagePreview: null,
        selectedModel: null,
        selectedColor: null
    }
};

// --- Data Constants ---
const productData = {
    's500': { name: 'S500', image: '../assets/models/shopping.jpeg', value: 's500' },
    'v280': { name: 'V280', image: '../assets/models/uitvalscherm.jpeg', value: 'v280' },
    'v225': { name: 'V225', image: '../assets/models/canopy_selectmodel.jpeg', value: 'v225' }
};

const colorOptions = [
    { name: 'Antraciet', value: 'antraciet', image: '../assets/colors/loodgrijs-effen.png' },
    { name: 'Grijs', value: 'grijs', image: '../assets/colors/lichtgrijs-wit-gestreept.jpg' },
    { name: 'Zwart', value: 'zwart', image: '../assets/colors/loodgrijs-effen.png' },
    { name: 'Beige', value: 'beige', image: '../assets/colors/gebroken-wit-creme-gestreept.jpg' }
];

// --- Translations ---
const translations = {
    loginTitle: "Inloggen",
    loginSubtitle: "Voer uw e-mailadres en wachtwoord in om toegang te krijgen.",
    emailLabel: "E-mailadres",
    passwordLabel: "Wachtwoord",
    loginButton: "Inloggen",
    welcome: "Welkom",
    creditsRemaining: "Credits over",
    startVisualization: "+ Start Nieuwe Visualisatie",
    recentActivity: "Recente Activiteit",
    noRecentHistory: "Nog geen recente geschiedenis.",
    dragDropText: "Sleep uw foto hierheen of klik om te uploaden",
    processingTitle: "Bezig met verwerken...",
    processingSubtitle: "Uw zonwering wordt gevisualiseerd. Dit kan even duren.",
    completedStatus: "Voltooid",
    configTitle: "Nieuwe Visualisatie Configureren",
    step1Title: "Stap 1: Project & Foto",
    step2Title: "Stap 2: Kies Model",
    step3Title: "Stap 3: Kies Kleur",
    projectNameLabel: "Projectnaam",
    uploadPhotoLabel: "Upload Foto van uw Gevel",
    generateButton: "Start Generatie",
    backButton: "Terug naar Dashboard",
    selectImage: "Selecteer Afbeelding",
    signUp: "Nog geen account? Registreren"
};

// --- DOM Elements ---
const app = document.getElementById('app');

// --- Helper Functions ---
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// --- Auth Functions ---
async function handleLogin(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;
        
        state.user = data.user;
        state.currentView = 'dashboard';
        render();
    } catch (error) {
        alert('Inloggen mislukt: ' + error.message);
    }
}

async function handleSignUp(email, password) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password
        });

        if (error) throw error;

        alert('Registratie succesvol! Controleer uw e-mail voor de bevestigingslink.');
    } catch (error) {
        alert('Registratie mislukt: ' + error.message);
    }
}

async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Error signing out:', error);
    
    state.user = null;
    state.currentView = 'login';
    render();
}

// --- Data Functions ---
async function fetchRecentHistory() {
    if (!state.user) return [];
    
    const { data, error } = await supabase
        .from('visualizations')
        .select('*')
        .eq('user_id', state.user.id)
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching history:', error);
        return [];
    }
    return data;
}

async function uploadImage(file, userId, projectId, projectName) {
    const fileExt = file.name.split('.').pop();
    // Sanitize project name to be safe for filenames
    const safeProjectName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${userId}/${projectId}/${safeProjectName}.${fileExt}`;
    
    const { data, error } = await supabase.storage
        .from('visualizations')
        .upload(fileName, file);

    if (error) throw error;
    return data.path;
}

async function createVisualizationRecord(projectData) {
    const { data, error } = await supabase
        .from('visualizations')
        .insert([projectData])
        .select();

    if (error) throw error;
    return data[0];
}

async function getSignedUrl(path) {
    if (!path) return null;
    const { data, error } = await supabase.storage
        .from('visualizations')
        .createSignedUrl(path, 3600); // 1 hour
    if (error) {
        console.error('Error creating signed url:', error);
        return null;
    }
    return data.signedUrl;
}

// --- Render Functions ---

function createLoginView() {
    return `
        <div class="login-container">
            <div class="login-card">
                <div class="login-header">
                    <div class="logo-placeholder">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3h18v18H3zM3 9h18M9 21V9"/>
                        </svg>
                    </div>
                    <h1>${translations.loginTitle}</h1>
                    <p>${translations.loginSubtitle}</p>
                </div>
                <form id="login-form" class="login-form">
                    <div class="form-group">
                        <label for="email">${translations.emailLabel}</label>
                        <input type="email" id="email" required placeholder="name@example.com">
                    </div>
                    <div class="form-group">
                        <label for="password">${translations.passwordLabel}</label>
                        <input type="password" id="password" required placeholder="••••••••">
                    </div>
                    <button type="submit" class="btn-primary full-width">${translations.loginButton}</button>
                    <button type="button" id="signup-btn" class="btn-secondary full-width" style="margin-top: 10px;">${translations.signUp}</button>
                </form>
            </div>
        </div>
    `;
}

async function createDashboardView() {
    const history = await fetchRecentHistory();
    state.history = history; // Store for easy access
    
    // Pre-fetch thumbnails (signed URLs for input images)
    const historyWithThumbs = await Promise.all(history.map(async (item) => {
        const thumbUrl = await getSignedUrl(item.input_image_path);
        return { ...item, thumbUrl };
    }));
    
    const historyHtml = historyWithThumbs.length > 0 
        ? historyWithThumbs.map(item => {
            const thumbHtml = item.thumbUrl 
                ? `<img src="${item.thumbUrl}" class="history-thumb" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;" />`
                : `<div class="history-thumb-placeholder" style="width: 48px; height: 48px; background: #eee; border-radius: 8px; display: flex; align-items: center; justify-content: center;">?</div>`;

            return `
            <div class="history-item" onclick="window.viewResult('${item.id}')" style="cursor: pointer;">
                <div class="history-icon" style="width: 60px; height: 60px;">
                    ${thumbHtml}
                </div>
                <div class="history-details">
                    <span class="history-name">${item.project_name}</span>
                    <span class="history-time">${new Date(item.created_at).toLocaleDateString()} ${formatTime(item.created_at)}</span>
                </div>
                <div class="history-status status-${item.status || 'completed'}">${item.status === 'completed' ? translations.completedStatus : item.status}</div>
            </div>
        `}).join('')
        : `<div class="empty-state">${translations.noRecentHistory}</div>`;

    return `
        <div class="dashboard-layout">
            <aside class="sidebar">
                <div class="sidebar-header">
                    <div class="logo">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3h18v18H3zM3 9h18M9 21V9"/>
                        </svg>
                        <span>Zonwering</span>
                    </div>
                </div>
                <nav class="sidebar-nav">
                    <a href="#" onclick="state.currentView='dashboard'; render(); return false;" class="nav-item active">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        Overzicht
                    </a>
                    <a href="#" onclick="state.currentView='config'; render(); return false;" class="nav-item">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                        Nieuw Project
                    </a>
                </nav>
                <div class="user-profile">
                    <div class="avatar">${state.user.email[0].toUpperCase()}</div>
                    <div class="user-info">
                        <span class="user-name">${state.user.email.split('@')[0]}</span>
                        <button id="logout-btn" class="btn-text">Uitloggen</button>
                    </div>
                </div>
            </aside>
            <main class="main-content">
                <header class="top-bar">
                    <h1>${translations.welcome}, ${state.user.email.split('@')[0]}</h1>
                    <div class="credits-badge">
                        <span class="credits-count">${state.credits}</span>
                        <span class="credits-label">${translations.creditsRemaining}</span>
                    </div>
                </header>
                
                <div class="dashboard-grid">
                    <!-- Hero Action Section -->
                    <div class="hero-section">
                         <button id="start-new-btn" class="btn-primary btn-large">
                            ${translations.startVisualization}
                        </button>
                    </div>

                    <!-- Recent Activity -->
                    <div class="recent-activity card">
                        <h3>${translations.recentActivity}</h3>
                        <div class="activity-list">
                            ${historyHtml}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;
}

function createConfigView() {
    const config = state.config;
    const isStep1Valid = !!config.imagePreview;
    const isStep2Valid = isStep1Valid && !!config.selectedModel;
    const canGenerate = isStep2Valid && !!config.selectedColor && !state.isProcessing;
    
    // Translations
    const translations = {
        step1Title: 'Upload Foto',
        step2Title: 'Kies Model',
        step3Title: 'Kies Kleur',
        dragDropText: 'Sleep je foto hierheen of klik om te uploaden',
        selectImage: 'Andere foto kiezen',
        generateButton: 'Visualisatie Genereren',
        processingTitle: 'Bezig met genereren...',
        projectNamePlaceholder: 'Naam van je project (bijv. Achtergevel)'
    };

    return `
        <div class="dashboard-layout">
            <aside class="sidebar">
                <div class="sidebar-header">
                    <div class="logo">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3h18v18H3zM3 9h18M9 21V9"/>
                        </svg>
                        <span>Zonwering</span>
                    </div>
                </div>
                <nav class="sidebar-nav">
                    <a href="#" onclick="state.currentView='dashboard'; render(); return false;" class="nav-item">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        Overzicht
                    </a>
                    <a href="#" onclick="state.currentView='config'; render(); return false;" class="nav-item active">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                        Nieuw Project
                    </a>
                    <a href="#" class="nav-item">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                        Instellingen
                    </a>
                </nav>
                <div class="sidebar-footer">
                    <div class="user-info">
                        <div class="user-avatar">${state.user.email[0].toUpperCase()}</div>
                        <div class="user-details">
                            <span class="user-name">${state.user.email.split('@')[0]}</span>
                            <span class="user-role">Gebruiker</span>
                        </div>
                    </div>
                    <button class="btn-text logout-btn" onclick="handleLogout()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    </button>
                </div>
            </aside>

            <main class="main-content">
                <div class="config-header">
                    <h2>Nieuwe Visualisatie</h2>
                    <button class="btn-secondary btn-small" onclick="state.currentView='dashboard'; render();">Terug</button>
                </div>
                
                <div class="config-container">
                    <!-- Project Name Input -->
                    <div class="config-section card">
                        <div class="form-group">
                            <label for="project-name">Project Naam</label>
                            <input type="text" id="project-name" class="form-input" 
                                   placeholder="${translations.projectNamePlaceholder}"
                                   value="${config.projectName || ''}"
                                   onchange="state.config.projectName = this.value">
                        </div>
                    </div>

                    <!-- Step 1: Image Upload & Drawing -->
                    <div class="config-section card">
                        <div class="step-title"><span class="step-number">1</span> ${translations.step1Title}</div>
                        <div class="image-upload-container">
                            <div class="upload-area" id="config-drop-zone">
                                 ${config.imagePreview 
                                    ? `<div class="image-preview-container">
                                         <div class="canvas-wrapper">
                                             <canvas id="drawing-canvas"></canvas>
                                             <div class="canvas-instructions">
                                                <p>🖌️ <strong>Teken een rode lijn</strong> op de muur waar het zonnescherm moet komen.</p>
                                             </div>
                                         </div>
                                         <div class="canvas-controls">
                                             <button class="btn-secondary btn-small" id="clear-canvas-btn">Lijn Wissen</button>
                                             <button class="btn-secondary btn-small" id="change-image-btn">${translations.selectImage}</button>
                                         </div>
                                       </div>`
                                    : `<div class="upload-placeholder">
                                         <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                         <p>${translations.dragDropText}</p>
                                       </div>`
                                }
                                <input type="file" id="file-input" accept="image/*" hidden>
                            </div>
                        </div>
                    </div>

                    <!-- Step 2: Select Model -->
                    <div class="config-section card ${!isStep1Valid ? 'disabled' : ''}">
                        <div class="step-title"><span class="step-number">2</span> ${translations.step2Title}</div>
                        <div class="config-grid">
                            ${Object.values(productData).map(model => `
                                <div class="selection-card ${config.selectedModel === model.value ? 'selected' : ''}" 
                                     onclick="window.selectModel('${model.value}', event)">
                                    <img src="${model.image}" alt="${model.name}">
                                    <span>${model.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Step 3: Select Color -->
                    <div class="config-section card ${!isStep2Valid ? 'disabled' : ''}">
                        <div class="step-title"><span class="step-number">3</span> ${translations.step3Title}</div>
                        <div class="config-grid">
                            ${colorOptions.map(color => `
                                <div class="selection-card ${config.selectedColor === color.value ? 'selected' : ''}"
                                     onclick="window.selectColor('${color.value}', event)">
                                    <img src="${color.image}" alt="${color.name}">
                                    <span>${color.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Action Footer -->
                    <div class="config-footer">
                        <button id="generate-btn" class="btn-primary btn-large" ${!canGenerate ? 'disabled' : ''}>
                            ${state.isProcessing ? translations.processingTitle : translations.generateButton}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// --- Main Render ---
async function render() {
    app.innerHTML = '';
    
    if (state.currentView === 'login') {
        app.innerHTML = createLoginView();
    } else if (state.currentView === 'dashboard') {
        // Since createDashboardView is async now (fetches data), we handle it differently
        app.innerHTML = '<div class="loading-spinner"></div>';
        const html = await createDashboardView();
        app.innerHTML = html;
    } else if (state.currentView === 'config') {
        app.innerHTML = createConfigView();
    } else if (state.currentView === 'result') {
        app.innerHTML = createResultView();
    }
    
    setupEventListeners();
}

function createResultView() {
    const { item, outputUrl } = state.selectedResult || {};
    if (!item || !outputUrl) {
        state.currentView = 'dashboard';
        render();
        return '';
    }

    return `
        <div class="dashboard-layout">
            <aside class="sidebar">
                 <div class="sidebar-header">
                    <div class="logo">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3h18v18H3zM3 9h18M9 21V9"/>
                        </svg>
                        <span>Zonwering</span>
                    </div>
                </div>
                <nav class="sidebar-nav">
                    <a href="#" onclick="state.currentView='dashboard'; render(); return false;" class="nav-item">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        Overzicht
                    </a>
                    <a href="#" onclick="state.currentView='config'; render(); return false;" class="nav-item">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                        Nieuw Project
                    </a>
                </nav>
            </aside>
            <main class="main-content">
                <div class="config-header">
                    <h2>Resultaat: ${item.project_name}</h2>
                    <button class="btn-secondary btn-small" onclick="state.currentView='dashboard'; render();">Terug</button>
                </div>
                
                <div class="config-container" style="max-width: 1000px;">
                    <div class="card" style="padding: 20px; text-align: center;">
                        <img src="${outputUrl}" alt="Gegenereerde Visualisatie" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        
                        <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
                            <a href="${outputUrl}" download="visualisatie-${item.project_name}.jpg" class="btn-primary btn-large" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                Downloaden
                            </a>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;
}

window.viewResult = async (id) => {
    const item = state.history.find(i => i.id === id);
    if (!item) return;
    
    if (item.status !== 'completed') {
        alert('Deze visualisatie is nog niet voltooid of is mislukt.');
        return;
    }

    // Show loading state if needed, but render is fast enough usually
    // Ideally we'd show a spinner
    app.innerHTML = '<div class="loading-spinner"></div>';

    const outputUrl = await getSignedUrl(item.output_image_path);
    
    if (!outputUrl) {
        alert('Kan de afbeelding niet laden.');
        state.currentView = 'dashboard';
        render();
        return;
    }

    state.selectedResult = { item, outputUrl };
    state.currentView = 'result';
    render();
};

function setupEventListeners() {
    // Login Listeners
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            handleLogin(email, password);
        });

        document.getElementById('signup-btn').addEventListener('click', () => {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            if(email && password) {
                handleSignUp(email, password);
            } else {
                alert('Vul e-mail en wachtwoord in om te registreren.');
            }
        });
    }

    // Dashboard Listeners
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    const startNewBtn = document.getElementById('start-new-btn');
    if (startNewBtn) {
        startNewBtn.addEventListener('click', () => {
            // Reset config
            state.config = {
                projectName: '',
                image: null,
                imagePreview: null,
                selectedModel: null,
                selectedColor: null
            };
            state.currentView = 'config';
            render();
        });
    }

    // Config Listeners
    const backBtn = document.getElementById('back-to-dashboard');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            state.currentView = 'dashboard';
            render();
        });
    }

    // Setup Canvas if we are in config mode and have an image
    if (state.currentView === 'config' && state.config.imagePreview) {
        setupCanvas();
    }

    const dropZone = document.getElementById('config-drop-zone');
    const fileInput = document.getElementById('file-input');
    
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            handleFiles(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', (e) => {
            handleFiles(e.target.files);
        });
    }

    const projectNameInput = document.getElementById('project-name');
    if (projectNameInput) {
        projectNameInput.addEventListener('input', (e) => {
            state.config.projectName = e.target.value;
            // Re-render to update button states if needed? 
            // For performance, maybe just toggle the button disabled attribute manually
            checkConfigValidity(); 
        });
    }

    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', startProcessing);
    }
}

function checkConfigValidity() {
    const { config } = state;
    const isValid = config.projectName && config.image && config.selectedModel && config.selectedColor;
    const btn = document.getElementById('generate-btn');
    
    // Get all config sections
    // 0: Project Name
    // 1: Step 1 (Image Upload)
    // 2: Step 2 (Model Selection)
    // 3: Step 3 (Color Selection)
    const sections = document.querySelectorAll('.config-section');
    
    // Enable Model Selection (Step 2) if we have an image
    if (config.image && sections[2]) {
        sections[2].classList.remove('disabled');
    }
    
    // Enable Color Selection (Step 3) if we have a model selected
    if (config.selectedModel && sections[3]) {
        sections[3].classList.remove('disabled');
    }

    if (btn) btn.disabled = !isValid;
}

function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
            state.config.image = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                state.config.imagePreview = e.target.result;
                render(); // Re-render to show preview
            };
            reader.readAsDataURL(file);
        }
    }
}

// Global handlers for onclick events in HTML string
window.selectModel = (modelValue, event) => {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    state.config.selectedModel = modelValue;
    
    // Update UI directly without full re-render
    const modelContainer = event.currentTarget.closest('.config-grid');
    if (modelContainer) {
        // Remove selected class from all siblings
        const cards = modelContainer.querySelectorAll('.selection-card');
        cards.forEach(card => card.classList.remove('selected'));
        
        // Add selected class to clicked element
        event.currentTarget.classList.add('selected');
    }
    
    // Enable next step if valid
    checkConfigValidity();
};

window.selectColor = (colorValue, event) => {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    state.config.selectedColor = colorValue;
    
    // Update UI directly without full re-render
    const colorContainer = event.currentTarget.closest('.config-grid');
    if (colorContainer) {
        // Remove selected class from all siblings
        const cards = colorContainer.querySelectorAll('.selection-card');
        cards.forEach(card => card.classList.remove('selected'));
        
        // Add selected class to clicked element
        event.currentTarget.classList.add('selected');
    }
    
    checkConfigValidity();
};

async function startProcessing() {
    if (state.isProcessing) return;
    
    const btn = document.getElementById('generate-btn');
    if (btn) btn.disabled = true;
    
    state.isProcessing = true;
    render(); // Re-render to show spinner/disabled state
    
    try {
        // 1. Get Image from Canvas (merged with red line)
        const canvas = document.getElementById('drawing-canvas');
        let imageFile = state.config.image;
        
        if (canvas) {
             // Convert canvas to blob
             const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
             imageFile = new File([blob], "input_with_line.jpg", { type: "image/jpeg" });
        }

        // Helper to fetch and convert local asset to base64
        const getBase64FromUrl = async (url) => {
            try {
                const res = await fetch(url);
                const blob = await res.blob();
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                console.error("Failed to convert asset to base64:", url, e);
                return null;
            }
        };

        // Prepare reference images
        const modelUrl = productData[state.config.selectedModel]?.image;
        const colorUrl = colorOptions.find(c => c.value === state.config.selectedColor)?.image;

        const [modelB64, colorB64] = await Promise.all([
            modelUrl ? getBase64FromUrl(modelUrl) : null,
            colorUrl ? getBase64FromUrl(colorUrl) : null
        ]);

        // Generate Project ID
        const projectId = crypto.randomUUID();

        // 2. Upload Image
        const imagePath = await uploadImage(imageFile, state.user.id, projectId, state.config.projectName || 'untitled');
        
        // 3. Create DB Record
        const recordData = await createVisualizationRecord({
             id: projectId,
             user_id: state.user.id,
             project_name: state.config.projectName || 'Untitled Project',
             status: 'pending',
             input_image_path: imagePath,
             configuration: {
                 model: state.config.selectedModel,
                 color: state.config.selectedColor
             }
        });
        
        const recordId = recordData.id;
        
        // 4. Call Edge Function
        // We need to send the base64 image for the edge function if we want it to process it directly
        // Or the edge function can download it from storage.
        // The current edge function expects 'image' (base64) and 'record_id'.
        // Let's convert blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        reader.onloadend = async () => {
             const base64data = reader.result;
             
             // Update to the new deployed edge function URL provided by the user
             const response = await fetch('https://pbexvaqypzlftjsaqjfq.supabase.co/functions/v1/new-test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    record_id: recordId,
                    image: base64data,
                    prompt_config: {
                        model: state.config.selectedModel,
                        color: state.config.selectedColor,
                        project_name: state.config.projectName,
                        model_image: modelB64,
                        color_image: colorB64
                    }
                })
            });

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Generation failed');
            }
            
            // Success!
            state.isProcessing = false;
            alert('Visualisatie voltooid! (Check console/storage for output)');
            // Update local credits locally for immediate feedback
            state.credits--;
            state.currentView = 'dashboard';
            render();
        };
        
    } catch (error) {
        console.error('Error:', error);
        alert('Er is een fout opgetreden: ' + error.message);
        state.isProcessing = false;
        render();
    }
}

// --- Initialization ---
async function init() {
    try {
        console.log('Checking session...');
        // Check for existing session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error('Session check error:', error);
            // Don't block app, just assume logged out
        }

        if (session) {
            console.log('Session found:', session.user.email);
            state.user = session.user;
            state.currentView = 'dashboard';
        } else {
            console.log('No session found');
        }

        // Listen for auth changes
        supabase.auth.onAuthStateChange((_event, session) => {
            console.log('Auth state changed:', _event);
            state.user = session ? session.user : null;
            if (!state.user) {
                state.currentView = 'login';
            }
            render();
        });

        render();
    } catch (err) {
        console.error('Init failed:', err);
        document.getElementById('app').innerHTML = `<div style="color:red; padding:20px;">Initialization failed: ${err.message}</div>`;
    }
}

// Expose state and functions to window for inline event handlers
window.state = state;
window.render = render;
window.handleLogout = handleLogout;

init();

function setupCanvas() {
    const canvas = document.getElementById('drawing-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
        // Set canvas size to match image but fit within container
        // For simplicity, we'll set canvas to image natural size
        // and let CSS handle the display size.
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        // Draw initial image
        ctx.drawImage(img, 0, 0);
        
        // Setup drawing context
        ctx.strokeStyle = 'red';
        ctx.lineWidth = Math.max(5, img.naturalWidth / 200); // Scale line width
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    };
    img.src = state.config.imagePreview;

    // Drawing Logic
    let isDrawing = false;
    let startX = 0;
    let startY = 0;

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        let clientX, clientY;
        if (e.changedTouches) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function startDrawing(e) {
        e.preventDefault();
        e.stopPropagation(); // Stop event from bubbling up to dropZone
        isDrawing = true;
        const pos = getPos(e);
        startX = pos.x;
        startY = pos.y;
    }

    function draw(e) {
        if (!isDrawing) return;
        e.preventDefault();
        e.stopPropagation();
        const pos = getPos(e);
        
        // Clear and redraw image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        // Draw straight line from start to current
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    }

    function stopDrawing(e) {
        if (isDrawing) {
            e.preventDefault();
            e.stopPropagation();
            isDrawing = false;
            // Final line is already drawn by the last 'draw' call
        }
    }

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    canvas.addEventListener('click', (e) => e.stopPropagation()); // Prevent click bubbling

    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);

    // Controls
    const clearBtn = document.getElementById('clear-canvas-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent bubbling
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        });
    }
    
    const changeImageBtn = document.getElementById('change-image-btn');
    if (changeImageBtn) {
        changeImageBtn.addEventListener('click', (e) => {
             e.stopPropagation(); // Prevent bubbling from here, but we handle the click explicitly
             document.getElementById('file-input').click();
        });
    }
}