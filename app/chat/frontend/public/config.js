// Runtime configuration for GitHub Pages deployment
// This file is loaded before the app bundle and sets the API backend URL
window.__APP_CONFIG__ = {
  // Frontend is at chat.neevs.io (GitHub Pages)
  // Backend needs a different subdomain (e.g., api.neevs.io or backend.neevs.io)
  apiBaseUrl: 'https://api.neevs.io', // Update this to your backend URL
};
