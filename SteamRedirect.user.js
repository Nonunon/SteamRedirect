// ==UserScript==
// @name         SteamRedirect Button
// @namespace    https://steamredirect.hi-nonunon.workers.dev
// @version      1.5
// @description  Adds a button to redirect Steam Workshop links to the custom SteamRedirect page
// @match        *://steamcommunity.com/sharedfiles/filedetails/?id=*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    const url = window.location.href;
    const match = url.match(/steamcommunity\.com\/sharedfiles\/filedetails\/\?id=(\d+)/);

    if (match && match[1]) {
        const workshopId = match[1];
        const normalUrl = `https://steamredirect.hi-nonunon.workers.dev/?id=${workshopId}`;
        const fastUrl   = `https://steamredirect.hi-nonunon.workers.dev/?id=${workshopId}&fast`;

        // Styles 
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

        // Wrapper 
        const wrapper = document.createElement('div');
        wrapper.id = 'sr-wrapper';

        // Main button 
        const mainBtn = document.createElement('button');
        mainBtn.id = 'sr-main-btn';
        mainBtn.textContent = 'SteamRedirect';
        mainBtn.addEventListener('click', () => {
            window.location.href = normalUrl;
        });

        // Dropdown 
        const dropdown = document.createElement('div');
        dropdown.id = 'sr-dropdown';

        // Fast Redirect
        const fastItem = document.createElement('button');
        fastItem.className = 'sr-item sr-fast';
        fastItem.textContent = 'Fast Redirect';
        fastItem.addEventListener('click', () => {
            window.location.href = fastUrl;
        });

        // Divider
        const divider1 = document.createElement('div');
        divider1.className = 'sr-divider';

        // Copy Link
        const copyItem = document.createElement('button');
        copyItem.className = 'sr-item sr-copy';
        copyItem.textContent = 'Copy Redirect Link';

        // Copy Fast Link
        const copyFastItem = document.createElement('button');
        copyFastItem.className = 'sr-item sr-copy';
        copyFastItem.textContent = 'Copy Fast Redirect Link';

        // Feedback line (shared, reused for both copy buttons)
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

        // Hover logic 
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

        // Assemble 
        wrapper.appendChild(mainBtn);
        wrapper.appendChild(dropdown);
        document.body.appendChild(wrapper);
    }
})();
