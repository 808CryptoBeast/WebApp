const body = document.querySelector("body");
const sidebar = document.querySelector(".sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
const searchBtn = body.querySelector(".search-box");
const modeSwitch = document.querySelector(".toggle-switch");
const modeText = document.querySelector(".mode-text"); // Define modeText variable

sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("close");
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
