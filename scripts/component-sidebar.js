/**
 * @fileoverview Reusable Standalone Sidebar Component & Universal Settings Modal
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 */

(function (window, document) {
    'use strict';

    const HodooriSidebar = {
        options: {
            activeItem: 'agent',
            showTrigger: true,
            showOverlay: true,
            customItems: null
        },

        isMounted: false,

        /**
         * Initialize and mount the standalone sidebar
         * @param {Object} [opts={}] - Configuration options
         */
        mount(opts = {}) {
            this.options = Object.assign({}, this.options, opts);

            // Auto detect active item from current URL if not explicitly provided
            if (!opts.activeItem) {
                const path = window.location.pathname.toLowerCase();
                const search = window.location.search.toLowerCase();
                if (path.includes('agent.html')) {
                    this.options.activeItem = 'agent';
                } else if (path.includes('dashboard-analytics.html')) {
                    this.options.activeItem = 'analytics';
                } else if (path.includes('teachers.html')) {
                    this.options.activeItem = 'teachers';
                } else if (path.includes('students.html') || path.includes('classes.html')) {
                    this.options.activeItem = 'classes';
                } else if (path.includes('reports.html')) {
                    this.options.activeItem = 'reports';
                } else if (path.includes('notifications.html')) {
                    this.options.activeItem = 'notifications';
                } else if (path.includes('schedule.html')) {
                    this.options.activeItem = 'schedule';
                } else if (path.includes('dashboard-admin.html')) {
                    const match = search.match(/tab=([a-z0-9_-]+)/);
                    this.options.activeItem = match ? match[1] : 'ai';
                }
            }

            this._ensureOverlay();
            this._ensureTrigger();
            this._ensureSettingsModal();
            this._renderSidebar();
            this._bindEvents();
            this._restoreState();
            this._updateUserProfile();

            this.isMounted = true;
        },

        /**
         * Toggles the sidebar open/close state
         * @param {boolean|null} [forceState=null]
         */
        toggle(forceState = null) {
            const isCurrentlyOpen = document.body.classList.contains('agent-sidebar-open');
            const targetState = (forceState !== null) ? forceState : !isCurrentlyOpen;

            if (targetState) {
                document.body.classList.add('agent-sidebar-open');
            } else {
                document.body.classList.remove('agent-sidebar-open');
            }

            if (window.innerWidth >= 1024) {
                try {
                    localStorage.setItem('hodoori_agent_sidebar', targetState ? '1' : '0');
                } catch (_) {}
            }
        },

        open() {
            this.toggle(true);
        },

        close() {
            this.toggle(false);
        },

        /**
         * Opens the universal Settings modal popup
         */
        openSettingsModal() {
            this._ensureSettingsModal();
            const modal = document.getElementById('hodoori-settings-modal');
            if (modal) {
                this._syncSettingsUI();
                modal.classList.add('active');
            }
        },

        /**
         * Closes the universal Settings modal popup
         */
        closeSettingsModal() {
            const modal = document.getElementById('hodoori-settings-modal');
            if (modal) {
                modal.classList.remove('active');
            }
        },

        /**
         * Updates and applies theme setting
         * @param {string} theme - 'light-warm' | 'dark-orange'
         */
        setThemeSetting(theme) {
            localStorage.setItem('admin_theme_mode', theme);
            const isDark = theme === 'dark-orange' || theme === 'dark';
            document.documentElement.className = isDark ? 'dark theme-dark-orange' : 'theme-light-warm';
            document.documentElement.style.backgroundColor = isDark ? '#09090b' : '#f4f6f8';
            document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
            document.body.className = isDark ? 'theme-dark-orange' : 'theme-light-warm';
            
            this._syncSettingsUI();
            window.dispatchEvent(new Event('themechange'));
            window.dispatchEvent(new Event('storage'));
        },

        /**
         * Updates End-of-Day unrecorded attendance default action
         * @param {string} action - 'absent' | 'present'
         */
        setEodAction(action) {
            localStorage.setItem('hodoori_eod_attendance_action', action);
            this._syncSettingsUI();
        },

        /**
         * Saves settings and provides toast feedback
         */
        saveSettings() {
            this.closeSettingsModal();
            if (typeof UI !== 'undefined' && typeof UI.toast === 'function') {
                UI.toast('تم حفظ الإعدادات بنجاح', 'success');
            }
        },

        /**
         * Handles navigation to platform modules and legacy admin tabs
         * @param {string} tab
         * @param {Event} [e=null]
         */
        navigateToAdminTab(tab, e = null) {
            if (e && typeof e.preventDefault === 'function') {
                e.preventDefault();
            }

            if (window.innerWidth < 1024) {
                this.close();
            }

            const pageMap = {
                'analytics': 'dashboard-analytics.html',
                'daily': 'dashboard-analytics.html',
                'ai': 'agent.html',
                'agent': 'agent.html',
                'teachers': 'teachers.html',
                'classes': 'students.html',
                'students': 'students.html',
                'reports': 'reports.html',
                'notifications': 'notifications.html',
                'schedule': 'schedule.html'
            };

            if (pageMap[tab]) {
                window.location.href = pageMap[tab];
                return;
            }

            const currentPath = window.location.pathname;
            const isAlreadyOnAdmin = currentPath.endsWith('dashboard-admin.html') || currentPath.endsWith('dashboard-admin');

            if (isAlreadyOnAdmin && typeof window.switchTab === 'function') {
                window.switchTab(tab);
                const url = new URL(window.location.href);
                url.searchParams.set('tab', tab);
                window.history.replaceState({}, '', url);
            } else {
                window.location.href = `dashboard-admin.html?tab=${encodeURIComponent(tab)}`;
            }
        },

        _ensureOverlay() {
            if (!this.options.showOverlay) return;
            let overlay = document.getElementById('agent-sidebar-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'agent-sidebar-overlay';
                overlay.className = 'agent-sidebar-overlay';
                overlay.onclick = () => this.close();
                document.body.appendChild(overlay);
            }
        },

        _ensureTrigger() {
            if (!this.options.showTrigger) return;
            let triggerWrap = document.getElementById('hodoori-sidebar-trigger-wrap');
            if (!triggerWrap) {
                triggerWrap = document.createElement('div');
                triggerWrap.id = 'hodoori-sidebar-trigger-wrap';
                triggerWrap.className = 'fixed top-4 right-4 z-30';
                triggerWrap.innerHTML = `
                    <button type="button" class="hodoori-menu-btn" onclick="HodooriSidebar.toggle()" title="القائمة الجانبية">
                        <span class="menu-line menu-line-top"></span>
                        <span class="menu-line menu-line-bottom"></span>
                    </button>
                `;
                document.body.appendChild(triggerWrap);
            }
        },

        _ensureSettingsModal() {
            let modal = document.getElementById('hodoori-settings-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'hodoori-settings-modal';
                modal.className = 'hodoori-modal-backdrop';
                modal.onclick = (e) => {
                    if (e.target === modal) HodooriSidebar.closeSettingsModal();
                };

                modal.innerHTML = `
                    <div class="hodoori-settings-dialog" onclick="event.stopPropagation()">
                        <!-- Header -->
                        <div class="settings-modal-header">
                            <div class="flex items-center gap-2.5">
                                <span class="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center font-black">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                                </span>
                                <h3 class="text-base font-extrabold text-stone-900 dark:text-white">إعدادات النظام</h3>
                            </div>
                            <button type="button" onclick="HodooriSidebar.closeSettingsModal()" class="agent-icon-btn" title="إغلاق">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                            </button>
                        </div>

                        <!-- Body -->
                        <div class="settings-modal-body">
                            <!-- Setting 1: Theme Mode -->
                            <div class="settings-section-box">
                                <span class="settings-label">1. مظهر النظام (الثيم)</span>
                                <p class="settings-desc">اختر نمط الألوان المفضل لواجهة النظام:</p>
                                <div class="theme-segmented-grid">
                                    <button type="button" id="theme-opt-light" class="theme-option-btn" onclick="HodooriSidebar.setThemeSetting('light-warm')">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                                        <span>الوضع الفاتح</span>
                                    </button>
                                    <button type="button" id="theme-opt-dark" class="theme-option-btn" onclick="HodooriSidebar.setThemeSetting('dark-orange')">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                                        <span>الوضع الداكن</span>
                                    </button>
                                </div>
                            </div>

                            <div class="border-b border-stone-200/60 dark:border-neutral-800"></div>

                            <!-- Setting 2: End-of-Day Unrecorded Action -->
                            <div class="settings-section-box">
                                <span class="settings-label">2. إجراء انقضاء اليوم بدون تسجيل تقرير</span>
                                <p class="settings-desc">في حال انتهى اليوم الدراسي دون أن يسجل المعلم تقرير الحضور لأحد الصفوف:</p>
                                
                                <div class="flex flex-col gap-2 pt-1">
                                    <!-- Option A: Absent (Default) -->
                                    <div class="eod-radio-card" id="eod-opt-absent" onclick="HodooriSidebar.setEodAction('absent')">
                                        <div class="custom-radio-circle">
                                            <div class="custom-radio-inner"></div>
                                        </div>
                                        <div>
                                            <div class="flex items-center gap-2">
                                                <span class="text-xs font-black text-stone-900 dark:text-white">اعتبار جميع طلاب الصف غياب</span>
                                                <span class="text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">الافتراضي</span>
                                            </div>
                                            <span class="text-[11px] font-medium text-stone-500 dark:text-stone-400 block mt-0.5">تسجيل تلقائي لحالة غياب لكافة طلاب الشعبة غير المسلمة بنهاية الدوام.</span>
                                        </div>
                                    </div>

                                    <!-- Option B: Present -->
                                    <div class="eod-radio-card" id="eod-opt-present" onclick="HodooriSidebar.setEodAction('present')">
                                        <div class="custom-radio-circle">
                                            <div class="custom-radio-inner"></div>
                                        </div>
                                        <div>
                                            <span class="text-xs font-black text-stone-900 dark:text-white">اعتبار جميع طلاب الصف حضور</span>
                                            <span class="text-[11px] font-medium text-stone-500 dark:text-stone-400 block mt-0.5">تسجيل تلقائي لحالة حضور لكافة طلاب الشعبة غير المسلمة بنهاية الدوام.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div class="settings-modal-footer">
                            <button type="button" class="header-action-btn" onclick="HodooriSidebar.closeSettingsModal()">إلغاء</button>
                            <button type="button" class="settings-save-btn" onclick="HodooriSidebar.saveSettings()">حفظ الإعدادات</button>
                        </div>
                    </div>
                `;

                document.body.appendChild(modal);
            }
        },

        _syncSettingsUI() {
            const currentTheme = localStorage.getItem('admin_theme_mode') || 'light-warm';
            const isDark = currentTheme === 'dark-orange' || currentTheme === 'dark';

            const lightBtn = document.getElementById('theme-opt-light');
            const darkBtn = document.getElementById('theme-opt-dark');

            if (lightBtn) lightBtn.classList.toggle('active', !isDark);
            if (darkBtn) darkBtn.classList.toggle('active', isDark);

            const eodAction = localStorage.getItem('hodoori_eod_attendance_action') || 'absent';
            const absentCard = document.getElementById('eod-opt-absent');
            const presentCard = document.getElementById('eod-opt-present');

            if (absentCard) absentCard.classList.toggle('active', eodAction === 'absent');
            if (presentCard) presentCard.classList.toggle('active', eodAction === 'present');
        },

        _renderSidebar() {
            let sidebar = document.getElementById('agent-sidebar');
            if (!sidebar) {
                sidebar = document.createElement('aside');
                sidebar.id = 'agent-sidebar';
                sidebar.className = 'agent-sidebar';
                document.body.appendChild(sidebar);
            }

            const active = this.options.activeItem;

            sidebar.innerHTML = `
                <!-- Sidebar Brand Header -->
                <div class="px-4 py-3 border-b border-stone-200/60 dark:border-neutral-800 flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <img src="assets/AI-logo.png" alt="حضوري" class="w-6 h-6 object-contain" />
                        <h2 class="font-extrabold text-[14px] text-stone-900 dark:text-white tracking-tight">نظام حضوري الذكي</h2>
                    </div>
                    <button type="button" onclick="HodooriSidebar.close()" class="agent-icon-btn" title="إغلاق القائمة">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dark:text-white"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                </div>

                <!-- Section 1: AI Actions -->
                <div class="py-1.5">
                    <!-- محادثة جديدة -->
                    <div class="agent-new-chat-pill" onclick="window.startNewAgentChat()" title="بدء محادثة جديدة">
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M12 5v14M5 12h14"/></svg>
                        <span class="text-[13px] font-bold">محادثة جديدة</span>
                    </div>

                    <!-- مكتبة الأوامر -->
                    <a href="javascript:void(0)" class="agent-nav-row" onclick="window.openPromptLibrary(); if(window.innerWidth < 1024) HodooriSidebar.close();" title="مكتبة الأوامر">
                        <span class="nav-row-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                        </span>
                        <span class="text-[13px] font-bold">مكتبة الأوامر</span>
                    </a>
                </div>

                <div class="mx-3.5 border-b border-stone-200/60 dark:border-neutral-800"></div>

                <!-- Section 2: Core Platform Navigation -->
                <div class="flex-1 py-1.5 overflow-y-auto">
                    <!-- المساعد الذكي -->
                    <a href="agent.html" class="agent-nav-row ${active === 'agent' ? 'active' : ''}" title="المساعد الذكي">
                        <span class="nav-row-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                        </span>
                        <span class="text-[13px] font-bold">المساعد الذكي</span>
                    </a>

                    <!-- لوحة التحليلات والإحصائيات -->
                    <a href="dashboard-analytics.html" class="agent-nav-row ${active === 'analytics' ? 'active' : ''}" title="التحليلات والإحصاء">
                        <span class="nav-row-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                        </span>
                        <span class="text-[13px] font-bold">لوحة الداشبورد</span>
                    </a>

                    <!-- المعلمون -->
                    <a href="teachers.html" class="agent-nav-row ${active === 'teachers' ? 'active' : ''}" title="المعلمون">
                        <span class="nav-row-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </span>
                        <span class="text-[13px] font-bold">المعلمون</span>
                    </a>

                    <!-- الطلاب والفصول -->
                    <a href="students.html" class="agent-nav-row ${active === 'classes' ? 'active' : ''}" title="الطلاب والفصول">
                        <span class="nav-row-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
                        </span>
                        <span class="text-[13px] font-bold">الطلاب والفصول</span>
                    </a>

                    <!-- السجلات والتقارير -->
                    <a href="reports.html" class="agent-nav-row ${active === 'reports' ? 'active' : ''}" title="السجلات">
                        <span class="nav-row-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>
                        </span>
                        <span class="text-[13px] font-bold">السجلات والتقارير</span>
                    </a>

                    <!-- الاشعارات -->
                    <a href="notifications.html" class="agent-nav-row ${active === 'notifications' ? 'active' : ''}" title="الاشعارات">
                        <span class="nav-row-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                        </span>
                        <span class="text-[13px] font-bold">الاشعارات</span>
                    </a>

                    <!-- جدول الحصص -->
                    <a href="schedule.html" class="agent-nav-row ${active === 'schedule' ? 'active' : ''}" title="جدول الحصص">
                        <span class="nav-row-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
                        </span>
                        <span class="text-[13px] font-bold">جدول الحصص</span>
                    </a>
                </div>

                <!-- Section 3: Footer Profile -->
                <div class="px-4 py-3 border-t border-stone-200/60 dark:border-neutral-800 flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <div id="agent-user-avatar" class="w-8 h-8 rounded-full bg-orange-500 text-white font-black text-xs flex items-center justify-center shadow-sm shrink-0">
                            م
                        </div>
                        <div class="text-right">
                            <span id="agent-user-name" class="font-bold text-xs text-stone-900 dark:text-white block leading-tight">مدير المدرسة</span>
                            <span id="agent-user-role" class="text-[10px] font-medium text-stone-400 dark:text-stone-500 block leading-tight mt-0.5">الإدارة</span>
                        </div>
                    </div>

                    <button type="button" onclick="HodooriSidebar.openSettingsModal()" class="agent-icon-btn" title="الإعدادات">
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                </div>
            `;
        },

        _updateUserProfile() {
            try {
                let user = null;
                if (typeof Auth !== 'undefined' && typeof Auth.getCurrentUser === 'function') {
                    user = Auth.getCurrentUser();
                }
                if (!user) {
                    user = JSON.parse(localStorage.getItem('attendance_current_user') || 'null');
                }

                if (user) {
                    const name = user.name || user.username || 'مستخدم النظام';
                    const role = user.role === 'admin' ? 'المدير' : (user.role === 'teacher' ? 'معلم' : (user.role === 'ministry' ? 'الوزارة' : (user.role || 'مستخدم')));
                    const initial = name.trim().charAt(0) || 'م';

                    const avatarEl = document.getElementById('agent-user-avatar');
                    const nameEl = document.getElementById('agent-user-name');
                    const roleEl = document.getElementById('agent-user-role');

                    if (avatarEl) avatarEl.textContent = initial;
                    if (nameEl) nameEl.textContent = name;
                    if (roleEl) roleEl.textContent = role;
                }
            } catch (_) {}
        },

        _restoreState() {
            if (window.innerWidth >= 1024) {
                const saved = localStorage.getItem('hodoori_agent_sidebar');
                if (saved === '0') {
                    document.body.classList.remove('agent-sidebar-open');
                } else {
                    document.body.classList.add('agent-sidebar-open');
                }
            } else {
                document.body.classList.remove('agent-sidebar-open');
            }
        },

        _bindEvents() {
            window.addEventListener('resize', () => {
                if (window.innerWidth < 1024) {
                    document.body.classList.remove('agent-sidebar-open');
                } else {
                    const saved = localStorage.getItem('hodoori_agent_sidebar');
                    if (saved !== '0') {
                        document.body.classList.add('agent-sidebar-open');
                    }
                }
            });
        }
    };

    // Global Bridge & Backward Compatibility
    window.HodooriSidebar = HodooriSidebar;
    window.SidebarComponent = HodooriSidebar;
    window.toggleAgentSidebar = (force) => HodooriSidebar.toggle(force);
    window.openMobileNavModal = () => HodooriSidebar.open();
    window.closeMobileNavModal = () => HodooriSidebar.close();
    window.navigateToAdminTab = (tab, e) => HodooriSidebar.navigateToAdminTab(tab, e);

    window.startNewAgentChat = function () {
        if (window.location.pathname.includes('agent.html')) {
            if (typeof Agent !== 'undefined' && typeof Agent.clearChat === 'function') {
                Agent.clearChat();
            }
            if (typeof window.updateDynamicHeaderState === 'function') {
                window.updateDynamicHeaderState();
            }
        } else {
            window.location.href = 'agent.html';
        }
    };

    window.openPromptLibrary = function () {
        const modal = document.getElementById('agent-prompt-library-modal');
        if (modal) {
            modal.classList.add('active');
        } else if (!window.location.pathname.includes('agent.html')) {
            window.location.href = 'agent.html?openPrompts=1';
        }
    };

    window.closePromptLibrary = function (e = null) {
        const modal = document.getElementById('agent-prompt-library-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    };

    // Auto mount if document is already ready and has data-auto-sidebar or id="hodoori-sidebar-mount"
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.querySelector('[data-auto-sidebar]') || document.getElementById('hodoori-sidebar-mount')) {
                HodooriSidebar.mount();
            }
        });
    } else {
        if (document.querySelector('[data-auto-sidebar]') || document.getElementById('hodoori-sidebar-mount')) {
            HodooriSidebar.mount();
        }
    }

})(window, document);
