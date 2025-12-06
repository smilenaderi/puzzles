import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    doc,
    getDoc,
    updateDoc,
    increment,
    setDoc,
    collection,
    addDoc,
    query,
    where,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
    return !p.releaseDate || p.releaseDate <= today;
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
const feedTitle = document.getElementById('feed-title');

// --- EVENT LISTENERS ---
window.addEventListener('scroll', () => {
    if (window.scrollY > 20) headerEl.classList.add('scrolled');
    else headerEl.classList.remove('scrolled');
});

filterContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-btn')) {
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('active-filter', 'bg-stone-900', 'text-white');
            if (!b.dataset.filter.includes('liked')) b.classList.add('text-stone-500');
        });

        e.target.classList.add('active-filter');
        e.target.classList.remove('text-stone-500');

        state.currentFilter = e.target.dataset.filter;
        renderFeed();
    }
});

document.getElementById('random-btn').addEventListener('click', () => {
    window.renderFeatured();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// --- LIKES LOGIC ---
async function fetchLikes(id) {
    try {
        const docRef = doc(db, "likes", id.toString());
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            updateLikeUI(id, docSnap.data().count);
        }
    } catch (e) {
        /* silent fail */
    }
}

window.handleLike = async function (id) {
    if (state.likedIds.has(id)) {
        state.likedIds.delete(id);
        localStorage.setItem('mg_liked', JSON.stringify([...state.likedIds]));
        updateLikeUI(id, null, false);
        if (state.currentFilter === 'liked') renderFeed();
        return;
    }

    const countEl = document.getElementById(`like-count-${id}`);
    let current = parseInt(countEl ? countEl.innerText : 0) || 0;

    state.likedIds.add(id);
    localStorage.setItem('mg_liked', JSON.stringify([...state.likedIds]));

    updateLikeUI(id, current + 1, true);

    const docRef = doc(db, "likes", id.toString());
    try {
        await updateDoc(docRef, { count: increment(1) });
    } catch (e) {
        try { await setDoc(docRef, { count: 1 }); } catch (err) { }
    }
};

function updateLikeUI(id, count, isLiked) {
    const countEl = document.getElementById(`like-count-${id}`);
    const btnIcon = document.querySelector(`#like-btn-${id} svg`);

    if (count !== null && countEl) countEl.innerText = count;

    const active = isLiked !== undefined ? isLiked : state.likedIds.has(id);

    if (active && btnIcon) {
        btnIcon.classList.add('liked-heart');
        btnIcon.setAttribute('fill', 'currentColor');
    } else if (btnIcon) {
        btnIcon.classList.remove('liked-heart');
        btnIcon.setAttribute('fill', 'none');
    }
}

// --- MATH RENDERING ---
function renderMath() {
    if (window.renderMathInElement) {
        renderMathInElement(document.body, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false }
            ],
            throwOnError: false
        });
    }
}

// --- SOLVED TOGGLE ---
window.toggle = function (id) {
    if (state.solvedIds.has(id)) state.solvedIds.delete(id);
    else state.solvedIds.add(id);
    localStorage.setItem('mg_solved', JSON.stringify([...state.solvedIds]));
    renderFeed();
};

// --- COMMENTS LOGIC ---
function escapeCommentText(text) {
    return (text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

async function loadComments(problemId) {
    try {
        const q = query(
            collection(db, "comments"),
            where("problemId", "==", problemId)
        );
        const snap = await getDocs(q);

        const comments = [];
        snap.forEach(docSnap => comments.push(docSnap.data()));

        const containers = [
            document.getElementById(`comments-${problemId}`),
            document.getElementById(`featured-comments-${problemId}`)
        ].filter(Boolean);

        containers.forEach(container => {
            if (!container) return;

            if (comments.length === 0) {
                container.innerHTML = `
                    <p class="text-[11px] text-stone-400">
                        هنوز نظری ثبت نشده. اولین نفر باش 😊
                    </p>
                `;
                return;
            }

            container.innerHTML = comments.map(c => {
                const text = escapeCommentText(c.text);
                return `
                    <div class="bg-stone-50 border border-stone-100 rounded-xl px-3 py-2 text-[11px] leading-relaxed text-stone-700">
                        ${text}
                    </div>
                `;
            }).join('');
        });

        renderMath();
    } catch (e) {
        console.error("Failed to load comments", e);
    }
}

// 🔧 اینجا فیکس اصلی: اول input بالایی رو بگیر، بعد پایینی
window.addComment = async function (problemId) {
    const featuredInput = document.getElementById(`featured-comment-input-${problemId}`);
    const cardInput = document.getElementById(`comment-input-${problemId}`);

    // اولویت با featured (بالای صفحه)، اگر نبود می‌ره سراغ کارت
    const input = featuredInput || cardInput;
    if (!input) return;

    const raw = input.value.trim();
    if (!raw) return;

    input.disabled = true;

    try {
        await addDoc(collection(db, "comments"), {
            problemId,
            text: raw,
            ts: serverTimestamp()
        });

        input.value = "";
        await loadComments(problemId);
    } catch (e) {
        console.error("Failed to add comment", e);
    } finally {
        input.disabled = false;
    }
};

// --- FEATURED PROBLEM ---
window.renderFeatured = function (problemId = null) {
    if (problems.length === 0) return;

    let prob;
    if (problemId !== null && problemId !== undefined) {
        prob = problems.find(p => p.id === problemId);
    }
    if (!prob) {
        prob = problems[Math.floor(Math.random() * problems.length)];
    }

    const isSolved = state.solvedIds.has(prob.id);
    const iconSvg = getIcon(prob.category, prob, true);

    const hasCustomVisual = !!problemVisuals[prob.id];
    const visualContent = hasCustomVisual
        ? problemVisuals[prob.id]
        : `<div class="w-full h-48 flex items-center justify-center opacity-10">${iconSvg}</div>`;

    const categoryMap = {
        'Logic': 'منطق',
        'Combinatorics': 'ترکیبیات',
        'Algorithms': 'الگوریتم',
        'Probability': 'احتمال',
        'Graph Theory': 'نظریه گراف',
        'Geometry': 'هندسه',
        'Number Theory': 'نظریه اعداد'
    };
    const displayCat = categoryMap[prob.category] || prob.category;

    featuredContainer.innerHTML = `
        <div class="relative overflow-hidden rounded-3xl bg-stone-900 text-stone-50 shadow-2xl flex flex-col md:flex-row min-h-[400px]">
            
            <div class="visual-col w-full md:w-5/12 bg-stone-800/50 p-8 md:p-12 flex items-center justify-center relative border-b md:border-b-0 md:border-l border-stone-700/50">
                <div class="absolute inset-0 opacity-5 pointer-events-none scale-150">${iconSvg}</div>
                <div class="relative z-10 w-full text-stone-300 visual-container">
                     ${visualContent}
                </div>
            </div>

            <div class="w-full md:w-7/12 p-8 md:p-12 flex flex-col justify-center relative z-10">
                <div class="flex items-center gap-3 mb-6">
                    <span class="px-3 py-1 bg-amber-600 text-[11px] font-bold uppercase tracking-wider rounded-lg text-white shadow-lg shadow-amber-900/20">
                        ${problemId ? 'نمایش انتخاب شده' : 'چالش تصادفی'}
                    </span>
                    <span class="text-xs font-medium text-stone-400 border border-stone-700 px-3 py-1 rounded-full">${displayCat}</span>
                </div>
                <h2 class="text-3xl md:text-4xl font-black mb-6 leading-tight tracking-tight text-white">${prob.title}</h2>
                
                <div class="text-stone-300 text-lg leading-relaxed mb-10 font-light problem-desc pl-1">
                    ${prob.text}
                </div>
                
                <div class="flex flex-wrap gap-4 mt-auto">
                    <button onclick="window.toggle(${prob.id})" class="px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-md transform active:scale-95 flex items-center gap-2 ${isSolved ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-white text-stone-900 hover:bg-stone-100'}">
                        ${isSolved ? '✓ حل شد' : 'حل کردم'}
                    </button>
                    <button onclick="window.renderFeatured()" class="px-6 py-3 rounded-xl font-medium text-stone-400 hover:text-white hover:bg-stone-800 transition-colors border border-stone-700 flex items-center gap-2">
                        <span>معمای تصادفی</span><span>↻</span>
                    </button>
                </div>

                <div class="mt-8 border-t border-stone-700/40 pt-4">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-[11px] font-semibold text-stone-300">ایده‌ها و راه‌حل‌های دیگران</span>
                    </div>
                    <div id="featured-comments-${prob.id}" class="comments-list space-y-2 max-h-40 overflow-y-auto pr-1 text-sm text-stone-100/90"></div>
                    <div class="flex items-center gap-2 mt-3">
                        <input
                            id="featured-comment-input-${prob.id}"
                            type="text"
                            class="flex-grow text-xs bg-stone-900/40 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/70 focus:border-amber-500"
                            placeholder="ایده یا حدس خودت را اینجا بنویس..."
                        >
                        <button
                            onclick="window.addComment(${prob.id})"
                            class="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-[11px] text-stone-900 font-semibold hover:bg-amber-400 transition-colors"
                        >
                            ارسال
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    loadComments(prob.id);
    renderMath();
};

// وقتی از روی کارت کلیک می‌کنی «مشاهده کامل»
window.showFull = function (id) {
    window.renderFeatured(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// --- FEED RENDERING ---
function renderFeed() {
    feed.innerHTML = '';

    let filtered = problems;

    if (state.currentFilter === 'liked') {
        filtered = problems.filter(p => state.likedIds.has(p.id));
        feedTitle.innerText = "مسائل مورد علاقه شما";
        document.getElementById('no-results-text').innerText = "هنوز هیچ معمایی را لایک نکرده‌اید.";
    } else if (state.currentFilter !== 'all') {
        filtered = problems.filter(p => p.category === state.currentFilter);
        const categoryMap = {
            'Logic': 'منطق',
            'Combinatorics': 'ترکیبیات',
            'Algorithms': 'الگوریتم',
            'Probability': 'احتمال',
            'Graph Theory': 'نظریه گراف',
            'Geometry': 'هندسه',
            'Number Theory': 'نظریه اعداد'
        };
        feedTitle.innerText = `دسته بندی: ${categoryMap[state.currentFilter] || state.currentFilter}`;
        document.getElementById('no-results-text').innerText = "موردی در این دسته یافت نشد.";
    } else {
        feedTitle.innerText = "آخرین معماها";
        document.getElementById('no-results-text').innerText = "موردی یافت نشد.";
    }

    if (filtered.length === 0) {
        document.getElementById('no-results').classList.remove('hidden');
        return;
    } else {
        document.getElementById('no-results').classList.add('hidden');
    }

    const sorted = [...filtered].reverse();

    const categoryMap = {
        'Logic': 'منطق',
        'Combinatorics': 'ترکیبیات',
        'Algorithms': 'الگوریتم',
        'Probability': 'احتمال',
        'Graph Theory': 'نظریه گراف',
        'Geometry': 'هندسه',
        'Number Theory': 'نظریه اعداد'
    };

    let delay = 0;
    sorted.forEach(p => {
        const isSolved = state.solvedIds.has(p.id);
        const displayCat = categoryMap[p.category] || p.category;
        const iconSvg = getIcon(p.category, p, false);
        const hasCustomVisual = !!problemVisuals[p.id];
        const isLiked = state.likedIds.has(p.id);

        const visualContent = hasCustomVisual
            ? problemVisuals[p.id]
            : `<div class="w-24 h-24 opacity-20 text-stone-400 transform rotate-12">${iconSvg}</div>`;

        fetchLikes(p.id);

        const card = document.createElement('div');
        card.style.animationDelay = `${delay}ms`;
        delay += 50;

        card.className = `problem-card fade-in group relative bg-white rounded-2xl border border-stone-100 flex flex-col overflow-hidden ${isSolved ? 'solved' : 'shadow-sm'}`;

        card.innerHTML = `
            <div class="visual-col bg-stone-50 h-48 flex items-center justify-center p-6 relative overflow-hidden border-b border-stone-100 text-stone-600">
                <div class="visual-container w-full flex justify-center transform transition-transform duration-500 group-hover:scale-105">
                    ${visualContent}
                </div>
                ${isSolved ? '<div class="absolute inset-0 bg-emerald-500/10 flex items-center justify-center backdrop-blur-[1px]"><span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold shadow-sm">حل شده</span></div>' : ''}
            </div>
            
            <div class="p-6 flex flex-col flex-grow">
                <div class="flex justify-between items-start mb-3">
                    <span class="text-[10px] font-bold text-stone-500 uppercase tracking-wider bg-stone-100 px-2 py-1 rounded-md">${displayCat}</span>
                </div>
                
                <h3 class="font-bold text-stone-800 text-lg leading-tight mb-3 line-clamp-2 group-hover:text-amber-600 transition-colors">
                    ${p.title}
                </h3>
                
                <div class="text-sm text-stone-600 leading-relaxed mb-6 line-clamp-4 text-justify problem-desc">
                    ${p.text}
                </div>
                
                <div class="mt-auto flex items-center justify-between pt-4 border-t border-stone-50">
                    <div class="flex items-center gap-2">
                        <button onclick="window.toggle(${p.id})" class="text-xs font-semibold px-4 py-2 rounded-lg transition-all ${isSolved ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-stone-600 bg-stone-100 hover:bg-stone-200 hover:text-stone-900'}">
                            ${isSolved ? '✓ حل شد' : 'حل مسئله'}
                        </button>

                        <button onclick="window.showFull(${p.id})" class="text-[11px] font-semibold px-3 py-2 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-all">
                            مشاهده کامل
                        </button>
                    </div>

                    <button id="like-btn-${p.id}" onclick="window.handleLike(${p.id})" class="group/like flex items-center gap-1.5 text-stone-400 hover:text-rose-500 transition-colors p-1.5 rounded-full hover:bg-rose-50" title="${isLiked ? 'حذف از مورد علاقه' : 'افزودن به مورد علاقه'}">
                        <span id="like-count-${p.id}" class="text-xs font-mono font-bold pt-0.5 group-hover/like:text-rose-500">0</span>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 transition-transform duration-300 ${isLiked ? 'liked-heart' : ''}" fill="${isLiked ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                    </button>
                </div>

                <div class="mt-4 border-t border-stone-100 pt-3">
                    <div id="comments-${p.id}" class="comments-list space-y-2 max-h-32 overflow-y-auto pr-1 text-xs text-stone-700"></div>
                    <div class="flex items-center gap-2 mt-2">
                        <input
                            id="comment-input-${p.id}"
                            type="text"
                            class="flex-grow text-xs border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/70 focus:border-amber-500"
                            placeholder="ایده یا راه‌حل خودت را بنویس..."
                        >
                        <button
                            onclick="window.addComment(${p.id})"
                            class="shrink-0 px-3 py-1.5 rounded-lg bg-stone-900 text-[11px] text-white font-semibold hover:bg-amber-600 transition-colors"
                        >
                            ارسال
                        </button>
                    </div>
                </div>
            </div>
        `;

        feed.appendChild(card);
        loadComments(p.id);
    });

    renderMath();
}

// Init
window.renderFeatured();
renderFeed();
