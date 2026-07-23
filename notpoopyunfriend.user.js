// ==UserScript==
// @name         Roblox Unfriend (Reflow & Keep Page)
// @namespace    http://tampermonkey.net/
// @version      15.0
// @description  Instantly unfriends users, reflows grid, and maintains current page position.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let cachedCsrfToken = null;

    // Retrieve security token safely
    function getCsrfToken() {
        if (cachedCsrfToken) return cachedCsrfToken;
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) {
            cachedCsrfToken = meta.getAttribute('data-token') || meta.getAttribute('content');
        }
        return cachedCsrfToken || '';
    }

    // Unfriend API call
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

    // Save and restore page position if Roblox forces a reset
    function maintainPagePosition() {
        const activePageBtn = document.querySelector('.pager .active, .pagination .active, [class*="pager"] .active');
        if (activePageBtn && activePageBtn.innerText) {
            const pageNum = activePageBtn.innerText.trim();
            sessionStorage.setItem('rbx_friends_last_page', pageNum);
        }

        // If page reset to 1 unexpectedly, trigger click on saved page number
        const savedPage = sessionStorage.getItem('rbx_friends_last_page');
        if (savedPage && savedPage !== '1') {
            const isCurrentlyPage1 = activePageBtn && activePageBtn.innerText.trim() === '1';
            if (isCurrentlyPage1) {
                const targetPageBtn = Array.from(document.querySelectorAll('.pager a, .pagination a, [class*="pager"] a'))
                    .find(el => el.innerText.trim() === savedPage);
                if (targetPageBtn) {
                    targetPageBtn.click();
                }
            }
        }
    }

    function scanAndAttach() {
        maintainPagePosition();

        // Target friend cards
        const cards = document.querySelectorAll('.friend-card, .avatar-card-container, .list-item');

        cards.forEach(card => {
            // Skip elements in header or top navigation bar
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

            // Stop click propagation
            ['touchstart', 'touchend', 'mousedown', 'mouseup', 'pointerdown', 'click'].forEach(evtType => {
                btn.addEventListener(evtType, (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }, true);
            });

            btn.addEventListener('click', async (e) => {
                e.preventDefault();

                btn.innerText = '...';
                btn.style.backgroundColor = '#7f8c8d';

                const success = await unfriendUser(userId);

                if (success) {
                    // Target the outermost wrapper element (li or .list-item)
                    const outerWrapper = card.closest('li, .list-item') || card;

                    // Fade out
                    outerWrapper.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
                    outerWrapper.style.opacity = '0';
                    outerWrapper.style.transform = 'scale(0.8)';

                    // Hide outer wrapper so grid reflows automatically
                    setTimeout(() => {
                        outerWrapper.style.display = 'none';
                    }, 150);
                } else {
                    btn.innerText = '✕';
                    btn.style.backgroundColor = '#e74c3c';
                }
            });

            card.appendChild(btn);
        });
    }

    setInterval(scanAndAttach, 600);
})();
