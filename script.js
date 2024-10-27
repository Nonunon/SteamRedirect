// Extract the Steam Workshop ID from URL query string
const urlParams = new URLSearchParams(window.location.search);
const itemId = urlParams.get('id');

// Function to update Open Graph tags
function updateOpenGraph(title, description) {
    const ogTitleMeta = document.querySelector('meta[property="og:title"]');
    const ogDescriptionMeta = document.querySelector('meta[property="og:description"]');
    const ogUrlMeta = document.querySelector('meta[property="og:url"]');

    ogTitleMeta.setAttribute('content', title);
    ogDescriptionMeta.setAttribute('content', description);
    ogUrlMeta.setAttribute('content', `https://nonunon.github.io/SteamRedirect${itemId ? `/?id=${itemId}` : ''}`);
}

// Check if a valid item ID is present
if (itemId) {
    if (!isNaN(itemId) && itemId.trim() !== "") {
        // Update Open Graph tags for valid Workshop ID
        updateOpenGraph(`SteamRedirect - ${itemId}`, `Redirect for Workshop ID ${itemId}`);

        // Directly use Steam protocol to open the item in the Steam client
        window.location.href = `steam://url/CommunityFilePage/${itemId}`;

        // Display a countdown timer with cancel option
        const linkSection = document.getElementById('link-section');
        let countdown = 10; // Starting countdown at 10 seconds
        let redirectEnabled = true; // Flag to control redirection

        // Initial message with item ID as a link and cancel option
        linkSection.innerHTML = `
            <p>Opening <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${itemId}" target="_blank"><strong>Workshop Item ${itemId}</strong></a> in Steam...</p>
            <p id="redirect-message">Redirecting to the workshop page in <span id="countdown">${countdown}</span> seconds. <a href="#" id="cancelRedirect">Cancel Redirect</a></p>
        `;

        // Countdown function to update the text every second
        const countdownInterval = setInterval(() => {
            if (redirectEnabled) {
                countdown--;
                document.getElementById('countdown').innerText = countdown;

                // Redirect to workshop link when countdown reaches 0
                if (countdown === 0) {
                    clearInterval(countdownInterval);
                    window.location.href = `https://steamcommunity.com/sharedfiles/filedetails/?id=${itemId}`;
                }
            }
        }, 1000);

        // Add click event listener to cancel the redirect
        document.getElementById('cancelRedirect').addEventListener('click', (event) => {
            event.preventDefault(); // Prevent default link behavior
            redirectEnabled = false; // Stop the countdown
            clearInterval(countdownInterval); // Stop the countdown timer

            // Replace the countdown message with "Redirect Canceled"
            document.getElementById('redirect-message').innerText = "Redirect Canceled";
        });

    } else {
        // Invalid ID handling - Open Graph tags set to default
        updateOpenGraph("SteamRedirect", "Invalid or missing Workshop ID provided for redirection.");
    }
} else {
    // No ID provided - default Open Graph tags
    updateOpenGraph("SteamRedirect", "Redirects Steam Workshop links for use in Discord where steam:// links are restricted.");
}
