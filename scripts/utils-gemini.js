/**
 * @fileoverview API Keys & Model Authentication Utility
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 * @license Proprietary - All rights reserved.
 */

const Gemini = {
    getApiKey() {
        return localStorage.getItem('gemini_api_key');
    },

    getOpenRouterKey() {
        return localStorage.getItem('openrouter_api_key') || '';
    },

    getInworldKey() {
        return localStorage.getItem('inworld_api_key') || '';
    }
};
