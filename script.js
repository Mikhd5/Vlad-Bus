(() => {
  const form = document.getElementById('booking-form');
  const message = document.getElementById('form-message');
  const dateInput = document.getElementById('travel-date');
  const routeSelect = document.getElementById('route-id');
  const countrySelect = form?.querySelector('[name=country]');
  const fromInput = form?.querySelector('[name=from]');
  const toInput = form?.querySelector('[name=to]');
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('main-nav');

  document.getElementById('year').textContent = new Date().getFullYear();
  if (dateInput) {
    const today = new Date();
    const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    dateInput.min = localToday;
  }


  // The CRM controls the active route catalogue shown on the public website.
  let publicRoutes = [];
  if (routeSelect && window.location.protocol !== 'file:') {
    fetch('/api/routes').then(response => response.ok ? response.json() : null).then(result => {
      publicRoutes = Array.isArray(result?.routes) ? result.routes : [];
      const routeField = document.getElementById('route-field');
      if (routeField && publicRoutes.length) routeField.hidden = false;
      publicRoutes.forEach(route => {
        const option = document.createElement('option');
        option.value = route.id;
        option.textContent = `${route.from_city} → ${route.to_city} · ${route.country}${route.default_price !== null && route.default_price !== undefined ? ` · ${route.default_price} ${route.currency}` : ''}`;
        routeSelect.appendChild(option);
      });
    }).catch(() => {});
    routeSelect.addEventListener('change', () => {
      const route = publicRoutes.find(item => item.id === routeSelect.value);
      if (!route) return;
      if (countrySelect && ![...countrySelect.options].some(option => option.value === route.country || option.textContent === route.country)) {
        const option = document.createElement('option'); option.textContent = route.country; option.value = route.country; countrySelect.appendChild(option);
      }
      if (countrySelect) countrySelect.value = route.country;
      if (fromInput) fromInput.value = route.from_city;
      if (toInput) toInput.value = route.to_city;
    });
    [countrySelect, fromInput, toInput].filter(Boolean).forEach(input => input.addEventListener('change', () => {
      const selected = publicRoutes.find(item => item.id === routeSelect.value);
      if (selected && (countrySelect.value !== selected.country || fromInput.value.trim().toLowerCase() !== selected.from_city.toLowerCase() || toInput.value.trim().toLowerCase() !== selected.to_city.toLowerCase())) routeSelect.value = '';
    }));
  }

  if (menuToggle && nav) {
    menuToggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      menuToggle.setAttribute('aria-label', isOpen ? 'Закрити меню' : 'Відкрити меню');
    });
    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Відкрити меню');
      });
    });
  }

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      message.replaceChildren();
      message.className = 'form-message';
      if (!form.reportValidity()) return;

      const submitButton = form.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.innerHTML;
      const payload = Object.fromEntries(new FormData(form).entries());
      if (payload.company) return; // hidden anti-spam field

      const travelDate = payload.date ? new Intl.DateTimeFormat('uk-UA').format(new Date(`${payload.date}T00:00:00`)) : payload.date;
      const requestLines = [
        'Вітаю! Хочу залишити заявку на пасажирське перевезення.',
        '',
        `Країна / напрямок: ${payload.country}`,
        `Маршрут: ${payload.from} → ${payload.to}`,
        `Дата поїздки: ${travelDate}`,
        `Бажаний час: ${payload.time || 'Не має значення'}`,
        `Кількість пасажирів: ${payload.passengers}`,
        `Ім’я: ${payload.name}`,
        `Телефон: ${payload.phone}`,
        `Додаткова інформація: ${payload.details || 'Немає'}`
      ];
      const whatsappUrl = `https://wa.me/380979327977?text=${encodeURIComponent(requestLines.join('\n'))}`;

      submitButton.disabled = true;
      submitButton.textContent = 'Відкриваємо WhatsApp…';
      let whatsappWindow = null;
      try { whatsappWindow = window.open(whatsappUrl, '_blank'); } catch (_) { /* fall back to the visible link below */ }
      if (whatsappWindow) {
        try { whatsappWindow.opener = null; } catch (_) { /* browser may restrict opener */ }
      }

      const confirmation = document.createElement('span');
      confirmation.textContent = whatsappWindow
        ? 'WhatsApp відкрито з підготовленою заявкою. Перевірте повідомлення та натисніть «Надіслати».'
        : 'Браузер заблокував нове вікно. Відкрийте WhatsApp за посиланням: ';
      message.appendChild(confirmation);
      if (!whatsappWindow) {
        const link = document.createElement('a');
        link.href = whatsappUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Відкрити WhatsApp';
        message.appendChild(link);
      } else {
        message.classList.add('is-success');
      }
      if (!whatsappWindow) message.classList.add('is-error');
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonText;
    });
  }
})();
