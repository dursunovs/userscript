// ==UserScript==
// @name         Roblox Unfriend (Perfected Pages & Clicks)
// @namespace    http://tampermonkey.net/
// @version      21.0
// @description  Working unfriend clicks, smooth grid reflow, and forced React pagination locking.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let cachedCsrfToken = null;

    // 1. TRACK THE PAGE YOU CLICK ON
    document.addEventListener('click', (e) => {
        const pageBtn = e.target.closest('.pager a, .pagination a, .pagination button, [class*="pager"] a');
        if (pageBtn && !pageBtn.closest('.active') && !pageBtn.closest('.disabled')) {
            const numMatch = pageBtn.innerText.match(/\d+/);
            if (numMatch) {
                sessionStorage.setItem('rbx_locked_page', numMatch[0]);
            }
        }
    }, true);

    // 2. GET API TOKEN
    function getCsrfToken() {
        if (cachedCsrfToken) return cachedCsrfToken;
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) cachedCsrfToken = meta.getAttribute('data-token') || meta.getAttribute('content');
        return cachedCsrfToken || '';
    }

    // 3. CALL UNFRIEND API
    async function unfriendUser(userId) {
        let token = getCsrfToken();
        try {
            let res = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': token
                },
                credentials: 'include'
            });

            if (res.status === 403) {
                const newToken = res.headers.get('x-csrf-token');
                if (newToken) {
                    cachedCsrfToken = newToken;
                    res = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': newToken
                        },
                        credentials: 'include'
                    });
                }
            }
            return res.ok;
        } catch (err) {
            return false;
        }
    }

    // 4. FORCE REACT TO STAY ON YOUR PAGE
    function enforcePageLock() {
        const savedPage = sessionStorage.getItem('rbx_locked_page');
        if (!savedPage || savedPage === '1') return;

        const activeEl = document.querySelector('.pager .active, .pagination .active, [class*="pager"] .active');
        if (!activeEl) return;

        const activePageMatch = activeEl.innerText.match(/\d+/);
        if (activePageMatch && activePageMatch[0] === '1') {
            // We got kicked to page 1. Find our saved page button and force a native React click.
            const allPageBtns = document.querySelectorAll('.pager a, .pagination a, .pagination button, [class*="pager"] a');
            for (let btn of allPageBtns) {
                if (btn.innerText.trim() === savedPage) {
                    // React requires bubbles: true to register the click
                    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    break;
                }
            }
        }
    }

    // 5. INJECT BUTTONS & HANDLE REFLOW
    function scanAndAttach() {
        enforcePageLock();

        const cards = document.querySelectorAll('.friend-card, .avatar-card-container, .list-item');

        cards.forEach(card => {
            if (card.closest('header, nav, .navbar, .header-container') || card.querySelector('.instant-unfriend-btn')) return;

            const link = card.querySelector('a[href*="/users/"]');
            if (!link) return;

            const match = (link.getAttribute('href') || '').match(/\/users\/(\d+)/);
            if (!match) return;

            const userId = match[1];

            const btn = document.createElement('button');
            btn.className = 'instant-unfriend-btn';
            btn.innerText = '✕';

            Object.assign(btn.style, {
                backgroundColor: '#e74c3c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                position: 'absolute',
                top: '4px',
                right: '4px',
                zIndex: '99999',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
            });

            if (getComputedStyle(card).position === 'static') {
                card.style.position = 'relative';
            }

            // Isolate touches so you don't accidentally navigate to their profile
            ['touchstart', 'pointerdown'].forEach(evtType => {
                btn.addEventListener(evtType, (e) => e.stopPropagation());
            });

            // Clean, working click handler
            btn.onclick = async function(e) {
                e.preventDefault();
                e.stopPropagation();

                btn.innerText = '...';
                btn.style.backgroundColor = '#7f8c8d';

                const success = await unfriendUser(userId);

                if (success) {
                    // The reflow logic you confirmed working
                    const outerWrapper = card.closest('li, .list-item') || card;
                    outerWrapper.style.transition = 'all 0.15s ease';
                    outerWrapper.style.opacity = '0';
                    outerWrapper.style.transform = 'scale(0.8)';

                    setTimeout(() => {
                        outerWrapper.style.display = 'none';
                    }, 150);
                } else {
                    btn.innerText = '✕';
                    btn.style.backgroundColor = '#e74c3c';
                }
            };

            card.appendChild(btn);
        });
    }

    setInterval(scanAndAttach, 400);
})();
