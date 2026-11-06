// Puente opcional de licencias para Kibian Extractos (Cloudflare Workers, plan gratis).
// Solo se necesita si el navegador no deja llamar directo a Lemon Squeezy.
// Recibe unicamente la clave de licencia; nunca datos de extractos.
const ALLOWED_ORIGIN = 'https://fabianlasso3.github.io';

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });
    if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403, headers: cors });

    let body;
    try { body = await request.json(); } catch (e) { return new Response('Bad Request', { status: 400, headers: cors }); }
    const action = ['activate', 'validate', 'deactivate'].includes(body.action) ? body.action : null;
    if (!action || !body.license_key) return new Response('Bad Request', { status: 400, headers: cors });

    const params = new URLSearchParams();
    params.set('license_key', String(body.license_key).slice(0, 200));
    if (body.instance_name) params.set('instance_name', String(body.instance_name).slice(0, 100));
    if (body.instance_id) params.set('instance_id', String(body.instance_id).slice(0, 100));

    const res = await fetch('https://api.lemonsqueezy.com/v1/licenses/' + action, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    return new Response(await res.text(), { status: res.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
};
