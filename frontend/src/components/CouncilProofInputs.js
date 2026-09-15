/* CivicPath product UI — civic field manual: guided choices, clear local context and accountable detail. */
import React, { useEffect, useId, useMemo, useState } from 'react';

export function SearchableSelect({ label, options = [], value, onChange, placeholder = 'Search or select…', required = false, disabled = false, help }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const selected = options.find((option) => option.id === value);
  const selectedLabel = selected?.label || '';
  const filtered = useMemo(() => options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase())), [options, query]);

  useEffect(() => { setQuery(selectedLabel); }, [selectedLabel]);

  return <label className="selector-field">
    <span>{label}{required && <b aria-hidden="true"> *</b>}</span>
    <div className={`searchable-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <input value={query} disabled={disabled} required={required} placeholder={placeholder} role="combobox" aria-autocomplete="list" aria-controls={open ? menuId : undefined} aria-expanded={open} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onChange={(event) => { setQuery(event.target.value); setOpen(true); if (event.target.value !== selectedLabel) onChange(null); }} />
      <span className="selector-chevron" aria-hidden="true">⌄</span>
      {open && !disabled && <div id={menuId} className="selector-menu" role="listbox">{filtered.length ? filtered.map((option) => <button type="button" role="option" aria-selected={option.id === value} key={option.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option.id); setQuery(option.label); setOpen(false); }}><span>{option.label}</span>{option.isCustom && <small>Council option</small>}</button>) : <p>No matching options.</p>}</div>}
    </div>
    {help && <small className="field-help">{help}</small>}
  </label>;
}

export function CurrencyInput({ label, currencyCode = 'AUD', value, onChange, placeholder = '0', help }) {
  const [focused, setFocused] = useState(false);
  const displayValue = !focused && value !== '' && value !== null && value !== undefined ? Number(value).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : value;
  return <label className="currency-field"><span>{label}</span><div className="currency-control"><b aria-hidden="true">$</b><input inputMode="decimal" value={displayValue} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ''))} placeholder={placeholder} /><em>{currencyCode}</em></div>{help && <small className="field-help">{help}</small>}</label>;
}

export function MultiSelectConstraints({ options = [], severityOptions = [], statusOptions = [], value = [], onChange, disabled = false }) {
  const [draftOptionId, setDraftOptionId] = useState(null);
  const addConstraint = () => {
    const option = options.find((item) => item.id === draftOptionId);
    if (!option || value.some((item) => item.constraintOptionId === option.id)) return;
    onChange([...value, { constraintOptionId: option.id, severityOptionId: severityOptions[0]?.id || '', statusOptionId: statusOptions[0]?.id || '', otherValue: '', detail: '' }]);
    setDraftOptionId(null);
  };
  const revise = (optionId, patch) => onChange(value.map((item) => item.constraintOptionId === optionId ? { ...item, ...patch } : item));
  const remove = (optionId) => onChange(value.filter((item) => item.constraintOptionId !== optionId));
  return <section className="constraint-editor"><div className="constraint-label"><span>Known constraints</span><small>Select all barriers that need attention. Each can be assigned a severity and state.</small></div><div className="constraint-adder"><SearchableSelect label="Add a known constraint" options={options.filter((option) => !value.some((item) => item.constraintOptionId === option.id))} value={draftOptionId} onChange={setDraftOptionId} placeholder="Search constraints" disabled={disabled} /><button type="button" className="secondary-button" disabled={!draftOptionId || disabled} onClick={addConstraint}>Add</button></div>{value.length > 0 && <div className="constraint-list">{value.map((item) => { const option = options.find((choice) => choice.id === item.constraintOptionId); return <article key={item.constraintOptionId} className="constraint-row"><div className="constraint-row-head"><b>{option?.label || 'Constraint'}</b><button type="button" className="text-action" onClick={() => remove(item.constraintOptionId)}>Remove</button></div>{option?.isOther && <label>Describe the constraint<input required value={item.otherValue || ''} onChange={(event) => revise(item.constraintOptionId, { otherValue: event.target.value })} placeholder="Describe the specific local constraint" /></label>}<div className="constraint-fields"><label>Severity<select value={item.severityOptionId} onChange={(event) => revise(item.constraintOptionId, { severityOptionId: event.target.value })}>{severityOptions.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label><label>Status<select value={item.statusOptionId} onChange={(event) => revise(item.constraintOptionId, { statusOptionId: event.target.value })}>{statusOptions.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label></div><label>Context or next action<textarea value={item.detail || ''} onChange={(event) => revise(item.constraintOptionId, { detail: event.target.value })} placeholder="Optional context, decision or next action" /></label></article>; })}</div>}</section>;
}
