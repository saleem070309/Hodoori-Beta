/**
 * @fileoverview Universal Transitions Orchestration Utilities
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 */

(function (window) {
  'use strict';

  const Transitions = {
    /**
     * Get numeric CSS property from :root
     */
    getMs(property, fallback = 150) {
      if (typeof window === 'undefined' || !document.documentElement) return fallback;
      const val = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(property));
      return Number.isFinite(val) ? val : fallback;
    },

    /**
     * Modal Open with transitions.dev scaling & asymmetry
     */
    openModal(modal) {
      if (!modal) return;
      modal.classList.remove('is-closing');
      modal.classList.add('is-open');
    },

    /**
     * Modal Close with fast exit & cleanup
     */
    closeModal(modal, callback) {
      if (!modal) return;
      const closeDur = this.getMs('--modal-close-dur', 150);
      modal.classList.remove('is-open');
      modal.classList.add('is-closing');
      setTimeout(() => {
        modal.classList.remove('is-closing');
        if (typeof callback === 'function') callback();
      }, closeDur);
    },

    /**
     * Dropdown Open
     */
    openDropdown(dropdown) {
      if (!dropdown) return;
      dropdown.classList.remove('is-closing');
      dropdown.classList.add('is-open');
    },

    /**
     * Dropdown Close with fast exit & cleanup
     */
    closeDropdown(dropdown, callback) {
      if (!dropdown) return;
      const closeDur = this.getMs('--dropdown-close-dur', 150);
      dropdown.classList.remove('is-open');
      dropdown.classList.add('is-closing');
      setTimeout(() => {
        dropdown.classList.remove('is-closing');
        if (typeof callback === 'function') callback();
      }, closeDur);
    },

    /**
     * Render Animated Number Pop-in
     */
    renderNumberPopIn(container, textValue) {
      if (!container) return;
      const str = String(textValue);
      const group = document.createElement('span');
      group.className = 't-digit-group is-animating';

      for (let i = 0; i < str.length; i++) {
        const span = document.createElement('span');
        span.className = 't-digit';
        span.textContent = str[i];
        span.setAttribute('data-stagger', String(i));
        group.appendChild(span);
      }

      container.innerHTML = '';
      container.appendChild(group);

      // Trigger reflow to restart keyframe
      void group.offsetWidth;
    },

    /**
     * Trigger Success Check Icon Animation
     */
    showSuccessCheck(checkEl) {
      if (!checkEl) return;
      checkEl.setAttribute('data-state', 'out');
      void checkEl.offsetWidth; // Force reflow
      checkEl.setAttribute('data-state', 'in');
    },

    /**
     * Initialize 3D Hover Tilt on cards
     */
    initTilt(root = document) {
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      if (isTouch) return; // Keep touch pure for scrolling

      const elements = root.querySelectorAll('.t-tilt');
      elements.forEach((tilt) => {
        if (tilt._hasTiltInitialized) return;
        tilt._hasTiltInitialized = true;

        const card = tilt.querySelector('.t-tilt-card') || tilt;
        const maxTilt = 12; // Subtle elegant lean angle

        const reset = () => {
          tilt.classList.remove('is-hover');
          card.classList.remove('is-tilting');
          card.style.setProperty('--tilt-rx', '0deg');
          card.style.setProperty('--tilt-ry', '0deg');
        };

        const track = (e) => {
          const r = tilt.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
          tilt.classList.add('is-hover');
          card.classList.add('is-tilting');
          card.style.setProperty('--tilt-ry', ((px - 0.5) * maxTilt).toFixed(2) + 'deg');
          card.style.setProperty('--tilt-rx', ((0.5 - py) * maxTilt).toFixed(2) + 'deg');
          card.style.setProperty('--tilt-gx', (px * 100).toFixed(1) + '%');
          card.style.setProperty('--tilt-gy', (py * 100).toFixed(1) + '%');
        };

        tilt.addEventListener('pointermove', track);
        tilt.addEventListener('pointerleave', reset);
      });
    },

    /**
     * Initialize Sliding Tabs with Pill
     */
    initTabs(bar) {
      if (!bar || bar._hasTabsInit) return;
      bar._hasTabsInit = true;

      let pill = bar.querySelector('.t-tabs-pill');
      if (!pill) {
        pill = document.createElement('span');
        pill.className = 't-tabs-pill';
        pill.setAttribute('aria-hidden', 'true');
        bar.prepend(pill);
      }

      const tabs = [...bar.querySelectorAll('.t-tab')];
      if (!tabs.length) return;

      const moveTo = (tab, animate) => {
        if (!tab) return;
        if (!animate) {
          const prev = pill.style.transition;
          pill.style.transition = 'none';
          pill.style.transform = `translateX(${tab.offsetLeft}px)`;
          pill.style.width = `${tab.offsetWidth}px`;
          void pill.offsetWidth;
          pill.style.transition = prev;
        } else {
          pill.style.transform = `translateX(${tab.offsetLeft}px)`;
          pill.style.width = `${tab.offsetWidth}px`;
        }
      };

      const active = () => tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];

      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.forEach((t) => t.setAttribute('aria-selected', t === tab ? 'true' : 'false'));
          moveTo(tab, true);
        });
      });

      requestAnimationFrame(() => moveTo(active(), false));
      window.addEventListener('resize', () => moveTo(active(), false));
    },

    /**
     * Initialize Accordions
     */
    initAccordions(root = document) {
      const items = root.querySelectorAll('.t-acc');
      items.forEach((acc) => {
        if (acc._hasAccInit) return;
        acc._hasAccInit = true;

        const head = acc.querySelector('.t-acc-head');
        if (!head) return;

        head.addEventListener('click', () => {
          const isOpen = acc.getAttribute('data-open') === 'true';
          acc.setAttribute('data-open', String(!isOpen));
          head.setAttribute('aria-expanded', String(!isOpen));
        });
      });
    },

    /**
     * Stream text word-by-word with cross-blur
     */
    streamText(container, text, onComplete) {
      if (!container) return;
      const words = String(text).trim().split(/\s+/);
      container.innerHTML = '';
      const spans = words.map((w, i) => {
        const s = document.createElement('span');
        s.className = 't-stream-w';
        s.textContent = w;
        container.appendChild(s);
        if (i < words.length - 1) container.appendChild(document.createTextNode(' '));
        return s;
      });

      const gap = this.getMs('--stream-gap', 40);
      let idx = 0;
      function next() {
        if (idx < spans.length) {
          spans[idx].classList.add('is-in');
          idx++;
          setTimeout(next, gap);
        } else if (typeof onComplete === 'function') {
          onComplete();
        }
      }
      requestAnimationFrame(next);
    }
  };

  // Auto-init on DOMContentLoaded
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      Transitions.initTilt();
      Transitions.initAccordions();
      document.querySelectorAll('.t-tabs').forEach((el) => Transitions.initTabs(el));
    });
  }

  window.Transitions = Transitions;
})(typeof window !== 'undefined' ? window : this);
