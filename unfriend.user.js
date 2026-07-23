// ==UserScript==
// @name         Roblox Instant Unfriend Button (API)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Directly calls Roblox API to instantly unfriend users on tap.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // Cache the CSRF token required by Roblox for API calls
    let cachedCsrfToken = null;

    async function getCsrfToken() {
        if (cachedCsrfToken) return cachedCsrfToken;

        // Try getting token from meta tag
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag && metaTag.content) {
            cachedCsrfToken = metaTag.content;
            return cachedCsrfToken;
        }

        // Fallback: Fetch token via request
        try {
            const res = await fetch('https://auth.roblox.com/v2/login', { method: 'POST' });
            const token = res.headers.get('x-csrf-token');
            if (token) cachedCsrfToken = token;
            return token;
        } catch (err) {
            console.error('Failed to retrieve CSRF token:', err);
            return null;
        }
    }

    async function unfriendUser(userId) {
        const token = await getCsrfToken();
        if (!token) return false;

        const response = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-csrf-token': token
            },
            credentials: 'include'
        });

        return response.ok;
    }

    function injectButtons() {
        // Find profile links to locate each friend's card
        const userLinks = document.querySelectorAll('a[href*="/users/"]');

        userLinks.forEach(link => {
            const href = link.getAttribute('href') || '';
            const match = href.match(/\/users\/(\d+)\//);
            if (!match) return;

            const userId = match[1];

            // Find the closest parent container (friend card)
            const card = link.closest('.avatar-card-container, .friend-card, .list-item, [class*="card"]') || link.parentElement;
            if (!card || card.querySelector('.instant-unfriend-btn')) return;

            // Create red unfriend button
            const btn = document.createElement('button');
            btn.className = 'instant-unfriend-btn';
            btn.innerText = '✕';
            btn.title = 'Instant Unfriend';

            Object.assign(btn.style, {
                backgroundColor: '#e74c3c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginLeft: '8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: '0',
                zIndex: '999'
            });

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                btn.innerText = '...';
                btn.style.backgroundColor = '#7f8c8d';

                const success = await unfriendUser(userId);

                if (success) {
                    // Visually remove the friend card from screen
                    card.style.transition = 'all 0.3s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';
                    setTimeout(() => card.remove(), 300);
                } else {
                    btn.innerText = '✕';
                    btn.style.backgroundColor = '#e74c3c';
                    alert('Failed to unfriend. Try refreshing the page.');
                }
            });

            // Insert button inside the card next to user info
            const targetContainer = card.querySelector('.avatar-card-caption, .friend-card-caption') || card;
            targetContainer.appendChild(btn);
        });
    }

    // Watch for dynamic infinite scroll updates
    const observer = new MutationObserver(() => injectButtons());
    observer.observe(document.body, { childList: true, subtree: true });

    // Run on initial load
    setTimeout(injectButtons, 1000);
})();
