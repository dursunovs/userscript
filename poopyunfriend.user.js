// ==UserScript==
// @name         Roblox Instant Unfriend (Reflow & Clean)
// @namespace    http://tampermonkey.net/
// @version      14.0
// @description  Instantly unfriends users, reflows grid items into empty spots, and stops page resets.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let cachedCsrfToken = null;

    // Get CSRF token safely
    function getCsrfToken() {
        if (cachedCsrfToken) return cachedCsrfToken;
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) {
            cachedCsrfToken = meta.getAttribute('data-token') || meta.getAttribute('content');
        }
        return cachedCsrfToken || '';
    }

    // Call Roblox API to unfriend user
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

    function scanAndAttach() {
        // Target friend card elements
        const cards = document.querySelectorAll('.friend-card, .avatar-card-container, .list-item');

        cards.forEach(card => {
            // Ignore elements inside top navigation or header bar
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
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                pointerEvents: 'auto'
            });

            if (getComputedStyle(card).position === 'static') {
                card.style.position = 'relative';
            }

            // Stop touch and click bubbling immediately to prevent page reset/navigation
            ['touchstart', 'touchend', 'mousedown', 'mouseup', 'pointerdown'].forEach(evtType => {
                btn.addEventListener(evtType, (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }, true);
            });

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                btn.innerText = '...';
                btn.style.backgroundColor = '#7f8c8d';

                const success = await unfriendUser(userId);

                if (success) {
                    // Smoothly scale down and fade out card
                    card.style.transition = 'all 0.2s ease-out';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.5)';

                    // Remove node from DOM so remaining cards shift left/up naturally
                    setTimeout(() => {
                        card.remove();
                    }, 200);
                } else {
                    btn.innerText = '✕';
                    btn.style.backgroundColor = '#e74c3c';
                }
            });

            card.appendChild(btn);
        });
    }

    setInterval(scanAndAttach, 800);
})();
