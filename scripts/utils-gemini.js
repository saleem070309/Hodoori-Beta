/**
 * API Keys Utility - OpenRouter & Inworld
 */

const Gemini = {
    getApiKey() {
        return localStorage.getItem('gemini_api_key');
    },

    getOpenRouterKey() {
        return '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';
    },

    getInworldKey() {
        return '';
    }
};
