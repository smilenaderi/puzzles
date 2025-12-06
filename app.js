import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, updateDoc, increment, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { problemVisuals, getIcon } from './visuals.js';

// --- FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyC0q3_lGDHyGNez2-TYcFlQnaQOB-ER_zs",
    authDomain: "mental-caa6d.firebaseapp.com",
    projectId: "mental-caa6d",
    storageBucket: "mental-caa6d.firebasestorage.app",
    messagingSenderId: "749958924464",
    appId: "1:749958924464:web:7ce584ba0015d3aa821375"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- STATE MANAGEMENT ---
const today = new Date().toISOString().split('T')[0];
const problems = (window.allProblems || []).filter(p => {
    if (!p.releaseDate) return true;
    return p.releaseDate <= today;
});

let state = {
    currentFilter: 'all',
    solvedIds: new Set(JSON.parse(localStorage.getItem('mg_solved')) || []),
    likedIds: new Set(JSON.parse(localStorage.getItem('mg_liked')) || [])
};

const feed = document.getElementById('problem-feed');
const featuredContainer = document.getElementById('featured-container');
const filterContainer = document.getElementById('filter-container');
const headerEl = document.getElementById('sticky-header');

// --- EVENT LISTENERS ---
window.addEventListener('scroll', () => {
    if (window.scrollY > 20) headerEl.classList.add('border-stone-200', 'shadow-sm');
    else headerEl.classList.remove('border-stone-200', 'shadow-sm');
});

filterContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-btn')) {
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.className = 'filter-btn shrink-0 text-xs font-medium px-4 py-1.5 rounded-full text-stone-500 hover:bg-stone-200 transition-colors';
        });
        e.target.className = 'filter-btn shrink-0 text-xs font-semibold px-4 py-1.5 rounded-full bg-stone-900 text-white transition-colors';
        state.currentFilter = e.target.dataset.filter;
        renderFeed();
    }
});

document.getElementById('random-btn').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderFeatured();
});

// --- LIKES LOGIC ---
async function fetchLikes(id) {
    try {
        const docRef = doc(db, "likes", id.toString());
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            updateLikeUI(id, docSnap.data().count);
        } else {
            updateLikeUI(id, 0); 
        }
    } catch(e) { console.log("Firebase inactive"); }
}

window.handleLike = async function(id) {
    if (state.likedIds.has(id)) return; 

    const countEl = document.getElementById(`like-count-${id}`);
    let current = parseInt(countEl.innerText) || 0;
    updateLikeUI(id, current + 1);
    state.likedIds.add(id);
    localStorage.setItem('mg_liked', JSON.stringify([...state.likedIds]));

    const docRef = doc(db, "likes", id.toString());
    try {
        await updateDoc(docRef, { count: increment(1) });
    } catch (e) {
        try { await setDoc(docRef, { count: 1 }); } catch(err){}
    }
};

function updateLikeUI(id, count) {
    const countEl = document.getElementById(`like-count-${id}`);
    const btnIcon = document.querySelector(`#like-btn-${id} svg`);
    if(countEl) countEl.innerText = count;
    if (state.likedIds.has(id) && btnIcon) {
        btnIcon.classList.add('liked-heart');
        btnIcon.setAttribute('fill', 'currentColor');
    }
}

// --- RENDER FUNCTIONS ---
function renderMath() {
    if (window.renderMathInElement) {
        renderMathInElement(document.body, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ],
            throwOnError: false
        });
    }
}

window.toggle = function(id) {
    if (state.solvedIds.has(id)) state.solvedIds.delete(id);
    else state.solvedIds.add(id);
    localStorage.setItem('mg_solved', JSON.stringify([...state.solvedIds]));
    renderFeed();
};

function renderFeatured() {
    if (problems.length === 0) return;
    const randomProb = problems[Math.floor(Math.random() * problems.length)];
    const isSolved = state.solvedIds.has(randomProb.id);
    const iconSvg = getIcon(randomProb.category, randomProb, true);
    
    // Check if custom visual exists, otherwise use large icon
    const hasCustomVisual = !!problemVisuals[randomProb.id];
    const visualContent = hasCustomVisual 
        ? problemVisuals[randomProb.id]
        : `<div class="w-full h-48 flex items-center justify-center opacity-10">${iconSvg}</div>`;
        
    const categoryMap = { 'Logic': 'منطق', 'Combinatorics': 'ترکیبیات', 'Algorithms': 'الگوریتم', 'Probability': 'احتمال', 'Graph Theory': 'نظریه گراف', 'Geometry': 'هندسه' };
    const displayCat = categoryMap[randomProb.category] || randomProb.category;

    // Featured section remains large and centered, but styled to match
    featuredContainer.innerHTML = `
        <div class="relative overflow-hidden rounded-3xl bg-stone-900 text-stone-50 shadow-2xl p-0 flex flex-col md:flex-row transition-all duration-700 fade-in group min-h-[400px]">
            
            <div class="visual-col w-full md:w-5/12 bg-stone-800/50 p-8 md:p-12 flex items-center justify-center relative border-b md:border-b-0 md:border-l border-stone-700">
                <div class="absolute inset-0 opacity-5 pointer-events-none">${iconSvg}</div>
                <div class="relative z-10 w-full text-stone-300">
                     ${visualContent}
                </div>
            </div>

            <div class="w-full md:w-7/12 p-8 md:p-12 flex flex-col justify-center relative">
                <div class="flex items-center gap-3 mb-6">
                    <span class="px-2 py-1 bg-amber-600 text-[11px] font-bold uppercase tracking-wider rounded text-white shadow-lg">چالش ویژه</span>
                    <span class="text-xs font-medium text-stone-400 border border-stone-700 px-3 py-1 rounded-full">${displayCat}</span>
                </div>
                <h2 class="text-3xl md:text-4xl font-black mb-6 leading-tight tracking-tight text-white drop-shadow-sm">${randomProb.title}</h2>
                <div class="text-stone-300 text-lg leading-relaxed mb-10 font-light problem-desc">${randomProb.text}</div>
                
                <div class="flex flex-wrap gap-4 mt-auto">
                    <button onclick="window.toggle(${randomProb.id})" class="px-6 py-3 rounded-lg font-bold text-sm transition-all shadow-md transform active:scale-95 flex items-center gap-2 ${isSolved ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-stone-50 text-stone-900 hover:bg-white hover:shadow-lg'}">
                        ${isSolved ? '✓ حل شد' : 'علامت زدن به عنوان حل شده'}
                    </button>
                    <button onclick="location.reload()" class="px-6 py-3 rounded-lg font-medium text-stone-400 hover:text-white hover:bg-stone-800 transition-colors border border-transparent hover:border-stone-700 flex items-center gap-2">
                        <span>بعدی</span><span>↻</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    renderMath();
}

function renderFeed(overrideProblems = null) {
    feed.innerHTML = '';
    const source = overrideProblems || problems;
    if (source.length === 0) {
        document.getElementById('no-results').classList.remove('hidden');
        return;
    }
    let visible = 0;
    const sorted = [...source].sort((a, b) => {
        const aS = state.solvedIds.has(a.id);
        const bS = state.solvedIds.has(b.id);
        return aS === bS ? 0 : aS ? 1 : -1;
    });
    const categoryMap = { 'Logic': 'منطق', 'Combinatorics': 'ترکیبیات', 'Algorithms': 'الگوریتم', 'Probability': 'احتمال', 'Graph Theory': 'نظریه گراف', 'Geometry': 'هندسه' };

    sorted.forEach(p => {
        if (!overrideProblems && state.currentFilter !== 'all' && p.category !== state.currentFilter) return;
        visible++;
        
        const isSolved = state.solvedIds.has(p.id);
        const displayCat = categoryMap[p.category] || p.category;
        const iconSvg = getIcon(p.category, p, false);
        const hasCustomVisual = !!problemVisuals[p.id];

        // Fallback visual if no custom drawing exists: Use category icon prominently
        const visualContent = hasCustomVisual 
            ? problemVisuals[p.id] 
            : `<div class="w-32 h-32 opacity-10 text-stone-400">${iconSvg}</div>`;

        fetchLikes(p.id);

        const card = document.createElement('div');
        // KEY CHANGE: Flex row layout
        card.className = `card-transition overflow-hidden rounded-2xl border flex flex-col md:flex-row group ${isSolved ? 'bg-stone-100 border-stone-200 opacity-70' : 'bg-white border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300'}`;

        card.innerHTML = `
            <div class="visual-col w-full md:w-1/3 bg-stone-50 border-b md:border-b-0 md:border-l border-stone-100 p-6 md:p-8 flex items-center justify-center relative min-h-[200px] text-stone-600">
                ${visualContent}
            </div>
            
            <div class="w-full md:w-2/3 p-6 md:p-8 flex flex-col relative">
                <div class="flex justify-between items-baseline mb-4">
                    <span class="text-[10px] font-bold text-stone-400 uppercase tracking-wider bg-stone-50 px-2 py-1 rounded border border-stone-100">${displayCat}</span>
                    ${isSolved ? '<span class="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-1 rounded">حل شده</span>' : ''}
                </div>
                
                <h3 class="font-extrabold text-stone-800 text-xl md:text-2xl leading-snug mb-4 ${isSolved ? 'line-through text-stone-400' : ''}">${p.title}</h3>
                
                <div class="text-sm md:text-base text-stone-600 font-normal leading-relaxed mb-6 text-justify grow problem-desc">
                    ${p.text}
                </div>
                
                <div class="flex items-center justify-between mt-auto pt-4 border-t border-stone-50">
                    <button onclick="window.toggle(${p.id})" class="text-xs font-semibold px-4 py-2 rounded-lg border border-stone-200 ${isSolved ? 'text-stone-400 bg-transparent' : 'text-stone-800 bg-white hover:bg-stone-50 hover:border-stone-300'} transition-all">
                        ${isSolved ? 'علامت زدن به عنوان حل نشده' : 'حل مسئله'}
                    </button>

                    <button id="like-btn-${p.id}" onclick="window.handleLike(${p.id})" class="like-btn flex items-center gap-1.5 text-stone-400 hover:text-red-500 transition-colors px-2 py-1" title="لایک">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        <span id="like-count-${p.id}" class="text-sm font-mono font-bold pt-0.5">0</span>
                    </button>
                </div>
            </div>
        `;
        feed.appendChild(card);
    });
    document.getElementById('no-results').classList.toggle('hidden', visible > 0);
    renderMath();
}

// Initialize
renderFeatured();
renderFeed();