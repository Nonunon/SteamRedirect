// ==UserScript==
// @name         Steam Workshop Redirect Button
// @namespace    https://steamredirect.hi-nonunon.workers.dev
// @version      1.3
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

        // Create the redirect button
        const button = document.createElement('button');
        button.textContent = 'SteamRedirect';
        
        // Style the button with the specified design
        button.style.position = 'fixed';
        button.style.top = '10px';
        button.style.right = '10px';
        button.style.padding = '8px 12px';
        button.style.background = 'linear-gradient(135deg, #4a8a4f, #66b266)'; // Muted green to normal green gradient
        button.style.color = '#ffffff';
        button.style.fontFamily = 'Arial, sans-serif'; // Common, widely supported font
        button.style.fontWeight = 'bold'; // Bold text
        button.style.fontSize = '14px';
        button.style.border = '1px solid black'; // Small black border
        button.style.borderRadius = '5px';
        button.style.boxShadow = '2px 2px 5px rgba(0, 0, 0, 0.3)'; // Subtle shadow
        button.style.cursor = 'pointer';
        button.style.zIndex = '1000';

        // Append the button to the body
        document.body.appendChild(button);

        // Add click event to the button to perform the redirect
        button.addEventListener('click', function() {
            window.location.href = redirectUrl;
        });
    }
})();
