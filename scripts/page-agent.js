/**
 * @fileoverview Dedicated Controller for AI Agent Page (agent.html)
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 */

(function (window, document) {
    'use strict';

    // ─── Voice Recognition State ───
    let recognition = null;
    let isRecording = false;
    let isStarting = false;
    let forceStop = false;
    let accumulatedText = '';
    let autoRestartCount = 0;
    const MAX_AUTO_RESTARTS = 3;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // ─── Unified Capsule Action State Machine (Mic / Send / Stop / Recording) ───
    window.setCapsuleActionState = function (state) {
        const btn = document.getElementById('agent-action-btn');
        const svg = document.getElementById('capsule-dynamic-icon') || btn?.querySelector('svg');
        if (!btn) return;

        btn.classList.remove('state-idle', 'state-mic', 'state-recording', 'state-send', 'state-stop');

        if (state === 'recording') {
            btn.classList.add('state-recording');
            btn.title = 'إيقاف التسجيل الصوتي';
            btn.dataset.actionState = 'recording';
            if (typeof Morphicons !== 'undefined' && svg) {
                Morphicons.morph(svg, 'Circle');
            }
        } else if (state === 'stop' || state === 'streaming') {
            btn.classList.add('state-stop');
            btn.title = 'إيقاف التوليد';
            btn.dataset.actionState = 'stop';
            if (typeof Morphicons !== 'undefined' && svg) {
                Morphicons.morph(svg, 'Square');
            }
        } else if (state === 'send' || state === 'typing') {
            btn.classList.add('state-send');
            btn.title = 'إرسال';
            btn.dataset.actionState = 'send';
            if (typeof Morphicons !== 'undefined' && svg) {
                Morphicons.morph(svg, 'ArrowUp');
            }
        } else {
            btn.classList.add('state-idle');
            btn.title = 'تحدث بصوتك';
            btn.dataset.actionState = 'mic';
            if (typeof Morphicons !== 'undefined' && svg) {
                Morphicons.morph(svg, 'Mic');
            }
        }
    };

    window.syncCapsuleActionState = function () {
        if (typeof Agent !== 'undefined' && Agent.isStreaming) {
            window.setCapsuleActionState('stop');
            return;
        }
        if (typeof isRecording !== 'undefined' && isRecording) {
            window.setCapsuleActionState('recording');
            return;
        }
        const input = document.getElementById('agent-input');
        const hasText = input && input.value.trim().length > 0;
        if (hasText) {
            window.setCapsuleActionState('send');
        } else {
            window.setCapsuleActionState('mic');
        }
    };

    window.handleUnifiedCapsuleAction = function () {
        const btn = document.getElementById('agent-action-btn');
        const state = btn?.dataset.actionState || 'mic';

        if (state === 'stop') {
            if (typeof Agent !== 'undefined') Agent.stopGeneration();
        } else if (state === 'send') {
            if (typeof Agent !== 'undefined' && !Agent.isStreaming) {
                Agent.sendMessage();
            }
        } else if (state === 'recording') {
            window.stopVoiceRecognition();
        } else {
            window.startVoiceRecognition();
        }
    };

    // ─── Voice Recognition Functions ───
    window.startVoiceRecognition = function () {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            if (typeof UI !== 'undefined' && typeof UI.toast === 'function') {
                UI.toast('التعرف الصوتي غير مدعوم في هذا المتصفح', 'warning');
            }
            return;
        }

        if (isStarting || isRecording) return;
        isStarting = true;
        forceStop = false;
        accumulatedText = '';
        autoRestartCount = 0;

        try {
            if (recognition) {
                recognition.onend = null;
                recognition.onerror = null;
                try { recognition.abort(); } catch (_) {}
            }

            recognition = new SpeechRecognition();
            recognition.lang = 'ar-JO';
            recognition.continuous = !isMobile;
            recognition.interimResults = true;
            recognition.maxAlternatives = 1;

            recognition.onstart = () => {
                isStarting = false;
                isRecording = true;
                window.setCapsuleActionState('recording');
            };

            recognition.onresult = (e) => {
                let finalTranscript = '';
                let interimTranscript = '';

                for (let i = e.resultIndex; i < e.results.length; i++) {
                    const transcript = e.results[i][0].transcript;
                    if (e.results[i].isFinal) {
                        finalTranscript += transcript + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }

                if (finalTranscript) {
                    accumulatedText += finalTranscript;
                }

                const currentFullText = (accumulatedText + interimTranscript).trim();
                const input = document.getElementById('agent-input');
                if (input && currentFullText) {
                    input.value = currentFullText;
                    window.handleInputTyping(input);
                }
            };

            recognition.onerror = (e) => {
                if (e.error !== 'no-speech' && e.error !== 'aborted') {
                    console.warn('Speech Recognition Error:', e.error);
                }
            };

            recognition.onend = () => {
                isStarting = false;
                if (!forceStop && isMobile && autoRestartCount < MAX_AUTO_RESTARTS) {
                    autoRestartCount++;
                    try {
                        recognition.start();
                        return;
                    } catch (_) {}
                }
                isRecording = false;
                window.syncCapsuleActionState();
            };

            recognition.start();
        } catch (err) {
            isStarting = false;
            isRecording = false;
            window.syncCapsuleActionState();
        }
    };

    window.stopVoiceRecognition = function () {
        forceStop = true;
        isStarting = false;
        if (recognition) {
            try {
                recognition.stop();
            } catch (_) {}
        }
        isRecording = false;
        window.syncCapsuleActionState();
    };

    // ─── Input & Typing Handler ───
    window.handleInputTyping = function (textarea) {
        if (!textarea) return;
        
        const rawScrollHeight = typeof textarea.scrollHeight === 'number' ? textarea.scrollHeight : 0;
        const targetHeight = Math.min(Math.max(rawScrollHeight, 24), 160);
        
        textarea.style.height = 'auto';
        textarea.style.height = targetHeight + 'px';

        const capsule = (textarea.closest && typeof textarea.closest === 'function')
            ? textarea.closest('.assistant-input-capsule')
            : (typeof document !== 'undefined' && document.querySelector ? document.querySelector('.assistant-input-capsule') : null);

        if (capsule && capsule.classList) {
            const hasText = Boolean(textarea.value && textarea.value.trim().length > 0);
            const isExpanded = hasText && (targetHeight > 48 || textarea.value.includes('\n'));
            if (isExpanded) {
                capsule.classList.add('expanded');
            } else {
                capsule.classList.remove('expanded');
            }
        }

        if (typeof window.syncCapsuleActionState === 'function') {
            window.syncCapsuleActionState();
        }
    };

    // ─── Prompt Library Modal Handlers ───
    window.selectPrompt = function (promptText) {
        window.closePromptLibrary();
        const input = document.getElementById('agent-input');
        if (input) {
            input.value = promptText;
            window.handleInputTyping(input);
            input.focus();
            if (typeof Agent !== 'undefined' && !Agent.isStreaming) {
                Agent.sendMessage();
            }
        }
    };

    // ─── Dynamic Header Actions ───
    window.updateDynamicHeaderState = function () {
        const pageRoot = document.getElementById('agent-page-root') || document.querySelector('.agent-page-container');
        const msgs = document.getElementById('agent-messages');
        const hasMessages = (pageRoot && pageRoot.classList.contains('has-messages')) ||
                            (msgs && msgs.querySelectorAll('.agent-msg-user, .agent-msg-ai-row, .agent-msg-ai').length > 0);

        const btn = document.getElementById('agent-dynamic-action-btn');
        if (!btn) return;

        if (hasMessages) {
            btn.setAttribute('title', 'بدء محادثة جديدة');
            btn.setAttribute('data-action', 'new-chat');
            btn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="morphicon"><path d="M12 5v14M5 12h14"/></svg>`;
        } else {
            btn.setAttribute('title', 'مكتبة الأوامر');
            btn.setAttribute('data-action', 'prompt-library');
            btn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="morphicon"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`;
        }
    };

    window.handleDynamicHeaderAction = function () {
        const btn = document.getElementById('agent-dynamic-action-btn');
        const action = btn?.getAttribute('data-action') || 'prompt-library';
        if (action === 'new-chat') {
            if (typeof Agent !== 'undefined') Agent.clearChat();
            window.updateDynamicHeaderState();
        } else {
            window.openPromptLibrary();
        }
    };

    // ─── Theme Management ───
    window.applyTheme = function (theme) {
        const root = document.getElementById('agent-page-root');
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        const themeIcon = document.getElementById('agent-theme-icon');

        if (theme === 'dark-orange' || theme === 'dark') {
            document.documentElement.className = 'dark theme-dark-orange';
            document.documentElement.style.backgroundColor = '#0d0d0d';
            document.documentElement.style.colorScheme = 'dark';
            document.body.className = 'theme-dark-orange';
            if (root) root.className = 'agent-page-container theme-dark-orange';
            if (metaTheme) metaTheme.setAttribute('content', '#0d0d0d');
            if (themeIcon && typeof Morphicons !== 'undefined') {
                Morphicons.morph(themeIcon, 'Sun');
            }
            localStorage.setItem('admin_theme_mode', 'dark-orange');
        } else {
            document.documentElement.className = 'theme-light-warm';
            document.documentElement.classList.remove('dark');
            document.documentElement.style.backgroundColor = '#faf7f2';
            document.documentElement.style.colorScheme = 'light';
            document.body.className = 'theme-light-warm';
            if (root) root.className = 'agent-page-container theme-light-warm';
            if (metaTheme) metaTheme.setAttribute('content', '#faf7f2');
            if (themeIcon && typeof Morphicons !== 'undefined') {
                Morphicons.morph(themeIcon, 'Moon');
            }
            localStorage.setItem('admin_theme_mode', 'light-warm');
        }
        window.dispatchEvent(new Event('themechange'));
    };

    window.toggleAgentTheme = function () {
        const current = localStorage.getItem('admin_theme_mode') || 'light-warm';
        const next = current === 'dark-orange' ? 'light-warm' : 'dark-orange';
        window.applyTheme(next);
    };

    // ─── Mount React BorderBeam Capsule ───
    async function mountReactCapsule() {
        try {
            const React = await import('https://esm.sh/react@18.3.1');
            const { createRoot } = await import('https://esm.sh/react-dom@18.3.1/client');
            const { BorderBeam } = await import('https://esm.sh/border-beam@1.3.0?deps=react@18.3.1');

            function ChatCapsuleComponent() {
                const getCapsuleTheme = () => (localStorage.getItem('admin_theme_mode') || 'light-warm') === 'dark-orange' ? 'dark' : 'light';
                const [theme, setTheme] = React.useState(getCapsuleTheme);
                const [isFocused, setIsFocused] = React.useState(false);
                const [hasMessages, setHasMessages] = React.useState(false);
                const [isExpanded, setIsExpanded] = React.useState(false);

                React.useEffect(() => {
                    const onThemeChange = () => {
                        setTheme(getCapsuleTheme());
                    };
                    window.addEventListener('storage', onThemeChange);
                    window.addEventListener('themechange', onThemeChange);

                    const checkMessages = () => {
                        const pageRoot = document.getElementById('agent-page-root') || document.querySelector('.agent-page-container');
                        const msgs = document.getElementById('agent-messages');
                        if ((pageRoot && pageRoot.classList.contains('has-messages')) || (msgs && msgs.querySelectorAll('.agent-msg-user, .agent-msg-ai').length > 0)) {
                            setHasMessages(true);
                        }
                    };
                    const observer = new MutationObserver(checkMessages);
                    const msgs = document.getElementById('agent-messages');
                    if (msgs) observer.observe(msgs, { childList: true, subtree: true });
                    const root = document.getElementById('agent-page-root');
                    if (root) observer.observe(root, { attributes: true, attributeFilter: ['class'] });

                    return () => {
                        window.removeEventListener('storage', onThemeChange);
                        observer.disconnect();
                    };
                }, []);

                const hideGlow = isFocused || hasMessages;

                const capsuleContent = React.createElement(
                    'div',
                    { className: 'assistant-input-capsule' + (isExpanded ? ' expanded' : '') },
                    React.createElement(
                        'div',
                        { className: 'assistant-capsule-left-actions' },
                        React.createElement(
                            'button',
                            {
                                id: 'agent-action-btn',
                                className: 'assistant-capsule-action-btn state-idle',
                                onClick: () => window.handleUnifiedCapsuleAction(),
                                title: 'تحدث بصوتك',
                                'data-action-state': 'mic'
                            },
                            React.createElement('svg', {
                                id: 'capsule-dynamic-icon',
                                width: 21,
                                height: 21,
                                viewBox: '0 0 24 24',
                                fill: 'none',
                                stroke: 'currentColor',
                                strokeWidth: 2.5,
                                strokeLinecap: 'round',
                                strokeLinejoin: 'round',
                                className: 'morphicon morphicon-mic',
                                'data-icon': 'Mic'
                            }, React.createElement('path', { d: 'M12 19C12 20 12 21 12 22M19 10C19 10.6667 19 11.3333 19 12C19 15.866 15.866 19 12 19C8.134 19 5 15.866 5 12C5 11.3333 5 10.6667 5 10M12 2C13.6569 2 15 3.3431 15 5C15 7.3333 15 9.6667 15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 9.6667 9 7.3333 9 5C9 3.3431 10.3431 2 12 2Z', 'data-morph-path': 'true' }))
                        )
                    ),
                    React.createElement('textarea', {
                        id: 'agent-input',
                        className: 'assistant-capsule-textarea',
                        placeholder: 'اسأل حضوري...',
                        rows: 1,
                        autoComplete: 'off',
                        onFocus: () => setIsFocused(true),
                        onBlur: () => setIsFocused(false),
                        onInput: (e) => {
                            window.handleInputTyping(e.target);
                            const val = e.target.value || '';
                            const shouldExpand = val.trim() !== '' && (e.target.scrollHeight > 48 || val.includes('\n'));
                            if (shouldExpand !== isExpanded) {
                                setIsExpanded(shouldExpand);
                            }
                        },
                        onKeyDown: (e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (!Agent.isStreaming && e.target.value.trim().length > 0) {
                                    Agent.sendMessage();
                                    setIsExpanded(false);
                                }
                            }
                        }
                    }),
                    React.createElement(
                        'button',
                        {
                            id: 'agent-send-btn',
                            className: 'assistant-capsule-right-btn',
                            onClick: () => document.getElementById('agent-file-input').click(),
                            title: 'إرفاق ملف أو صورة'
                        },
                        React.createElement('svg', {
                            id: 'capsule-right-icon',
                            width: 18,
                            height: 18,
                            viewBox: '0 0 24 24',
                            fill: 'none',
                            stroke: 'currentColor',
                            strokeWidth: 2,
                            strokeLinecap: 'round',
                            strokeLinejoin: 'round',
                            className: 'morphicon',
                            'data-icon': 'Plus'
                        }, React.createElement('path', { d: 'M5 12h14M12 5v14', 'data-morph-path': 'true' }))
                    ),
                    React.createElement('input', {
                        type: 'file',
                        id: 'agent-file-input',
                        className: 'hidden',
                        onChange: (e) => Agent.handleFileUpload(e.target)
                    })
                );

                return React.createElement(
                    BorderBeam,
                    {
                        size: 'pulse-outside',
                        colorVariant: 'sunset',
                        staticColors: true,
                        hueRange: 0,
                        strength: hideGlow ? 0 : 1,
                        theme: theme,
                        borderRadius: 32,
                        className: 'w-full ' + (hideGlow ? 'no-glow' : '')
                    },
                    capsuleContent
                );
            }

            const rootEl = document.getElementById('react-capsule-root');
            if (rootEl) {
                const root = createRoot(rootEl);
                root.render(React.createElement(ChatCapsuleComponent));
            }
        } catch (err) {
            console.warn('React BorderBeam Capsule Fallback active:', err);
        }
    }

    // ─── Initialization on DOM Ready ───
    document.addEventListener('DOMContentLoaded', async () => {
        // 1. Mount Shared Standalone Sidebar
        if (typeof HodooriSidebar !== 'undefined') {
            HodooriSidebar.mount({ activeItem: 'agent' });
        }

        // 2. Auth Guard
        const user = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        // 3. Populate User Greeting
        const firstName = user.name ? user.name.trim().split(' ')[0] : 'مدير المدرسة';
        const greetingEl = document.getElementById('assistant-greeting-text');
        if (greetingEl) {
            greetingEl.textContent = `كيف أساعدك اليوم يا ${firstName}؟`;
        }

        // 4. Apply Saved Theme
        const savedTheme = localStorage.getItem('admin_theme_mode') || 'light-warm';
        window.applyTheme(savedTheme);

        // 5. Dynamic Header Observer
        const msgs = document.getElementById('agent-messages');
        if (msgs) {
            const observer = new MutationObserver(() => {
                window.updateDynamicHeaderState();
            });
            observer.observe(msgs, { childList: true, subtree: true });
        }
        const root = document.getElementById('agent-page-root');
        if (root) {
            const rootObserver = new MutationObserver(() => {
                window.updateDynamicHeaderState();
            });
            rootObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
        }
        window.updateDynamicHeaderState();

        // 6. Check query params for openPrompts
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('openPrompts') === '1') {
            window.openPromptLibrary();
        }

        // 7. Mount React BorderBeam Capsule
        mountReactCapsule();

        // 8. Initialize AI Agent Engine
        try {
            await Agent.init();
        } catch (err) {
            console.warn('Agent standalone init warning:', err);
        }
    });

})(window, document);
