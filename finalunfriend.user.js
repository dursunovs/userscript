// ==UserScript==
// @name         Roblox Instant Unfriend (Zero-Crash Reflow)
// @namespace    http://tampermonkey.net/
// @version      20.0
// @description  Unfriends instantly, fills the grid gap, and prevents React from crashing back to Page 1.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let cachedCsrfToken = null;

    // Grab the security token needed to tell Roblox you are authorized to unfriend
    function getCsrfToken() {
        if (cachedCsrfToken) return cachedCsrfToken;
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) {
            cachedCsrfToken = meta.getAttribute('data-token') || meta.getAttribute('content');
        }
        return cachedCsrfToken || '';
    }

    // Call the Unfriend API
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

            // If the token is stale, Roblox sends a new one back. Catch it and retry instantly.
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

    // Aggressively swallow all interactions so Roblox's background scripts never notice the click
    function devourEvent(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }

    function scanAndAttach() {
        // Target the friend cards on the screen
        const cards = document.querySelectorAll('.friend-card, .avatar-card-container, .list-item');

        cards.forEach(card => {
            // Ignore the top search/robux bar and any card we already injected
            if (card.closest('header, nav, .navbar, .header-container') || card.querySelector('.instant-unfriend-btn')) {
                return;
            }

            const link = card.querySelector('a[href*="/users/"]');
            if (!link) return;

            const href = link.getAttribute('href') || '';
            const match = href.match(/\/users\/(\d+)/);
            if (!match) return;

            const userId = match[1];

            // Build the button
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

            // Bind the event devourer to every type of tap/click using the capture phase (true)
            ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'].forEach(evtType => {
                btn.addEventListener(evtType, devourEvent, true);
            });

            // The actual logic when you tap the button
            btn.addEventListener('click', async (e) => {
                btn.innerText = '...';
                btn.style.backgroundColor = '#7f8c8d';

                const success = await unfriendUser(userId);

                if (success) {
                    // Find the absolute outermost boundary of the friend card
                    const outerWrapper = card.closest('li, .list-item') || card;

                    // Fade out smoothly
                    outerWrapper.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                    outerWrapper.style.opacity = '0';
                    outerWrapper.style.transform = 'scale(0.5)';

                    // Instead of deleting the code, we crush it to 0 pixels and rip it out of the flow.
                    // This forces the grid to close the gap without triggering a React page reset.
                    setTimeout(() => {
                        outerWrapper.style.position = 'absolute';
                        outerWrapper.style.width = '0px';
                        outerWrapper.style.height = '0px';
                        outerWrapper.style.margin = '0px';
                        outerWrapper.style.padding = '0px';
                        outerWrapper.style.overflow = 'hidden';
                        outerWrapper.style.pointerEvents = 'none';
                    }, 200);

                } else {
                    // Revert if API fails
                    btn.innerText = '✕';
                    btn.style.backgroundColor = '#e74c3c';
                }
            }, true);

            card.appendChild(btn);
        });
    }

    // Run constantly to catch new pages loading in
    setInterval(scanAndAttach, 500);
})();
