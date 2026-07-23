// ==UserScript==
// @name         Roblox Unfriend (Hard Lock Page Position)
// @namespace    http://tampermonkey.net/
// @version      17.0
// @description  Hard-locks Roblox pagination state, removes grid gaps, and unfriends instantly.
// @match        https://www.roblox.com/users/*/friends*
// @match        https://www.roblox.com/users/friends*
// @match        https://web.roblox.com/users/*/friends*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let cachedCsrfToken = null;
    let lockedPageNumber = 1;

    // Track active page number from UI clicks
    document.addEventListener('click', (e) => {
        const pageBtn = e.target.closest('.pager a, .pagination a, [class*="pager"] a, .page-num');
        if (pageBtn) {
            const num = parseInt(pageBtn.innerText.trim(), 10);
            if (!isNaN(num) && num > 0) {
                lockedPageNumber = num;
                sessionStorage.setItem('rbx_locked_page', num);
            }
        }
    }, true);

    // Initialize locked page from stored state
    const saved = sessionStorage.getItem('rbx_locked_page');
    if (saved) {
        lockedPageNumber = parseInt(saved, 10) || 1;
    }

    // Get CSRF Token
    function getCsrfToken() {
        if (cachedCsrfToken) return cachedCsrfToken;
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) {
            cachedCsrfToken = meta.getAttribute('data-token') || meta.getAttribute('content');
        }
        return cachedCsrfToken || '';
    }

    // Direct unfriend request
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

    // Force UI back to locked page if Roblox resets it automatically
    function enforcePageLock() {
        if (lockedPageNumber <= 1) return;

        const activeBtn = document.querySelector('.pager .active, .pagination .active, [class*="pager"] .active');
        const currentUIPage = activeBtn ? parseInt(activeBtn.innerText.trim(), 10) : 1;

        if (currentUIPage === 1 && lockedPageNumber > 1) {
            const allPageBtns = Array.from(document.querySelectorAll('.pager a, .pagination a, [class*="pager"] a'));
            const targetBtn = allPageBtns.find(b => parseInt(b.innerText.trim(), 10) === lockedPageNumber);

            if (targetBtn) {
                targetBtn.click();
            }
        }
    }

    function scanAndAttach() {
        enforcePageLock();

        const cards = document.querySelectorAll('.friend-card, .avatar-card-container, .list-item');

        cards.forEach(card => {
            // Ignore headers/navbars or already injected buttons
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

            // Isolate touch/pointer events from propagating to parent links
            ['touchstart', 'mousedown', 'pointerdown'].forEach(evtType => {
                btn.addEventListener(evtType, (e) => e.stopPropagation());
            });

            btn.onclick = async function(e) {
                e.preventDefault();
                e.stopPropagation();

                btn.innerText = '...';
                btn.style.backgroundColor = '#7f8c8d';

                const success = await unfriendUser(userId);

                if (success) {
                    // Lock active page immediately upon click
                    const activeBtn = document.querySelector('.pager .active, .pagination .active, [class*="pager"] .active');
                    if (activeBtn) {
                        const num = parseInt(activeBtn.innerText.trim(), 10);
                        if (!isNaN(num)) lockedPageNumber = num;
                    }

                    // Target outermost element to eliminate blank hole in grid
                    const outerWrapper = card.closest('li, .list-item') || card;

                    outerWrapper.style.transition = 'all 0.15s ease';
                    outerWrapper.style.opacity = '0';
                    outerWrapper.style.transform = 'scale(0.8)';

                    setTimeout(() => {
                        outerWrapper.style.display = 'none';
                    }, 150);
                } else {
                    btn.innerText = '✕';
                    btn.style.backgroundColor = '#e74c3c';
                }
            };

            card.appendChild(btn);
        });
    }

    setInterval(scanAndAttach, 400);
})();
