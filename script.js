// 今天一定要把事情解決工作坊 — 微互動
(function () {
  'use strict';

  // 1) Intersection-based reveal
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach((el) => obs.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }

  // 2) Form submit handling
  const form = document.getElementById('signupForm');
  if (form) {
    form.addEventListener('submit', function (e) {
      const btn = form.querySelector('.submit-btn');
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = '送出中⋯⋯';
      // If the action is unset (placeholder), fall back to client-only success page.
      const action = form.getAttribute('action') || '';
      if (!action || action.includes('YOUR_FORMSPREE_ID')) {
        e.preventDefault();
        // Persist task title to next page so success can echo it
        try {
          const task = (form.querySelector('[name="task"]') || {}).value || '';
          sessionStorage.setItem('getitdone_task', task);
        } catch (_) {}
        setTimeout(() => { window.location.href = 'success.html'; }, 600);
      }
      // Otherwise let the form post to Formspree / Web3Forms; their default redirect goes to success page if configured.
    });
  }

  // 3) Success page: echo the submitted task if available
  const taskEcho = document.getElementById('echo-task');
  if (taskEcho) {
    try {
      const t = sessionStorage.getItem('getitdone_task');
      if (t && t.trim()) {
        taskEcho.textContent = t.trim();
        taskEcho.parentElement.style.display = '';
      }
    } catch (_) {}
  }

  // 4) Smooth-scroll active link highlight (subtle)
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
  if ('IntersectionObserver' in window && sections.length && navLinks.length) {
    const navObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.getAttribute('id');
          const link = document.querySelector(`.nav-links a[href="#${id}"]`);
          if (!link) return;
          if (entry.isIntersecting) {
            navLinks.forEach((l) => l.classList.remove('active'));
            link.classList.add('active');
          }
        });
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );
    sections.forEach((s) => navObs.observe(s));
  }
})();
