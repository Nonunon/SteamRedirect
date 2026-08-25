// ==UserScript==
// @name         SteamRelink Button
// @namespace    https://steamre.link
// @version      2.1
// @description  Adds a button to redirect Steam Workshop links to the custom SteamRelink page, and auto-closes SteamRelink fast-mode tabs shortly after steam:// fires (toggleable via the script manager's menu)
// @updateURL    https://raw.githubusercontent.com/Nonunon/SteamRelink/refs/heads/main/SteamRelink.user.js
// @downloadURL  https://raw.githubusercontent.com/Nonunon/SteamRelink/refs/heads/main/SteamRelink.user.js
// @match        *://steamcommunity.com/sharedfiles/filedetails/?id=*
// @match        *://steamcommunity.com/workshop/filedetails/?id=*
// @match        https://steamre.link/*
// @match        https://steamredirect.hi-nonunon.workers.dev/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        window.close
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    const FAST_CLOSE_KEY = 'sr-fast-close-enabled';
    // defaults on to preserve existing behavior; flip off via the script manager's menu
    const fastCloseEnabled = GM_getValue(FAST_CLOSE_KEY, true);

    GM_registerMenuCommand(
        fastCloseEnabled ? 'Disable Fast-Close' : 'Enable Fast-Close',
        () => {
            GM_setValue(FAST_CLOSE_KEY, !fastCloseEnabled);
            // label only updates on next page load; that's a normal
            // limitation of GM_registerMenuCommand, not a bug
        }
    );

    const hostname = window.location.hostname;

    if (hostname === 'steamcommunity.com') {
        const url = window.location.href;
        const match = url.match(/steamcommunity\.com\/(?:sharedfiles|workshop)\/filedetails\/\?id=(\d+)/);

        if (match && match[1]) {
            const workshopId = match[1];
            const normalUrl = `https://steamre.link/?id=${workshopId}`;
            const fastUrl   = `https://steamre.link/?id=${workshopId}&fast`;

            GM_addStyle(`
                #sr-wrapper {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    z-index: 9999;
                    display: inline-block;
                    font-family: Arial, sans-serif;
                }

                #sr-main-btn {
                    display: block;
                    width: 100%;
                    padding: 8px 14px;
                    background: linear-gradient(135deg, #4a8a4f, #66b266);
                    color: #ffffff;
                    font-family: Arial, sans-serif;
                    font-weight: bold;
                    font-size: 14px;
                    border: 1px solid #2a2a2a;
                    border-radius: 5px;
                    box-shadow: 2px 2px 5px rgba(0,0,0,0.35);
                    cursor: pointer;
                    white-space: nowrap;
                    text-align: center;
                }

                #sr-main-btn:hover {
                    background: linear-gradient(135deg, #559155, #70c270);
                }

                #sr-dropdown {
                    display: none;
                    position: absolute;
                    top: calc(100% + 3px);
                    right: 0;
                    min-width: 100%;
                    background: #1b2838;
                    border: 1px solid #2a2a2a;
                    border-radius: 5px;
                    box-shadow: 2px 4px 8px rgba(0,0,0,0.5);
                    overflow: hidden;
                    white-space: nowrap;
                }

                .sr-divider {
                    height: 1px;
                    background: #2a475e;
                    margin: 0;
                }

                .sr-item {
                    display: block;
                    width: 100%;
                    padding: 8px 14px;
                    background: transparent;
                    color: #c7d5e0;
                    font-family: Arial, sans-serif;
                    font-size: 13px;
                    font-weight: normal;
                    border: none;
                    cursor: pointer;
                    text-align: left;
                    box-sizing: border-box;
                }

                .sr-item:hover {
                    background: #2a475e;
                    color: #ffffff;
                }

                .sr-item.sr-fast {
                    color: #66c0f4;
                }

                .sr-item.sr-fast:hover {
                    color: #ffffff;
                }

                .sr-item.sr-copy {
                    font-size: 12px;
                    color: #8f98a0;
                }

                .sr-item.sr-copy:hover {
                    color: #ffffff;
                }

                .sr-feedback {
                    display: block;
                    padding: 5px 14px 7px;
                    font-size: 11px;
                    color: #66b266;
                    font-family: Arial, sans-serif;
                    text-align: left;
                    pointer-events: none;
                }
            `);

            const wrapper = document.createElement('div');
            wrapper.id = 'sr-wrapper';

            const mainBtn = document.createElement('button');
            mainBtn.id = 'sr-main-btn';
            mainBtn.textContent = 'SteamRelink';
            mainBtn.addEventListener('click', () => {
                window.location.href = normalUrl;
            });

            const dropdown = document.createElement('div');
            dropdown.id = 'sr-dropdown';

            const fastItem = document.createElement('button');
            fastItem.className = 'sr-item sr-fast';
            fastItem.textContent = 'Fast Redirect';
            fastItem.addEventListener('click', () => {
                window.location.href = fastUrl;
            });

            const divider1 = document.createElement('div');
            divider1.className = 'sr-divider';

            const copyItem = document.createElement('button');
            copyItem.className = 'sr-item sr-copy';
            copyItem.textContent = 'Copy Redirect Link';

            const copyFastItem = document.createElement('button');
            copyFastItem.className = 'sr-item sr-copy';
            copyFastItem.textContent = 'Copy Fast Redirect Link';

            // shared between both copy buttons below
            const feedback = document.createElement('span');
            feedback.className = 'sr-feedback';
            feedback.style.display = 'none';

            let feedbackTimer;
            const showFeedback = (msg) => {
                clearTimeout(feedbackTimer);
                feedback.textContent = msg;
                feedback.style.display = 'block';
                feedbackTimer = setTimeout(() => {
                    feedback.style.display = 'none';
                }, 2000);
            };

            copyItem.addEventListener('click', (e) => {
                e.stopPropagation();
                GM_setClipboard(normalUrl);
                showFeedback('Copied to clipboard.');
            });

            copyFastItem.addEventListener('click', (e) => {
                e.stopPropagation();
                GM_setClipboard(fastUrl);
                showFeedback('Copied to clipboard.');
            });

            dropdown.appendChild(fastItem);
            dropdown.appendChild(divider1);
            dropdown.appendChild(copyItem);
            dropdown.appendChild(copyFastItem);
            dropdown.appendChild(feedback);

            let hideTimer;
            const showDropdown = () => {
                clearTimeout(hideTimer);
                dropdown.style.display = 'block';
            };
            const hideDropdown = () => {
                hideTimer = setTimeout(() => {
                    dropdown.style.display = 'none';
                    feedback.style.display = 'none';
                }, 150);
            };

            wrapper.addEventListener('mouseenter', showDropdown);
            wrapper.addEventListener('mouseleave', hideDropdown);

            wrapper.appendChild(mainBtn);
            wrapper.appendChild(dropdown);
            document.body.appendChild(wrapper);
        }
    } else if (hostname === 'steamre.link' || hostname === 'steamredirect.hi-nonunon.workers.dev') {
        if (!fastCloseEnabled) return;

        // empirical, not documented: 150ms works reliably in practice. If
        // steam:// starts silently failing to launch, raise this before
        // assuming something else broke.
        const CLOSE_DELAY_MS = 150;

        const params = new URLSearchParams(window.location.search);
        const isRedirectPage = params.has('id');
        const isFast = params.has('fast');

        if (isRedirectPage && isFast) {
            setTimeout(() => {
                window.close();
            }, CLOSE_DELAY_MS);
        }
    }
})();
