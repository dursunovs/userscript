// ==UserScript==
// @name         Roblox Unfriend Button
// @namespace    http://tampermonkey.net/
// @version      12.0
// @description  Adds simple red unfriend button to friends list.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function addUnfriendButtons() {
        // Target friend cards specifically on the page
        const cards = document.querySelectorAll('.friend-card, .avatar-card-container, .list-item');

        cards.forEach(card => {
            if (card.querySelector('.instant-del-btn')) return;

            const link = card.querySelector('a[href*="/users/"]');
            if (!link) return;

            const href = link.getAttribute('href') || '';
            const match = href.match(/\/users\/(\d+)\//);
            if (!match) return;

            const userId = match[1];

            const btn = document.createElement('button');
            btn.className = 'instant-del-btn';
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
                zIndex: '999'
            });

            if (getComputedStyle(card).position === 'static') {
                card.style.position = 'relative';
            }

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                btn.innerText = '...';

                // Get current meta CSRF token directly from page HTML
                const meta = document.querySelector('meta[name="csrf-token"]');
                const token = meta ? meta.getAttribute('data-token') || meta.getAttribute('content') : '';

                try {
                    const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/unfriend`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': token
                        },
                        credentials: 'include'
                    });

                    if (res.ok) {
                        card.style.opacity = '0.2';
                        btn.remove();
                    } else {
                        btn.innerText = '✕';
                    }
                } catch (err) {
                    btn.innerText = '✕';
                }
            });

            card.appendChild(btn);
        });
    }

    // Run periodically to catch newly scrolled cards
    setInterval(addUnfriendButtons, 1000);
})();
