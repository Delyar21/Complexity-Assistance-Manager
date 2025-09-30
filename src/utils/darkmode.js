// Theme management
      function toggleTheme() {
        const root = document.documentElement;
        const currentTheme = root.getAttribute("data-theme");
        const newTheme = currentTheme === "dark" ? "light" : "dark";

        root.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);

        // Update button icons
        const sunIcon = document.querySelector(".sun-icon");
        const moonIcon = document.querySelector(".moon-icon");

        if (newTheme === "dark") {
          sunIcon.style.display = "none";
          moonIcon.style.display = "block";
        } else {
          sunIcon.style.display = "block";
          moonIcon.style.display = "none";
        }
      }

      // Initialize theme on page load
      function initializeTheme() {
        const savedTheme = localStorage.getItem("theme") || "light";
        const root = document.documentElement;
        root.setAttribute("data-theme", savedTheme);

        // Set initial icon state
        const sunIcon = document.querySelector(".sun-icon");
        const moonIcon = document.querySelector(".moon-icon");

        if (savedTheme === "dark") {
          sunIcon.style.display = "none";
          moonIcon.style.display = "block";
        } else {
          sunIcon.style.display = "block";
          moonIcon.style.display = "none";
        }
      }