(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function track(eventName, details = {}) {
    const payload = { event: eventName, ...details };
    window.dispatchEvent(new CustomEvent('sosVendas:conversion', { detail: payload }));
    if (Array.isArray(window.dataLayer)) window.dataLayer.push(payload);
  }

  document.querySelectorAll('[data-track]').forEach((element) => {
    element.addEventListener('click', () => {
      track('landing_interaction', {
        action: element.dataset.track,
        label: element.textContent.trim().replace(/\s+/g, ' '),
      });
    });
  });

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const selector = anchor.getAttribute('href');
      if (!selector || selector === '#') return;
      const target = document.querySelector(selector);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', selector);
    });
  });

  const demoTabs = [...document.querySelectorAll('.demo-tab')];
  const demoPanels = [...document.querySelectorAll('.demo-panel')];

  function activateDemoTab(tab, moveFocus = false) {
    const key = tab.dataset.demo;
    demoTabs.forEach((item) => {
      const selected = item === tab;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    demoPanels.forEach((panel) => {
      const selected = panel.id === `panel-${key}`;
      panel.classList.toggle('active', selected);
      panel.hidden = !selected;
    });
    if (moveFocus) tab.focus();
    track('demo_step_viewed', { step: key });
  }

  demoTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateDemoTab(tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = demoTabs.length - 1;
      else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % demoTabs.length;
      else nextIndex = (index - 1 + demoTabs.length) % demoTabs.length;
      activateDemoTab(demoTabs[nextIndex], true);
    });
  });

  document.querySelectorAll('.faq-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const panelId = trigger.getAttribute('aria-controls');
      const panel = document.getElementById(panelId);
      const willOpen = trigger.getAttribute('aria-expanded') !== 'true';

      document.querySelectorAll('.faq-trigger').forEach((otherTrigger) => {
        const otherPanel = document.getElementById(otherTrigger.getAttribute('aria-controls'));
        otherTrigger.setAttribute('aria-expanded', 'false');
        if (otherPanel) otherPanel.hidden = true;
      });

      trigger.setAttribute('aria-expanded', String(willOpen));
      if (panel) panel.hidden = !willOpen;
      if (willOpen) track('faq_opened', { question: trigger.textContent.trim() });
    });
  });

  const diagnosisInputs = [...document.querySelectorAll('#diagnosis-checklist input[type="checkbox"]')];
  const diagnosisCount = document.getElementById('diagnosis-count');
  const diagnosisMessage = document.getElementById('diagnosis-message');
  const diagnosisCta = document.getElementById('diagnosis-cta');

  const diagnosisMessages = {
    0: 'Escolha uma ou mais situações para montar seu diagnóstico.',
    1: 'Existe um ponto objetivo para organizar primeiro.',
    2: 'Há perda de continuidade entre atendimento e acompanhamento.',
    3: 'Sua operação já depende demais de memória e esforço manual.',
    4: 'A equipe precisa de uma visão comum para decidir e acompanhar.',
    5: 'O gargalo é estrutural: a conversa precisa virar um processo comercial.',
  };

  function updateDiagnosis() {
    const selected = diagnosisInputs.filter((input) => input.checked);
    const count = selected.length;
    diagnosisCount.textContent = count === 0 ? 'Nenhum ponto marcado' : `${count} ${count === 1 ? 'ponto identificado' : 'pontos identificados'}`;
    diagnosisMessage.textContent = diagnosisMessages[count];
    diagnosisCta.classList.toggle('disabled', count === 0);
    diagnosisCta.setAttribute('aria-disabled', String(count === 0));
    diagnosisCta.textContent = count === 0 ? 'Mapear minha operação' : `Ver caminho para ${count} ${count === 1 ? 'gargalo' : 'gargalos'}`;

    if (count > 0) {
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      arrow.setAttribute('viewBox', '0 0 24 24');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = '<path d="M5 12h14M13 6l6 6-6 6"></path>';
      diagnosisCta.appendChild(arrow);
    }
  }

  diagnosisInputs.forEach((input) => {
    input.addEventListener('change', () => {
      updateDiagnosis();
      track('diagnosis_updated', {
        count: diagnosisInputs.filter((item) => item.checked).length,
        items: diagnosisInputs.filter((item) => item.checked).map((item) => item.value),
      });
    });
  });

  diagnosisCta?.addEventListener('click', (event) => {
    if (diagnosisInputs.every((input) => !input.checked)) {
      event.preventDefault();
      diagnosisInputs[0]?.focus();
    }
  });

  const stickyCta = document.querySelector('.mobile-sticky-cta');
  const offerSection = document.getElementById('comecar');
  let offerVisible = false;

  if ('IntersectionObserver' in window && offerSection) {
    const observer = new IntersectionObserver((entries) => {
      offerVisible = entries[0].isIntersecting;
      stickyCta?.classList.toggle('visible', window.scrollY > 620 && !offerVisible);
    }, { threshold: 0.08 });
    observer.observe(offerSection);
  }

  window.addEventListener('scroll', () => {
    stickyCta?.classList.toggle('visible', window.scrollY > 620 && !offerVisible);
    document.querySelector('.site-header')?.classList.toggle('scrolled', window.scrollY > 12);
  }, { passive: true });

  updateDiagnosis();
})();
