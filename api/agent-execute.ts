/**
 * api/agent-execute.ts — NAN Agent Real Service Execution
 *
 * Handles actual API calls to external services on behalf of the user.
 * Called by api/chat.ts when intent classification resolves to a known service.
 *
 * Supported services:
 *   brave-search       — web search (BRAVE_SEARCH_API_KEY)
 *   serper-search      — Google search (SERPER_API_KEY)
 *   skyscanner-flights — flight search (SKYSCANNER_API_KEY)
 *   amadeus-hotels     — hotel search (AMADEUS_API_KEY + AMADEUS_API_SECRET)
 *   perplexity-research— deep research (PERPLEXITY_API_KEY)
 *   coingecko-prices   — crypto prices (no key needed)
 *   exchangerate-fx    — forex rates (EXCHANGERATE_API_KEY)
 *   github-code-search — repo search (GITHUB_TOKEN optional)
 *   openai-completion  — AI tasks (OPENAI_API_KEY)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { service_id, query, params = {} } = req.body as {
    service_id: string
    query: string
    params?: Record<string, string>
  }

  if (!service_id || !query) {
    return res.status(400).json({ error: 'service_id and query required' })
  }

  try {
    let result: string
    let raw: unknown = null
    let cost_usdc = 0

    switch (service_id) {

      // ── Web search ────────────────────────────────────────────────────────────
      case 'brave-search': {
        const key = process.env.BRAVE_SEARCH_API_KEY
        if (!key) { result = await fallbackWebSearch(query); break }
        const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
          headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': key },
        })
        if (!r.ok) { result = await fallbackWebSearch(query); break }
        const d = await r.json() as { web?: { results?: Array<{ title: string; description: string; url: string }> } }
        const results = d.web?.results ?? []
        raw = results
        result = results.length === 0
          ? `No results found for "${query}".`
          : `Here are the top results for **"${query}"**:\n\n` + results.slice(0, 5).map((r, i) =>
              `${i + 1}. **${r.title}**\n${r.description}\n🔗 ${r.url}`
            ).join('\n\n')
        break
      }

      case 'serper-search': {
        const key = process.env.SERPER_API_KEY
        if (!key) { result = await fallbackWebSearch(query); break }
        const r = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, num: 5 }),
        })
        if (!r.ok) { result = await fallbackWebSearch(query); break }
        const d = await r.json() as {
          organic?: Array<{ title: string; snippet: string; link: string }>
          answerBox?: { answer?: string; snippet?: string }
          knowledgeGraph?: { description?: string }
        }
        const answer = d.answerBox?.answer ?? d.answerBox?.snippet ?? d.knowledgeGraph?.description
        const organic = d.organic ?? []
        raw = d
        result = (answer ? `**Answer:** ${answer}\n\n` : '') +
          (organic.length > 0
            ? `**Search results for "${query}":**\n\n` + organic.slice(0, 5).map((r, i) =>
                `${i + 1}. **${r.title}**\n${r.snippet}\n🔗 ${r.link}`
              ).join('\n\n')
            : `No results found for "${query}".`)
        break
      }

      // ── Flights ───────────────────────────────────────────────────────────────
      case 'skyscanner-flights': {
        const key = process.env.SKYSCANNER_API_KEY
        // Parse origin/destination from query
        const { origin = 'LOS', destination = 'ABV', date = params.date } = extractFlightParams(query)
        if (!key) {
          result = generateFlightEstimate(query, origin, destination, date)
          break
        }
        try {
          const r = await fetch('https://partners.api.skyscanner.net/apiservices/v3/flights/live/search/create', {
            method: 'POST',
            headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: {
                market: 'US', locale: 'en-US', currency: 'USD',
                queryLegs: [{ originPlaceId: { iata: origin }, destinationPlaceId: { iata: destination }, date: { year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate() + 7 } }],
                adults: 1, cabinClass: 'CABIN_CLASS_ECONOMY',
              },
            }),
          })
          if (!r.ok) { result = generateFlightEstimate(query, origin, destination, date); break }
          const d = await r.json() as { content?: { results?: { itineraries?: Record<string, { pricingOptions?: Array<{ price?: { amount?: string } }> }> } } }
          const its = Object.values(d.content?.results?.itineraries ?? {}).slice(0, 3)
          raw = its
          result = its.length === 0
            ? generateFlightEstimate(query, origin, destination, date)
            : `**Flights from ${origin} to ${destination}:**\n\n` + its.map((it, i) => {
                const price = it.pricingOptions?.[0]?.price?.amount ?? 'N/A'
                return `${i + 1}. From **$${price}** USD`
              }).join('\n') + `\n\nPrices shown are estimates. Book directly on Skyscanner or Google Flights.`
        } catch { result = generateFlightEstimate(query, origin, destination, date) }
        break
      }

      // ── Hotels ────────────────────────────────────────────────────────────────
      case 'amadeus-hotels': {
        const key = process.env.AMADEUS_API_KEY
        const secret = process.env.AMADEUS_API_SECRET
        const city = extractCity(query) ?? params.city ?? 'Lagos'
        if (!key || !secret) {
          result = generateHotelEstimate(query, city)
          break
        }
        try {
          // Get access token
          const tokenRes = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=client_credentials&client_id=${key}&client_secret=${secret}`,
          })
          const tokenData = await tokenRes.json() as { access_token?: string }
          const token = tokenData.access_token
          if (!token) { result = generateHotelEstimate(query, city); break }

          const r = await fetch(`https://test.api.amadeus.com/v2/shopping/hotel-offers?cityCode=${city.toUpperCase().slice(0, 3)}&adults=1&roomQuantity=1&paymentPolicy=NONE`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!r.ok) { result = generateHotelEstimate(query, city); break }
          const d = await r.json() as { data?: Array<{ hotel?: { name?: string }; offers?: Array<{ price?: { total?: string; currency?: string } }> }> }
          const hotels = d.data?.slice(0, 4) ?? []
          raw = hotels
          result = hotels.length === 0
            ? generateHotelEstimate(query, city)
            : `**Hotels in ${city}:**\n\n` + hotels.map((h, i) => {
                const price = h.offers?.[0]?.price
                return `${i + 1}. **${h.hotel?.name ?? 'Hotel'}** — ${price ? `from $${price.total} ${price.currency}` : 'Price on request'}`
              }).join('\n') + `\n\nBook directly through the hotel or on Booking.com.`
        } catch { result = generateHotelEstimate(query, city) }
        break
      }

      // ── Crypto prices ─────────────────────────────────────────────────────────
      case 'coingecko-prices': {
        const coins = extractCoins(query)
        try {
          const ids = coins.join(',')
          const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`)
          if (!r.ok) { result = `Could not fetch live prices. Try coingecko.com.`; break }
          const d = await r.json() as Record<string, { usd?: number; usd_24h_change?: number; usd_market_cap?: number }>
          raw = d
          result = `**Live crypto prices** (from CoinGecko):\n\n` + Object.entries(d).map(([coin, data]) => {
            const change = data.usd_24h_change ?? 0
            const sign = change >= 0 ? '📈' : '📉'
            const cap = data.usd_market_cap ? ` · Market cap: $${(data.usd_market_cap / 1e9).toFixed(1)}B` : ''
            return `${sign} **${coin.charAt(0).toUpperCase() + coin.slice(1)}**: $${data.usd?.toLocaleString() ?? 'N/A'} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%${cap})`
          }).join('\n') + `\n\n_Updated just now via CoinGecko._`
        } catch { result = `Could not fetch live crypto prices. Check coingecko.com for live data.` }
        break
      }

      // ── Forex rates ───────────────────────────────────────────────────────────
      case 'exchangerate-fx': {
        const key = process.env.EXCHANGERATE_API_KEY
        const { from = 'USD', to = 'NGN' } = extractCurrencies(query)
        try {
          const url = key
            ? `https://v6.exchangerate-api.com/v6/${key}/pair/${from}/${to}`
            : `https://api.exchangerate-api.com/v4/latest/${from}`
          const r = await fetch(url)
          if (!r.ok) { result = getFxFallback(from, to); break }
          const d = await r.json() as { conversion_rate?: number; rates?: Record<string, number> }
          const rate = d.conversion_rate ?? d.rates?.[to]
          raw = { from, to, rate }
          if (!rate) { result = getFxFallback(from, to); break }
          result = `**Exchange Rate (live):**\n\n1 ${from} = **${rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${to}**\n\n_Source: ExchangeRate-API · Updated live_`
          if (from === 'USD' && to === 'NGN') {
            result += `\n\nFor comparison, the parallel market rate may differ slightly. Always check your bank or a licensed exchange for transactional rates.`
          }
        } catch { result = getFxFallback(from, to) }
        break
      }

      // ── GitHub code search ────────────────────────────────────────────────────
      case 'github-code-search': {
        const token = process.env.GITHUB_TOKEN
        const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        const q = query.replace(/find|search|github|repository|library|package|code|for/gi, '').trim()
        const r = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=5`, { headers })
        if (!r.ok) { result = `GitHub search unavailable. Try github.com/search directly.`; break }
        const d = await r.json() as { items?: Array<{ full_name: string; description: string; stargazers_count: number; html_url: string; language: string }> }
        const items = d.items ?? []
        raw = items
        result = items.length === 0
          ? `No repositories found for "${q}".`
          : `**GitHub repositories for "${q}":**\n\n` + items.map((r, i) =>
              `${i + 1}. **${r.full_name}** ⭐ ${r.stargazers_count.toLocaleString()}\n${r.description ?? 'No description'} · ${r.language ?? 'Unknown'}\n🔗 ${r.html_url}`
            ).join('\n\n')
        break
      }

      // ── Perplexity research ───────────────────────────────────────────────────
      case 'perplexity-research': {
        cost_usdc = 0.002
        const key = process.env.PERPLEXITY_API_KEY
        if (!key) { result = await fallbackResearch(query); break }
        const r = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.1-sonar-large-128k-online',
            messages: [
              { role: 'system', content: 'Be precise and concise. Provide cited, factual information.' },
              { role: 'user', content: query },
            ],
            max_tokens: 600,
          }),
        })
        if (!r.ok) { result = await fallbackResearch(query); break }
        const d = await r.json() as { choices?: Array<{ message: { content: string } }> }
        result = d.choices?.[0]?.message?.content ?? await fallbackResearch(query)
        break
      }

      // ── OpenAI AI tasks ───────────────────────────────────────────────────────
      case 'openai-completion': {
        cost_usdc = 0.001
        const key = process.env.OPENAI_API_KEY
        if (!key) { result = `OpenAI not configured. Add OPENAI_API_KEY to enable AI tasks.`; break }
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: query }],
            max_tokens: 600,
          }),
        })
        if (!r.ok) { result = `OpenAI request failed.`; break }
        const d = await r.json() as { choices?: Array<{ message: { content: string } }> }
        result = d.choices?.[0]?.message?.content ?? 'No response from OpenAI.'
        break
      }

      // ── Supplier search (Alibaba fallback) ────────────────────────────────────
      case 'alibaba-suppliers': {
        result = generateSupplierEstimate(query)
        break
      }

      default:
        return res.status(404).json({ error: `Unknown service: ${service_id}` })
    }

    return res.status(200).json({ result, raw, cost_usdc, service_id })
  } catch (e) {
    console.error('agent-execute error:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Execution failed', service_id })
  }
}

// ── Helper: Extract flight params from natural language ───────────────────────

function extractFlightParams(query: string): { origin: string; destination: string; date?: string } {
  const lower = query.toLowerCase()
  const AIRPORTS: Record<string, string> = {
    'lagos': 'LOS', 'abuja': 'ABV', 'london': 'LHR', 'new york': 'JFK', 'dubai': 'DXB',
    'accra': 'ACC', 'nairobi': 'NBO', 'johannesburg': 'JNB', 'paris': 'CDG', 'amsterdam': 'AMS',
    'frankfurt': 'FRA', 'istanbul': 'IST', 'doha': 'DOH', 'toronto': 'YYZ', 'houston': 'IAH',
    'los angeles': 'LAX', 'chicago': 'ORD', 'miami': 'MIA', 'cairo': 'CAI', 'addis ababa': 'ADD',
  }
  const cities = Object.keys(AIRPORTS)
  const found = cities.filter(c => lower.includes(c))
  // Try to determine direction from "from X to Y"
  const fromMatch = lower.match(/from\s+([a-z\s]+?)\s+to\s+/)
  const toMatch = lower.match(/to\s+([a-z\s]+?)(?:\s+(?:on|next|this|in|for)|$)/)
  const fromCity = fromMatch ? cities.find(c => fromMatch[1].includes(c)) : found[0]
  const toCity = toMatch ? cities.find(c => toMatch[1].includes(c)) : found[1]
  return {
    origin: fromCity ? AIRPORTS[fromCity] : 'LOS',
    destination: toCity ? AIRPORTS[toCity] : 'LHR',
  }
}

function generateFlightEstimate(query: string, origin: string, dest: string, _date?: string): string {
  const ROUTES: Record<string, { price: string; duration: string; airlines: string }> = {
    'LOS-LHR': { price: '$500–900', duration: '6h 30m', airlines: 'British Airways, Virgin Atlantic, Air Peace' },
    'LOS-ABV': { price: '$80–150', duration: '1h 10m', airlines: 'Air Peace, Ibom Air, Dana Air' },
    'LOS-DXB': { price: '$350–600', duration: '7h', airlines: 'Emirates, Flynas, Qatar Airways' },
    'LOS-JFK': { price: '$700–1,200', duration: '11h', airlines: 'Delta, United, Air Peace' },
    'LOS-ACC': { price: '$100–200', duration: '1h 20m', airlines: 'Air Peace, Africa World Airlines' },
    'LOS-NBO': { price: '$250–450', duration: '4h', airlines: 'Kenya Airways, Ethiopian Airlines' },
    'ABV-LHR': { price: '$500–850', duration: '7h', airlines: 'British Airways, Air Peace' },
    'LHR-JFK': { price: '$300–700', duration: '7h 30m', airlines: 'BA, Virgin Atlantic, American' },
  }
  const key = `${origin}-${dest}`
  const rev = `${dest}-${origin}`
  const route = ROUTES[key] ?? ROUTES[rev]
  if (route) {
    return `**Flights from ${origin} to ${dest}** (knowledge-based estimate):\n\n✈️ Price range: **${route.price}** · Duration: **${route.duration}**\nAirlines: ${route.airlines}\n\n_For live prices and booking, check Skyscanner or Google Flights. Add a SKYSCANNER_API_KEY for real-time results._`
  }
  return `**Flights from ${origin} to ${dest}**:\n\nPrices typically range from **$150–$900** depending on the route and date. Check Skyscanner, Google Flights, or Kayak for live fares.\n\n_Add a SKYSCANNER_API_KEY to get real-time results in NAN._`
}

function generateHotelEstimate(query: string, city: string): string {
  const CITIES: Record<string, { budget: string; mid: string; luxury: string }> = {
    'Lagos': { budget: '$40–80', mid: '$100–180', luxury: '$200–400' },
    'Abuja': { budget: '$50–90', mid: '$120–200', luxury: '$250–500' },
    'London': { budget: '$80–120', mid: '$150–300', luxury: '$400–900' },
    'Dubai': { budget: '$60–100', mid: '$120–250', luxury: '$300–800' },
    'New York': { budget: '$100–150', mid: '$200–350', luxury: '$500–1,200' },
    'Accra': { budget: '$50–80', mid: '$100–180', luxury: '$200–400' },
  }
  const prices = CITIES[city] ?? { budget: '$40–100', mid: '$100–250', luxury: '$250–600' }
  return `**Hotels in ${city}** (knowledge-based estimate):\n\n🏨 Budget: **${prices.budget}/night**\n🏨 Mid-range: **${prices.mid}/night**\n🏨 Luxury: **${prices.luxury}/night**\n\n_Add AMADEUS_API_KEY for live availability and booking options._`
}

function generateSupplierEstimate(query: string): string {
  return `**Supplier search for "${query}":**\n\nTop platforms for finding suppliers:\n1. **Alibaba.com** — largest B2B marketplace, MOQ from 50–500 units\n2. **Global Sources** — verified Asian manufacturers\n3. **Made-in-China.com** — factory direct pricing\n4. **DHgate** — smaller MOQs, faster shipping\n\nTips: Request samples before bulk orders, verify certifications, use escrow payments.\n\n_Add ALIBABA_APP_KEY for live supplier data directly in NAN._`
}

function extractCity(query: string): string | null {
  const CITIES = ['Lagos', 'Abuja', 'London', 'Dubai', 'New York', 'Paris', 'Accra', 'Nairobi', 'Johannesburg', 'Cairo', 'Istanbul', 'Amsterdam', 'Frankfurt', 'Toronto']
  const lower = query.toLowerCase()
  return CITIES.find(c => lower.includes(c.toLowerCase())) ?? null
}

function extractCoins(query: string): string[] {
  const COIN_MAP: Record<string, string> = {
    'bitcoin': 'bitcoin', 'btc': 'bitcoin',
    'ethereum': 'ethereum', 'eth': 'ethereum',
    'usdc': 'usd-coin', 'usd coin': 'usd-coin',
    'solana': 'solana', 'sol': 'solana',
    'bnb': 'binancecoin', 'binance': 'binancecoin',
    'xrp': 'ripple', 'ripple': 'ripple',
    'cardano': 'cardano', 'ada': 'cardano',
    'polygon': 'matic-network', 'matic': 'matic-network',
    'dogecoin': 'dogecoin', 'doge': 'dogecoin',
    'arbitrum': 'arbitrum', 'arb': 'arbitrum',
  }
  const lower = query.toLowerCase()
  const found = Object.entries(COIN_MAP).filter(([k]) => lower.includes(k)).map(([, v]) => v)
  const unique = [...new Set(found)]
  return unique.length > 0 ? unique.slice(0, 5) : ['bitcoin', 'ethereum', 'usd-coin']
}

function extractCurrencies(query: string): { from: string; to: string } {
  const CURRENCIES = ['USD', 'NGN', 'GBP', 'EUR', 'AED', 'GHS', 'KES', 'ZAR', 'CAD', 'JPY', 'AUD', 'CHF', 'CNY', 'INR']
  const found = CURRENCIES.filter(c => query.toUpperCase().includes(c))
  // Try to get direction from "USD to NGN" or "dollar to naira"
  const lower = query.toLowerCase()
  if (lower.includes('naira') || lower.includes('ngn')) return { from: 'USD', to: 'NGN' }
  if (lower.includes('pound') || lower.includes('gbp')) return { from: 'USD', to: 'GBP' }
  if (lower.includes('euro') || lower.includes('eur')) return { from: 'USD', to: 'EUR' }
  if (lower.includes('dirham') || lower.includes('aed')) return { from: 'USD', to: 'AED' }
  if (lower.includes('cedi') || lower.includes('ghs')) return { from: 'USD', to: 'GHS' }
  return { from: found[0] ?? 'USD', to: found[1] ?? 'NGN' }
}

function getFxFallback(from: string, to: string): string {
  const RATES: Record<string, number> = {
    'USD-NGN': 1650, 'USD-GBP': 0.79, 'USD-EUR': 0.92, 'USD-GHS': 15.8,
    'USD-KES': 130, 'USD-ZAR': 18.5, 'USD-AED': 3.67, 'USD-CAD': 1.38,
    'GBP-NGN': 2090, 'EUR-NGN': 1795,
  }
  const rate = RATES[`${from}-${to}`]
  if (rate) return `**${from} → ${to}** (estimated, late 2026):\n\n1 ${from} ≈ **${rate.toLocaleString()} ${to}**\n\n_For live rates, check xe.com or your bank. Add EXCHANGERATE_API_KEY for real-time data in NAN._`
  return `Exchange rate for ${from}/${to} not available. Check xe.com for the live rate.`
}

async function fallbackWebSearch(query: string): Promise<string> {
  return `I searched for **"${query}"** but no search API key is configured (BRAVE_SEARCH_API_KEY or SERPER_API_KEY). Here's what I know from my training data:\n\nFor the most current results, I recommend checking Google, Bing, or DuckDuckGo directly.`
}

async function fallbackResearch(query: string): Promise<string> {
  return `Deep research for **"${query}"** requires a PERPLEXITY_API_KEY. I can provide a knowledge-based answer instead — just ask me directly in the chat and I'll answer from my training data.`
}
