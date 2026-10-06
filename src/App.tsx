import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Compass,
  Filter,
  Heart,
  MapPin,
  Menu,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Star,
  UserRound,
  Wrench,
  X,
} from 'lucide-react'
import { checkSupabaseConnection, confirmBookingCompletion, deleteAllUserNotifications, deleteUserNotification, describeDashboardError, getCategoryIdByName, getCurrentProfile, getServiceCategories, getStoredSession, getUserNotifications, getVerifiedProviderCount, getVerifiedProviders, isSupabaseConfigured, markUserNotificationRead, updateBookingProgress } from './lib/supabase'
import { acceptQuotation, approveProvider, applyAsProvider, createQuotation, createServiceRequest, getAdminMetrics, getCustomerQuotations, getCustomerRequests, getOpenServiceRequests, getPendingProviders, getProviderQuotations, signIn, signUp, type AuthSession, type CustomerQuotationRecord, type PendingProviderRecord, type ProviderQuotationRecord, type ServiceRequestRecord, type UserNotificationRecord } from './lib/supabase'

type Provider = {
  id: number | string
  name: string
  specialty: string
  category: string
  rating: number
  reviews: number
  distance: string
  location: string
  price: string
  available: string
  initials: string
  accent: string
  featured?: boolean
  bio?: string
  experienceYears?: number
}

const serviceCategories = [
  'Umeme',
  'Plumbing',
  'ICT & Wi-Fi',
  'Usafi',
  'Useremala',
  'CCTV',
] as const

const categoryDisplayMap: Record<string, string> = {
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
  seremala: 'Useremala',
  useremala: 'Useremala',
  carpentry: 'Useremala',
  carpenter: 'Useremala',
  woodworking: 'Useremala',
  woodwork: 'Useremala',
  camera: 'CCTV',
  kamera: 'CCTV',
  cctv: 'CCTV',
  'cctv installation': 'CCTV',
  'camera installation': 'CCTV',
  security: 'CCTV',
}

const categoryIconMap: Record<string, string> = {
  Umeme: '⚡',
  Plumbing: '◌',
  'ICT & Wi-Fi': '⌁',
  Usafi: '✦',
  Useremala: '⌂',
  CCTV: '◉',
}

function normalizeCategoryName(name: string) {
  const trimmed = (name || '').trim()
  if (!trimmed) return 'Zote'

  const directMatch = serviceCategories.find((category) => category.toLowerCase() === trimmed.toLowerCase())
  if (directMatch) return directMatch

  const lookupKey = trimmed.toLowerCase().replace(/[^a-z&\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return categoryDisplayMap[lookupKey] || trimmed
}

const serviceOptionsByCategory: Record<string, string[]> = {
  Umeme: ['Kufunga socket mpya', 'Kubadili swichi', 'Kujenga mfumo wa mzunguko', 'Kutatua tatizo la umeme wa nyumba'],
  Plumbing: ['Kufunga bomba la maji', 'Kubadili mfereji wa maji', 'Kukarabati chupa ya bafu', 'Kusafisha mfumo wa maji'],
  'ICT & Wi-Fi': ['Kusakinisha Wi-Fi ya ofisi', 'Kuweka router na CCTV', 'Kusafisha mitandao', 'Kurekebisha laptop na internet'],
  Usafi: ['Usafi wa nyumba', 'Usafi wa ofisi', 'Kusafisha baada ya kujenga', 'Usafi wa vyombo na vitanda'],
  Useremala: ['Kukarabati meza', 'Kusakinisha milango', 'Kujenga rafiki ya chumbani', 'Kukarabati vitanda na kiti'],
  CCTV: ['Kusakinisha CCTV ya ndani', 'Kusakinisha CCTV ya nje', 'Kuboresha mfumo wa usalama', 'Kurekebisha kamera zilizokosa'],
}

const tanzaniaRegions = [
  { region: 'Dar es Salaam', cities: ['Kinondoni', 'Ilala', 'Temeke', 'Ubungo', 'Kigamboni'] },
  { region: 'Dodoma', cities: ['Dodoma Mjini', 'Kondoa', 'Bahi'] },
  { region: 'Arusha', cities: ['Arusha Mjini', 'Karatu', 'Meru'] },
  { region: 'Mwanza', cities: ['Mwanza Mjini', 'Ukerewe', 'Sengerema'] },
  { region: 'Mbeya', cities: ['Mbeya Mjini', 'Rungwe', 'Chunya'] },
  { region: 'Morogoro', cities: ['Morogoro Mjini', 'Kilosa', 'Mvomero'] },
  { region: 'Tanga', cities: ['Tanga Mjini', 'Muheza', 'Pangani'] },
  { region: 'Kilimanjaro', cities: ['Moshi', 'Same', 'Hai'] },
  { region: 'Iringa', cities: ['Iringa Mjini', 'Njombe', 'Makambako'] },
  { region: 'Zanzibar', cities: ['Unguja', 'Pemba', 'Stone Town'] },
] as const

const defaultCategories = [
  { label: 'Umeme', icon: '⚡', count: 32 },
  { label: 'Plumbing', icon: '◌', count: 24 },
  { label: 'ICT & Wi-Fi', icon: '⌁', count: 18 },
  { label: 'Usafi', icon: '✦', count: 15 },
  { label: 'Useremala', icon: '⌂', count: 12 },
  { label: 'CCTV', icon: '◉', count: 9 },
]

const defaultProviders: Provider[] = [
  { id: 'colin-provider', name: 'Colin', specialty: 'ICT & Network Setup', category: 'ICT & Wi-Fi', rating: 4.9, reviews: 51, distance: '1.4 km', location: 'Kigamboni', price: 'Kuanzia TSh 28,000', available: 'Leo, 10:00', initials: 'CO', accent: 'teal', featured: true, bio: 'Mtaalamu wa mtandao, Wi‑Fi, na usakinishaji wa vifaa vya ICT kwa makazi na ofisi.', experienceYears: 6 },
  { id: 'main-provider', name: 'Main Provider', specialty: 'ICT & Wi‑Fi Solutions', category: 'ICT & Wi-Fi', rating: 4.8, reviews: 34, distance: '2.6 km', location: 'Mikocheni', price: 'Kuanzia TSh 32,000', available: 'Kesho, 09:00', initials: 'MP', accent: 'navy', featured: true, bio: 'Huduma ya usakinishaji wa Wi‑Fi, routers, CCTV, na uboreshaji wa mtandao wa kampuni ndogo na za makazi.', experienceYears: 5 },
]

type RequestItem = {
  title: string
  provider: string
  status: string
  date: string
  color: string
}

const defaultRequests: RequestItem[] = [
  { title: 'Kufunga socket mpya', provider: 'Moses Mwakalinga', status: 'Quotes 2', date: 'Leo, 14:00', color: 'amber' },
  { title: 'Wi-Fi ya ofisi', provider: 'TechNia Solutions', status: 'In review', date: 'Jumatano', color: 'teal' },
  { title: 'Usafi wa nyumba', provider: 'Amani Clean Co.', status: 'Completed', date: '12 Sep 2024', color: 'green' },
]

function readStoredValue<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    if (value === null) return fallback
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

function getDemoProviders(): Provider[] {
  const stored = readStoredValue<Provider[]>('mtaani-demo-providers', defaultProviders)
  return stored.length > 0 ? stored : defaultProviders
}

function setDemoProviders(nextProviders: Provider[]) {
  localStorage.setItem('mtaani-demo-providers', JSON.stringify(nextProviders))
}

function createLocalNotification(title: string, body: string) {
  const nextNotification: UserNotificationRecord = {
    id: `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    body,
    created_at: new Date().toISOString(),
    read_at: null,
  }

  const notifications = readStoredValue<UserNotificationRecord[]>('mtaani-demo-notifications', [])
  localStorage.setItem('mtaani-demo-notifications', JSON.stringify([nextNotification, ...notifications].slice(0, 25)))
  window.dispatchEvent(new CustomEvent('mtaani-demo-notification'))
  return nextNotification
}

function updateLocalNotifications(update: (notifications: UserNotificationRecord[]) => UserNotificationRecord[]) {
  const notifications = update(readStoredValue<UserNotificationRecord[]>('mtaani-demo-notifications', []))
  localStorage.setItem('mtaani-demo-notifications', JSON.stringify(notifications))
  window.dispatchEvent(new CustomEvent('mtaani-demo-notification'))
}

function App() {
  const [role, setRole] = useState<'customer' | 'provider' | 'admin'>(() => {
    const storedRole = readStoredValue<string | null>('mtaani-role', null)
    return storedRole === 'provider' || storedRole === 'admin' ? storedRole : 'customer'
  })
  const [activeCategory, setActiveCategory] = useState('Zote')
  const [search, setSearch] = useState('')
  const [saved, setSaved] = useState<Array<number | string>>(() => readStoredValue<Array<number | string>>('mtaani-saved', []))
  const [requestItems, setRequestItems] = useState<RequestItem[]>(() => readStoredValue<RequestItem[]>('mtaani-requests', defaultRequests))
  const [showRequest, setShowRequest] = useState(false)
  const [requestProviderId, setRequestProviderId] = useState('')
  const [selectedProviderProfile, setSelectedProviderProfile] = useState<Provider | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<UserNotificationRecord[]>([])
  const [notificationError, setNotificationError] = useState('')
  const [deletingNotifications, setDeletingNotifications] = useState(false)
  const [deletingNotificationId, setDeletingNotificationId] = useState<string | null>(null)
  const knownNotificationIds = useRef<Set<string> | null>(null)
  const notificationOwner = useRef<string | null>(null)
  const [notice, setNotice] = useState('')
  const [databaseStatus, setDatabaseStatus] = useState<'checking' | 'connected' | 'demo' | 'error'>(isSupabaseConfigured ? 'checking' : 'demo')
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession())
  const [showAuth, setShowAuth] = useState(false)
  const [dynamicCategories, setDynamicCategories] = useState<Array<{ label: string; icon: string; count: number }>>(defaultCategories)
  const [registeredProviders, setRegisteredProviders] = useState<Provider[]>(() => getDemoProviders())
  const [liveProviders, setLiveProviders] = useState<Provider[]>([])
  const [liveProvidersLoaded, setLiveProvidersLoaded] = useState(false)
  const [verifiedProviderCount, setVerifiedProviderCount] = useState<number | null>(null)
  const [customerRequests, setCustomerRequests] = useState<ServiceRequestRecord[]>([])
  const [customerQuotes, setCustomerQuotes] = useState<CustomerQuotationRecord[]>([])
  const [openRequests, setOpenRequests] = useState<ServiceRequestRecord[]>([])
  const [providerQuotes, setProviderQuotes] = useState<ProviderQuotationRecord[]>([])
  const [pendingProviders, setPendingProviders] = useState<PendingProviderRecord[]>([])
  const [adminMetrics, setAdminMetrics] = useState({ customers: 0, providers: 0, requests: 0, pending: 0 })
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const dashboardLoadedKey = useRef('')
  const [dashboardError, setDashboardError] = useState('')
  const [dashboardRefresh, setDashboardRefresh] = useState(0)
  const [progressingBooking, setProgressingBooking] = useState<string | null>(null)
  const [confirmingBooking, setConfirmingBooking] = useState<string | null>(null)

  const accountName = session?.user.full_name || session?.user.name || (session?.user.email ? session.user.email.split('@')[0] : undefined)
  const displayProviders = isSupabaseConfigured && liveProvidersLoaded
    ? liveProviders
    : registeredProviders.length > 0 ? registeredProviders : (liveProviders.length > 0 ? liveProviders : defaultProviders)
  const categoryOptions = useMemo(() => {
    const countsByCategory = displayProviders.reduce<Record<string, number>>((accumulator, provider) => {
      accumulator[provider.category] = (accumulator[provider.category] || 0) + 1
      return accumulator
    }, {})

    const merged = [...(dynamicCategories.length > 0 ? dynamicCategories : defaultCategories)].map((category) => ({
      ...category,
      count: countsByCategory[category.label] ?? 0,
    }))

    return merged.length > 0 ? merged : defaultCategories
  }, [displayProviders, dynamicCategories])
  const totalProviderCount = verifiedProviderCount ?? displayProviders.length
  const providerCompletedJobs = providerQuotes.filter((item) => item.customer_confirmed_at !== null).length

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const categories = await getServiceCategories()
        if (!active) return

        const mapped = categories
          .map((category, index) => {
            const label = normalizeCategoryName(category.name)
            return {
              label,
              icon: categoryIconMap[label] || category.icon || ['⚡', '◌', '⌁', '✦', '⌂', '◉'][index % 6],
              count: 0,
            }
          })
          .filter((item, index, array) => array.findIndex((entry) => entry.label === item.label) === index)

        if (mapped.length > 0) {
          setDynamicCategories(mapped)
          return
        }

        setDynamicCategories(defaultCategories)
      } catch {
        setDynamicCategories(defaultCategories)
      }
    })()
    return () => { active = false }
  }, [])

  const filteredProviders = useMemo(() => displayProviders.filter((provider) => {
    const matchesCategory = activeCategory === 'Zote' || provider.category === activeCategory
    const query = search.toLowerCase()
    return matchesCategory && (!query || `${provider.name} ${provider.specialty} ${provider.location}`.toLowerCase().includes(query))
  }), [activeCategory, displayProviders, search])

  const toggleSaved = (id: number | string) => {
    setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    setNotice('Orodha ya providers uliowahifadhi imesasishwa')
    window.setTimeout(() => setNotice(''), 2200)
  }

  const savedProviders = useMemo(() => displayProviders.filter((provider) => saved.includes(provider.id)), [displayProviders, saved])

  useEffect(() => { localStorage.setItem('mtaani-saved', JSON.stringify(saved)) }, [saved])
  useEffect(() => {
    setDemoProviders(registeredProviders)
  }, [registeredProviders])
  useEffect(() => {
    const syncDemoNotifications = () => {
      const localNotifications = readStoredValue<UserNotificationRecord[]>('mtaani-demo-notifications', [])
      const knownIds = knownNotificationIds.current
      const newNotification = localNotifications.find((item) => !item.read_at && (!knownIds || !knownIds.has(item.id)))
      knownNotificationIds.current = new Set(localNotifications.map((item) => item.id))
      setNotifications(localNotifications)
      if (newNotification) {
        setShowNotifications(true)
        setNotice(`Notification mpya: ${newNotification.title}`)
        window.setTimeout(() => setNotice(''), 5000)
      }
    }

    window.addEventListener('mtaani-demo-notification', syncDemoNotifications)
    return () => window.removeEventListener('mtaani-demo-notification', syncDemoNotifications)
  }, [])
  useEffect(() => { localStorage.setItem('mtaani-requests', JSON.stringify(requestItems)) }, [requestItems])
  useEffect(() => { localStorage.setItem('mtaani-role', JSON.stringify(role)) }, [role])
  useEffect(() => {
    if (!isSupabaseConfigured) return
    checkSupabaseConnection().then((result) => setDatabaseStatus(result.connected ? 'connected' : 'error')).catch(() => setDatabaseStatus('error'))
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    const refreshProviders = () => {
      getVerifiedProviderCount().then((count) => {
        if (active && count !== null) setVerifiedProviderCount(count)
      }).catch(() => {
        if (active) setVerifiedProviderCount(null)
      })
      getVerifiedProviders().then((items) => {
        if (!active) return
        setLiveProviders(items.map((item) => ({ ...item, category: normalizeCategoryName(item.category) })))
        setLiveProvidersLoaded(true)
      }).catch(() => {
        if (active) {
          setLiveProviders([])
          setLiveProvidersLoaded(false)
        }
      })
    }
    void refreshProviders()
    const timer = window.setInterval(refreshProviders, 15000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [dashboardRefresh])

  useEffect(() => {
    if (!isSupabaseConfigured || !session) return

    getCurrentProfile(session).then((profile) => {
      if (!profile || !profile.full_name) return
      if (profile.role === 'customer' || profile.role === 'provider' || profile.role === 'admin') setRole(profile.role)
      setSession((current) => {
        if (!current) return current
        const nextName = profile.full_name || current.user.full_name || current.user.email || 'MtaaniHub user'
        if (current.user.full_name === nextName && current.user.name === nextName) return current
        return {
          ...current,
          user: {
            ...current.user,
            full_name: nextName,
            name: nextName,
          },
        }
      })
    }).catch(() => {
      setDashboardError('Imeshindikana kusoma wasifu wa akaunti. Hakikisha umeingia tena na Supabase inapatikana.')
    })
  }, [session?.user.id, session?.user.email, session?.user.full_name])

  useEffect(() => {
    if (!session || !isSupabaseConfigured) return
    let active = true
    const dashboardKey = `${session.user.id}:${role}`
    if (dashboardLoadedKey.current !== dashboardKey) setDashboardLoading(true)
    setDashboardError('')

    const loadDashboard = async () => {
      try {
        if (role === 'customer') {
          const [requestsResult, quotesResult] = await Promise.allSettled([getCustomerRequests(session), getCustomerQuotations(session)])
          if (active) {
            const errors: unknown[] = []
            if (requestsResult.status === 'fulfilled') setCustomerRequests(requestsResult.value)
            else errors.push(requestsResult.reason)
            if (quotesResult.status === 'fulfilled') setCustomerQuotes(quotesResult.value)
            else errors.push(quotesResult.reason)
            if (errors.length > 0) setDashboardError(describeDashboardError(errors[0], 'customer'))
          }
        } else if (role === 'provider') {
          const [requests, quotes] = await Promise.all([getOpenServiceRequests(session), getProviderQuotations(session)])
          if (active) {
            setOpenRequests(requests)
            setProviderQuotes(quotes)
          }
        } else {
          const [providers, metrics] = await Promise.all([getPendingProviders(session), getAdminMetrics(session)])
          if (active) {
            setPendingProviders(providers)
            setAdminMetrics(metrics)
          }
        }
      } catch (error) {
        if (active) setDashboardError(describeDashboardError(error, role))
      } finally {
        if (active) {
          setDashboardLoading(false)
          dashboardLoadedKey.current = dashboardKey
        }
      }
    }

    void loadDashboard()
    return () => { active = false }
  }, [dashboardRefresh, role, session])

  useEffect(() => {
    const syncLocalDemoNotifications = () => {
      const storedNotifications = readStoredValue<UserNotificationRecord[]>('mtaani-demo-notifications', [])
      const localNotifications = storedNotifications.filter((item) => !(item.title === 'Mteja mpya alijiunga' && item.body.includes('imeingia kwenye MtaaniHub.')))
      if (localNotifications.length !== storedNotifications.length) {
        localStorage.setItem('mtaani-demo-notifications', JSON.stringify(localNotifications))
      }
      const knownIds = knownNotificationIds.current
      const newNotification = localNotifications.find((item) => !item.read_at && (!knownIds || !knownIds.has(item.id)))
      knownNotificationIds.current = new Set(localNotifications.map((item) => item.id))
      setNotifications((current) => {
        const merged = [...localNotifications, ...current.filter((item) => !localNotifications.some((localItem) => localItem.id === item.id))]
        return merged.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      })
      if (newNotification) {
        setShowNotifications(true)
        setNotice(`Notification mpya: ${newNotification.title}`)
        window.setTimeout(() => setNotice(''), 5000)
      }
    }

    if (!session || !isSupabaseConfigured) {
      syncLocalDemoNotifications()
      notificationOwner.current = null
      return
    }

    const currentNotificationOwner = `${session.user.id}:${role}`
    if (notificationOwner.current !== currentNotificationOwner) {
      notificationOwner.current = currentNotificationOwner
      knownNotificationIds.current = null
    }
    let active = true
    const refreshNotifications = async () => {
      try {
        const records = await getUserNotifications(session)
        if (active) {
          const knownIds = knownNotificationIds.current
          const newNotification = knownIds
            ? records.find((record) => !record.read_at && !knownIds.has(record.id))
            : records.find((record) => !record.read_at)
          knownNotificationIds.current = new Set(records.map((record) => record.id))
          setNotifications(records)
          setNotificationError('')
          if (newNotification) {
            setShowNotifications(true)
            setNotice(`Notification mpya: ${newNotification.title}`)
            window.setTimeout(() => setNotice(''), 5000)
          }
        }
      } catch {
        if (active) setNotificationError('Imeshindikana kupakia notifications.')
      }
    }
    void refreshNotifications()
    const timer = window.setInterval(refreshNotifications, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [role, session])

  useEffect(() => {
    if (!session || !isSupabaseConfigured || (role !== 'customer' && role !== 'provider')) return
    const timer = window.setInterval(() => setDashboardRefresh((value) => value + 1), 30000)
    return () => window.clearInterval(timer)
  }, [role, session?.user.id])

  const addRequest = async (service: string, location: string, description: string, categoryName?: string, region?: string, city?: string, providerId?: string) => {
    if (!session || role !== 'customer') {
      setShowAuth(true)
      setNotice('Lazima uingie kama mteja ili utume request.')
      return
    }
    try {
      const categoryId = categoryName ? await getCategoryIdByName(categoryName) : null
      const remote = await createServiceRequest({
        title: service,
        location: location || 'Dar es Salaam',
        description,
        provider_id: providerId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(providerId) ? providerId : null,
        category_id: categoryId,
        region: region || null,
        city: city || null,
      }, session)
      if (remote.ok) {
        setDashboardRefresh((value) => value + 1)
        setNotice(remote.directed
          ? 'Request imeelekezwa kwa provider uliyemchagua.'
          : 'Request imetumwa kwa providers waliothibitishwa.')
      } else if (remote.reason === 'targeted-provider-not-enabled') {
        setNotice(remote.message)
      } else if (remote.reason === 'not-authenticated') {
        setRequestItems((current) => [{ title: service, provider: 'Inatafuta provider...', status: 'New request', date: location || 'Dar es Salaam', color: 'amber' }, ...current])
        setNotice('Request imehifadhiwa demo. Ingia ili ihifadhiwe database.')
      } else {
        setNotice(`Request haikuhifadhiwa: ${remote.message || 'database haikupokea.'}`)
      }
    } catch {
      setNotice('Request haikutumwa. Angalia internet na ujaribu tena.')
    }
    window.setTimeout(() => setNotice(''), 2600)
  }

  const submitQuote = async (requestId: string, amount: number, message: string, estimatedDays: number | null) => {
    if (!session) return
    await createQuotation(session, requestId, amount, message, estimatedDays)
    setDashboardRefresh((value) => value + 1)
    setNotice('Quotation imetumwa kwa mteja.')
    window.setTimeout(() => setNotice(''), 2600)
  }

  const bookQuotation = async (requestId: string, quotationId: string) => {
    if (!session) return
    await acceptQuotation(session, requestId, quotationId)
    setDashboardRefresh((value) => value + 1)
    setNotice('Umechagua quotation. Booking yako imethibitishwa.')
    window.setTimeout(() => setNotice(''), 3000)
  }

  const changeBookingProgress = async (bookingId: string, status: 'in_progress' | 'completed') => {
    if (!session) throw new Error('Ingia tena ili kuendelea.')
    setProgressingBooking(bookingId)
    try {
      await updateBookingProgress(session, bookingId, status)
      setDashboardRefresh((value) => value + 1)
      setNotice(status === 'completed' ? 'Kazi imewekwa kuwa imekamilika. Mteja ametaarifiwa.' : 'Kazi imeanza.')
      window.setTimeout(() => setNotice(''), 3000)
    } finally {
      setProgressingBooking(null)
    }
  }

  const confirmCompletion = async (bookingId: string) => {
    if (!session) throw new Error('Ingia tena ili kuendelea.')
    setConfirmingBooking(bookingId)
    try {
      await confirmBookingCompletion(session, bookingId)
      setDashboardRefresh((value) => value + 1)
      setNotice('Umehakikisha kazi imekamilika. Asante kwa kutumia MtaaniHub.')
      window.setTimeout(() => setNotice(''), 3500)
    } finally {
      setConfirmingBooking(null)
    }
  }

  const readNotification = async (notification: UserNotificationRecord) => {
    if (!session || notification.read_at) return
    if (notification.id.startsWith('demo-')) {
      const readAt = new Date().toISOString()
      updateLocalNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item))
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item))
      return
    }
    try {
      await markUserNotificationRead(session, notification.id)
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item))
    } catch {
      setNotificationError('Imeshindikana kusasisha notification. Jaribu tena.')
    }
  }

  const removeNotification = async (notificationId: string) => {
    if (!session) return
    setDeletingNotificationId(notificationId)
    setNotificationError('')
    try {
      if (notificationId.startsWith('demo-')) {
        updateLocalNotifications((items) => items.filter((item) => item.id !== notificationId))
      } else {
        await deleteUserNotification(session, notificationId)
      }
      setNotifications((current) => current.filter((item) => item.id !== notificationId))
      knownNotificationIds.current?.delete(notificationId)
    } catch {
      setNotificationError('Imeshindikana kufuta notification. Jaribu tena.')
    } finally {
      setDeletingNotificationId(null)
    }
  }

  const removeAllNotifications = async () => {
    if (!session) return
    setDeletingNotifications(true)
    setNotificationError('')
    try {
      updateLocalNotifications((items) => items.filter((item) => !item.id.startsWith('demo-')))
      if (notifications.some((item) => !item.id.startsWith('demo-'))) await deleteAllUserNotifications(session)
      setNotifications([])
      knownNotificationIds.current = new Set()
    } catch {
      setNotificationError('Imeshindikana kufuta notifications zote. Jaribu tena.')
    } finally {
      setDeletingNotifications(false)
    }
  }

  const submitProviderApplication = async (businessName: string, serviceArea: string, bio: string, serviceCategory: string, region: string, city: string) => {
    if (!session) {
      setShowAuth(true)
      return
    }
    const formattedArea = [city, region].filter(Boolean).join(', ') || serviceArea || 'Tanzania'
    await applyAsProvider(session, businessName, formattedArea, bio || `${serviceCategory} service provider`, serviceCategory, region, city)
    if (!isSupabaseConfigured) createLocalNotification('Provider mpya amesajiliwa', `${businessName} ameomba kujiunga kama provider wa ${serviceCategory}.`)
    setNotice(`Ombi lako la provider la ${serviceCategory} limetumwa kwa admin kwa uhakiki.`)
    window.setTimeout(() => setNotice(''), 3000)
  }

  const verifyProvider = async (providerId: string) => {
    if (!session) return
    try {
      await approveProvider(session, providerId)
      const approvedProvider = pendingProviders.find((provider) => provider.id === providerId)
      const providerName = approvedProvider?.business_name || approvedProvider?.full_name || 'Provider'
      const category = approvedProvider?.service_category || 'ICT & Wi-Fi'
      const nextProvider: Provider = {
        id: providerId,
        name: providerName,
        specialty: category === 'ICT & Wi-Fi' ? 'ICT & Wi-Fi Solutions' : `${category} services`,
        category,
        rating: 4.8,
        reviews: 18,
        distance: '2.5 km',
        location: [approvedProvider?.city, approvedProvider?.region].filter(Boolean).join(', ') || 'Dar es Salaam',
        price: 'Kuanzia TSh 30,000',
        available: 'Leo, 09:30',
        initials: providerName.split(' ').slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('').slice(0, 2) || 'PR',
        accent: 'teal',
        featured: true,
        bio: approvedProvider?.bio || 'Provider aliyeidhinishwa kwa huduma ya ndani.',
        experienceYears: approvedProvider?.experience_years || 3,
      }
      setRegisteredProviders((current) => {
        const exists = current.some((item) => String(item.id) === String(providerId))
        return exists ? current : [nextProvider, ...current]
      })
      setPendingProviders((current) => current.filter((provider) => provider.id !== providerId))
      setDashboardRefresh((value) => value + 1)
      if (!isSupabaseConfigured) createLocalNotification('Umeidhinishwa kuwa provider', `${providerName} amethibitishwa na admin. Sasa unaweza kupokea requests.`)
      setNotice('Provider amethibitishwa na kupewa dashboard.')
    } catch {
      setNotice('Imeshindikana kuthibitisha provider. Hakikisha akaunti hii ina role ya admin.')
    }
    window.setTimeout(() => setNotice(''), 3000)
  }

  return (
    <div className="app-shell">
      {notice && <div className="toast"><Check size={16} /> {notice}</div>}
      <header className="topbar">
        <a className="brand" href="#top" aria-label="MtaaniHub home"><span className="brand-mark">m</span><span>Mtaani<span>Hub</span></span></a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className="active" href="#discover">Gundua huduma</a>
          <a href="#how-it-works">Jinsi inavyofanya kazi</a>
          <a href="#about">Kuhusu sisi</a>
        </nav>
        <div className="top-actions">
          <span className={`database-status ${databaseStatus}`} title={databaseStatus === 'connected' ? 'Supabase database connected' : databaseStatus === 'error' ? 'Supabase configuration or schema error' : 'Demo mode'}><i /> {databaseStatus === 'connected' ? 'DB online' : databaseStatus === 'checking' ? 'Checking DB' : databaseStatus === 'error' ? 'DB error' : 'Demo mode'}</span>
          <div className="notification-area">
            <button className="icon-button notification" aria-label={`Notifications, ${notifications.filter((item) => !item.read_at).length} hazijasomwa`} aria-expanded={showNotifications} onClick={() => setShowNotifications((value) => !value)}><Bell size={19} />{notifications.some((item) => !item.read_at) && <i />}</button>
            {showNotifications && <div className="notification-menu">
              <div className="notification-menu-heading"><strong>Notifications</strong>{notifications.length > 0 && <button disabled={deletingNotifications} onClick={() => void removeAllNotifications()}>{deletingNotifications ? 'Inafuta...' : 'Futa zote'}</button>}</div>
              {notificationError && <span className="notification-error">{notificationError}</span>}
              {notifications.length === 0
                ? <span className="notification-empty">Hakuna notifications mpya.</span>
                : notifications.map((notification) => <article className={`notification-item ${notification.read_at ? 'read' : 'new'}`} key={notification.id} onClick={() => void readNotification(notification)}>
                  <div className="notification-item-heading"><span>{notification.title}</span>{!notification.read_at && <b>MPYA</b>}</div>
                  <small>{notification.body}</small><time>{new Date(notification.created_at).toLocaleString('sw-TZ')}</time>
                  <button className="notification-delete" disabled={deletingNotifications || deletingNotificationId === notification.id} onClick={(event) => { event.stopPropagation(); void removeNotification(notification.id) }}>{deletingNotificationId === notification.id ? 'Inafuta...' : 'Futa'}</button>
                </article>)}
            </div>}
          </div>
          <button className="avatar-button" onClick={() => setShowMenu(!showMenu)}><span>{role === 'customer' ? 'AK' : role === 'provider' ? 'MM' : 'AD'}</span><ChevronDown size={15} /></button>
          {showMenu && <div className="profile-menu"><strong>{accountName || (role === 'customer' ? 'Anna K.' : role === 'provider' ? 'Moses M.' : 'Admin')}</strong><span>{session ? session.user.email || roleLabel(role) : roleLabel(role)}</span>{!session && <><button onClick={() => { setShowAuth(true); setShowMenu(false) }}>Ingia / Jisajili</button><button onClick={() => setRole('customer')}>Customer demo</button><button onClick={() => setRole('provider')}>Provider demo</button><button onClick={() => setRole('admin')}>Admin demo</button></>}{session && <button onClick={() => { localStorage.removeItem('mtaani-session'); setSession(null); setRole('customer') }}>Ondoka</button>}</div>}
        </div>
        <button
  className="mobile-menu"
  aria-label="Open profile menu"
  onClick={() => setShowMenu((value) => !value)}
>
  <Menu size={21} />
</button>
      </header>

      <main id="top">
        <section className="hero" id="discover">
          <div className="hero-copy">
            <div className="eyebrow"><span /> MTANDAO WA HUDUMA ZA KARIBU</div>
            <h1>Huduma bora,<br /><em>karibu nawe.</em></h1>
            <p>Wataalamu wanaoaminika kwa kila hitaji la nyumbani na biashara, wanapatikana ndani ya mtaa wako.</p>
            <div className="search-box">
              <Search size={19} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Unahitaji huduma gani?" aria-label="Search services" />
              <div className="search-location"><MapPin size={16} /><span>Dar es Salaam</span><ChevronDown size={15} /></div>
              <button className="search-submit" aria-label="Search">Tafuta</button>
            </div>
            <div className="hero-proof"><div className="people"><span>MM</span><span>NS</span><span>TS</span><span>+</span></div><strong>2,400+</strong><small>Wateja wanatuamini</small><span className="proof-line" /><ShieldCheck size={18} /><small>Providers verified</small></div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="sun-disc" /><div className="art-grid" />
            <div className="art-card art-card-main"><div className="art-person">AK</div><div><strong>Fundi salama</strong><span>Verified provider</span></div><Check size={17} /></div>
            <div className="art-card art-card-mini"><Star size={14} fill="currentColor" /><strong>4.9</strong><span>rating</span></div>
            <div className="art-label"><span>01</span> Kila huduma,<br />kwa uhakika.</div>
          </div>
        </section>

        <section className="category-section" id="how-it-works">
          <div className="section-heading"><div><span className="section-kicker">HUDUMA KWA KILA HITAJI</span><h2>Unatafuta nini leo?</h2></div><button className="text-button">Ona huduma zote <ArrowRight size={16} /></button></div>
          <div className="category-row">
            <button className={`category-item ${activeCategory === 'Zote' ? 'selected' : ''}`} onClick={() => setActiveCategory('Zote')}><span className="category-icon all"><Compass size={21} /></span><strong>Zote</strong><small>{totalProviderCount} providers</small></button>
            {categoryOptions.map((category) => <button key={category.label} className={`category-item ${activeCategory === category.label ? 'selected' : ''}`} onClick={() => setActiveCategory(category.label)}><span className="category-icon">{category.icon}</span><strong>{category.label}</strong><small>{category.count} providers</small></button>)}
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="providers-panel">
            <div className="section-heading compact"><div><span className="section-kicker">{role === 'customer' ? 'WANAOPENDWA KARIBU NAWE' : role === 'provider' ? 'KITUO CHA PROVIDER' : 'USIMAMIZI WA MTANDAO'}</span><h2>{role === 'customer' ? 'Providers waliothibitishwa' : role === 'provider' ? 'Requests zinazosubiri quotation' : 'Muhtasari wa MtaaniHub'}</h2></div><button className="filter-button"><Filter size={16} /> Filter</button></div>
            {role === 'customer' && <div className="provider-grid">{filteredProviders.map((provider) => <ProviderCard key={provider.id} provider={provider} saved={saved.includes(provider.id)} onSave={() => toggleSaved(provider.id)} onProfile={() => setSelectedProviderProfile(provider)} onRequest={() => { setRequestProviderId(isProviderUuid(provider.id) ? String(provider.id) : ''); setSelectedProviderProfile(null); setShowRequest(true) }} />)}</div>}
            {role === 'customer' && session && <CustomerQuotes quotations={customerQuotes} loading={dashboardLoading} onAccept={bookQuotation} onConfirmCompletion={confirmCompletion} confirmingBooking={confirmingBooking} />}
            {role === 'provider' && (session ? <ProviderWorkspace requests={openRequests} quotations={providerQuotes} loading={dashboardLoading} onSubmitQuote={submitQuote} onProgress={changeBookingProgress} progressingBooking={progressingBooking} /> : <DashboardSignIn onSignIn={() => setShowAuth(true)} />)}
            {role === 'admin' && (session ? <AdminWorkspace metrics={adminMetrics} providers={pendingProviders} loading={dashboardLoading} onApprove={verifyProvider} /> : <DashboardSignIn onSignIn={() => setShowAuth(true)} />)}
            {dashboardError && session && <div className="dashboard-error" role="alert">{dashboardError}</div>}
            {role === 'customer' && session && <ProviderApplication onApply={submitProviderApplication} />}
            {role === 'customer' && filteredProviders.length === 0 && <div className="empty-state"><Search size={28} /><strong>Hakuna provider aliyepatikana</strong><span>Jaribu neno jingine au chagua huduma zote.</span></div>}
          </div>
          <aside className="activity-panel">
            <div className="activity-heading"><div><span className="section-kicker">{role === 'customer' ? 'DASHBOARD YAKO' : role === 'provider' ? 'PROVIDER INBOX' : 'ADMIN OVERVIEW'}</span><h2>{role === 'customer' ? 'Shughuli zako' : role === 'provider' ? 'Quotes zako' : 'System health'}</h2></div></div>
            <div className="stats-row">
                      <div><strong>{role === 'customer' ? String(session ? customerRequests.length : requestItems.length).padStart(2, '0') : role === 'provider' ? String(openRequests.length).padStart(2, '0') : String(adminMetrics.providers).padStart(2, '0')}</strong><span>{role === 'admin' ? 'Providers' : role === 'provider' ? 'Open jobs' : 'Requests'}</span></div>
              <div><strong>{role === 'customer' ? String(customerQuotes.length).padStart(2, '0') : role === 'provider' ? String(providerQuotes.length).padStart(2, '0') : String(adminMetrics.pending).padStart(2, '0')}</strong><span>{role === 'admin' ? 'Pending' : 'Quotes'}</span></div>
              <div><strong>{role === 'admin' ? String(adminMetrics.customers).padStart(2, '0') : role === 'provider' ? String(providerCompletedJobs) : String(customerRequests.filter((item) => item.status === 'completed' || item.status === 'booked').length).padStart(2, '0')}</strong><span>{role === 'admin' ? 'Customers' : 'Completed'}</span></div>
            </div>
            <div className="request-list">
              {role === 'customer' && (session ? customerRequests.slice(0, 4).map((request) => {
                const requestLocation = [request.city, request.region].filter(Boolean).join(', ') || request.location
                const directedProvider = displayProviders.find((provider) => String(provider.id) === request.provider_id)
                return <div className="request-item" key={request.id}><span className="request-icon amber"><BriefcaseBusiness size={17} /></span><div className="request-detail"><strong>{request.title}</strong><span>{requestLocation}{directedProvider ? ` · Kwa ${directedProvider.name}` : request.provider_id ? ' · Imeelekezwa kwa provider' : ''}</span><small><Clock3 size={12} /> {request.created_at.slice(0, 10)}</small></div><span className={`status ${statusColor(request.status)}`}>{requestStatusLabel(request.status)}</span></div>
              }) : requestItems.slice(0, 3).map((request, index) => <div className="request-item" key={`${request.title}-${index}`}><span className={`request-icon ${request.color}`}><BriefcaseBusiness size={17} /></span><div className="request-detail"><strong>{request.title}</strong><span>{request.provider}</span><small><Clock3 size={12} /> {request.date}</small></div><span className={`status ${request.color}`}>{request.status}</span></div>))}
              {role === 'customer' && notifications.slice(0, 3).map((notification) => <button className={`request-item dashboard-notification ${notification.read_at ? 'read' : ''}`} key={notification.id} onClick={() => void readNotification(notification)}><span className="request-icon green"><Bell size={17} /></span><span className="request-detail"><strong>{notification.title}</strong><span>{notification.body}</span><small><Clock3 size={12} /> {new Date(notification.created_at).toLocaleDateString('sw-TZ')}{notification.read_at ? '' : ' · Mpya'}</small></span></button>)}
              {role === 'provider' && providerQuotes.slice(0, 4).map((quote) => <div className="request-item" key={quote.id}><span className="request-icon teal"><BriefcaseBusiness size={17} /></span><div className="request-detail"><strong>{quote.service_requests?.title || 'Service request'}</strong><span>TSh {Number(quote.amount).toLocaleString()}</span><small><Clock3 size={12} /> {quote.created_at.slice(0, 10)}</small></div><span className={`status ${statusColor(quote.service_requests?.status || 'open')}`}>{requestStatusLabel(quote.service_requests?.status || 'open')}</span></div>)}
              {role === 'admin' && <div className="request-item"><span className="request-icon amber"><ShieldCheck size={17} /></span><div className="request-detail"><strong>{adminMetrics.requests} requests</strong><span>{adminMetrics.providers} providers on platform</span><small><Clock3 size={12} /> {adminMetrics.pending} pending verification</small></div></div>}
              {role === 'customer' && savedProviders.length > 0 && <div className="request-item"><span className="request-icon green"><Heart size={17} /></span><div className="request-detail"><strong>Providers uliowahifadhi</strong><span>{savedProviders.slice(0, 3).map((provider) => provider.name).join(', ')}</span><small>{savedProviders.length} waliohifadhiwa</small></div></div>}
              {dashboardLoading && <div className="dashboard-hint">Inapakia taarifa...</div>}
              {!dashboardLoading && role === 'customer' && session && customerRequests.length === 0 && <div className="dashboard-hint">Bado hujatuma request. Anza kwa kutuma ya kwanza.</div>}
              {!dashboardLoading && role === 'provider' && providerQuotes.length === 0 && <div className="dashboard-hint">Quotes ulizotuma zitaonekana hapa.</div>}
            </div>
            {role === 'customer' && <button className="outline-button" onClick={() => { setRequestProviderId(''); setShowRequest(true) }}><Plus size={16} /> Tuma request mpya</button>}
          </aside>
        </section>

        <section className="trust-strip" id="about"><div><ShieldCheck size={23} /><strong>Providers verified</strong><span>Tunathibitisha utambulisho na uzoefu</span></div><div><MessageCircle size={23} /><strong>Mawasiliano rahisi</strong><span>Ongea moja kwa moja na mtaalamu</span></div><div><CalendarDays size={23} /><strong>Ratiba yako</strong><span>Chagua muda unaokufaa</span></div></section>
      </main>
      <footer><span>© 2024 MtaaniHub</span><span>Huduma za karibu, maisha rahisi.</span><span>Dar es Salaam, Tanzania</span></footer>
      {showRequest && <RequestModal providers={displayProviders} initialProviderId={requestProviderId} onClose={() => setShowRequest(false)} onSent={(service, location, description, category, region, city, providerId) => { setShowRequest(false); addRequest(service, location, description, category, region, city, providerId) }} />}
      {selectedProviderProfile && <ProviderProfileModal provider={selectedProviderProfile} onClose={() => setSelectedProviderProfile(null)} onRequest={() => { setRequestProviderId(isProviderUuid(selectedProviderProfile.id) ? String(selectedProviderProfile.id) : String(selectedProviderProfile.id)); setSelectedProviderProfile(null); setShowRequest(true) }} />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onAuthenticated={(nextSession, registered) => { setSession(nextSession); setShowAuth(false); setNotice(registered ? 'Usajili umekamilika. Karibu MtaaniHub.' : 'Umeingia kwenye MtaaniHub.'); if (registered && !isSupabaseConfigured) createLocalNotification('Mteja mpya amejisajili', `${nextSession.user.email || 'Akaunti mpya'} amefungua akaunti ya MtaaniHub.`); }} />}
    </div>
  )
}

function ProviderCard({ provider, saved, onSave, onProfile, onRequest }: { provider: Provider; saved: boolean; onSave: () => void; onProfile: () => void; onRequest: () => void }) {
  return <article className="provider-card"><div className={`provider-avatar ${provider.accent}`}><span>{provider.initials}</span>{provider.featured && <b>TOP</b>}</div><button className={`save-button ${saved ? 'saved' : ''}`} onClick={onSave} aria-label={`Save ${provider.name}`}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button><div className="provider-body"><div className="provider-title"><div><button className="provider-profile-link" onClick={onProfile}><h3>{provider.name}</h3><span>{provider.specialty}</span></button></div><div className="rating"><Star size={14} fill="currentColor" /> {provider.rating} <small>({provider.reviews})</small></div></div><div className="provider-meta"><span><MapPin size={13} /> {provider.location} · {provider.distance}</span><span><Clock3 size={13} /> {provider.available}</span></div><div className="provider-footer"><button className="profile-action" onClick={onProfile}><UserRound size={14} /> Wasifu</button><button onClick={onRequest}>Tuma request <ArrowRight size={14} /></button></div></div></article>
}

function isProviderUuid(id: string | number) {
  if (typeof id !== 'string') return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return true
  return id === 'colin-provider' || id === 'main-provider' || id.startsWith('demo-')
}

function roleLabel(role: 'customer' | 'provider' | 'admin') {
  return role === 'customer' ? 'Mteja' : role === 'provider' ? 'Provider' : 'Administrator'
}

function requestStatusLabel(status: string) {
  const normalized = status?.toLowerCase?.() || 'open'
  if (normalized === 'completed') return 'Imekamilika'
  if (normalized === 'booked') return 'Imebookiwa'
  if (normalized === 'quoted') return 'Imetumwa quote'
  if (normalized === 'cancelled') return 'Imefutwa'
  return 'Inafunguliwa'
}

function statusColor(status: string) {
  const normalized = status?.toLowerCase?.() || 'open'
  if (normalized === 'completed') return 'green'
  if (normalized === 'booked') return 'teal'
  if (normalized === 'cancelled') return 'red'
  if (normalized === 'quoted') return 'amber'
  return 'amber'
}

function DashboardSignIn({ onSignIn }: { onSignIn: () => void }) {
  return <div className="dashboard-empty"><ShieldCheck size={22} /><strong>Ingia kuona dashboard yako</strong><span>Dashboard za provider na admin zinahitaji akaunti yenye role husika.</span><button className="outline-button" onClick={onSignIn}>Ingia / Jisajili</button></div>
}

function CustomerQuotes({ quotations, loading, onAccept, onConfirmCompletion, confirmingBooking }: {
  quotations: CustomerQuotationRecord[]
  loading: boolean
  onAccept: (requestId: string, quotationId: string) => Promise<void>
  onConfirmCompletion: (bookingId: string) => Promise<void>
  confirmingBooking: string | null
}) {
  const [accepting, setAccepting] = useState<string | null>(null)
  const [error, setError] = useState('')

  const confirmCompletion = async (bookingId: string) => {
    setError('')
    try {
      await onConfirmCompletion(bookingId)
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Imeshindikana kuthibitisha kukamilika kwa kazi.')
    }
  }

  const accept = async (quotation: CustomerQuotationRecord) => {
    setAccepting(quotation.id)
    setError('')
    try {
      await onAccept(quotation.request_id, quotation.id)
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Booking haikukamilika.'
      setError(message.includes('Request') || message.includes('belongs') ? 'Hili request haliwezi kukubaliwa tena. Tafadhali angalia upya quotes.' : 'Booking haikukamilika. Request inaweza kuwa tayari imewekewa booking.')
    } finally {
      setAccepting(null)
    }
  }

  if (loading || quotations.length === 0) return null
  return <section className="customer-quotes"><div className="subsection-heading"><div><span className="section-kicker">OFa ZA WATAALAMU</span><h3>Quotations ulizopokea</h3></div><span>{quotations.length} quotes</span></div>{error && <div className="dashboard-error">{error}</div>}<div className="quote-grid">{quotations.map((quotation) => {
    const provider = quotation.provider_profiles
    const providerName = provider?.profiles?.full_name || provider?.business_name || 'Provider'
    const requestStatus = quotation.service_requests?.status || 'open'
    const bookingStatus = quotation.booking_status
    const statusText = bookingStatus === 'completed'
      ? quotation.customer_confirmed_at ? 'Umethibitisha kazi imekamilika' : 'Provider amemaliza — thibitisha kazi'
      : bookingStatus === 'in_progress'
        ? 'Kazi inaendelea'
        : bookingStatus === 'pending' || bookingStatus === 'confirmed'
          ? 'Umejibu quotation: umeikubali'
          : requestStatusLabel(requestStatus)
    const progressStep = bookingStatus === 'completed' ? 3 : bookingStatus === 'in_progress' ? 2 : bookingStatus ? 1 : 0
    return <article className="customer-quote-card" key={quotation.id}><div><strong>{quotation.service_requests?.title || 'Service request'}</strong><span>{providerName}</span></div><strong className="quote-amount">TSh {Number(quotation.amount).toLocaleString()}</strong>{quotation.message && <p>{quotation.message}</p>}{quotation.estimated_days && <small>{quotation.estimated_days} siku</small>}<small className="quote-status">{statusText}</small>{bookingStatus && <div className="booking-progress" aria-label={`Hatua ya kazi ${progressStep} kati ya 3`}><span className={progressStep >= 1 ? 'active' : ''}>Imekubaliwa</span><i className={progressStep >= 2 ? 'active' : ''} /><span className={progressStep >= 2 ? 'active' : ''}>Inaendelea</span><i className={progressStep >= 3 ? 'active' : ''} /><span className={progressStep >= 3 ? 'active' : ''}>Imekamilika</span></div>}{bookingStatus === 'completed' && !quotation.customer_confirmed_at && quotation.booking_id && <button className="primary-button confirm-completion-button" disabled={confirmingBooking !== null} onClick={() => void confirmCompletion(quotation.booking_id!)}>{confirmingBooking === quotation.booking_id ? 'Inathibitisha...' : 'Nimeridhika — thibitisha kazi imekamilika'} <Check size={15} /></button>}{bookingStatus === 'completed' && quotation.customer_confirmed_at && <small className="customer-confirmed">Umethibitisha kuridhika na kazi.</small>}<button className="outline-button" disabled={accepting !== null || requestStatus !== 'open'} onClick={() => accept(quotation)}>{accepting === quotation.id ? 'Inathibitisha...' : requestStatus === 'open' ? 'Kubali quotation' : requestStatus === 'booked' ? 'Imebookiwa' : `Request ${statusText}`}</button></article>
  })}</div></section>
}

function ProviderProfileModal({ provider, onClose, onRequest }: { provider: Provider; onClose: () => void; onRequest: () => void }) {
  const canReceiveDirectRequest = isProviderUuid(provider.id)
  return <div className="modal-backdrop" onClick={onClose}><section className="request-modal provider-profile-modal" role="dialog" aria-modal="true" aria-labelledby="provider-profile-name" onClick={(event) => event.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="Funga wasifu"><X size={19} /></button>
    <div className={`profile-avatar-large ${provider.accent}`}>{provider.initials}</div>
    <span className="section-kicker">{canReceiveDirectRequest ? 'PROVIDER ALIYETHIBITISHWA' : 'WASIFU WA MFANO'}</span>
    <h2 id="provider-profile-name">{provider.name}</h2>
    <p>{provider.specialty}</p>
    <div className="profile-facts">
      <span><MapPin size={15} />{provider.location}</span>
      <span><Star size={15} fill="currentColor" />{provider.rating.toFixed(1)} ({provider.reviews} maoni)</span>
      <span><Clock3 size={15} />{provider.available}</span>
      {provider.experienceYears ? <span><BriefcaseBusiness size={15} />{provider.experienceYears} miaka ya uzoefu</span> : null}
    </div>
    <p className="profile-bio">{provider.bio || 'Wasilisha maelezo ya kazi unayohitaji ili upokee quotation.'}</p>
    {!canReceiveDirectRequest && <div className="dashboard-hint">Huu ni wasifu wa mfano; chagua provider aliyepo kwenye database ili kuelekeza request moja kwa moja.</div>}
    <button className="primary-button" disabled={!canReceiveDirectRequest} onClick={onRequest}>Mwelekeze request <ArrowRight size={16} /></button>
  </section></div>
}

function ProviderWorkspace({ requests, quotations, loading, onSubmitQuote, onProgress, progressingBooking }: {
  requests: ServiceRequestRecord[]
  quotations: ProviderQuotationRecord[]
  loading: boolean
  onSubmitQuote: (requestId: string, amount: number, message: string, estimatedDays: number | null) => Promise<void>
  onProgress: (bookingId: string, status: 'in_progress' | 'completed') => Promise<void>
  progressingBooking: string | null
}) {
  const [activeRequest, setActiveRequest] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [estimatedDays, setEstimatedDays] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [progressError, setProgressError] = useState('')
  const quotedRequests = new Set(quotations.map((quote) => quote.request_id))

  const updateProgress = async (bookingId: string, status: 'in_progress' | 'completed') => {
    setProgressError('')
    try {
      await onProgress(bookingId, status)
    } catch (progressUpdateError) {
      setProgressError(progressUpdateError instanceof Error ? progressUpdateError.message : 'Imeshindikana kusasisha hatua ya kazi.')
    }
  }

  const submit = async (requestId: string) => {
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Weka kiasi chenye thamani ya quotation.')
      return
    }
    const days = estimatedDays === '' ? null : Number(estimatedDays)
    if (days !== null && (!Number.isInteger(days) || days < 1)) {
      setError('Weka siku za kazi kama namba kamili kuanzia 1, au acha wazi.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmitQuote(requestId, numericAmount, message.trim(), days)
      setActiveRequest(null)
      setAmount('')
      setEstimatedDays('')
      setMessage('')
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Quotation haikutumwa.'
      const normalizedError = message.toLowerCase()
      setError(normalizedError.includes('duplicate') || normalizedError.includes('unique')
        ? 'Tayari umetuma quotation kwa request hii.'
        : normalizedError.includes('request') || normalizedError.includes('verified')
          ? 'Quotation haikutumwa. Hakikisha request iko wazi na provider account yako imeidhinishwa.'
          : 'Quotation haikutumwa. Hakiki taarifa zako na ujaribu tena baada ya muda mfupi.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="dashboard-hint">Inapakia kazi zilizo wazi...</div>
  return <div className="provider-workspace">
    <section className="provider-jobs">
      <div className="subsection-heading"><div><span className="section-kicker">FURSA MPYA</span><h3>Requests zilizo wazi</h3></div><span>{requests.length} kazi</span></div>
      {requests.length === 0
        ? <div className="dashboard-empty"><BriefcaseBusiness size={22} /><strong>Hakuna request zilizo wazi sasa</strong><span>Requests mpya kutoka kwa wateja zitaonekana hapa.</span></div>
        : <div className="workspace-list">{requests.map((request) => {
          const requestLocation = [request.city, request.region].filter(Boolean).join(', ') || request.location
          return <article className="workspace-card" key={request.id}><div className="workspace-row"><div className="workspace-icon"><Wrench size={18} /></div><div><strong>{request.title}</strong><span>{requestLocation} · {request.created_at.slice(0, 10)}</span>{request.description && <p>{request.description}</p>}</div>{quotedRequests.has(request.id) ? <span className="status teal">Quote imetumwa</span> : <button onClick={() => { setActiveRequest(activeRequest === request.id ? null : request.id); setError(''); setAmount(''); setEstimatedDays(''); setMessage('') }}>{activeRequest === request.id ? 'Funga' : 'Tuma quote'} <ArrowRight size={14} /></button>}</div>{activeRequest === request.id && !quotedRequests.has(request.id) && <div className="quote-form"><label>Kiasi (TSh)<input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Mfano: 25000" /></label><label>Muda wa kazi (siku, hiari)<input type="number" min="1" step="1" value={estimatedDays} onChange={(event) => setEstimatedDays(event.target.value)} placeholder="Mfano: 2" /></label><label>Ujumbe<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} placeholder="Eleza kazi itakayofanyika au masharti ya quotation" /></label>{error && <div className="dashboard-error">{error}</div>}<button className="primary-button" disabled={submitting || amount === ''} onClick={() => submit(request.id)}>{submitting ? 'Inatuma...' : 'Tuma quotation'} <ArrowRight size={14} /></button></div>}</article>
        })}</div>}
    </section>
    <section className="provider-sent-quotes">
      <div className="subsection-heading"><div><span className="section-kicker">UFUATILIAJI</span><h3>Quotations ulizotuma</h3></div><span>{quotations.length} quotes</span></div>
      {progressError && <div className="dashboard-error" role="alert">{progressError}</div>}
      {quotations.length === 0
        ? <div className="dashboard-hint">Quotations zako zitaonekana hapa baada ya kuyatuma.</div>
        : <div className="provider-quote-list">{quotations.map((quotation) => {
          const requestStatus = quotation.service_requests?.status || 'open'
          const bookingStatus = quotation.booking_status
          const accepted = bookingStatus === 'pending' || bookingStatus === 'confirmed' || bookingStatus === 'in_progress' || bookingStatus === 'completed'
          return <article className="provider-quote-row" key={quotation.id}>
            <div><strong>{quotation.service_requests?.title || 'Service request'}</strong><span>{quotation.created_at.slice(0, 10)}{quotation.estimated_days ? ` · Takriban siku ${quotation.estimated_days}` : ''}</span>{quotation.message && <p>{quotation.message}</p>}{accepted && <small className="booking-accepted">Mteja amekubali quotation</small>}</div>
            <strong className="quote-amount">TSh {Number(quotation.amount).toLocaleString()}</strong>
            <div className="provider-booking-actions">
              <span className={`status ${bookingStatus === 'completed' ? quotation.customer_confirmed_at ? 'green' : 'amber' : bookingStatus === 'in_progress' ? 'teal' : statusColor(requestStatus)}`}>{bookingStatus === 'completed' ? quotation.customer_confirmed_at ? 'Mteja ameridhika' : 'Inasubiri uthibitisho wa mteja' : bookingStatus === 'in_progress' ? 'Inaendelea' : accepted ? 'Imekubaliwa' : requestStatus === 'open' ? 'Inasubiri mteja' : requestStatusLabel(requestStatus)}</span>
              {quotation.booking_id && (bookingStatus === 'pending' || bookingStatus === 'confirmed') && <button disabled={progressingBooking !== null} onClick={() => void updateProgress(quotation.booking_id!, 'in_progress')}>{progressingBooking === quotation.booking_id ? 'Inasasisha...' : 'Anza kazi'}</button>}
              {quotation.booking_id && bookingStatus === 'in_progress' && <button disabled={progressingBooking !== null} onClick={() => void updateProgress(quotation.booking_id!, 'completed')}>{progressingBooking === quotation.booking_id ? 'Inasasisha...' : 'Weka imekamilika'}</button>}
            </div>
          </article>
        })}</div>}
    </section>
  </div>
}

function ProviderApplication({ onApply }: { onApply: (businessName: string, serviceArea: string, bio: string, serviceCategory: string, region: string, city: string) => Promise<void> }) {
  const [businessName, setBusinessName] = useState('')
  const [serviceArea, setServiceArea] = useState('')
  const [bio, setBio] = useState('')
  const [serviceCategory, setServiceCategory] = useState<string>(serviceCategories[0])
  const [region, setRegion] = useState<string>(tanzaniaRegions[0].region)
  const [city, setCity] = useState<string>(tanzaniaRegions[0].cities[0])
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const regionCities = tanzaniaRegions.find((item) => item.region === region)?.cities || tanzaniaRegions[0].cities

  const submit = async () => {
    setLoading(true)
    setError('')
    try {
      await onApply(businessName, serviceArea, bio, serviceCategory, region, city)
      setExpanded(false)
      setBusinessName('')
      setServiceArea('')
      setBio('')
      setServiceCategory(serviceCategories[0])
      setRegion(tanzaniaRegions[0].region)
      setCity(tanzaniaRegions[0].cities[0])
    } catch {
      setError('Ombi halikutumwa. Jaribu tena baada ya muda mfupi.')
    } finally {
      setLoading(false)
    }
  }

  return <section className="provider-application"><div><span className="section-kicker">KWA WATAALAMU</span><h3>Jiunge kama provider</h3><p>Tuma maelezo ya biashara yako kwa admin kwa uhakiki.</p></div>{!expanded ? <button className="outline-button" onClick={() => setExpanded(true)}>Anza maombi <ArrowRight size={14} /></button> : <div className="quote-form"><label>Jina la biashara<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></label><label>Sehemu ya huduma<select value={serviceCategory} onChange={(event) => setServiceCategory(event.target.value)}>{serviceCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Mkoa<select value={region} onChange={(event) => { const nextRegion = event.target.value; const nextCity = tanzaniaRegions.find((item) => item.region === nextRegion)?.cities[0] || ''; setRegion(nextRegion); setCity(nextCity) }}>{tanzaniaRegions.map((item) => <option key={item.region} value={item.region}>{item.region}</option>)}</select></label><label>Mji<select value={city} onChange={(event) => setCity(event.target.value)}>{regionCities.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label><label>Eneo unalohudumia<input value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} placeholder="Mfano: Sinza, Dar es Salaam" /></label><label>Uzoefu na huduma<textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={3} /></label>{error && <div className="dashboard-error">{error}</div>}<button className="primary-button" disabled={loading || !businessName.trim() || !serviceArea.trim()} onClick={submit}>{loading ? 'Inatuma...' : 'Tuma maombi'}</button></div>}</section>
}

function AdminWorkspace({ metrics, providers, loading, onApprove }: {
  metrics: { customers: number; providers: number; requests: number; pending: number }
  providers: PendingProviderRecord[]
  loading: boolean
  onApprove: (providerId: string) => void
}) {
  return <div className="admin-workspace"><div className="admin-stats"><div><strong>{metrics.providers}</strong><span>Providers</span></div><div><strong>{metrics.customers}</strong><span>Wateja</span></div><div><strong>{metrics.requests}</strong><span>Requests</span></div><div><strong>{metrics.pending}</strong><span>Pending review</span></div></div><div className="admin-review"><div className="subsection-heading"><div><span className="section-kicker">UHAKIKI</span><h3>Maombi ya provider</h3></div><span>{providers.length} pending</span></div>{loading && <div className="dashboard-hint">Inapakia maombi...</div>}{!loading && providers.length === 0 && <div className="dashboard-hint">Hakuna maombi mapya ya provider.</div>}{providers.map((provider) => {
    const providerLocation = [provider.city, provider.region].filter(Boolean).join(', ') || provider.service_area || 'Eneo halijawekwa'
    return <article className="admin-provider-row" key={provider.id}><div><strong>{provider.full_name}</strong><span>{provider.business_name || 'Biashara haijawekwa'} · {provider.service_category || 'Kategoria haijawekwa'} · {providerLocation}</span><small>{provider.experience_years} miaka ya uzoefu {provider.bio ? `· ${provider.bio}` : ''}</small></div><button onClick={() => onApprove(provider.id)}><Check size={14} /> Thibitisha</button></article>
  })}</div></div>
}

function RequestModal({ providers, initialProviderId, onClose, onSent }: { providers: Provider[]; initialProviderId: string; onClose: () => void; onSent: (service: string, location: string, description: string, category: string, region: string, city: string, providerId?: string) => void }) {
  const initialProvider = providers.find((provider) => String(provider.id) === initialProviderId)
  const initialCategory = initialProvider && serviceCategories.includes(initialProvider.category as typeof serviceCategories[number])
    ? initialProvider.category
    : serviceCategories[0]
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory)
  const [selectedService, setSelectedService] = useState<string>(serviceOptionsByCategory[initialCategory][0])
  const [region, setRegion] = useState<string>(tanzaniaRegions[0].region)
  const [city, setCity] = useState<string>(tanzaniaRegions[0].cities[0])
  const [description, setDescription] = useState('')
  const [providerId, setProviderId] = useState(initialProviderId)

  const regionCities = tanzaniaRegions.find((item) => item.region === region)?.cities || tanzaniaRegions[0].cities
  const serviceOptions = serviceOptionsByCategory[selectedCategory] || []
  const eligibleProviders = providers.filter((provider) => provider.category === selectedCategory || provider.category === 'Zote')

  const submit = () => {
    const serviceTitle = selectedService || serviceOptions[0]
    const locationLabel = [city, region].filter(Boolean).join(', ')
    onSent(serviceTitle, locationLabel, description.trim(), selectedCategory, region, city, providerId || undefined)
  }

  return <div className="modal-backdrop" onClick={onClose}><div className="request-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button><span className="section-kicker">REQUEST YA HUDUMA</span><h2>Tuambie unachohitaji.</h2><p>Chagua provider maalum au acha request ionekane kwa providers wote waliothibitishwa.</p><label>Kategoria ya huduma<select value={selectedCategory} onChange={(event) => { const nextCategory = event.target.value; setSelectedCategory(nextCategory); setSelectedService(serviceOptionsByCategory[nextCategory]?.[0] || ''); setProviderId('') }}>{serviceCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Huduma unayohitaji<select value={selectedService} onChange={(event) => setSelectedService(event.target.value)}>{serviceOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><label>Mwelekeze provider (hiari)<select value={providerId} onChange={(event) => setProviderId(event.target.value)}><option value="">Providers wote waliothibitishwa</option>{eligibleProviders.map((provider) => <option key={provider.id} value={String(provider.id)}>{provider.name} · {provider.category}</option>)}</select></label><label>Mkoa<select value={region} onChange={(event) => { const nextRegion = event.target.value; const nextCity = tanzaniaRegions.find((item) => item.region === nextRegion)?.cities[0] || ''; setRegion(nextRegion); setCity(nextCity) }}>{tanzaniaRegions.map((item) => <option key={item.region} value={item.region}>{item.region}</option>)}</select></label><label>Mji<select value={city} onChange={(event) => setCity(event.target.value)}>{regionCities.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label><label>Maelezo mafupi<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Eleza tatizo au kazi kwa ufupi..." rows={3} /></label><button className="primary-button" disabled={!selectedService.trim()} onClick={submit}>Tuma request <ArrowRight size={16} /></button></div></div>
}

function AuthModal({ onClose, onAuthenticated }: { onClose: () => void; onAuthenticated: (session: AuthSession, registered: boolean) => void }) {
  const [register, setRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(false)
  const submit = async () => {
    if (cooldown || loading) return
    setLoading(true); setError('')
    try {
      const result = register ? await signUp(email, password, name) : await signIn(email, password)
      if (!result.ok) {
        setError(result.message)
        if (result.rateLimited) {
          setCooldown(true)
          window.setTimeout(() => setCooldown(false), Math.max(60, result.retryAfterSeconds || 0) * 1000)
        }
        return
      }
      if (result.session) onAuthenticated(result.session, register)
      else if (result.needsEmailConfirmation) setError('Usajili umefanikiwa. Fungua email yako na uthibitishe akaunti kabla ya kuingia.')
    } catch {
      setError('Imeshindikana kuwasiliana na server. Angalia internet kisha ujaribu tena.')
    } finally {
      setLoading(false)
    }
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="request-modal auth-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button><span className="section-kicker">MTAANIHUB ACCOUNT</span><h2>{register ? 'Jisajili MtaaniHub.' : 'Karibu tena.'}</h2><p>{register ? 'Fungua account ili requests zako zihifadhiwe moja kwa moja. Kwenye Supabase, uthibitisho wa email lazima umezimwa/kuwepo.' : 'Ingia ili utume requests kwenye database yako.'}</p>{register && <label>Jina kamili<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Jina lako" /></label>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Angalau characters 6" /></label>{error && <div className="auth-error">{error}</div>}<button className="primary-button" disabled={loading || cooldown || !email || password.length < 6 || (register && !name)} onClick={submit}>{loading ? 'Inachakata...' : cooldown ? 'Subiri...' : register ? 'Fungua account' : 'Ingia'} <ArrowRight size={16} /></button><button className="switch-auth" onClick={() => { setRegister(!register); setError('') }}>{register ? 'Tayari una account? Ingia' : 'Huna account? Jisajili'}</button></div></div>
}

export default App
