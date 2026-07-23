// ==UserScript==
// @name         Roblox Unfriend (Fixed Click & Keep Page)
// @namespace    http://tampermonkey.net/
// @version      16.0
// @description  Restores instant unfriend button execution, auto-reflows grid items, and locks page position.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let cachedCsrfToken = null;

    // Get CSRF Token
    function getCsrfToken() {
        if (cachedCsrfToken) return cachedCsrfToken;
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) {
            cachedCsrfToken = meta.getAttribute('data-token') || meta.getAttribute('content');
        }
        return cachedCsrfToken || '';
    }

    // Call Roblox API
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

    // Lock and maintain pagination position
    function saveAndLockPage() {
        const activeBtn = document.querySelector('.pager .active, .pagination .active, [class*="pager"] .active');
        if (activeBtn && activeBtn.innerText) {
            const currentPg = activeBtn.innerText.trim();
            sessionStorage.setItem('rbx_current_page', currentPg);
        }

        const savedPg = sessionStorage.getItem('rbx_current_page');
        if (savedPg && savedPg !== '1') {
            const isPage1 = activeBtn && activeBtn.innerText.trim() === '1';
            if (isPage1) {
                const pgButtons = Array.from(document.querySelectorAll('.pager a, .pagination a, [class*="pager"] a'));
                const targetBtn = pgButtons.find(b => b.innerText.trim() === savedPg);
                if (targetBtn) targetBtn.click();
            }
        }
    }

    function scanAndAttach() {
        saveAndLockPage();

        const cards = document.querySelectorAll('.friend-card, .avatar-card-container, .list-item');

        cards.forEach(card => {
            // Ignore headers/navbars or already injected buttons
            if (card.closest('header, nav, .navbar, .header-container') || card.querySelector('.instant-unfriend-btn')) {
                return;
            }

            const link = card.querySelector('a[href*="/users/"]');
            if (!link) return;

            const href = link.getAttribute('href') || '';
            const match = href.match(/\/users\/(\d+)/);
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

            // Prevent card link navigation when tapping button
            ['touchstart', 'mousedown', 'pointerdown'].forEach(evtType => {
                btn.addEventListener(evtType, (e) => e.stopPropagation());
            });

            // Action execution handler
            btn.onclick = async function(e) {
                e.preventDefault();
                e.stopPropagation();

                btn.innerText = '...';
                btn.style.backgroundColor = '#7f8c8d';

                const success = await unfriendUser(userId);

                if (success) {
                    // Find outermost grid wrapper (li or .list-item)
                    const outerWrapper = card.closest('li, .list-item') || card;

                    outerWrapper.style.transition = 'all 0.15s ease';
                    outerWrapper.style.opacity = '0';
                    outerWrapper.style.transform = 'scale(0.8)';

                    // Hide container so grid closes gap instantly
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

    setInterval(scanAndAttach, 600);
})();
