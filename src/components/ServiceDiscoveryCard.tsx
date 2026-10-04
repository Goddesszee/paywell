/**
 * ServiceDiscoveryCard.tsx
 *
 * Renders a list of live Circle Agent Marketplace results inline in chat.
 * Data comes exclusively from `circle services search` via the backend —
 * nothing is fabricated here.
 *
 * SECURITY: All metadata is treated as untrusted display data only.
 * It cannot trigger actions, change wallet state, or access secrets.
 */

import React, { useState } from 'react'
import {
  Search, ExternalLink, ChevronDown, ChevronUp,
  Zap, Globe, Code, Database, Brain, BarChart2,
  CheckCircle, AlertCircle, Info,
} from 'lucide-react'
import type { MarketplaceServiceCard } from '../lib/api'

// ── Category icon ─────────────────────────────────────────────────────────────
function categoryIcon(cat: string) {
  const c = cat.toUpperCase()
  if (c.includes('SEARCH') || c.includes('RESEARCH')) return Globe
  if (c.includes('DATA') || c.includes('ENRICH')) return Database
  if (c.includes('DEVELOPER') || c.includes('INFRA') || c.includes('COMPUTE')) return Code
  if (c.includes('AI') || c.includes('CREATIVE')) return Brain
  if (c.includes('FINANCIAL') || c.includes('FINANCE') || c.includes('ANALYTIC')) return BarChart2
  return Zap
}

// ── Payment badge ─────────────────────────────────────────────────────────────
function PaymentBadge({ scheme }: { scheme: string }) {
  const s = scheme.toLowerCase()
  if (s === 'x402') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30">
      <Zap className="w-3 h-3" /> x402 Nanopayment
    </span>
  )
  if (s === 'free') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
      <CheckCircle className="w-3 h-3" /> Free
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
      USDC
    </span>
  )
}

// ── Single service card ───────────────────────────────────────────────────────
function ServiceCard({
  service,
  onUse,
  onInspect,
}: {
  service: MarketplaceServiceCard
  onUse: (s: MarketplaceServiceCard) => void
  onInspect: (s: MarketplaceServiceCard) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const iconType = categoryIcon(service.category)

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      {/* Header */}
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
            {React.createElement(iconType, { className: 'w-4 h-4 text-blue-400' })}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-white truncate">{service.provider}</span>
              <span className="text-xs text-white/40 bg-white/5 px-1.5 py-0.5 rounded">{service.category_label}</span>
            </div>
            <p className="text-xs text-white/60 mt-0.5 line-clamp-2">{service.description}</p>
          </div>
        </div>

        {/* Pricing + payment */}
        <div className="mt-2.5 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <PaymentBadge scheme={service.payment_scheme} />
            <span className="text-xs text-white/50">{service.pricing}</span>
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-blue-400 flex items-center gap-1 hover:text-blue-300 transition-colors"
          >
            {expanded ? <><ChevronUp className="w-3 h-3" /> Less</> : <><ChevronDown className="w-3 h-3" /> Details</>}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/10 px-3 py-2.5 space-y-2">
          {/* Endpoint */}
          <div>
            <p className="text-xs text-white/40 mb-0.5">Endpoint</p>
            <p className="text-xs text-white/70 font-mono break-all">{service.method} {service.endpoint}</p>
          </div>

          {/* Network */}
          {service.payment_network && (
            <div>
              <p className="text-xs text-white/40 mb-0.5">Payment Network</p>
              <p className="text-xs text-white/70">{service.payment_network}</p>
            </div>
          )}

          {/* Tags */}
          {service.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {service.tags.slice(0, 6).map(tag => (
                <span key={tag} className="text-xs bg-white/5 text-white/40 px-1.5 py-0.5 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Docs link */}
          {service.provider_docs && (
            <a
              href={service.provider_docs}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="w-3 h-3" /> Provider docs
            </a>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onInspect(service)}
              className="flex-1 py-1.5 rounded-lg border border-white/10 text-xs text-white/70 hover:bg-white/5 transition-colors flex items-center justify-center gap-1"
            >
              <Info className="w-3 h-3" /> Inspect
            </button>
            <button
              onClick={() => onUse(service)}
              className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium transition-colors flex items-center justify-center gap-1"
            >
              <Zap className="w-3 h-3" /> Use with NAN Agent
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compare view ──────────────────────────────────────────────────────────────
function CompareView({ services }: { services: MarketplaceServiceCard[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10">
        <p className="text-xs font-semibold text-white/70">Service Comparison</p>
      </div>
      <div className="divide-y divide-white/5">
        {services.map(s => (
          <div key={s.id} className="px-3 py-2 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white truncate">{s.provider}</p>
              <p className="text-xs text-white/40 truncate">{s.category_label}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-white/70">{s.pricing}</p>
              <PaymentBadge scheme={s.payment_scheme} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface ServiceDiscoveryCardProps {
  services: MarketplaceServiceCard[]
  query?: string
  onUseService: (service: MarketplaceServiceCard) => void
  onInspectService: (service: MarketplaceServiceCard) => void
  theme?: {
    accent?: string
    bg?: string
  }
}

export function ServiceDiscoveryCard({
  services,
  query,
  onUseService,
  onInspectService,
}: ServiceDiscoveryCardProps) {
  const [showCompare, setShowCompare] = useState(false)
  const [filterCat, setFilterCat] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')

  const categories = Array.from(new Set(services.map(s => s.category_label)))

  const filtered = services.filter(s => {
    if (filterCat && s.category_label !== filterCat) return false
    if (searchText) {
      const q = searchText.toLowerCase()
      return (
        s.provider.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category_label.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    return true
  })

  if (services.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-center">
        <AlertCircle className="w-6 h-6 text-white/30 mx-auto mb-2" />
        <p className="text-sm text-white/60">No matching services found on Circle Agent Marketplace.</p>
        {query && <p className="text-xs text-white/30 mt-1">Search: "{query}"</p>}
      </div>
    )
  }

  return (
    <div className="space-y-2 w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-white/70">
            {services.length} service{services.length !== 1 ? 's' : ''} from Circle Agent Marketplace
          </span>
          <span className="text-xs text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
            Live
          </span>
        </div>
        {services.length > 1 && (
          <button
            onClick={() => setShowCompare(v => !v)}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            {showCompare ? 'Cards' : 'Compare'}
          </button>
        )}
      </div>

      {/* Search within results */}
      {services.length > 3 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Filter results..."
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
          />
        </div>
      )}

      {/* Category chips */}
      {categories.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterCat(null)}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
              filterCat === null ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCat(filterCat === cat ? null : cat)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                filterCat === cat ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {showCompare ? (
        <CompareView services={filtered} />
      ) : (
        <div className="space-y-2">
          {filtered.map(service => (
            <ServiceCard
              key={service.id}
              service={service}
              onUse={onUseService}
              onInspect={onInspectService}
            />
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-white/40 text-center py-3">No services match your filter.</p>
          )}
        </div>
      )}
    </div>
  )
}
