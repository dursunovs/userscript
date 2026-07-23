// ==UserScript==
// @name         Roblox Unfriend (Fixed Top Bar & Page Lock)
// @namespace    http://tampermonkey.net/
// @version      22.0
// @description  Hides unfriended users smoothly, keeps your page, and ignores the top bar.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let cachedCsrfToken = null;
    let myCurrentPage = 1;

    // 1. Keep track of what page you are actually on
    document.addEventListener('click', (e) => {
        const pageBtn = e.target.closest('.pager a, .pagination a, [class*="pager"] a');
        if (pageBtn && !pageBtn.closest('.active')) {
            const pageNum = parseInt(pageBtn.innerText.trim(), 10);
            if (!isNaN(pageNum)) {
                myCurrentPage = pageNum;
                sessionStorage.setItem('rbx_saved_page', myCurrentPage);
            }
        }
    }, true);

    // Load saved page from memory in case of a hard refresh
    const saved = sessionStorage.getItem('rbx_saved_page');
    if (saved) {
        myCurrentPage = parseInt(saved, 10);
    }

    // 2. Grab security token for the API
    function getCsrfToken() {
        if (cachedCsrfToken) return cachedCsrfToken;
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) cachedCsrfToken = meta.getAttribute('data-token') || meta.getAttribute('content');
        return cachedCsrfToken || '';
    }

    // 3. The Unfriend Request
    async function unfriendUser(userId) {
        let token = getCsrfToken();
        try {
            let res = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
                credentials: 'include'
            });

            if (res.status === 403) {
                const newToken = res.headers.get('x-csrf-token');
                if (newToken) {
                    cachedCsrfToken = newToken;
                    res = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': newToken },
                        credentials: 'include'
                    });
                }
            }
            return res.ok;
        } catch (err) {
            return false;
        }
    }

    // 4. Inject buttons and force page position
    function scanAndAttach() {
        // A. Force the page back if Roblox's server resets it to Page 1
        if (myCurrentPage > 1) {
            const activeBtn = document.querySelector('.pager .active, .pagination .active, [class*="pager"] .active');
            if (activeBtn && activeBtn.innerText.trim() === '1') {
                const allPageBtns = document.querySelectorAll('.pager a, .pagination a, [class*="pager"] a');
                for (let btn of allPageBtns) {
                    if (parseInt(btn.innerText.trim(), 10) === myCurrentPage) {
                        // Triggers a native click that React understands
                        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        break;
                    }
                }
            }
        }

        // B. Add buttons to friend cards
        const cards = document.querySelectorAll('.friend-card, .avatar-card-container, .list-item');

        cards.forEach(card => {
            // EXTREMELY STRICT FILTER: Ignore top bar, headers, navigation
            if (card.closest('#navigation, .rbx-header, .navbar, header, .header-container') || card.querySelector('.instant-unfriend-btn')) {
                return;
            }

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

            // Button Click Action
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                btn.innerText = '...';
                btn.style.backgroundColor = '#7f8c8d';

                const success = await unfriendUser(userId);

                if (success) {
                    // The exact hole-filling code that worked for you previously
                    const outerWrapper = card.closest('li, .list-item') || card;
                    outerWrapper.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                    outerWrapper.style.opacity = '0';
                    outerWrapper.style.transform = 'scale(0.8)';
                    
                    setTimeout(() => {
                        outerWrapper.style.display = 'none'; // Fills the hole smoothly
                    }, 200);
                } else {
                    btn.innerText = '✕';
                    btn.style.backgroundColor = '#e74c3c';
                }
            });

            card.appendChild(btn);
        });
    }

    // Run interval to ensure buttons stay attached
    setInterval(scanAndAttach, 500);
})();
