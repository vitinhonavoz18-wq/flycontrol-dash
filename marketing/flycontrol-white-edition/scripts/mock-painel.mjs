// Back end FALSO para gravar o painel ORIGINAL do FlyControl (flycontrol-dash rodando local).
// Pedidos e clientes são fictícios; produtos, preços e configurações são os reais do Açaí Deus Proverá.
// Nada chega ao banco de verdade: toda chamada ao Supabase é respondida aqui.
const SB = 'https://knhenchgntttraaeewlj.supabase.co';
const UID = '00000000-0000-4000-8000-0000000000aa';
const TENANT = 'f73c7dab-b849-4221-8047-4ac0fa6a3982';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
export const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', exp, aud: 'authenticated', email: 'demo@flycontrol.com.br' })}.c2lnbmF0dXJl`;
export const USER = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'demo@flycontrol.com.br', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Açaí Deus Proverá' }, created_at: '2026-09-01T12:00:00Z' };
export const SESSION = { access_token: JWT, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'demo-refresh', user: USER };

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const it = (name, unit, qty = 1, notes = '') => ({ name, unit_price: unit, quantity: qty, total_price: +(unit * qty).toFixed(2), notes, type: 'product', menu_product_id: null });
const order = (n, status, min, cliente, items, extra = {}) => {
  const sub = items.reduce((s, i) => s + i.total_price, 0);
  return {
    id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`, tenant_id: TENANT, order_number: 1040 + n, status, created_at: ago(min), updated_at: ago(min),
    customer_name: cliente, customer_phone: '(71) 90000-00' + String(10 + n), customer_address: 'Rua das Palmeiras, ' + (100 + n * 7), neighborhood: 'São Marcos',
    items, subtotal: sub, delivery_fee: 0, total: +sub.toFixed(2), payment_method: 'Pix', change_for: null, notes: '', order_type: 'delivery', service_mode: 'delivery',
    table_number: null, ticket_number: null, payment_status: 'pending', source: 'sitecreatorfly', ...extra,
  };
};
export const ORDERS = [
  order(1, 'novo', 1, 'Mariana Souza', [it('Açaí na Tigela 500ml', 18, 1, 'Adicionais: Nutella, Calda de Morango, Paçoca')]),
  order(2, 'novo', 3, 'Lucas Andrade', [it('Açaí na Tigela 720ml', 29, 1, 'Adicionais: Ninho, KitKat'), it('Vitamina de Açaí 500ml', 18.5)], { payment_method: 'Cartão de Crédito' }),
  order(3, 'novo', 4, 'Juliana Costa', [it('Hambúrguer de Carne com Salada', 6, 2), it('Batata Frita com Bacon e Cheddar', 15)], { order_type: 'pickup', service_mode: 'pickup', customer_address: null, neighborhood: null }),
  order(4, 'preparando', 9, 'Rafael Lima', [it('Barca de Açaí', 33.9, 1, 'Adicionais: Creme de Ovomaltine, Bis')], { payment_method: 'Dinheiro', change_for: 50 }),
  order(5, 'preparando', 14, 'Beatriz Melo', [it('Açaí na Garrafa com Creme de Maracujá', 19), it('Misto de Queijo e Presunto', 6)]),
  order(6, 'saiu', 22, 'Pedro Henrique', [it('Marmita Toscana com Frango', 18.99), it('Açaí na Tigela 300ml', 13, 1, 'Adicionais: Leite Condensado')]),
  order(7, 'saiu', 31, 'Camila Rocha', [it('Açaí na Tigela 1 LITRO', 33.9, 1, 'Adicionais: Nutella, Ninho, Morango')], { payment_method: 'Cartão de Débito' }),
];
export const PIZZERIA = {
  id: TENANT, owner_id: UID, name: 'Açai Deus provera', slug: 'acai-deus-provera', status: 'active', is_open: true, sound_enabled: true, print_auto: true,
  api_key: 'demo', phone: '(71) 99206-4951', address: 'Salvador, BA', created_at: '2026-09-01T12:00:00Z', updated_at: ago(60),
  primary_color: '42.86 91.8% 52.16%', secondary_color: '290.08 73.33% 32.35%', button_color: null, theme_mode: 'light', business_type: 'Açaíteria',
  hero_media_type: 'video', tagline: 'Seu momento mais gostoso começa aqui 💜', selected_template: 'black', show_item_images: true,
  delivery_enabled: true, pickup_enabled: true, table_enabled: true, subscription_plan: 'test', plan_type: 'premium', subscription_status: 'active', billing_model: 'fixed',
  welcome_seen: true, payment_methods: ['Pix', 'Cartão de Débito', 'Dinheiro', 'Cartão de Crédito'], average_delivery_time: 'De 15 a 40 minutos', delivery_fee: 0,
  city: 'Salvador,BA', neighborhood: 'SÃO MARCOS', provision_status: 'provisioned', public_url: 'https://conectfly.com.br/acai-deus-provera', is_active: true,
  site_settings: { menu_texts: { menu_badge: 'FEITO PARA ADOÇAR SEU DIA', menu_title: 'MONTE SEU AÇAI', menu_description: 'Escolha o tamanho, adicione seus acompanhamentos favoritos e monte um açaí cremoso, caprichado e do seu jeito. 💜' }, menu_layout: 'acai', checkout_layout: 'central', background_color: '288 33.33% 5.88%' },
  subscription_expires_at: '2027-01-01T00:00:00Z',
  hero_video_url: 'https://knhenchgntttraaeewlj.supabase.co/storage/v1/object/sign/menu-images/hero/1789870368326-bdeclm.mp4?token=demo',
};
const TABLES = { user_roles: [{ role: 'owner' }], pizzerias: [PIZZERIA], orders: ORDERS, waiters: [] };

export async function installMock(ctx, { extra = {}, log = () => {} } = {}) {
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, ['sb-knhenchgntttraaeewlj-auth-token', JSON.stringify(SESSION)]);
  await ctx.route(SB + '/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname;
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' } });
    if (p.startsWith('/storage/')) return route.continue();
    if (p.startsWith('/auth/v1/user')) return json(USER);
    if (p.startsWith('/auth/v1/token')) return json(SESSION);
    if (p.startsWith('/auth/v1/')) return json({});
    if (p.startsWith('/functions/v1/')) { log('fn', p); return json(extra['fn:' + p.split('/').pop()] ?? {}); }
    if (p.startsWith('/rest/v1/rpc/')) { const fn = p.split('/').pop(); log('rpc', fn); return json(extra['rpc:' + fn] ?? null); }
    if (p.startsWith('/rest/v1/')) {
      const table = p.split('/').pop();
      if (req.method() !== 'GET' && req.method() !== 'HEAD') {
        log('WRITE(simulada)', req.method(), table, u.search);
        // simula a gravação só na memória desta gravação (nada vai para o banco real)
        if (req.method() === 'PATCH' && TABLES[table]) {
          const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
          let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch {}
          for (const r of TABLES[table]) if (!id || r.id === id) Object.assign(r, body);
          return json(TABLES[table].filter((r) => !id || r.id === id));
        }
        return json([], 200);
      }
      const rows = extra[table] ?? TABLES[table];
      if (rows === undefined) log('tabela sem dados:', table, u.search.slice(0, 80));
      const data = rows ?? [];
      const accept = req.headers()['accept'] || '';
      const range = { 'content-range': `0-${Math.max(0, data.length - 1)}/${data.length}` };
      if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': '*', ...range } });
      if (accept.includes('vnd.pgrst.object')) return data.length ? json(data[0], 200, range) : json({ code: 'PGRST116', message: 'no rows' }, 406);
      return json(data, 200, range);
    }
    return route.continue();
  });
}
