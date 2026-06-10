// ==UserScript==
// @name         Steam Workshop Redirect Button
// @namespace    https://steamredirect.hi-nonunon.workers.dev
// @version      1.4
// @description  Adds a button to redirect Steam Workshop links to the custom SteamRedirect page
// @match        *://steamcommunity.com/sharedfiles/filedetails/?id=*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // Extract the Workshop ID from the URL
    const url = window.location.href;
    const match = url.match(/steamcommunity\.com\/sharedfiles\/filedetails\/\?id=(\d+)/);

    if (match && match[1]) {
        const workshopId = match[1];
        const redirectUrl = `https://steamredirect.hi-nonunon.workers.dev/?id=${workshopId}`;
        const fastUrl    = `https://steamredirect.hi-nonunon.workers.dev/?id=${workshopId}&fast`;

        // Wrapper (positions the button + dropdown together)
        const wrapper = document.createElement('div');
        wrapper.style.position   = 'fixed';
        wrapper.style.top        = '10px';
        wrapper.style.right      = '10px';
        wrapper.style.zIndex     = '1000';
        wrapper.style.display    = 'inline-block';

        // Main button
        const button = document.createElement('button');
        button.textContent           = 'SteamRedirect';
        button.style.display         = 'block';
        button.style.width           = '100%';
        button.style.padding         = '8px 12px';
        button.style.background      = 'linear-gradient(135deg, #4a8a4f, #66b266)';
        button.style.color           = '#ffffff';
        button.style.fontFamily      = 'Arial, sans-serif';
        button.style.fontWeight      = 'bold';
        button.style.fontSize        = '14px';
        button.style.border          = '1px solid black';
        button.style.borderRadius    = '5px';
        button.style.boxShadow       = '2px 2px 5px rgba(0, 0, 0, 0.3)';
        button.style.cursor          = 'pointer';
        button.style.whiteSpace      = 'nowrap';

        button.addEventListener('click', () => {
            window.location.href = redirectUrl;
        });

        // Dropdown
        const dropdown = document.createElement('div');
        dropdown.style.display      = 'none';
        dropdown.style.position     = 'absolute';
        dropdown.style.top          = '100%';
        dropdown.style.right        = '0';
        dropdown.style.marginTop    = '2px';
        dropdown.style.background   = '#1b2838';
        dropdown.style.border       = '1px solid black';
        dropdown.style.borderRadius = '5px';
        dropdown.style.boxShadow    = '2px 2px 5px rgba(0, 0, 0, 0.4)';
        dropdown.style.overflow     = 'hidden';
        dropdown.style.whiteSpace   = 'nowrap';

        const fastItem = document.createElement('button');
        fastItem.textContent           = '⚡ Fast Redirect';
        fastItem.style.display         = 'block';
        fastItem.style.width           = '100%';
        fastItem.style.padding         = '8px 12px';
        fastItem.style.background      = 'transparent';
        fastItem.style.color           = '#66c0f4';
        fastItem.style.fontFamily      = 'Arial, sans-serif';
        fastItem.style.fontWeight      = 'bold';
        fastItem.style.fontSize        = '13px';
        fastItem.style.border          = 'none';
        fastItem.style.cursor          = 'pointer';
        fastItem.style.textAlign       = 'left';

        fastItem.addEventListener('mouseenter', () => {
            fastItem.style.background = '#2a475e';
        });
        fastItem.addEventListener('mouseleave', () => {
            fastItem.style.background = 'transparent';
        });
        fastItem.addEventListener('click', () => {
            window.location.href = fastUrl;
        });

        dropdown.appendChild(fastItem);

        // Use a small delay so the dropdown doesn't flicker when moving the mouse between the button and the dropdown itself.
        let hideTimer;

        const showDropdown = () => {
            clearTimeout(hideTimer);
            dropdown.style.display = 'block';
        };
        const hideDropdown = () => {
            hideTimer = setTimeout(() => {
                dropdown.style.display = 'none';
            }, 120);
        };

        wrapper.addEventListener('mouseenter', showDropdown);
        wrapper.addEventListener('mouseleave', hideDropdown);

        // Assemble
        wrapper.appendChild(button);
        wrapper.appendChild(dropdown);
        document.body.appendChild(wrapper);
    }
})();
