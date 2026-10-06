const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export async function checkSupabaseConnection() {
  if (!isSupabaseConfigured) return { connected: false, reason: 'missing-config' as const }

  const response = await fetch(`${supabaseUrl}/rest/v1/service_categories?select=id&limit=1`, {
    headers: { apikey: supabaseAnonKey!, Authorization: `Bearer ${supabaseAnonKey}` },
  })

  return { connected: response.ok, reason: response.ok ? 'connected' as const : 'schema-or-key-error' as const }
}

export type RemoteRequest = {
  title: string
  description?: string
  location: string
  provider_id?: string | null
  category_id?: string | null
  region?: string | null
  city?: string | null
  status?: 'open' | 'quoted' | 'booked' | 'completed' | 'cancelled'
}

export type AuthSession = {
  access_token: string
  user: {
    id: string
    email?: string
    full_name?: string | null
    name?: string | null
  }
}

export type AuthResult =
  | { ok: true; session: AuthSession; needsEmailConfirmation: false }
  | { ok: true; session: null; needsEmailConfirmation: true }
  | { ok: false; message: string; rateLimited: boolean; retryAfterSeconds?: number }

export type ProfileRow = {
  id: string
  full_name: string | null
  role?: string | null
  phone?: string | null
  location?: string | null
}

function normalizeSession(payload: Record<string, any> | null, fallbackName?: string): AuthSession | null {
  if (!payload) return null

  const authData = payload.session ?? payload
  const user = authData.user ?? payload.user ?? null
  if (!user?.id || !authData.access_token) return null

  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.full_name || fallbackName || user.email || 'MtaaniHub user'

  return {
    access_token: authData.access_token,
    user: {
      id: user.id,
      email: user.email,
      full_name: fullName,
      name: user.user_metadata?.name || fullName,
    },
  }
}

async function syncProfile(session: AuthSession, fullName: string) {
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) return

  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }

  const checkResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,role&id=eq.${session.user.id}`, {
    headers,
  })

  if (checkResponse.ok) {
    const existing = await checkResponse.json()
    if (Array.isArray(existing) && existing.length > 0) {
      const profile = existing[0]
      const existingRole = typeof profile?.role === 'string' ? profile.role.trim().toLowerCase() : ''
      const safeRole = existingRole === 'provider' || existingRole === 'admin' || existingRole === 'customer' ? existingRole : 'customer'

      const patchBody: Record<string, string | null> = {
        full_name: fullName,
      }

      if (!existingRole) {
        patchBody.role = 'customer'
      } else if (safeRole !== existingRole) {
        patchBody.role = safeRole
      }

      const patchResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${session.user.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patchBody),
      })

      if (patchResponse.ok) return
      const patchText = await patchResponse.text()
      if (patchText) console.warn('MtaaniHub profile update failed:', patchText)
      return
    }
  }

  const insertResponse = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      id: session.user.id,
      full_name: fullName,
      role: 'customer',
    }),
  })

  if (!insertResponse.ok) {
    const text = await insertResponse.text()
    console.warn('MtaaniHub profile insert failed:', text)
  }
}

async function ensureProfileExists(session: AuthSession) {
  try {
    const fullName = session.user.full_name || session.user.name || session.user.email || 'MtaaniHub user'
    await syncProfile(session, fullName)
  } catch (error) {
    console.warn('MtaaniHub profile ensure failed:', error)
  }
}

export function getStoredSession(): AuthSession | null {
  try { return JSON.parse(localStorage.getItem('mtaani-session') || 'null') } catch { return null }
}

export async function signIn(email: string, password: string) {
  return authenticate('/auth/v1/token?grant_type=password', { email, password }, false)
}

export async function signUp(email: string, password: string, fullName: string) {
  return authenticate('/auth/v1/signup', { email, password, data: { full_name: fullName } }, true)
}

function getAuthErrorMessage(data: Record<string, unknown>, fallback: string) {
  const raw = String(data.error_description || data.msg || data.message || '')
  const combined = `${raw} ${JSON.stringify(data)}`.toLowerCase()

  if (combined.includes('rate limit') || combined.includes('too many requests') || combined.includes('email rate limit')) {
    return 'Umefanya maombi mengi ya kujisajili kwa muda mfupi. Tafadhali subiri dakika chache au jaribu email nyingine.'
  }

  return raw || fallback
}

async function authenticate(path: string, body: Record<string, unknown>, allowPendingConfirmation: boolean): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false, message: 'Supabase haijawekwa.', rateLimited: false }
  const response = await fetch(`${supabaseUrl}${path}`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) {
    const rateLimited = /rate limit|too many requests|email rate limit/i.test(JSON.stringify(data))
    const retryAfter = Number(response.headers.get('Retry-After'))
    return {
      ok: false,
      message: getAuthErrorMessage(data, 'Imeshindikana kuingia.'),
      rateLimited,
      ...(rateLimited && Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
    }
  }

  const session = normalizeSession(data, typeof body.data === 'object' && body.data && 'full_name' in body.data ? String((body.data as { full_name?: string }).full_name) : undefined)
  if (!session) {
    if (allowPendingConfirmation && (data.user?.id || data.id)) {
      return { ok: true, session: null, needsEmailConfirmation: true }
    }
    return { ok: false, message: 'Taarifa za sesheni hazikuweza kusomwa.', rateLimited: false }
  }

  await ensureProfileExists(session)

  localStorage.setItem('mtaani-session', JSON.stringify(session))
  return { ok: true, session, needsEmailConfirmation: false }
}

export async function getCurrentProfile(session: AuthSession | null) {
  if (!isSupabaseConfigured || !session) return null

  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,full_name,role,phone,location&id=eq.${session.user.id}`, {
    headers: {
      apikey: supabaseAnonKey!,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) throw new Error(await response.text())

  const payload = await response.json()
  const record = Array.isArray(payload) ? payload[0] : payload
  if (!record) return null

  return {
    id: record.id,
    full_name: record.full_name || session.user.full_name || session.user.email || 'MtaaniHub user',
    role: record.role,
    phone: record.phone,
    location: record.location,
  } satisfies ProfileRow
}

export async function getVerifiedProviders() {
  if (!isSupabaseConfigured) return []

  const queries = [
    `${supabaseUrl}/rest/v1/provider_profiles?select=id,verified,business_name,service_area,service_category,region,city,bio,experience_years,available,rating,review_count`,
    `${supabaseUrl}/rest/v1/provider_profiles?select=id,verified,business_name,service_area,available,rating,review_count,services(title,starting_price,service_categories(name))`,
  ]

  for (const query of queries) {
    const response = await fetch(query, {
      headers: {
        apikey: supabaseAnonKey!,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) continue

    const payload = await response.json()
    return Array.isArray(payload) ? payload.filter((item) => item?.verified).map((item, index) => {
      const service = Array.isArray(item.services) ? item.services[0] : item.services
      const serviceCategory = Array.isArray(service?.service_categories) ? service.service_categories[0] : service?.service_categories
      const categoryName = item.service_category || serviceCategory?.name || 'Zote'
      const fullName = item.business_name || `Provider ${index + 1}`
      const initials = fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part: string) => part[0]?.toUpperCase() || '')
        .join('') || 'P'
      const location = [item.city, item.region].filter(Boolean).join(', ') || item.service_area || 'Dar es Salaam'

      return {
        id: item.id,
        name: fullName,
        specialty: service?.title || item.business_name || 'Local service provider',
        category: categoryName,
        rating: Number(item.rating || 0),
        reviews: Number(item.review_count || 0),
        distance: 'Karibu nawe',
        location,
        price: service?.starting_price ? `Kuanzia TSh ${Number(service.starting_price).toLocaleString()}` : 'Uliza bei',
        available: item.available ? 'Anapatikana' : 'Hapatikani sasa',
        initials,
        accent: ['ochre', 'coral', 'teal', 'sage', 'navy', 'plum'][index % 6],
        featured: index < 2,
        bio: item.bio || '',
        experienceYears: Number(item.experience_years || 0),
      }
    }) : []
  }

  return []
}

export async function getVerifiedProviderCount() {
  if (!isSupabaseConfigured) return null
  const response = await fetch(`${supabaseUrl}/rest/v1/provider_profiles?select=id&verified=eq.true`, {
    method: 'HEAD',
    headers: {
      apikey: supabaseAnonKey!,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  if (!response.ok) throw new Error(await response.text())
  const total = response.headers.get('Content-Range')?.split('/')[1]
  return total && total !== '*' ? Number(total) : null
}

export type ServiceRequestRecord = {
  id: string
  provider_id?: string | null
  title: string
  description: string | null
  location: string
  region: string | null
  city: string | null
  category_id: string | null
  status: string
  created_at: string
}

export type PendingProviderRecord = {
  id: string
  full_name: string
  business_name: string | null
  service_area: string | null
  service_category: string | null
  region: string | null
  city: string | null
  bio: string | null
  experience_years: number
  verified: boolean
}

export type CustomerQuotationRecord = {
  id: string
  request_id: string
  amount: number
  message: string | null
  estimated_days: number | null
  provider_id: string
  booking_id: string | null
  booking_status: string | null
  customer_confirmed_at: string | null
  service_requests: { title: string; customer_id: string; status: string } | null
  provider_profiles: { business_name: string | null; profiles: { full_name: string | null } | null } | null
}

export type ProviderQuotationRecord = {
  id: string
  request_id: string
  amount: number
  message: string | null
  estimated_days: number | null
  created_at: string
  booking_id: string | null
  booking_status: string | null
  customer_confirmed_at: string | null
  service_requests: { title: string; status: string } | null
}

export type UserNotificationRecord = {
  id: string
  title: string
  body: string
  read_at: string | null
  created_at: string
}

function userHeaders(session: AuthSession) {
  return {
    apikey: supabaseAnonKey!,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

function isMissingColumnError(message: string, column: string) {
  const normalized = message.toLowerCase()
  return normalized.includes(column.toLowerCase())
    && (normalized.includes('column') || normalized.includes('schema cache') || normalized.includes('pgrst204'))
}

function summarizeSupabaseError(message: string) {
  try {
    const parsed = JSON.parse(message) as { code?: string; message?: string; details?: string; hint?: string }
    const description = [parsed.message, parsed.details, parsed.hint].filter(Boolean).join(' ')
    return `${parsed.code ? `${parsed.code}: ` : ''}${description}`.slice(0, 300) || 'Supabase haikupokea ombi.'
  } catch {
    if (/^\s*(alter|create|drop|grant|revoke)\s+(table|policy|index|function|type)\b/i.test(message)) {
      return 'Supabase imerudisha SQL badala ya maelezo ya hitilafu. Hakiki kwamba migration inaendeshwa kwenye SQL Editor pekee, kisha jaribu tena.'
    }
    return message.replace(/\s+/g, ' ').slice(0, 300) || 'Supabase haikupokea ombi.'
  }
}

export async function getCustomerRequests(session: AuthSession) {
  const base = `${supabaseUrl}/rest/v1/service_requests?select=`
  const suffix = `&customer_id=eq.${session.user.id}&order=created_at.desc`
  const selectVariants = [
    'id,provider_id,title,description,location,region,city,category_id,status,created_at',
    'id,title,description,location,region,city,category_id,status,created_at',
    'id,title,description,location,category_id,status,created_at',
  ]
  let response: Response | undefined
  for (const select of selectVariants) {
    response = await fetch(`${base}${select}${suffix}`, { headers: userHeaders(session) })
    if (response.ok) break
    const errorText = await response.clone().text()
    if (select === selectVariants[0] && isMissingColumnError(errorText, 'provider_id')) continue
    if (select !== selectVariants[2] && (isMissingColumnError(errorText, 'region') || isMissingColumnError(errorText, 'city'))) continue
    throw new Error(errorText)
  }
  if (!response?.ok) throw new Error(await response?.text())
  return await response.json() as ServiceRequestRecord[]
}

export async function getCustomerQuotations(session: AuthSession) {
  const requests = await getCustomerRequests(session)
  if (requests.length === 0) return []

  const requestById = new Map(requests.map((request) => [request.id, request]))
  const requestIds = requests.map((request) => request.id).join(',')
  const quoteUrl = `${supabaseUrl}/rest/v1/quotations?select=`
  const quoteSuffix = `&request_id=in.(${requestIds})&order=created_at.desc`
  let quotationsResponse = await fetch(`${quoteUrl}id,request_id,amount,message,estimated_days,provider_id${quoteSuffix}`, {
    headers: userHeaders(session),
  })
  let hasEstimatedDays = true
  if (!quotationsResponse.ok && isMissingColumnError(await quotationsResponse.clone().text(), 'estimated_days')) {
    quotationsResponse = await fetch(`${quoteUrl}id,request_id,amount,message,provider_id${quoteSuffix}`, {
      headers: userHeaders(session),
    })
    hasEstimatedDays = false
  }
  if (!quotationsResponse.ok) throw new Error(await quotationsResponse.text())

  const quotations = await quotationsResponse.json() as Array<Omit<CustomerQuotationRecord, 'service_requests' | 'provider_profiles'>>
  const bookingsResponse = await fetch(`${supabaseUrl}/rest/v1/bookings?select=id,request_id,quotation_id,status,customer_confirmed_at&request_id=in.(${requestIds})`, {
    headers: userHeaders(session),
  })
  if (!bookingsResponse.ok) throw new Error(await bookingsResponse.text())
  const bookings = await bookingsResponse.json() as Array<{ id: string; request_id: string; quotation_id: string; status: string; customer_confirmed_at: string | null }>
  const bookingByQuotation = new Map(bookings.map((booking) => [booking.quotation_id, booking]))
  const providerIds = [...new Set(quotations.map((quotation) => quotation.provider_id).filter(Boolean))]
  const providerMap = new Map<string, { business_name: string | null; profiles: { full_name: string | null } | null }>()

  if (providerIds.length > 0) {
    const providerResponse = await fetch(`${supabaseUrl}/rest/v1/provider_profiles?select=id,business_name&id=in.(${providerIds.join(',')})`, {
      headers: userHeaders(session),
    })
    if (!providerResponse.ok) throw new Error(await providerResponse.text())
    const providerRecords = await providerResponse.json() as Array<{ id: string; business_name: string | null }>

    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,full_name&id=in.(${providerIds.join(',')})`, {
      headers: userHeaders(session),
    })
    if (!profileResponse.ok) throw new Error(await profileResponse.text())
    const profileRecords = await profileResponse.json() as Array<{ id: string; full_name: string | null }>
    const profileNames = new Map(profileRecords.map((profile) => [profile.id, profile.full_name]))

    for (const provider of providerRecords) {
      providerMap.set(provider.id, {
        business_name: provider.business_name,
        profiles: { full_name: profileNames.get(provider.id) || null },
      })
    }
  }

  return quotations.map((quotation) => ({
    ...quotation,
    estimated_days: hasEstimatedDays ? quotation.estimated_days : null,
    booking_id: bookingByQuotation.get(quotation.id)?.id || null,
    booking_status: bookingByQuotation.get(quotation.id)?.status || null,
    customer_confirmed_at: bookingByQuotation.get(quotation.id)?.customer_confirmed_at || null,
    service_requests: requestById.get(quotation.request_id)
      ? {
        title: requestById.get(quotation.request_id)!.title,
        customer_id: session.user.id,
        status: requestById.get(quotation.request_id)!.status,
      }
      : null,
    provider_profiles: providerMap.get(quotation.provider_id) || null,
  })) as CustomerQuotationRecord[]
}

export function describeDashboardError(error: unknown, role: 'customer' | 'provider' | 'admin') {
  const detail = error instanceof Error ? error.message : String(error || '')
  const normalized = detail.toLowerCase()
  let apiMessage = detail
  let apiCode = ''
  try {
    const parsed = JSON.parse(detail) as { code?: string; message?: string; details?: string; hint?: string }
    apiCode = parsed.code || ''
    apiMessage = [parsed.message, parsed.details, parsed.hint].filter(Boolean).join(' ')
  } catch {
    apiMessage = detail
  }
  const diagnostic = apiCode ? ` (Supabase ${apiCode}: ${apiMessage})` : ''
  if (normalized.includes('jwt') || normalized.includes('unauthorized') || normalized.includes('401')) {
    return 'Kipindi cha kuingia kimeisha au si sahihi. Toka kisha ingia tena.'
  }
  if (normalized.includes('permission denied') || normalized.includes('row-level security') || normalized.includes('42501') || normalized.includes('403')) {
    return 'Akaunti haina ruhusa ya kusoma taarifa hizi. Hakikisha role na sera za RLS zimesanidiwa kwenye Supabase.'
  }
  if (normalized.includes('provider_id') && (normalized.includes('column') || normalized.includes('schema cache'))) {
    return 'Orodha ya request imepakiwa bila kipengele cha kuelekeza provider. Endesha migration 20261004_targeted_provider_requests.sql ili kuwezesha uelekezaji wa moja kwa moja.'
  }
  if (normalized.includes('estimated_days') && (normalized.includes('column') || normalized.includes('schema cache') || normalized.includes('pgrst204'))) {
    return 'Database haina safu ya makadirio ya muda wa quotation. App inajaribu kutumia quotations bila taarifa hiyo; endesha migration 20261005_quotation_estimates.sql ili kuiwezesha.'
  }
  if (normalized.includes('pgrst200') || normalized.includes('relationship')) {
    return 'Supabase imeshindwa kuunganisha taarifa za dashboard. Refresh schema cache kwenye Supabase kisha jaribu tena.'
  }
  if (normalized.includes('does not exist') || normalized.includes('schema cache') || normalized.includes('pgrst')) {
    return `Supabase imerudisha hitilafu ya data kwenye dashboard ya ${role}. Hakiki sera za database.${diagnostic}`
  }
  if (role === 'admin') return 'Imeshindikana kupakia dashboard ya admin. Hakikisha role ya akaunti ni admin na migrations za Supabase zimeendeshwa.'
  if (role === 'provider') return 'Imeshindikana kupakia dashboard ya provider. Hakikisha provider amethibitishwa na migrations za Supabase zimeendeshwa.'
  return 'Imeshindikana kupakia dashboard ya mteja. Angalia ruhusa za Supabase na ujaribu tena.'
}

export async function acceptQuotation(session: AuthSession, requestId: string, quotationId: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/accept_quotation`, {
    method: 'POST',
    headers: { ...userHeaders(session), Prefer: 'return=minimal' },
    body: JSON.stringify({ p_request_id: requestId, p_quotation_id: quotationId }),
  })
  if (!response.ok) throw new Error(await response.text())
}

export async function getOpenServiceRequests(session: AuthSession) {
  let includeProviderId = true
  let includeLocationFields = true

  while (true) {
    const fields = [
      'id',
      ...(includeProviderId ? ['provider_id'] : []),
      'title',
      'description',
      'location',
      ...(includeLocationFields ? ['region', 'city'] : []),
      'category_id',
      'status',
      'created_at',
    ].join(',')
    const targetedFilter = includeProviderId ? `&or=(provider_id.is.null,provider_id.eq.${session.user.id})` : ''
    const response = await fetch(`${supabaseUrl}/rest/v1/service_requests?select=${fields}&status=eq.open${targetedFilter}&order=created_at.desc`, {
      headers: userHeaders(session),
    })

    if (response.ok) return await response.json() as ServiceRequestRecord[]

    const error = await response.text()
    const missingProviderId = includeProviderId && isMissingColumnError(error, 'provider_id')
    const missingLocation = includeLocationFields
      && (isMissingColumnError(error, 'region') || isMissingColumnError(error, 'city'))

    if (!missingProviderId && !missingLocation) throw new Error(error)
    if (missingProviderId) includeProviderId = false
    if (missingLocation) includeLocationFields = false
  }
}

export async function createQuotation(session: AuthSession, requestId: string, amount: number, message: string, estimatedDays?: number | null) {
  const endpoint = `${supabaseUrl}/rest/v1/quotations`
  let response = await fetch(endpoint, {
    method: 'POST',
    headers: { ...userHeaders(session), Prefer: 'return=minimal' },
    body: JSON.stringify({ request_id: requestId, provider_id: session.user.id, amount, message, estimated_days: estimatedDays || null }),
  })
  if (!response.ok && isMissingColumnError(await response.clone().text(), 'estimated_days')) {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...userHeaders(session), Prefer: 'return=minimal' },
      body: JSON.stringify({ request_id: requestId, provider_id: session.user.id, amount, message }),
    })
  }
  if (!response.ok) throw new Error(await response.text())
}

export async function getProviderQuotations(session: AuthSession) {
  const base = `${supabaseUrl}/rest/v1/quotations?select=`
  const suffix = `&provider_id=eq.${session.user.id}&order=created_at.desc`
  let response = await fetch(`${base}id,request_id,amount,message,estimated_days,created_at,service_requests(title,status)${suffix}`, {
    headers: userHeaders(session),
  })
  let hasEstimatedDays = true
  if (!response.ok && isMissingColumnError(await response.clone().text(), 'estimated_days')) {
    response = await fetch(`${base}id,request_id,amount,message,created_at,service_requests(title,status)${suffix}`, {
      headers: userHeaders(session),
    })
    hasEstimatedDays = false
  }
  if (!response.ok) throw new Error(await response.text())
  const quotations = await response.json() as Array<Omit<ProviderQuotationRecord, 'booking_id' | 'booking_status' | 'estimated_days'> & { estimated_days?: number | null }>
  if (quotations.length === 0) return []
  const requestIds = [...new Set(quotations.map((quotation) => quotation.request_id))]
  const bookingsResponse = await fetch(`${supabaseUrl}/rest/v1/bookings?select=id,request_id,quotation_id,status,customer_confirmed_at&request_id=in.(${requestIds.join(',')})`, {
    headers: userHeaders(session),
  })
  if (!bookingsResponse.ok) throw new Error(await bookingsResponse.text())
  const bookings = await bookingsResponse.json() as Array<{ id: string; request_id: string; quotation_id: string; status: string; customer_confirmed_at: string | null }>
  const bookingByQuotation = new Map(bookings.map((booking) => [booking.quotation_id, booking]))
  return quotations.map((quotation) => {
    const booking = bookingByQuotation.get(quotation.id)
    return {
      ...quotation,
      estimated_days: hasEstimatedDays ? quotation.estimated_days || null : null,
      booking_id: booking?.id || null,
      booking_status: booking?.status || null,
      customer_confirmed_at: booking?.customer_confirmed_at || null,
    }
  })
}

export async function updateBookingProgress(session: AuthSession, bookingId: string, status: 'in_progress' | 'completed') {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/update_booking_progress`, {
    method: 'POST',
    headers: { ...userHeaders(session), Prefer: 'return=minimal' },
    body: JSON.stringify({ p_booking_id: bookingId, p_status: status }),
  })
  if (!response.ok) throw new Error(await response.text())
}

export async function confirmBookingCompletion(session: AuthSession, bookingId: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/confirm_booking_completion`, {
    method: 'POST',
    headers: { ...userHeaders(session), Prefer: 'return=minimal' },
    body: JSON.stringify({ p_booking_id: bookingId }),
  })
  if (!response.ok) throw new Error(await response.text())
}

export async function getUserNotifications(session: AuthSession) {
  const response = await fetch(`${supabaseUrl}/rest/v1/notifications?select=id,title,body,read_at,created_at&user_id=eq.${session.user.id}&order=created_at.desc&limit=20`, {
    headers: userHeaders(session),
  })
  if (!response.ok) throw new Error(await response.text())
  return await response.json() as UserNotificationRecord[]
}

export async function markUserNotificationRead(session: AuthSession, notificationId: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/notifications?id=eq.${notificationId}&user_id=eq.${session.user.id}`, {
    method: 'PATCH',
    headers: { ...userHeaders(session), Prefer: 'return=minimal' },
    body: JSON.stringify({ read_at: new Date().toISOString() }),
  })
  if (!response.ok) throw new Error(await response.text())
}

export async function deleteUserNotification(session: AuthSession, notificationId: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/notifications?id=eq.${notificationId}&user_id=eq.${session.user.id}`, {
    method: 'DELETE',
    headers: { ...userHeaders(session), Prefer: 'return=minimal' },
  })
  if (!response.ok) throw new Error(await response.text())
}

export async function deleteAllUserNotifications(session: AuthSession) {
  const response = await fetch(`${supabaseUrl}/rest/v1/notifications?user_id=eq.${session.user.id}`, {
    method: 'DELETE',
    headers: { ...userHeaders(session), Prefer: 'return=minimal' },
  })
  if (!response.ok) throw new Error(await response.text())
}

export async function getServiceCategories() {
  if (!isSupabaseConfigured) return []

  const response = await fetch(`${supabaseUrl}/rest/v1/service_categories?select=id,name,icon&order=name.asc`, {
    headers: { apikey: supabaseAnonKey!, Authorization: `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json' },
  })

  if (!response.ok) return []
  return await response.json() as Array<{ id: string; name: string; icon: string | null }>
}

function normalizeCategoryName(name: string) {
  const trimmed = (name || '').trim()
  if (!trimmed) return ''

  const aliases: Record<string, string> = {
    electric: 'Umeme',
    electricity: 'Umeme',
    umeme: 'Umeme',
    plumbing: 'Plumbing',
    water: 'Plumbing',
    wifi: 'ICT & Wi-Fi',
    internet: 'ICT & Wi-Fi',
    ict: 'ICT & Wi-Fi',
    'ict & wifi': 'ICT & Wi-Fi',
    cleaning: 'Usafi',
    usafi: 'Usafi',
    furniture: 'Useremala',
    useremala: 'Useremala',
    camera: 'CCTV',
    cctv: 'CCTV',
    security: 'CCTV',
  }

  const normalized = trimmed.toLowerCase().replace(/[^a-z&\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return aliases[normalized] || trimmed
}

export async function getCategoryIdByName(name: string) {
  const categories = await getServiceCategories()
  const targetName = normalizeCategoryName(name)

  if (!targetName) return null

  return categories.find((item) => normalizeCategoryName(item.name) === targetName)?.id ?? null
}

export async function applyAsProvider(session: AuthSession, businessName: string, serviceArea: string, bio: string, serviceCategory?: string, region?: string, city?: string) {
  await ensureProfileExists(session)

  const normalizedBio = [bio, serviceCategory ? `Aina ya huduma: ${serviceCategory}` : ''].filter(Boolean).join('\n')
  const fallbackServiceArea = [serviceArea, city, region].filter(Boolean).join(', ') || serviceArea || 'Tanzania'
  const payload: Record<string, unknown> = {
    id: session.user.id,
    business_name: businessName,
    service_area: fallbackServiceArea,
    service_category: serviceCategory || null,
    region: region || null,
    city: city || null,
    bio: normalizedBio,
    verified: false,
  }

  let response = await fetch(`${supabaseUrl}/rest/v1/provider_profiles`, {
    method: 'POST',
    headers: { ...userHeaders(session), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const bodyText = await response.text()
    const summary = bodyText.toLowerCase()
    const columnIssue = summary.includes('column') || summary.includes('does not exist') || summary.includes('unknown')

    if (columnIssue) {
      const fallbackPayload = {
        id: session.user.id,
        business_name: businessName,
        service_area: fallbackServiceArea,
        bio: normalizedBio,
        verified: false,
      }

      response = await fetch(`${supabaseUrl}/rest/v1/provider_profiles`, {
        method: 'POST',
        headers: { ...userHeaders(session), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(fallbackPayload),
      })
    }

    if (!response.ok) {
      const fallbackText = await response.text()
      const maybeAlreadyExists = fallbackText.toLowerCase().includes('duplicate') || fallbackText.toLowerCase().includes('already exists')
      if (maybeAlreadyExists) {
        const updateResponse = await fetch(`${supabaseUrl}/rest/v1/provider_profiles?id=eq.${session.user.id}`, {
          method: 'PATCH',
          headers: { ...userHeaders(session), Prefer: 'return=minimal' },
          body: JSON.stringify({ business_name: businessName, service_area: fallbackServiceArea, bio: normalizedBio, verified: false }),
        })
        if (!updateResponse.ok) throw new Error(await updateResponse.text())
        return
      }

      throw new Error(fallbackText || bodyText)
    }
  }
}

export async function getPendingProviders(session: AuthSession) {
  const response = await fetch(`${supabaseUrl}/rest/v1/provider_profiles?select=id,business_name,service_area,service_category,region,city,bio,experience_years,verified&verified=eq.false&order=created_at.asc`, {
    headers: userHeaders(session),
  })
  if (!response.ok) throw new Error(await response.text())

  const records = await response.json()
  const ids = (Array.isArray(records) ? records : []).map((record: { id?: string }) => record.id).filter((id): id is string => Boolean(id))
  const profileMap = new Map<string, string>()

  if (ids.length > 0) {
    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,full_name&id=in.(${ids.join(',')})`, {
      headers: userHeaders(session),
    })
    if (!profileResponse.ok) throw new Error(await profileResponse.text())

    const profiles = await profileResponse.json()
    for (const profile of Array.isArray(profiles) ? profiles : []) {
      profileMap.set(profile.id, profile.full_name || 'Provider mpya')
    }
  }

  return (Array.isArray(records) ? records : []).map((record: {
    id: string
    business_name: string | null
    service_area: string | null
    service_category: string | null
    region: string | null
    city: string | null
    bio: string | null
    experience_years: number | null
    verified: boolean
  }) => ({
    id: record.id,
    full_name: profileMap.get(record.id) || record.business_name || 'Provider mpya',
    business_name: record.business_name,
    service_area: record.service_area,
    service_category: record.service_category,
    region: record.region,
    city: record.city,
    bio: record.bio,
    experience_years: Number(record.experience_years || 0),
    verified: Boolean(record.verified),
  })) as PendingProviderRecord[]
}

export async function approveProvider(session: AuthSession, providerId: string) {
  const providerResponse = await fetch(`${supabaseUrl}/rest/v1/provider_profiles?id=eq.${providerId}`, {
    method: 'PATCH',
    headers: { ...userHeaders(session), Prefer: 'return=minimal' },
    body: JSON.stringify({ verified: true }),
  })
  if (!providerResponse.ok) throw new Error(await providerResponse.text())

  const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${providerId}`, {
    method: 'PATCH',
    headers: { ...userHeaders(session), Prefer: 'return=minimal' },
    body: JSON.stringify({ role: 'provider' }),
  })
  if (!profileResponse.ok) throw new Error(await profileResponse.text())
}

async function getTableCount(session: AuthSession, table: string, filter = '') {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id${filter}`, {
    method: 'HEAD',
    headers: { ...userHeaders(session), Prefer: 'count=exact', Range: '0-0' },
  })
  if (!response.ok) throw new Error(await response.text())
  const total = response.headers.get('Content-Range')?.split('/')[1]
  return Number(total || 0)
}

export async function getAdminMetrics(session: AuthSession) {
  const responses = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/profiles?select=id&role=eq.customer`, { headers: userHeaders(session) }),
    fetch(`${supabaseUrl}/rest/v1/provider_profiles?select=id&verified=eq.true`, { headers: userHeaders(session) }),
    fetch(`${supabaseUrl}/rest/v1/service_requests?select=id`, { headers: userHeaders(session) }),
    fetch(`${supabaseUrl}/rest/v1/provider_profiles?select=id&verified=eq.false`, { headers: userHeaders(session) }),
  ])

  for (const response of responses) {
    if (!response.ok) throw new Error(await response.text())
  }

  const [customers, providers, requests, pendingProviders] = await Promise.all(responses.map((response) => response.json()))
  return {
    customers: Array.isArray(customers) ? customers.length : 0,
    providers: Array.isArray(providers) ? providers.length : 0,
    requests: Array.isArray(requests) ? requests.length : 0,
    pending: Array.isArray(pendingProviders) ? pendingProviders.length : 0,
  }
}

export async function createServiceRequest(request: RemoteRequest, session: AuthSession | null) {
  if (!isSupabaseConfigured) return { ok: false, reason: 'missing-config' as const }
  if (!session) return { ok: false, reason: 'not-authenticated' as const }

  const payload: Record<string, unknown> = {
    ...request,
    customer_id: session.user.id,
    status: request.status || 'open',
  }

  if (!payload.category_id) delete payload.category_id
  if (request.region) payload.region = request.region
  if (request.city) payload.city = request.city

  const directed = Boolean(payload.provider_id)
  const requestBody = { ...payload }
  let response = await fetch(`${supabaseUrl}/rest/v1/service_requests`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey!,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const messageText = await response.text()
    const missingProviderColumn = isMissingColumnError(messageText, 'provider_id')
    if (missingProviderColumn && directed) {
      return {
        ok: false,
        reason: 'targeted-provider-not-enabled' as const,
        message: 'Request haikutumwa kwa sababu database haina provider_id. Endesha migration 20261004_targeted_provider_requests.sql kwenye Supabase, kisha jaribu tena.',
      }
    }
    const missingLocationColumns = ['region', 'city'].filter((column) => isMissingColumnError(messageText, column))
    if (missingProviderColumn || missingLocationColumns.length > 0) {
      const fallbackPayload = { ...requestBody }
      if (missingProviderColumn) delete fallbackPayload.provider_id
      if (missingLocationColumns.length > 0) {
        delete fallbackPayload.region
        delete fallbackPayload.city
      }
      response = await fetch(`${supabaseUrl}/rest/v1/service_requests`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey!,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(fallbackPayload),
      })
    }

    if (!response.ok) {
      return { ok: false, reason: 'remote-error' as const, message: summarizeSupabaseError(await response.text()) }
    }
    if (missingProviderColumn) return { ok: true as const, directed: false }
  }

  return { ok: true as const, directed }
}
