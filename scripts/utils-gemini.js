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
        return 'cXpIamdtOXpLa1F0dDFuNVVyeVg0MVdoUVZHUUhyNGc6bEptVnpuc0R5aEtSTXpnOVF2a3dRbDd6QnNIYXliazdmMmJLUlNOem5Tc2dPYjRDQkRuRzNTWFQ2dWo1enpUdQ==';
    }
};
