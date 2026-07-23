// ==UserScript==
// @name         Roblox Instant Unfriend Button (Fixed)
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Adds a single red button per friend card on Roblox using direct API call.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    let cachedCsrfToken = null;

    // Retrieve CSRF token from Roblox page DOM
    async function getCsrfToken() {
        if (cachedCsrfToken) return cachedCsrfToken;

        // Roblox stores the CSRF token in the data-token attribute
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag) {
            const token = metaTag.getAttribute('data-token') || metaTag.getAttribute('content');
            if (token) {
                cachedCsrfToken = token;
                return cachedCsrfToken;
            }
        }

        // Fallback: Make a lightweight request to trigger a 403 and grab the x-csrf-token header
        try {
            const res = await fetch('https://auth.roblox.com/v2/logout', { method: 'POST', credentials: 'include' });
            const token = res.headers.get('x-csrf-token');
            if (token) cachedCsrfToken = token;
            return token;
        } catch (err) {
            console.error('CSRF fetch error:', err);
            return null;
        }
    }

    // Call Roblox Unfriend API
    async function unfriendUser(userId) {
        let token = await getCsrfToken();
        
        let response = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': token || ''
            },
            credentials: 'include'
        });

        // If initial attempt fails due to expired CSRF token, grab new header token and retry once
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
    }

    function injectButtons() {
        // Target card containers directly to avoid duplicate buttons
        const cards = document.querySelectorAll('.list-item, .friend-card, [class*="friend-card"], .avatar-card-container');

        cards.forEach(card => {
            if (card.classList.contains('has-instant-btn')) return;

            // Extract user ID from any profile link inside this specific card
            const link = card.querySelector('a[href*="/users/"]');
            if (!link) return;

            const href = link.getAttribute('href') || '';
            const match = href.match(/\/users\/(\d+)\//);
            if (!match) return;

            const userId = match[1];
            card.classList.add('has-instant-btn');

            // Create a single red unfriend button
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

            // Ensure parent element is positioned relatively so the button sits in the top-right corner
            if (getComputedStyle(card).position === 'static') {
                card.style.position = 'relative';
            }

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                btn.innerText = '...';
                btn.style.backgroundColor = '#7f8c8d';

                const success = await unfriendUser(userId);

                if (success) {
                    card.style.transition = 'all 0.25s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';
                    setTimeout(() => card.remove(), 250);
                } else {
                    btn.innerText = '✕';
                    btn.style.backgroundColor = '#e74c3c';
                    alert('Failed to unfriend. Try refreshing the page once to reset session tokens.');
                }
            });

            card.appendChild(btn);
        });
    }

    // Observer for infinite scrolling through large friends lists
    const observer = new MutationObserver(() => injectButtons());
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(injectButtons, 500);
})();
