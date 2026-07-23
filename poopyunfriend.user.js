// ==UserScript==
// @name         Roblox Unfriend Button (Debug & Fix)
// @namespace    http://tampermonkey.net/
// @version      13.0
// @description  Instant unfriend buttons with fallback token fetch and error feedback.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let currentCsrfToken = null;

    // Grab CSRF token from DOM or fetch header
    async function fetchCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) {
            const token = meta.getAttribute('data-token') || meta.getAttribute('content');
            if (token) return token;
        }

        // Send a dummy request to trigger a 403 with the fresh token in headers
        try {
            const res = await fetch('https://friends.roblox.com/v1/users/1/unfriend', {
                method: 'POST',
                credentials: 'include'
            });
            const token = res.headers.get('x-csrf-token');
            if (token) return token;
        } catch (e) {
            console.error('[UnfriendScript] CSRF Fetch Error:', e);
        }
        return '';
    }

    // Call unfriend endpoint
    async function performUnfriend(userId) {
        if (!currentCsrfToken) {
            currentCsrfToken = await fetchCsrfToken();
        }

        try {
            let res = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': currentCsrfToken
                },
                credentials: 'include'
            });

            // If token expired (403), grab new token sent back in response headers and retry once
            if (res.status === 403) {
                const newToken = res.headers.get('x-csrf-token');
                if (newToken) {
                    currentCsrfToken = newToken;
                    res = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': currentCsrfToken
                        },
                        credentials: 'include'
                    });
                }
            }

            return { ok: res.ok, status: res.status };
        } catch (err) {
            console.error('[UnfriendScript] Network Error:', err);
            return { ok: false, status: 'NET' };
        }
    }

    function scanAndAttach() {
        // Find friend tiles
        const cards = document.querySelectorAll('.friend-card, .avatar-card-container, .list-item');

        cards.forEach(card => {
            if (card.querySelector('.instant-unfriend-btn')) return;

            // Robust link search matching /users/123456
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
                width: '26px',
                height: '26px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                position: 'absolute',
                top: '4px',
                right: '4px',
                zIndex: '99999',
                boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                pointerEvents: 'auto'
            });

            if (getComputedStyle(card).position === 'static') {
                card.style.position = 'relative';
            }

            // Prevent card tap/navigation
            ['touchstart', 'mousedown', 'pointerdown'].forEach(evt => {
                btn.addEventListener(evt, (e) => e.stopPropagation(), { passive: true });
            });

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                btn.innerText = '...';
                btn.style.backgroundColor = '#7f8c8d';

                const result = await performUnfriend(userId);

                if (result.ok) {
                    card.style.transition = 'opacity 0.2s ease';
                    card.style.opacity = '0.1';
                    btn.remove();
                } else {
                    // Display status code on button for debugging
                    btn.innerText = result.status || 'Err';
                    btn.style.backgroundColor = '#d32f2f';
                    setTimeout(() => {
                        btn.innerText = '✕';
                        btn.style.backgroundColor = '#e74c3c';
                    }, 2000);
                }
            });

            card.appendChild(btn);
        });
    }

    setInterval(scanAndAttach, 800);
})();
