import { useState, useEffect } from 'react'
import { ACCOUNT_TYPES, TAX_LABELS, getAccountColor, getAccountTax } from '../hooks/useProjectorData'

function formatFull(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

// Controlled number input that lets users clear and retype freely
function NumInput({ value, onChange, min = 0, max, step = 1, prefix }) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = (raw) => {
    const num = parseFloat(raw.replace(/,/g, ''))
    onChange(isNaN(num) ? 0 : Math.max(min, max !== undefined ? Math.min(max, num) : num))
  }

  if (prefix) {
    return (
      <div className="dollar-input">
        <span>{prefix}</span>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onFocus={e => e.target.select()}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && commit(draft)}
        />
      </div>
    )
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

export default function AccountCard({ account, onUpdate, onRemove }) {
  const isCustom   = account.type === 'custom'
  const type       = ACCOUNT_TYPES[account.type]
  const effectiveTax = getAccountTax(account)
  const taxInfo    = TAX_LABELS[effectiveTax]
  const cardColor  = getAccountColor(account)
  const limit      = isCustom ? null : type?.limit
  const annualContrib = account.monthlyContribution * 12
  const overLimit  = limit && annualContrib > limit

  return (
    <div className="account-card" style={{ borderTopColor: cardColor }}>
      <div className="account-card-header">
        <div className="account-type-dot" style={{ background: cardColor }} />

        {isCustom ? (
          <input
            className="account-name-input"
            value={account.customLabel ?? ''}
            onChange={e => onUpdate(account.id, { customLabel: e.target.value })}
            placeholder="Account Name"
            maxLength={30}
          />
        ) : (
          <span className="account-type-label">{type?.label}</span>
        )}

        <span
          className="tax-badge"
          style={{ background: `${taxInfo.color}18`, color: taxInfo.color, borderColor: `${taxInfo.color}40` }}
        >
          {taxInfo.short}
        </span>
        <button className="account-remove-btn" onClick={() => onRemove(account.id)} title="Remove">✕</button>
      </div>

      <div className="account-fields">

        {/* Tax structure selector — custom accounts only */}
        {isCustom && (
          <div className="field-group">
            <label>Tax Treatment</label>
            <div className="custom-tax-selector">
              {Object.entries(TAX_LABELS).map(([key, t]) => (
                <button
                  key={key}
                  className={`tax-select-btn ${effectiveTax === key ? 'selected' : ''}`}
                  style={effectiveTax === key
                    ? { background: `${t.color}18`, color: t.color, borderColor: t.color }
                    : {}}
                  onClick={() => onUpdate(account.id, { customTax: key })}
                >
                  {t.short}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field-group">
          <label>Current Balance</label>
          <NumInput
            prefix="$"
            value={account.balance}
            min={0}
            step={100}
            onChange={val => onUpdate(account.id, { balance: val })}
          />
        </div>

        <div className={`field-group ${overLimit ? 'field-warning' : ''}`}>
          <label>
            Monthly Contribution
            {overLimit && <span className="warning-badge">Exceeds {formatFull(limit)}/yr limit</span>}
            {limit && !overLimit && <span className="limit-hint">{formatFull(limit)}/yr limit</span>}
          </label>
          <NumInput
            prefix="$"
            value={account.monthlyContribution}
            min={0}
            step={50}
            onChange={val => onUpdate(account.id, { monthlyContribution: val })}
          />
          <span className="field-sub">= {formatFull(annualContrib)}/yr</span>
        </div>

        <div className="field-group">
          <label>
            Annual Return (%)
            {account.type === 'hysa'
              ? <span className="recommended-badge">~4% current rate</span>
              : <span className="recommended-badge">10% historical avg</span>}
          </label>
          <NumInput
            value={account.returnRate}
            min={0}
            max={30}
            step={0.5}
            onChange={val => onUpdate(account.id, { returnRate: val })}
          />
          <input
            type="range"
            min={0}
            max={account.type === 'hysa' ? 10 : 20}
            step={0.5}
            value={account.returnRate}
            onChange={e => onUpdate(account.id, { returnRate: Number(e.target.value) })}
            className="slider"
            style={{ accentColor: cardColor }}
          />
        </div>
      </div>
    </div>
  )
}
