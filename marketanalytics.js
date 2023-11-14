const body = document.querySelector("body");
const sidebar = document.querySelector(".sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
const searchBtn = body.querySelector(".search-box");
const modeSwitch = document.querySelector(".toggle-switch");
const modeText = document.querySelector(".mode-text");
const backgroundVideo = document.getElementById("backgroundVideo");
const home = document.querySelector(".home");
const videoContainer = document.querySelector(".video-container");

sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("close");

    const isSidebarOpen = sidebar.classList.contains("close");
    const newSidebarWidth = isSidebarOpen ? "88px" : "250px";
    const newContentWidth = isSidebarOpen ? "calc(100% - 88px)" : "calc(100% - 250px)";

    sidebar.style.width = newSidebarWidth;
    home.style.width = newContentWidth;

    if (isSidebarOpen) {
        // Adjust video and background styles when the sidebar is closed
        videoContainer.style.width = "100%";
        backgroundVideo.style.width = "100%";
    } else {
        // Adjust video and background styles when the sidebar is open
        videoContainer.style.width = "calc(100% + 250px)";
        backgroundVideo.style.width = "calc(100% + 250px)";
    }
});

searchBtn.addEventListener("click", () => {
    sidebar.classList.remove("close");
});

modeSwitch.addEventListener("click", () => {
    body.classList.toggle("dark");

    if (body.classList.contains("dark")) {
        modeText.innerText = "Light Mode";
    } else {
        modeText.innerText = "Dark Mode";
    }
});
