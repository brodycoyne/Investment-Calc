import { useState, useEffect, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  useProjectorData, projectAccounts,
  ACCOUNT_TYPES, ACCOUNT_GROUPS, TAX_LABELS,
  getAccountColor, getAccountLabel, getAccountTax,
} from '../hooks/useProjectorData'
import AccountCard from './AccountCard'

function formatFull(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}
function formatK(value) {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000)     return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

const CustomTooltip = ({ active, payload, label, accounts }) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, e) => s + (e.value || 0), 0)
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">Age {label}</p>
      {payload.map(e => {
        const account = accounts.find(a => a.id === e.dataKey)
        return (
          <p key={e.dataKey} style={{ color: e.color }}>
            {getAccountLabel(account) ?? e.dataKey}: {formatFull(e.value)}
          </p>
        )
      })}
      <p className="tooltip-total">Total: {formatFull(total)}</p>
    </div>
  )
}

// Simple inline number input for settings bar
function SettingInput({ value, onChange, min, max, step = 1 }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(value)) }, [value])

  const commit = (raw) => {
    const num = parseFloat(raw)
    if (!isNaN(num)) onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, num)))
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onFocus={e => e.target.select()}
      onChange={e => setDraft(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && commit(draft)}
    />
  )
}

export default function Projector() {
  const { data, updateSettings, addAccount, updateAccount, removeAccount, resetData } = useProjectorData()
  const { accounts, settings } = data
  const { currentAge, retirementAge, inflationRate, taxRate = 22, capitalGains = 15 } = settings

  const [markerAge,      setMarkerAge]      = useState(retirementAge)
  const [showReal,       setShowReal]       = useState(true)
  const [addingType,     setAddingType]     = useState(false)
  const [showTaxInfo,    setShowTaxInfo]    = useState(false)
  const [showTaxRateInfo,  setShowTaxRateInfo]  = useState(false)
  const [showCapGainsInfo, setShowCapGainsInfo] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('projector_onboarding_dismissed')
  )

  const activeAccounts = accounts.filter(a => a.active)

  const { chartData, accountTotals, retirementPoint } = useMemo(
    () => projectAccounts(accounts, settings),
    [accounts, settings]
  )

  const markerPoint        = chartData.find(d => d.age === markerAge) ?? chartData[chartData.length - 1]
  const markerTotal        = showReal ? markerPoint?.totalReal : markerPoint?.totalNominal
  const totalContributions     = accountTotals.reduce((s, a) => s + a.totalContributions, 0)
  const totalAfterTaxNominal   = accountTotals.reduce((s, a) => s + a.afterTax, 0)
  const totalRetirementNominal = retirementPoint?.totalNominal ?? 0
  const totalRetirementReal    = retirementPoint?.totalReal    ?? 0
  const realRatio      = (showReal && totalRetirementNominal > 0) ? totalRetirementReal / totalRetirementNominal : 1
  const totalRetirement = showReal ? totalRetirementReal : totalRetirementNominal
  const totalAfterTax   = Math.round(totalAfterTaxNominal * realRatio)
  const totalGrowth     = totalRetirement - totalContributions
  const growthPct       = totalRetirement > 0 ? (totalGrowth / totalRetirement * 100).toFixed(0) : 0

  // After-tax estimate at the current marker age (re-computed from markerPoint balances)
  const markerAfterTaxNominal = useMemo(() => {
    if (!markerPoint) return 0
    const yearsToMarker = Math.max(0, markerAge - currentAge)
    const { taxRate = 22, capitalGains = 15 } = settings
    return Math.round(activeAccounts.reduce((sum, a) => {
      const projBal      = markerPoint[a.id] ?? 0
      const contribs     = a.balance + (a.monthlyContribution * 12 * yearsToMarker)
      const growth       = projBal - contribs
      const taxType      = getAccountTax(a)
      let afterTax
      if (taxType === 'free')          afterTax = projBal
      else if (taxType === 'deferred') afterTax = projBal * (1 - taxRate / 100)
      else                             afterTax = contribs + (growth * (1 - capitalGains / 100))
      return sum + Math.max(0, afterTax)
    }, 0))
  }, [markerPoint, markerAge, currentAge, activeAccounts, settings])

  const markerRealRatio  = (showReal && (markerPoint?.totalNominal ?? 0) > 0)
    ? markerPoint.totalReal / markerPoint.totalNominal
    : 1
  const markerAfterTax   = Math.round(markerAfterTaxNominal * markerRealRatio)

  const markerContributions = activeAccounts.reduce((sum, a) =>
    sum + a.balance + (a.monthlyContribution * 12 * Math.max(0, markerAge - currentAge)), 0)
  const markerGrowth     = Math.round((markerTotal ?? 0) - markerContributions)
  const markerGrowthPct  = (markerTotal ?? 0) > 0
    ? (markerGrowth / (markerTotal ?? 0) * 100).toFixed(0)
    : 0

  const multiplier = totalContributions > 0
    ? (totalRetirement / totalContributions).toFixed(1)
    : null

  const dismissOnboarding = () => {
    localStorage.setItem('projector_onboarding_dismissed', '1')
    setShowOnboarding(false)
  }

  const handleRetirementAge = (val) => {
    updateSettings({ retirementAge: val })
    setMarkerAge(val)
  }

  return (
    <div className="projector">

      {/* ── Header ── */}
      <div className="proj-header">
        <h1>Investment Growth Calculator</h1>
        <p className="page-subtitle">See how every account you own grows to retirement — with real after-tax estimates.</p>
      </div>

      {/* ── Hero Stat ── */}
      <div className="hero-stat">
        <div className="hero-main">
          <p className="hero-label">
            Projected at Retirement (Age {retirementAge}){showReal ? ' · Today\'s Dollars' : ' · Future Dollars'}
          </p>
          <p className="hero-value">{formatFull(totalRetirement)}</p>
          <p className="hero-sub">
            Est. <span className="hero-after-tax">{formatFull(totalAfterTax)}</span> after tax
            {multiplier && <span className="hero-divider">·</span>}
            {multiplier && <span className="hero-multiplier">{multiplier}× your contributions</span>}
            <span className="hero-divider">·</span>
            <span>{retirementAge - currentAge} years away</span>
          </p>
        </div>
      </div>

      {/* ── Onboarding Strip ── */}
      {showOnboarding && (
        <div className="onboarding-strip">
          <div className="onboarding-steps">
            <div className="onboarding-step">
              <span className="step-num">①</span>
              <span><strong>Add your accounts</strong> — current balance &amp; contributions on the left</span>
            </div>
            <span className="onboarding-arrow">→</span>
            <div className="onboarding-step">
              <span className="step-num">②</span>
              <span><strong>Set your age &amp; tax rates</strong> in the settings bar below</span>
            </div>
            <span className="onboarding-arrow">→</span>
            <div className="onboarding-step">
              <span className="step-num">③</span>
              <span><strong>Drag the timeline slider</strong> to explore your growth at any age</span>
            </div>
          </div>
          <button className="onboarding-dismiss" onClick={dismissOnboarding} title="Dismiss">✕</button>
        </div>
      )}

      {/* ── Global Settings Bar ── */}
      <div className="settings-bar">
        <div className="setting-item">
          <label>Current Age</label>
          <SettingInput value={currentAge} min={16} max={80}
            onChange={val => updateSettings({ currentAge: val })} />
        </div>
        <div className="setting-item">
          <label>Retirement Age</label>
          <SettingInput value={retirementAge} min={currentAge + 1} max={90}
            onChange={handleRetirementAge} />
        </div>
        <div className="setting-item">
          <label>Inflation Rate (%) <span className="recommended-badge">3% avg</span></label>
          <SettingInput value={inflationRate} min={0} max={15} step={0.5}
            onChange={val => updateSettings({ inflationRate: val })} />
        </div>
        <div className="setting-divider" />
        <div className="setting-item tax-setting-item">
          <label>
            Income Tax Rate (%)
            <span className="tax-hint-badge deferred-badge">Applies to Traditional/Pension</span>
            <button
              className={`info-btn ${showTaxRateInfo ? 'active' : ''}`}
              onClick={() => setShowTaxRateInfo(v => !v)}
              title="Tax bracket reference"
            >i</button>
          </label>
          <SettingInput value={taxRate} min={0} max={60} step={1}
            onChange={val => updateSettings({ taxRate: val })} />
          <input
            type="range" min={0} max={60} step={1} value={taxRate}
            onChange={e => updateSettings({ taxRate: Number(e.target.value) })}
            className="setting-slider"
            style={{ accentColor: '#d97706' }}
          />
          {showTaxRateInfo && (
            <div className="info-popover">
              <p className="info-popover-title">2024 Federal Income Tax Brackets (Single filer)</p>
              <table className="info-table">
                <tbody>
                  <tr><td>10%</td><td>Up to $11,600</td></tr>
                  <tr><td>12%</td><td>$11,601 – $47,150</td></tr>
                  <tr><td>22%</td><td>$47,151 – $100,525</td></tr>
                  <tr><td>24%</td><td>$100,526 – $191,950</td></tr>
                  <tr><td>32%</td><td>$191,951 – $243,725</td></tr>
                  <tr><td>35%</td><td>$243,726 – $609,350</td></tr>
                  <tr><td>37%</td><td>Over $609,350</td></tr>
                </tbody>
              </table>
              <p className="info-popover-note">Use your expected <strong>marginal rate</strong> at retirement — that's what you'll pay on Traditional 401k/IRA withdrawals.</p>
            </div>
          )}
        </div>
        <div className="setting-item tax-setting-item">
          <label>
            Capital Gains Rate (%)
            <span className="tax-hint-badge taxable-badge">Applies to Brokerage</span>
            <button
              className={`info-btn ${showCapGainsInfo ? 'active' : ''}`}
              onClick={() => setShowCapGainsInfo(v => !v)}
              title="Capital gains rate reference"
            >i</button>
          </label>
          <SettingInput value={capitalGains} min={0} max={40} step={1}
            onChange={val => updateSettings({ capitalGains: val })} />
          <input
            type="range" min={0} max={40} step={1} value={capitalGains}
            onChange={e => updateSettings({ capitalGains: Number(e.target.value) })}
            className="setting-slider"
            style={{ accentColor: '#6b7280' }}
          />
          {showCapGainsInfo && (
            <div className="info-popover">
              <p className="info-popover-title">2024 Long-Term Capital Gains Rates (Single filer)</p>
              <table className="info-table">
                <tbody>
                  <tr><td>0%</td><td>Taxable income up to $47,025</td></tr>
                  <tr><td>15%</td><td>$47,026 – $518,900</td></tr>
                  <tr><td>20%</td><td>Over $518,900</td></tr>
                </tbody>
              </table>
              <p className="info-popover-note">Only applies to assets held <strong>over 1 year</strong>. Most retirees qualify for the 0% or 15% rate. Add 3.8% NIIT if income exceeds ~$200K.</p>
            </div>
          )}
        </div>
      </div>

      {/* Tax explanation */}
      <div className="tax-explainer">
        <button className="tax-explainer-toggle" onClick={() => setShowTaxInfo(v => !v)}>
          ℹ️ How tax treatment works {showTaxInfo ? '▲' : '▼'}
        </button>
        {showTaxInfo && (
          <div className="tax-explainer-body">
            {Object.entries(TAX_LABELS).map(([key, t]) => (
              <div key={key} className="tax-explainer-row">
                <span className="tax-badge" style={{ background: `${t.color}18`, color: t.color, borderColor: `${t.color}40` }}>
                  {t.short}
                </span>
                <span>{t.label}</span>
                <span className="tax-accounts">
                  {Object.entries(ACCOUNT_TYPES).filter(([k, v]) => v.tax === key && k !== 'custom').map(([, v]) => v.label).join(', ')}
                </span>
              </div>
            ))}
            <p className="tax-note">
              After-tax values are estimates. Roth IRA and HSA withdrawals are tax-free.
              Traditional 401k/403b and Pension balances are taxed as ordinary income at your set rate.
              Brokerage: only growth is subject to capital gains tax; your contributions come back tax-free.
            </p>
          </div>
        )}
      </div>

      <div className="proj-layout">

        {/* ── Left: Accounts ── */}
        <div className="accounts-panel">
          <div className="accounts-panel-header">
            <h2>Your Accounts</h2>
            <div className="accounts-panel-actions">
              <button className="btn-ghost small" onClick={() => { if (window.confirm('Reset all accounts and settings to defaults?')) resetData() }}>Reset</button>
              <button className="btn-primary small" onClick={() => setAddingType(t => !t)}>+ Add</button>
            </div>
          </div>

          {addingType && (
            <div className="account-type-picker">
              {ACCOUNT_GROUPS.map(group => (
                <div key={group.key} className="picker-group">
                  <div className="picker-group-header">
                    <span className="picker-group-label" style={{ color: group.color }}>{group.label}</span>
                    <span className="picker-group-note">{group.note}</span>
                  </div>
                  <div className="picker-group-types">
                    {group.types.map(key => {
                      const t = ACCOUNT_TYPES[key]
                      return (
                        <button
                          key={key}
                          className="type-pick-btn"
                          style={{ borderColor: t.color }}
                          onClick={() => { addAccount(key); setAddingType(false) }}
                        >
                          <span className="type-dot" style={{ background: t.color }} />
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div className="picker-group">
                <div className="picker-group-header">
                  <span className="picker-group-label" style={{ color: '#94a3b8' }}>Custom</span>
                  <span className="picker-group-note">Set your own name and tax structure</span>
                </div>
                <div className="picker-group-types">
                  <button
                    className="type-pick-btn"
                    style={{ borderColor: '#94a3b8' }}
                    onClick={() => { addAccount('custom'); setAddingType(false) }}
                  >
                    <span className="type-dot" style={{ background: '#94a3b8' }} />
                    Custom Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeAccounts.map(account => (
            <AccountCard key={account.id} account={account} onUpdate={updateAccount} onRemove={removeAccount} />
          ))}

          {activeAccounts.length === 0 && (
            <div className="empty-state">
              <p>No accounts yet. Click <strong>+ Add</strong> to get started.</p>
            </div>
          )}
        </div>

        {/* ── Right: Results ── */}
        <div className="results-panel">

          {/* View Mode Switcher */}
          <div className="view-mode-bar">
            <span className="view-mode-label">Show values in:</span>
            <div className="view-mode-toggle">
              <button className={`view-mode-btn ${showReal ? 'active' : ''}`} onClick={() => setShowReal(true)}>
                Today's Dollars
              </button>
              <button className={`view-mode-btn ${!showReal ? 'active' : ''}`} onClick={() => setShowReal(false)}>
                Future (Nominal) Dollars
              </button>
            </div>
            <span className="view-mode-note">
              {showReal
                ? `Purchasing power in today's dollars, adjusted for ${inflationRate}% annual inflation`
                : 'Raw projected amounts — not adjusted for inflation'}
            </span>
          </div>

          {/* Summary Cards */}
          <div className="proj-summary-cards">
            <div className="summary-card card-tint-blue">
              <p className="summary-label">{showReal ? 'Inflation-Adjusted' : 'Gross Total'} at Age {markerAge}</p>
              <p className="summary-value">{formatFull(markerTotal ?? 0)}</p>
              <p className="summary-sub">{markerAge === retirementAge ? 'At retirement' : `${retirementAge - markerAge} yrs before retirement`}</p>
            </div>
            <div className="summary-card card-tint-green">
              <p className="summary-label">Est. After-Tax at Age {markerAge}</p>
              <p className="summary-value after-tax-value">{formatFull(markerAfterTax)}</p>
              <p className="summary-sub">{markerAge === retirementAge ? 'At retirement' : `${retirementAge - markerAge} yrs before retirement`}</p>
            </div>
            <div className="summary-card card-tint-amber">
              <p className="summary-label">Total Contributions</p>
              <p className="summary-value">{formatFull(totalContributions)}</p>
              <p className="summary-sub">Principal invested</p>
            </div>
            <div className="summary-card card-tint-teal">
              <p className="summary-label">Investment Growth at Age {markerAge}</p>
              <p className="summary-value growth-value">{formatFull(markerGrowth)}</p>
              <p className="summary-sub">{markerGrowthPct}% of total is compounding</p>
            </div>
          </div>

          {/* Age Marker Slider */}
          <div className="marker-slider-card">
            <div className="marker-slider-header">
              <span>Drag to explore value at any age</span>
              <strong>Age {markerAge} → {formatFull(markerTotal ?? 0)}</strong>
            </div>
            <input type="range" min={currentAge} max={retirementAge} value={markerAge}
              onChange={e => setMarkerAge(Number(e.target.value))} className="marker-slider" />
            <div className="marker-slider-labels">
              <span>Age {currentAge}</span>
              <span>Age {retirementAge}</span>
            </div>
          </div>

          {/* Chart */}
          <div className="chart-card">
            <h2>Portfolio Growth Over Time</h2>
            <ResponsiveContainer width="100%" height={360}>
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <defs>
                  {activeAccounts.map(a => {
                    const color = getAccountColor(a)
                    return (
                      <linearGradient key={a.id} id={`grad-${a.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={color} stopOpacity={0.7} />
                        <stop offset="95%" stopColor={color} stopOpacity={0.3} />
                      </linearGradient>
                    )
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="age" label={{ value: 'Age', position: 'insideBottom', offset: -10 }} tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatK} tick={{ fontSize: 12 }} width={75} />
                <Tooltip content={<CustomTooltip accounts={activeAccounts} />} />
                <Legend
                  formatter={(value) => {
                    const account = activeAccounts.find(a => a.id === value)
                    return account ? getAccountLabel(account) : value
                  }}
                  verticalAlign="top"
                />
                <ReferenceLine x={markerAge} stroke="#94a3b8" strokeDasharray="4 4"
                  label={{ value: `Age ${markerAge}`, position: 'top', fontSize: 11, fill: '#94a3b8' }} />
                {activeAccounts.map(a => {
                  const color = getAccountColor(a)
                  return (
                    <Area key={a.id} type="monotone" dataKey={a.id} stackId="1"
                      stroke={color} fill={`url(#grad-${a.id})`} strokeWidth={1.5} dot={false} />
                  )
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown Table */}
          <div className="table-card">
            <h2>Projected Balance at Retirement (Age {retirementAge})</h2>
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Tax Treatment</th>
                  <th>Current Balance</th>
                  <th>Total Contributions</th>
                  <th>Gross Balance</th>
                  <th>Est. After-Tax</th>
                </tr>
              </thead>
              <tbody>
                {accountTotals.map(a => {
                  const taxInfo = TAX_LABELS[a.taxType]
                  return (
                    <tr key={a.id}>
                      <td>
                        <span className="table-type-dot" style={{ background: getAccountColor(a) }} />
                        {getAccountLabel(a)}
                      </td>
                      <td>
                        <span className="tax-badge"
                          style={{ background: `${taxInfo.color}18`, color: taxInfo.color, borderColor: `${taxInfo.color}40` }}>
                          {taxInfo.short}
                        </span>
                      </td>
                      <td>{formatFull(a.balance)}</td>
                      <td>{formatFull(a.totalContributions)}</td>
                      <td><strong>{formatFull(Math.round(a.projectedBalance * realRatio))}</strong></td>
                      <td className="after-tax-cell"><strong>{formatFull(Math.round(a.afterTax * realRatio))}</strong></td>
                    </tr>
                  )
                })}
                <tr className="total-row net-worth-row">
                  <td colSpan={2}><strong>Total</strong></td>
                  <td>{formatFull(accountTotals.reduce((s, a) => s + a.balance, 0))}</td>
                  <td>{formatFull(totalContributions)}</td>
                  <td><strong>{formatFull(totalRetirement)}</strong></td>
                  <td className="after-tax-cell"><strong>{formatFull(totalAfterTax)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  )
}
