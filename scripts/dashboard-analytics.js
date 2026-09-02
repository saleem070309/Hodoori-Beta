/**
 * @fileoverview Dedicated Controller for Clean Flat Analytics Dashboard (100% Real DB Data)
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 */

(function (window, document) {
    'use strict';

    let allStudents = [];
    let allClasses = [];
    let allTeachers = [];
    let allRecords = [];
    let trendChartInstance = null;
    let classesChartInstance = null;

    const AnalyticsDashboard = {
        async init() {
            try {
                // 1. Auth Guard
                const user = typeof Auth !== 'undefined' ? Auth.checkAuth('admin') : null;
                if (!user) return;

                // 2. Mount Sidebar
                if (typeof HodooriSidebar !== 'undefined') {
                    HodooriSidebar.mount({ activeItem: 'analytics' });
                }

                // 3. Initialize DB & load school name
                await DB.init();
                if (user.schoolId) {
                    const school = await DB.getSchool(user.schoolId);
                    if (school) {
                        const nameEl = document.getElementById('analytics-school-name');
                        if (nameEl) nameEl.textContent = school.name;
                    }
                }

                // 4. Load Real Data
                await this.refreshData();

                // 5. Initialize Theme
                const savedTheme = localStorage.getItem('admin_theme_mode') || 'light-warm';
                this.applyTheme(savedTheme);

            } catch (err) {
                console.error('Analytics Dashboard Init Error:', err);
                if (typeof UI !== 'undefined' && typeof UI.toast === 'function') {
                    UI.toast('خطأ في تحميل بيانات الإحصائيات', 'error');
                }
            }
        },

        async refreshData() {
            try {
                // Fetch Core Collections concurrently
                const [students, classes, teachers, records] = await Promise.all([
                    DB.getStudents(),
                    DB.getClasses(),
                    DB.getTeachers(),
                    DB.getRecentRecords(30, null, { forceRefresh: true })
                ]);

                allStudents = Array.isArray(students) ? students : [];
                allClasses = Array.isArray(classes) ? classes : [];
                allTeachers = Array.isArray(teachers) ? teachers : [];
                allRecords = Array.isArray(records) ? records : [];

                this.computeAndRenderAll();
            } catch (e) {
                console.warn('Analytics Refresh Error:', e);
            }
        },

        computeAndRenderAll() {
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

            // Filter today's records
            const todayRecords = allRecords.filter(r => r.date === todayStr);

            // Group by classId to prevent duplicate period records for the same class today
            const latestClassRecordMap = new Map();
            todayRecords.forEach(rec => {
                if (rec.classId) {
                    const existing = latestClassRecordMap.get(rec.classId);
                    if (!existing || (rec.timestamp && new Date(rec.timestamp) > new Date(existing.timestamp || 0))) {
                        latestClassRecordMap.set(rec.classId, rec);
                    }
                }
            });

            let presentToday = 0;
            let absentToday = 0;
            const submittedClassIds = new Set(latestClassRecordMap.keys());

            latestClassRecordMap.forEach(rec => {
                if (Array.isArray(rec.details)) {
                    rec.details.forEach(d => {
                        const status = (d.status || '').toLowerCase();
                        if (status === 'present') {
                            presentToday++;
                        } else if (status === 'absent') {
                            absentToday++;
                        }
                    });
                }
            });

            const totalStudentsCount = allStudents.length;
            const totalMarkedToday = presentToday + absentToday;
            
            let attendanceRateStr = '--%';
            if (totalMarkedToday > 0) {
                const rateVal = ((presentToday / totalMarkedToday) * 100).toFixed(1);
                attendanceRateStr = `${rateVal}%`;
            }

            // 1. Update 4 Top Segments (100% Real DB Data)
            const totalEl = document.getElementById('kpi-total-students');
            if (totalEl) totalEl.textContent = totalStudentsCount;

            const presentEl = document.getElementById('kpi-present-count');
            if (presentEl) presentEl.textContent = presentToday;

            const absentEl = document.getElementById('kpi-absent-count');
            if (absentEl) absentEl.textContent = absentToday;

            const rateEl = document.getElementById('kpi-attendance-rate');
            if (rateEl) rateEl.textContent = attendanceRateStr;

            // 2. Render Middle Row Charts
            this.renderClassesChart(latestClassRecordMap);
            this.renderWeeklyTrendChart();

            // 3. Render Bottom Row (Submitted vs Pending Classes)
            this.renderSubmissionLists(submittedClassIds, latestClassRecordMap);
        },

        renderClassesChart(latestTodayMap) {
            const ctx = document.getElementById('chart-classes-breakdown');
            if (!ctx) return;

            // Compute class attendance rates for TODAY ONLY
            const labels = [];
            const rates = [];

            allClasses.forEach(c => {
                labels.push(c.name || c.grade || `صف ${c.id}`);

                // Strictly for TODAY only
                const targetRec = latestTodayMap.get(c.id);

                if (targetRec && Array.isArray(targetRec.details) && targetRec.details.length > 0) {
                    let p = 0;
                    let t = 0;
                    targetRec.details.forEach(d => {
                        const s = (d.status || '').toLowerCase();
                        if (s === 'present') {
                            p++;
                            t++;
                        } else if (s === 'absent') {
                            t++;
                        }
                    });
                    rates.push(t > 0 ? Math.round((p / t) * 100) : 0);
                } else {
                    rates.push(0); // Not submitted today
                }
            });

            if (classesChartInstance) {
                classesChartInstance.destroy();
            }

            const isDark = document.documentElement.classList.contains('dark');
            const textColor = isDark ? '#d4d4d4' : '#334155';
            const barColor = isDark ? '#fbbf24' : '#d97706';
            const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';

            classesChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels.length > 0 ? labels : ['لا توجد شعب'],
                    datasets: [{
                        data: rates.length > 0 ? rates : [0],
                        backgroundColor: barColor,
                        borderRadius: 8,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: { top: 15, bottom: 5, left: 10, right: 10 }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ctx.raw > 0 ? `نسبة الحضور اليوم: ${ctx.raw}%` : 'لم يتم تسجيل الحضور اليوم (0%)'
                            }
                        }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 100,
                            grid: { color: gridColor },
                            ticks: { 
                                color: textColor, 
                                font: { family: 'Tajawal', weight: 'bold', size: 12 }, 
                                stepSize: 25,
                                callback: (v) => `${v}%` 
                            }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: textColor, font: { family: 'Tajawal', weight: 'bold', size: 11 } }
                        }
                    }
                }
            });
        },

        renderWeeklyTrendChart() {
            const ctx = document.getElementById('chart-attendance-trend');
            if (!ctx) return;

            // Group all records by real date
            const dateMap = {};
            allRecords.forEach(r => {
                if (!r.date) return;
                if (!dateMap[r.date]) dateMap[r.date] = { present: 0, total: 0 };
                if (Array.isArray(r.details)) {
                    r.details.forEach(d => {
                        const s = (d.status || '').toLowerCase();
                        if (s === 'present') {
                            dateMap[r.date].present++;
                            dateMap[r.date].total++;
                        } else if (s === 'absent') {
                            dateMap[r.date].total++;
                        }
                    });
                }
            });

            // Generate last 7 actual school days (excluding Friday & Saturday)
            const daysArabic = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
            const schoolDays = [];
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');

            let checkDate = new Date(now);
            while (schoolDays.length < 7) {
                const dayNum = checkDate.getDay();
                // Skip Friday (5) and Saturday (6)
                if (dayNum !== 5 && dayNum !== 6) {
                    const dateStr = `${checkDate.getFullYear()}-${pad(checkDate.getMonth() + 1)}-${pad(checkDate.getDate())}`;
                    schoolDays.unshift({
                        dateStr: dateStr,
                        dayName: daysArabic[dayNum],
                        shortDate: `${checkDate.getMonth() + 1}/${checkDate.getDate()}`
                    });
                }
                checkDate.setDate(checkDate.getDate() - 1);
            }

            const labels = [];
            const rates = [];

            schoolDays.forEach(item => {
                labels.push(`${item.dayName} (${item.shortDate})`);
                const rec = dateMap[item.dateStr];
                if (rec && rec.total > 0) {
                    rates.push(Math.round((rec.present / rec.total) * 100));
                } else {
                    // 0 or null if no attendance was recorded on that school day
                    rates.push(0);
                }
            });

            if (trendChartInstance) {
                trendChartInstance.destroy();
            }

            const isDark = document.documentElement.classList.contains('dark');
            const textColor = isDark ? '#d4d4d4' : '#334155';
            const lineColor = isDark ? '#fbbf24' : '#d97706';
            const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';

            trendChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        data: rates,
                        borderColor: lineColor,
                        borderWidth: 3,
                        backgroundColor: isDark ? 'rgba(251, 191, 36, 0.12)' : 'rgba(217, 119, 6, 0.1)',
                        fill: true,
                        tension: 0.35,
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        pointBackgroundColor: lineColor,
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2.5,
                        clip: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: { top: 15, bottom: 5, left: 10, right: 15 }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ctx.raw > 0 ? `نسبة الحضور: ${ctx.raw}%` : 'لا توجد سجلات لهذا اليوم (0%)'
                            }
                        }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 100,
                            grace: '5%',
                            grid: { color: gridColor },
                            ticks: { 
                                color: textColor, 
                                font: { family: 'Tajawal', weight: 'bold', size: 12 }, 
                                stepSize: 25,
                                callback: (v) => `${v}%` 
                            }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: textColor, font: { family: 'Tajawal', weight: 'bold', size: 11 } }
                        }
                    }
                }
            });
        },

        renderSubmissionLists(submittedClassIds, latestTodayMap) {
            const pendingListEl = document.getElementById('pending-classes-list');
            const submittedListEl = document.getElementById('submitted-classes-list');
            const pendingBadge = document.getElementById('pending-classes-badge');
            const submittedBadge = document.getElementById('submitted-classes-badge');

            const pendingClasses = allClasses.filter(c => !submittedClassIds.has(c.id));
            const submittedClasses = allClasses.filter(c => submittedClassIds.has(c.id));

            if (pendingBadge) pendingBadge.textContent = `${pendingClasses.length} شعب`;
            if (submittedBadge) submittedBadge.textContent = `${submittedClasses.length} شعب`;

            // Render Pending
            if (pendingListEl) {
                if (pendingClasses.length === 0) {
                    pendingListEl.innerHTML = `
                        <div class="text-center py-6 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            🎉 رائع! تم استلام تقارير جميع الشعب الدراسية اليوم.
                        </div>
                    `;
                } else {
                    pendingListEl.innerHTML = pendingClasses.map(c => {
                        const teacher = allTeachers.find(t => t.id === c.teacherId) || { name: 'المعلم المسؤول' };
                        return `
                            <div class="class-status-row">
                                <div>
                                    <span class="block font-bold text-stone-900 dark:text-white">${c.name || c.grade}</span>
                                    <span class="text-[10px] text-stone-500">${teacher.name}</span>
                                </div>
                                <span class="status-badge-pending">لم يُسلم بعد</span>
                            </div>
                        `;
                    }).join('');
                }
            }

            // Render Submitted
            if (submittedListEl) {
                if (submittedClasses.length === 0) {
                    submittedListEl.innerHTML = `
                        <div class="text-center py-6 text-xs font-bold text-stone-500">
                            لم يتم استلام أي تقرير حضور حتى الآن اليوم.
                        </div>
                    `;
                } else {
                    submittedListEl.innerHTML = submittedClasses.map(c => {
                        const rec = latestTodayMap.get(c.id);
                        let p = 0;
                        let a = 0;
                        if (rec && Array.isArray(rec.details)) {
                            rec.details.forEach(d => {
                                const s = (d.status || '').toLowerCase();
                                if (s === 'present') p++;
                                else if (s === 'absent') a++;
                            });
                        }
                        const time = rec && rec.timestamp ? new Date(rec.timestamp).toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }) : 'صباحاً';
                        return `
                            <div class="class-status-row">
                                <div>
                                    <span class="block font-bold text-stone-900 dark:text-white">${c.name || c.grade}</span>
                                    <span class="text-[10px] text-stone-500">حاضر: ${p} | غائب: ${a} (استُلم ${time})</span>
                                </div>
                                <span class="status-badge-done">تم التسليم ✓</span>
                            </div>
                        `;
                    }).join('');
                }
            }
        },

        applyTheme(theme) {
            const isDark = theme === 'dark-orange' || theme === 'dark';
            document.documentElement.className = isDark ? 'dark theme-dark-orange' : 'theme-light-warm';
            document.documentElement.style.backgroundColor = isDark ? '#09090b' : '#f4f6f8';
            document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
            document.body.className = isDark ? 'theme-dark-orange' : 'theme-light-warm';
            localStorage.setItem('admin_theme_mode', isDark ? 'dark-orange' : 'light-warm');

            const themeIcon = document.getElementById('analytics-theme-icon');
            if (themeIcon && typeof Morphicons !== 'undefined') {
                Morphicons.morph(themeIcon, isDark ? 'Sun' : 'Moon');
            }
        },

        toggleTheme() {
            const current = localStorage.getItem('admin_theme_mode') || 'light-warm';
            const next = current === 'dark-orange' ? 'light-warm' : 'dark-orange';
            this.applyTheme(next);
            this.computeAndRenderAll();
        }
    };

    window.AnalyticsDashboard = AnalyticsDashboard;

    document.addEventListener('DOMContentLoaded', () => {
        AnalyticsDashboard.init();
    });

})(window, document);
