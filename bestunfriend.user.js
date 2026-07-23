// ==UserScript==
// @name         Roblox Instant Unfriend (Sorted by Longest Inactive)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Sorts friends by longest time offline and provides instant unfriend functionality.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    let cachedCsrfToken = null;
    const userPresenceCache = new Map(); // Stores userId -> lastOnline timestamp

    // Fetch CSRF token for API requests
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

    // Call API to unfriend
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

    // Query Roblox Presence API for exact 'lastOnline' dates in batch
    async function fetchLastOnlineBatch(userIds) {
        const missingIds = userIds.filter(id => !userPresenceCache.has(id));
        if (missingIds.length === 0) return;

        try {
            const res = await fetch('https://presence.roblox.com/v1/presence/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userIds: missingIds })
            });

            if (!res.ok) return;

            const data = await res.json();
            if (data && data.userPresences) {
                data.userPresences.forEach(presence => {
                    // Convert lastOnline string to Epoch timestamp for easy numerical sorting
                    const time = presence.lastOnline ? new Date(presence.lastOnline).getTime() : 0;
                    userPresenceCache.set(String(presence.userId), time);
                });
            }
        } catch (err) {
            console.error('Error fetching presences:', err);
        }
    }

    // Sort displayed cards by oldest 'lastOnline' time
    async function sortCardsByInactive() {
        const containers = document.querySelectorAll('.hlist, .friends-content, [class*="friends-list"]');

        for (const container of containers) {
            const cards = Array.from(container.children);
            if (cards.length < 2) continue;

            // Extract all User IDs currently in this list section
            const cardDataList = cards.map(card => {
                const link = card.querySelector('a[href*="/users/"]');
                const match = link ? (link.getAttribute('href') || '').match(/\/users\/(\d+)\//) : null;
                return {
                    card,
                    userId: match ? match[1] : null
                };
            }).filter(item => item.userId !== null);

            const userIds = cardDataList.map(item => parseInt(item.userId, 10));
            await fetchLastOnlineBatch(userIds);

            // Sort ascending: lower timestamp = older/longer time since last seen
            cardDataList.sort((a, b) => {
                const timeA = userPresenceCache.get(a.userId) || 0;
                const timeB = userPresenceCache.get(b.userId) || 0;
                return timeA - timeB;
            });

            // Re-append DOM nodes in sorted order
            cardDataList.forEach(item => {
                container.appendChild(item.card);
            });
        }
    }

    // Inject buttons onto friend cards
    function injectButtons() {
        const cards = document.querySelectorAll('.list-item, .friend-card, [class*="friend-card"], .avatar-card-container');

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
                    btn.innerText = '✕';
                    btn.style.backgroundColor = '#e74c3c';
                }
            });

            card.appendChild(btn);
        });

        sortCardsByInactive();
    }

    const observer = new MutationObserver(() => injectButtons());
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(injectButtons, 500);
})();
