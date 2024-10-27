// Extract the Steam Workshop ID from URL query string
const urlParams = new URLSearchParams(window.location.search);
const itemId = urlParams.get('id');

// Function to fetch data from the Cloudflare Worker
async function fetchWorkshopData(workshopId) {
    const workerUrl = `https://steamredirect.hi-nonunon.workers.dev/?id=${workshopId}`;
    
    try {
        const response = await fetch(workerUrl);
        if (!response.ok) throw new Error("Failed to fetch Workshop data.");

        const data = await response.json();

        // Update link-section content with fetched data
        const linkSection = document.getElementById('link-section');
        linkSection.innerHTML = `
            <p>Opening <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}" target="_blank">
            <strong>${data.title || "Workshop Item"}</strong></a> in Steam...</p>
            <img src="${data.previewImage}" alt="Preview Image" style="max-width: 100%; margin-top: 10px;" />
            <p id="redirect-message">Redirecting to the workshop page in <span id="countdown">10</span> seconds. <a href="#" id="cancelRedirect">Cancel Redirect</a></p>
        `;

        // Start countdown and redirection
        startCountdown(workshopId);
    } catch (error) {
        console.error("Error fetching data from Cloudflare Worker:", error);
        document.getElementById('link-section').innerHTML = "Failed to retrieve Workshop data. Please try again later.";
    }
}

// Function to start the countdown and handle redirection
function startCountdown(workshopId) {
    let countdown = 10;
    let redirectEnabled = true; // Flag to control redirection
    const countdownElement = document.getElementById('countdown');
    const countdownInterval = setInterval(() => {
        if (redirectEnabled) {
            countdown--;
            countdownElement.innerText = countdown;

            // Redirect to workshop link when countdown reaches 0
            if (countdown === 0) {
                clearInterval(countdownInterval);
                window.location.href = `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`;
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
}

// Main code to execute based on presence and validity of item ID
if (itemId && !isNaN(itemId)) {
    // Directly use Steam protocol to open the item in the Steam client
    window.location.href = `steam://url/CommunityFilePage/${itemId}`;

    // Fetch data from Cloudflare Worker to display content on the page
    fetchWorkshopData(itemId);

} else if (itemId === '') {
    // If ?id= is present but empty, display a message
    document.getElementById('link-section').innerText = "No Workshop ID provided.";
} else if (itemId === null) {
    // If no id parameter at all, leave link-section blank
    document.getElementById('link-section').innerText = "";
} else {
    // Display error in link section if ID is invalid; leave the title element unchanged
    document.getElementById('link-section').innerText = "Invalid Workshop ID";
}
