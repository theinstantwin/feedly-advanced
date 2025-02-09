// Initialize state
let state = {
    highlightTerms: [], // Will store objects: {term: string, color: string}
    hiddenTerms: [],
    showEmphasis: false,
    isMinimized: true
};

let activeColorInput = null;

// Load saved settings
async function loadSettings() {
    const result = await chrome.storage.local.get([
        'highlightTerms',
        'hiddenTerms',
        'showEmphasis',
        'isMinimized'
    ]);
    
    state = {
        highlightTerms: result.highlightTerms || [],
        hiddenTerms: result.hiddenTerms || [],
        showEmphasis: result.showEmphasis || false,
        isMinimized: result.isMinimized !== undefined ? result.isMinimized : true
    };
    
    return state;
}

function createUI() {
    const container = document.createElement('div');
    container.id = 'feedly-highlighter';
    if (state.isMinimized) container.classList.add('minimized');

    container.innerHTML = `
        <div class="header">
            <h3>Feedly Highlighter</h3>
            <button class="minimize-button">${state.isMinimized ? '+' : '−'}</button>
        </div>
        <div class="main-content">
            <div>
                <h4>Keywords <span style="font-size: 12px; color: #666; font-weight: normal;">(Click to change color)</span></h4>
                <div id="highlight-terms" class="term-cloud"></div>
                <div class="term-input">
                    <input type="text" id="new-highlight" placeholder="Add keyword">
                    <button id="add-highlight">Add</button>
                </div>
            </div>

            <div>
                <h4>Hidden Terms</h4>
                <div id="hidden-terms" class="term-cloud"></div>
                <div class="term-input">
                    <input type="text" id="new-hidden" placeholder="Add term">
                    <button id="add-hidden">Add</button>
                </div>
            </div>

            <label style="display: flex; align-items: center; gap: 8px; margin-top: 16px;">
                <input type="checkbox" id="toggle-emphasis" ${state.showEmphasis ? 'checked' : ''}>
                Emphasize Highlighted Articles
            </label>
        </div>
    `;

    document.body.appendChild(container);
}

async function addTerm(type) {
    const input = document.getElementById(`new-${type}`);
    const term = input.value.trim();

    if (!term) return;

    const terms = type === 'highlight' ? state.highlightTerms : state.hiddenTerms;
    if (!terms.some(t => typeof t === 'object' ? t.term === term : t === term)) {
        if (type === 'highlight') {
            terms.push({ term, color: '#e8f5e9' }); // Default color
        } else {
            terms.push(term);
        }
        
        await chrome.storage.local.set({
            [type === 'highlight' ? 'highlightTerms' : 'hiddenTerms']: terms
        });
        
        if (type === 'highlight') state.highlightTerms = terms;
        else state.hiddenTerms = terms;
        
        renderTerms();
        applyStyles();
    }

    input.value = '';
}

async function removeTerm(term, type) {
    const terms = type === 'highlight' ? state.highlightTerms : state.hiddenTerms;
    const updatedTerms = terms.filter(t => 
        typeof t === 'object' ? t.term !== term : t !== term
    );

    await chrome.storage.local.set({
        [type === 'highlight' ? 'highlightTerms' : 'hiddenTerms']: updatedTerms
    });
    
    if (type === 'highlight') state.highlightTerms = updatedTerms;
    else state.hiddenTerms = updatedTerms;

    renderTerms();
    applyStyles();
}

function renderTerms() {
    function renderCloud(elementId, terms, type) {
        const container = document.getElementById(elementId);
        if (!container) return;
        
        container.innerHTML = terms
            .sort((a, b) => {
                const termA = typeof a === 'object' ? a.term : a;
                const termB = typeof b === 'object' ? b.term : b;
                return termA.localeCompare(termB);
            })
            .map(term => {
                const termText = typeof term === 'object' ? term.term : term;
                const termColor = typeof term === 'object' ? term.color : '#e8f5e9';
                
                return `
                    <div class="term-tag" 
                         style="background-color: ${termColor}"
                         data-term="${termText}">
                        <span>${termText}</span>
                        <button class="remove-button" data-term="${termText}" data-type="${type}">×</button>
                    </div>
                `;
            }).join('');

        if (type === 'highlight') {
            container.querySelectorAll('.term-tag').forEach(tag => {
                tag.addEventListener('click', (e) => {
                    if (!e.target.classList.contains('remove-button')) {
                        const colorInput = document.createElement('input');
                        colorInput.type = 'color';
                        const termObj = state.highlightTerms.find(t => 
                            typeof t === 'object' ? t.term === tag.dataset.term : t === tag.dataset.term
                        );
                        colorInput.value = termObj?.color || '#e8f5e9';
                        
                        activeColorInput = colorInput;
                        colorInput.click();
                        
                        colorInput.addEventListener('input', async (e) => {
                            await updateTermColor(tag.dataset.term, e.target.value);
                        });
                        
                        colorInput.addEventListener('change', () => {
                            colorInput.remove();
                            activeColorInput = null;
                        });
                    }
                });
            });
        }

        container.querySelectorAll('.remove-button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const term = button.dataset.term;
                const type = button.dataset.type;
                removeTerm(term, type);
            });
        });
    }

    renderCloud('highlight-terms', state.highlightTerms, 'highlight');
    renderCloud('hidden-terms', state.hiddenTerms, 'hidden');
}

async function updateTermColor(term, newColor) {
    const termIndex = state.highlightTerms.findIndex(t => 
        typeof t === 'object' ? t.term === term : t === term
    );
    
    if (termIndex !== -1) {
        state.highlightTerms[termIndex] = { term, color: newColor };
        
        await chrome.storage.local.set({
            highlightTerms: state.highlightTerms
        });
        
        renderTerms();
        applyStyles();
    }
}

function applyStyles() {
    const articles = document.querySelectorAll('article, .entry, [data-entry-id]');

    articles.forEach(article => {
        article.classList.remove('feedly-hidden', 'feedly-reduced');
        article.style.removeProperty('background-color');
        article.style.removeProperty('border-left');

        const text = article.textContent.toLowerCase();
        
        const matchedTerm = state.highlightTerms.find(term => {
            const termText = typeof term === 'object' ? term.term : term;
            return text.includes(termText.toLowerCase());
        });

        if (matchedTerm) {
            article.style.backgroundColor = matchedTerm.color;
            article.style.borderLeft = `4px solid ${adjustColor(matchedTerm.color, -20)}`;
        } else if (state.hiddenTerms.some(term => text.includes(term.toLowerCase()))) {
            article.classList.add('feedly-hidden');
        } else if (state.showEmphasis) {
            article.classList.add('feedly-reduced');
        }
    });
}

function adjustColor(color, amount) {
    const hex = color.replace('#', '');
    const num = parseInt(hex, 16);
    const r = Math.min(Math.max((num >> 16) + amount, 0), 255);
    const g = Math.min(Math.max(((num >> 8) & 0x00FF) + amount, 0), 255);
    const b = Math.min(Math.max((num & 0x0000FF) + amount, 0), 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function addEventListeners() {
    document.querySelector('.minimize-button').addEventListener('click', async () => {
        const container = document.getElementById('feedly-highlighter');
        state.isMinimized = !state.isMinimized;
        container.classList.toggle('minimized');
        document.querySelector('.minimize-button').textContent = state.isMinimized ? '+' : '−';
        await chrome.storage.local.set({ isMinimized: state.isMinimized });
    });

    document.getElementById('add-highlight').addEventListener('click', () => addTerm('highlight'));
    document.getElementById('add-hidden').addEventListener('click', () => addTerm('hidden'));

    document.getElementById('new-highlight').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') addTerm('highlight');
    });
    
    document.getElementById('new-hidden').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') addTerm('hidden');
    });

    document.getElementById('toggle-emphasis').addEventListener('change', async (e) => {
        state.showEmphasis = e.target.checked;
        await chrome.storage.local.set({ showEmphasis: state.showEmphasis });
        applyStyles();
    });
}

async function init() {
    await loadSettings();
    createUI();
    addEventListeners();
    renderTerms();
    applyStyles();

    new MutationObserver(() => applyStyles())
        .observe(document.body, { childList: true, subtree: true });
}

init();