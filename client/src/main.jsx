import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

console.log("main.jsx script executing");
const rootElement = document.getElementById('root');
console.log("Root element found:", rootElement);

try {
    ReactDOM.createRoot(rootElement).render(
        <App />
    )
    console.log("React mount completed without throwing synchronously.");
} catch (e) {
    console.error("Fatal error mounting React app:", e);
}
