// ==UserScript==
// @name         Roblox Instant Unfriend (Strict Scope & Soft Hide)
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  Prevents header button leaks, stops page resets by soft-hiding cards, and sorts active friends on screen.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    let cachedCsrfToken = null;

    // Fetch Roblox CSRF Token for unfriend API call
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

    // Call unfriend API endpoint
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

    // Identify if a card is Online or In-Game
    function getPriority(card) {
        const text = card.innerText || '';
        const hasOnlineIcon = card.querySelector('.icon-online, .icon-game, [class*="online"], [class*="game"]');
        
        if (hasOnlineIcon || text.includes('In-Game') || text.includes('Playing')) return 0;
        if (text.includes('Online')) return 1;
        return 2;
    }

    // Sort cards currently loaded in the active grid
    function sortLoadedCards(container) {
        const cards = Array.from(container.children).filter(child => {
            return child.matches('.list-item, .friend-card, .avatar-card-container, [class*="friend-card"]');
        });

        if (cards.length < 2) return;

        cards.sort((a, b) => getPriority(a) - getPriority(b));
        cards.forEach(card => container.appendChild(card));
    }

    function processFriends() {
        // STRICT SCOPING: Only look inside the main friends section, ignoring navigation headers
        const mainSection = document.querySelector('.friends-content, #rbx-friends-container, .friends-list');
        if (!mainSection) return;

        const cards = mainSection.querySelectorAll('.list-item, .friend-card, .avatar-card-container, [class*="friend-card"]');

        cards.forEach(card => {
            // Ignore cards inside header/navigation bars or already processed cards
            if (card.closest('header, nav, .navbar, .navigation-container') || card.classList.contains('has-instant-btn')) {
                return;
            }

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
                width: '24px',
                height: '24px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                position: 'absolute',
                top: '6px',
                right: '6px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: '999'
            });

            if (getComputedStyle(card).position === 'static') {
                card.style.position = 'relative';
            }

            // Stop click/touch bubbling completely to avoid triggering Roblox event listeners
            ['touchstart', 'touchend', 'mousedown', 'mouseup', 'pointerdown'].forEach(evt => {
                btn.addEventListener(evt, (e) => e.stopPropagation(), { passive: true });
            });

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                btn.innerText = '...';
                btn.style.backgroundColor = '#7f8c8d';

                const success = await unfriendUser(userId);

                if (success) {
                    card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';

                    // SOFT HIDE: Hide visually without deleting from DOM so Roblox page position stays stable
                    setTimeout(() => {
                        card.style.display = 'none';
                        card.style.visibility = 'hidden';
                    }, 200);
                } else {
                    btn.innerText = '✕';
                    btn.style.backgroundColor = '#e74c3c';
                }
            });

            card.appendChild(btn);
        });

        // Find grid containers and re-order cards currently present
        const grids = mainSection.querySelectorAll('.hlist, [class*="friends-list"], .avatar-cards');
        grids.forEach(grid => sortLoadedCards(grid));
    }

    const observer = new MutationObserver(() => processFriends());
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(processFriends, 500);
})();
