const url = 'https://szlstosdwhrdhcdwsvzl.supabase.co';
const anon = 'sb_publishable_VSfnDFLoWDB9ecSd8rVA6A_t6PGoopf';
const email = 'live-test-' + Date.now() + '@example.com';
const password = 'TestPass123!';
const fullName = 'Live Tester';

async function request(path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: anon,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { ok: response.ok, status: response.status, data, text };
}

(async () => {
  const categories = await request('/rest/v1/service_categories?select=id,name&limit=5');
  console.log('CATEGORIES', categories.ok ? 'OK' : 'ERROR', categories.status, JSON.stringify(categories.data));

  const signup = await request('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, data: { full_name: fullName } }),
  });
  console.log('SIGNUP', signup.ok ? 'OK' : 'ERROR', signup.status, JSON.stringify(signup.data));

  const sessionPayload = signup.data && signup.data.session ? signup.data.session : signup.data;
  const session = sessionPayload && sessionPayload.access_token ? sessionPayload : null;

  if (!session || !session.user || !session.user.id) {
    console.log('NO_SESSION_AFTER_SIGNUP');
    return;
  }

  const customerId = session.user.id;

  const requestCreate = await request('/rest/v1/service_requests', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      customer_id: customerId,
      title: 'Test live request',
      description: 'Validated from live Supabase flow',
      location: 'Dar es Salaam',
      region: 'Dar es Salaam',
      city: 'Kinondoni',
      status: 'open',
    }),
  });
  console.log('REQUEST_CREATE', requestCreate.ok ? 'OK' : 'ERROR', requestCreate.status, JSON.stringify(requestCreate.data));

  const providerCreate = await request('/rest/v1/provider_profiles', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      id: customerId,
      business_name: 'Live Test Provider',
      bio: 'Validated from live provider app flow',
      service_category: 'Umeme',
      region: 'Dar es Salaam',
      city: 'Kinondoni',
      service_area: 'Kinondoni, Dar es Salaam',
      verified: false,
    }),
  });
  console.log('PROVIDER_CREATE', providerCreate.ok ? 'OK' : 'ERROR', providerCreate.status, JSON.stringify(providerCreate.data));

  const profileCheck = await request(`/rest/v1/profiles?select=id,full_name,role&id=eq.${customerId}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  console.log('PROFILE_CHECK', profileCheck.ok ? 'OK' : 'ERROR', profileCheck.status, JSON.stringify(profileCheck.data));
})();
