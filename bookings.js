import { createClient } from '@supabase/supabase-js';

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 8;
const recentRequests = new Map();

function clean(value, max = 180) {
  return String(value ?? '').replace(/[<>\u0000-\u001F]/g, ' ').trim().slice(0, max);
}

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const current = recentRequests.get(ip) || [];
  const active = current.filter((time) => now - time < RATE_WINDOW_MS);
  if (active.length >= RATE_LIMIT) return json(res, 429, { error: 'Забагато заявок. Спробуйте трохи пізніше.' });
  active.push(now);
  recentRequests.set(ip, active);

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { return json(res, 400, { error: 'Некоректний формат заявки.' }); }
  }
  // Honeypot: bots fill this hidden field. Respond as if accepted, without storing it.
  if (clean(body.company, 120)) return json(res, 201, { ok: true, bookingNumber: 'UA-RECEIVED' });

  const booking = {
    country: clean(body.country, 100),
    from_city: clean(body.from, 100),
    to_city: clean(body.to, 100),
    travel_date: clean(body.date, 10),
    preferred_time: clean(body.time || 'Не має значення', 40),
    passengers: Number.parseInt(body.passengers, 10),
    customer_name: clean(body.name, 100),
    customer_phone: clean(body.phone, 40),
    notes: clean(body.details, 1000),
    requested_route_id: clean(body.route_id, 80),
    source: 'website',
    status: 'new'
  };

  if (!booking.country || !booking.from_city || !booking.to_city || !booking.travel_date || !booking.customer_name || !booking.customer_phone) {
    return json(res, 400, { error: 'Заповніть усі обов’язкові поля.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.travel_date) || Number.isNaN(Date.parse(`${booking.travel_date}T00:00:00Z`))) {
    return json(res, 400, { error: 'Перевірте дату поїздки.' });
  }
  if (!Number.isInteger(booking.passengers) || booking.passengers < 1 || booking.passengers > 20) {
    return json(res, 400, { error: 'Некоректна кількість пасажирів.' });
  }
  if (booking.from_city.toLowerCase() === booking.to_city.toLowerCase()) {
    return json(res, 400, { error: 'Міста відправлення та прибуття мають відрізнятися.' });
  }
  if (booking.customer_phone.replace(/\D/g, '').length < 7) {
    return json(res, 400, { error: 'Перевірте номер телефону.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json(res, 503, { error: 'Зараз не вдалося прийняти заявку онлайн. Будь ласка, напишіть нам у WhatsApp або зателефонуйте.' });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const normalizedPhone = booking.customer_phone.replace(/[\s()\-]/g, '');
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .upsert({
        full_name: booking.customer_name,
        phone: booking.customer_phone,
        phone_normalized: normalizedPhone
      }, { onConflict: 'phone_normalized' })
      .select('id')
      .single();
    if (customerError) throw customerError;

    let matchedRoute = null;
    if (booking.requested_route_id && /^[0-9a-f-]{36}$/i.test(booking.requested_route_id)) {
      const { data, error } = await supabase.from('routes').select('id,currency').eq('id', booking.requested_route_id).eq('country', booking.country).ilike('from_city', booking.from_city).ilike('to_city', booking.to_city).eq('active', true).maybeSingle();
      if (error) throw error;
      matchedRoute = data;
    }
    if (!matchedRoute) {
      const { data, error } = await supabase.from('routes').select('id,currency').eq('country', booking.country).ilike('from_city', booking.from_city).ilike('to_city', booking.to_city).eq('active', true).maybeSingle();
      if (error) throw error;
      matchedRoute = data;
    }
    delete booking.requested_route_id;

    const { data: saved, error: insertError } = await supabase
      .from('bookings')
      .insert({ ...booking, customer_id: customer.id, route_id: matchedRoute?.id || null, currency: matchedRoute?.currency || 'EUR' })
      .select('id, booking_number')
      .single();
    if (insertError) throw insertError;

    // Telegram is optional. A notification failure must not undo a saved booking.
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (botToken && chatId) {
      const message = [
        '🚐 Нова заявка з сайту',
        `Номер: ${saved.booking_number}`,
        `Клієнт: ${booking.customer_name}`,
        `Телефон: ${booking.customer_phone}`,
        `Маршрут: ${booking.from_city} → ${booking.to_city} (${booking.country})`,
        `Дата: ${booking.travel_date}, час: ${booking.preferred_time}`,
        `Пасажири: ${booking.passengers}`,
        `Коментар: ${booking.notes || '—'}`
      ].join('\n');
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: message })
        });
      } catch (notifyError) {
        console.error('Telegram notification failed:', notifyError);
      }
    }

    return json(res, 201, { ok: true, bookingNumber: saved.booking_number });
  } catch (error) {
    console.error('Booking API error:', error);
    return json(res, 500, { error: 'Не вдалося зберегти заявку. Спробуйте ще раз або зв’яжіться з менеджером.' });
  }
}
