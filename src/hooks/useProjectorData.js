import { useState, useEffect } from 'react'

const STORAGE_KEY = 'projector_v1'

function genId() {
  return crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// tax: 'free'     = no tax at withdrawal (Roth, HSA)
//      'deferred' = taxed as ordinary income at withdrawal (Traditional, Pension)
//      'taxable'  = subject to capital gains on growth (Brokerage, HYSA)
export const ACCOUNT_TYPES = {
  // ── Tax-Free → green family ───────────────────────────────────────────────
  roth_ira:         { label: 'Roth IRA',          color: '#22c55e', defaultReturn: 10, limit: 7000,  tax: 'free'     },
  roth_401k:        { label: 'Roth 401k',         color: '#16a34a', defaultReturn: 10, limit: 23000, tax: 'free'     },
  hsa:              { label: 'HSA',               color: '#14b8a6', defaultReturn: 7,  limit: 4150,  tax: 'free'     },
  // ── Pre-Tax → amber / orange family ──────────────────────────────────────
  traditional_ira:  { label: 'Traditional IRA',   color: '#f59e0b', defaultReturn: 10, limit: 7000,  tax: 'deferred' },
  traditional_401k: { label: 'Traditional 401k',  color: '#f97316', defaultReturn: 10, limit: 23000, tax: 'deferred' },
  traditional_403b: { label: 'Traditional 403b',  color: '#ea580c', defaultReturn: 10, limit: 23000, tax: 'deferred' },
  sep_ira:          { label: 'SEP-IRA',           color: '#d97706', defaultReturn: 10, limit: 69000, tax: 'deferred' },
  '457b':           { label: '457(b)',            color: '#b45309', defaultReturn: 10, limit: 23000, tax: 'deferred' },
  pension:          { label: 'Pension',           color: '#c2410c', defaultReturn: 6,  limit: null,  tax: 'deferred' },
  // ── Taxable → blue / slate family ────────────────────────────────────────
  brokerage:        { label: 'Brokerage',         color: '#3b82f6', defaultReturn: 10, limit: null,  tax: 'taxable'  },
  hysa:             { label: 'HYSA',              color: '#64748b', defaultReturn: 4,  limit: null,  tax: 'taxable'  },
  // ── Custom → neutral ─────────────────────────────────────────────────────
  custom:           { label: 'Custom',            color: '#94a3b8', defaultReturn: 7,  limit: null,  tax: 'taxable'  },
}

export const ACCOUNT_GROUPS = [
  {
    key:   'free',
    label: 'Tax-Free',
    note:  'Grow & withdraw tax-free on qualified distributions',
    color: '#16a34a',
    types: ['roth_ira', 'roth_401k', 'hsa'],
  },
  {
    key:   'deferred',
    label: 'Pre-Tax',
    note:  'Contributions reduce taxable income now; taxed as ordinary income at withdrawal',
    color: '#d97706',
    types: ['traditional_ira', 'traditional_401k', 'traditional_403b', 'sep_ira', '457b', 'pension'],
  },
  {
    key:   'taxable',
    label: 'Taxable',
    note:  'No special tax treatment; capital gains apply to growth',
    color: '#6b7280',
    types: ['brokerage', 'hysa'],
  },
]

export const TAX_LABELS = {
  free:     { label: 'Tax-Free Withdrawal',     short: 'Tax-Free', color: '#16a34a' },
  deferred: { label: 'Taxed at Withdrawal',     short: 'Pre-Tax',  color: '#d97706' },
  taxable:  { label: 'Taxable (Capital Gains)', short: 'Taxable',  color: '#6b7280' },
}

// Returns the display color for an account, respecting custom tax treatment
export function getAccountColor(account) {
  if (account.type === 'custom') {
    return TAX_LABELS[account.customTax ?? 'taxable'].color
  }
  return ACCOUNT_TYPES[account.type]?.color ?? '#94a3b8'
}

// Returns the display label for an account
export function getAccountLabel(account) {
  if (account.type === 'custom') return account.customLabel || 'Custom Account'
  return ACCOUNT_TYPES[account.type]?.label ?? account.type
}

// Returns the tax type for an account
export function getAccountTax(account) {
  if (account.type === 'custom') return account.customTax ?? 'taxable'
  return ACCOUNT_TYPES[account.type]?.tax ?? 'taxable'
}

const DEFAULT_ACCOUNTS = [
  { id: genId(), type: 'roth_ira',         balance: 10000, monthlyContribution: 0, returnRate: 10, active: true },
  { id: genId(), type: 'traditional_401k', balance: 5000,  monthlyContribution: 0, returnRate: 10, active: true },
  { id: genId(), type: 'brokerage',        balance: 15000, monthlyContribution: 0, returnRate: 10, active: true },
]

const DEFAULT_SETTINGS = {
  currentAge:    25,
  retirementAge: 65,
  inflationRate: 3,
  taxRate:       22,
  capitalGains:  15,
}

const DEFAULT_DATA = {
  accounts: DEFAULT_ACCOUNTS,
  settings: DEFAULT_SETTINGS,
}

function migrateData(parsed) {
  // Migrate old tax settings
  if (!parsed.settings.taxRate) {
    parsed.settings.taxRate      = 22
    parsed.settings.capitalGains = 15
  }
  // Migrate old 'traditional' type → 'traditional_401k'
  parsed.accounts = parsed.accounts.map(a =>
    a.type === 'traditional' ? { ...a, type: 'traditional_401k' } : a
  )
  return parsed
}

export function useProjectorData() {
  const [data, setData] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return migrateData(JSON.parse(stored))
    } catch {}
    return DEFAULT_DATA
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  const updateSettings = (updates) =>
    setData(d => ({ ...d, settings: { ...d.settings, ...updates } }))

  const addAccount = (type) =>
    setData(d => ({
      ...d,
      accounts: [
        ...d.accounts,
        {
          id: genId(),
          type,
          balance: 0,
          monthlyContribution: 0,
          returnRate: ACCOUNT_TYPES[type]?.defaultReturn ?? 7,
          active: true,
          ...(type === 'custom' ? { customLabel: 'My Account', customTax: 'taxable' } : {}),
        },
      ],
    }))

  const updateAccount = (id, updates) =>
    setData(d => ({
      ...d,
      accounts: d.accounts.map(a => a.id === id ? { ...a, ...updates } : a),
    }))

  const removeAccount = (id) =>
    setData(d => ({ ...d, accounts: d.accounts.filter(a => a.id !== id) }))

  const resetData = () => setData(DEFAULT_DATA)

  return { data, updateSettings, addAccount, updateAccount, removeAccount, resetData }
}

// ── Projection engine ──────────────────────────────────────────────────────────

export function projectAccounts(accounts, settings) {
  const { currentAge, retirementAge, inflationRate, taxRate = 22, capitalGains = 15 } = settings
  const years = Math.max(1, retirementAge - currentAge)
  const activeAccounts = accounts.filter(a => a.active)

  const chartData = []
  const balances  = {}
  activeAccounts.forEach(a => { balances[a.id] = a.balance })

  for (let i = 0; i <= years; i++) {
    const age   = currentAge + i
    const point = { age }
    let totalNominal = 0

    activeAccounts.forEach(a => {
      if (i > 0) {
        const monthlyRate = a.returnRate / 100 / 12
        let bal = balances[a.id]
        for (let m = 0; m < 12; m++) {
          bal = bal * (1 + monthlyRate) + a.monthlyContribution
        }
        balances[a.id] = bal
      }
      point[a.id] = Math.round(balances[a.id])
      totalNominal += balances[a.id]
    })

    const inflationFactor = Math.pow(1 + inflationRate / 100, i)
    point.totalNominal    = Math.round(totalNominal)
    point.totalReal       = Math.round(totalNominal / inflationFactor)
    chartData.push(point)
  }

  const retirementPoint = chartData[chartData.length - 1]

  const accountTotals = activeAccounts.map(a => {
    const taxType          = getAccountTax(a)
    const projectedBalance = retirementPoint[a.id] ?? 0
    const totalContribs    = a.balance + (a.monthlyContribution * 12 * years)
    const totalGrowth      = projectedBalance - totalContribs

    let afterTax
    if (taxType === 'free') {
      afterTax = projectedBalance
    } else if (taxType === 'deferred') {
      afterTax = projectedBalance * (1 - taxRate / 100)
    } else {
      afterTax = totalContribs + (totalGrowth * (1 - capitalGains / 100))
    }

    return {
      ...a,
      projectedBalance,
      totalContributions: totalContribs,
      totalGrowth,
      afterTax: Math.round(Math.max(0, afterTax)),
      taxType,
    }
  })

  return { chartData, accountTotals, retirementPoint }
}
