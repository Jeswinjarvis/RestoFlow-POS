// config.js

// --- Google App Script Configuration ---
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwsLmzqidAvx-abkoizx6idSrjKbZkLpgX5t3kKiJ5TgQZ6QCtyeql89W0HZWHbdVg/exec";
const API_SECRET = "ICH_SECURE_KEY_2024_DBL";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyASYBAcsjnCI_L-97TGJtI_B1ZTg87RHuw",
    authDomain: "indiancoffeehouse-tallaght.firebaseapp.com",
    databaseURL: "https://indiancoffeehouse-tallaght-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "indiancoffeehouse-tallaght",
    storageBucket: "indiancoffeehouse-tallaght.firebasestorage.app",
    messagingSenderId: "956571989086",
    appId: "1:956571989086:web:bad5627d41bba8513030cf"
};

// --- Firebase Initialization Helper ---
// Only initializes if firebase is loaded and not already initialized
function initFirebase() {
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    } else if (typeof firebase !== 'undefined' && firebase.apps.length) {
        // Already initialized
        return firebase.app(); // Return existing app
    } else {
        console.warn("Firebase SDK not loaded.");
    }
}

// Auto-initialize if script is loaded defer/async
if (typeof firebase !== 'undefined') {
    initFirebase();
} else {
    window.addEventListener('load', () => initFirebase());
}
