// ==UserScript==
// @name         Roblox Instant Unfriend (Fixed UI & API)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Instantly unfriends users with scoped buttons and fast fallback.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    let cachedCsrfToken = null;

    // Retrieve CSRF token required for Roblox API
    async function getCsrfToken() {
        if (cachedCsrfToken) return cachedCsrfToken;

        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag) {
            const token = metaTag.getAttribute('data-token') || metaTag.getAttribute('content');
            if (token) {
                cachedCsrfToken = token;
                return cachedCsrfToken;
            }
        }

        try {
            const res = await fetch('https://auth.roblox.com/v2/logout', { method: 'POST', credentials: 'include' });
            const token = res.headers.get('x-csrf-token');
            if (token) cachedCsrfToken = token;
            return token;
        } catch (err) {
            return null;
        }
    }

    // Call unfriend endpoint with a strict 4-second timeout to prevent infinite '...'
    async function unfriendUser(userId) {
        const token = await getCsrfToken();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        try {
            let response = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': token || ''
                },
                credentials: 'include',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.status === 403) {
                const newToken = response.headers.get('x-csrf-token');
                if (newToken) {
                    cachedCsrfToken = newToken;
                    response = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': newToken
                        },
                        credentials: 'include'
                    });
                }
            }

            return response.ok;
        } catch (err) {
            clearTimeout(timeoutId);
            return false;
        }
    }

    function injectButtons() {
        // STRICT SCOPING: Only target cards inside the main friends list container
        const mainContainer = document.querySelector('.friends-content, .friends-list, #rbx-friends-container, .hlist');
        if (!mainContainer) return;

        const cards = mainContainer.querySelectorAll('.list-item, .friend-card, [class*="friend-card"], .avatar-card-container');

        cards.forEach(card => {
            if (card.classList.contains('has-instant-btn')) return;

            const link = card.querySelector('a[href*="/users/"]');
            if (!link) return;

            const href = link.getAttribute('href') || '';
            const match = href.match(/\/users\/(\d+)\//);
            if (!match) return;

            const userId = match[1];
            card.classList.add('has-instant-btn');

            const btn = document.createElement('button');
            btn.className = 'instant-unfriend-btn';
            btn.innerText = '✕';
            btn.title = 'Instant Unfriend';

            Object.assign(btn.style, {
                backgroundColor: '#e74c3c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '50%',
                width: '26px',
                height: '26px',
                fontSize: '13px',
                fontWeight: 'bold',
                cursor: 'pointer',
                position: 'absolute',
                top: '6px',
                right: '6px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: '9999'
            });

            if (getComputedStyle(card).position === 'static') {
                card.style.position = 'relative';
            }

            btn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
            btn.addEventListener('mousedown', (e) => e.stopPropagation());

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                btn.innerText = '...';
                btn.style.backgroundColor = '#7f8c8d';

                const success = await unfriendUser(userId);

                if (success) {
                    card.style.transition = 'all 0.2s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';
                    setTimeout(() => card.remove(), 200);
                } else {
                    // Reset button if API request failed or timed out
                    btn.innerText = '✕';
                    btn.style.backgroundColor = '#e74c3c';
                }
            });

            card.appendChild(btn);
        });
    }

    const observer = new MutationObserver(() => injectButtons());
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(injectButtons, 500);
})();
