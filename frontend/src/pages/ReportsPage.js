import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../features/AuthContext';
import { api } from '../lib/api';
import { ReportHistoryPanel } from '../components/ReportHistoryPanel';

const readers = ['org_admin', 'portfolio_manager', 'executive'];
const message = (error) => error.response?.status === 404 ? 'Reporting endpoints are not available. Ask your administrator to complete reporting integration.' : error.response?.data?.error || 'Reporting selections could not be loaded. Retry or contact your administrator.';
export default function ReportsPage() {
  const { user } = useAuth(); const allowed = readers.includes(user?.role);
  const [strategies, setStrategies] = useState([]); const [strategyId, setStrategyId] = useState(''); const [periods, setPeriods] = useState([]); const [periodId, setPeriodId] = useState('');
  const [strategyPage, setStrategyPage] = useState(null); const [periodPage, setPeriodPage] = useState(null); const [loading, setLoading] = useState(false); const [periodLoading, setPeriodLoading] = useState(false); const [moreLoading, setMoreLoading] = useState(false); const [error, setError] = useState(''); const [retryKey, setRetryKey] = useState(0);
  const periodGeneration = useRef(0); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!allowed) return undefined;
    const controller = new AbortController(); let current = true; setLoading(true); setError(''); setStrategyId(''); setPeriodId('');
    api.get('/reports/strategies', { signal: controller.signal, params: { limit: 50 } }).then((response) => { if (!current) return; const rows = response.data.data || []; setStrategies(rows); setStrategyPage(response.data.pagination); setStrategyId(rows.find((s) => s.status === 'active')?.id || rows[0]?.id || ''); }).catch((err) => { if (current) { setError(message(err)); setStrategies([]); } }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [allowed, user?.organizationId, retryKey]);
  useEffect(() => {
    const counter = periodGeneration; const key = ++counter.current; const controller = new AbortController(); setPeriods([]); setPeriodId(''); setPeriodPage(null); setMoreLoading(false);
    if (!strategyId || !allowed) { setPeriodLoading(false); return () => controller.abort(); }
    setPeriodLoading(true); setError('');
    api.get(`/reports/strategies/${strategyId}/periods`, { signal: controller.signal, params: { limit: 50 } }).then((response) => { if (key !== periodGeneration.current) return; const rows = response.data.data || []; setPeriods(rows); setPeriodPage(response.data.pagination); setPeriodId(rows.find((p) => p.status === 'open')?.id || rows[0]?.id || ''); }).catch((err) => { if (key === periodGeneration.current && !controller.signal.aborted) setError(message(err)); }).finally(() => { if (key === periodGeneration.current) setPeriodLoading(false); });
    return () => { ++counter.current; controller.abort(); };
  }, [strategyId, allowed]);
  const more = async (type) => {
    const page = type === 'strategies' ? strategyPage : periodPage; const key = periodGeneration.current; setMoreLoading(true); setError('');
    try {
      const response = await api.get(type === 'strategies' ? '/reports/strategies' : `/reports/strategies/${strategyId}/periods`, { params: { limit: 50, offset: page.offset + page.limit } });
      if (!mounted.current || key !== periodGeneration.current) return;
      if (type === 'strategies') { setStrategies((current) => [...new Map([...current, ...response.data.data].map((r) => [r.id, r])).values()]); setStrategyPage(response.data.pagination); }
      else { setPeriods((current) => [...new Map([...current, ...response.data.data].map((r) => [r.id, r])).values()]); setPeriodPage(response.data.pagination); }
    } catch (err) { if (mounted.current && key === periodGeneration.current) setError(message(err)); }
    finally { if (mounted.current && key === periodGeneration.current) setMoreLoading(false); }
  };
  if (!allowed) return <main className="page-content reports-page"><h2>Strategy reporting</h2><p className="report-empty">Reports are available to organisation administrators, portfolio managers and executives. Ask your administrator if you need reporting access.</p></main>;
  return <main className="page-content reports-page"><section className="report-heading"><div><p className="page-intro">Live strategy delivery information and immutable recorded report snapshots. No demonstration metrics, synthetic trend lines or formal approval claims.</p><h2>Strategy reporting</h2></div></section>
    {loading && <p role="status">Loading council strategies…</p>}{periodLoading && <p role="status">Loading reporting periods…</p>}{error && <div className="report-error" role="alert"><p>{error}</p><button className="secondary-button" type="button" onClick={() => setRetryKey((key) => key + 1)}>Retry selections</button></div>}
    {!loading && !strategies.length && !error && <p className="report-empty">No strategy has been recorded for this council. An organisation administrator or portfolio manager can create a strategy and reporting periods in Strategy Delivery.</p>}
    {!!strategies.length && <div className="reporting-selectors"><label>Strategy<select value={strategyId} onChange={(event) => { setPeriodId(''); setStrategyId(event.target.value); }} disabled={loading || moreLoading}>{strategies.map((s) => <option value={s.id} key={s.id}>{s.name} ({s.status})</option>)}</select></label>{strategyPage?.hasMore && <button className="secondary-button" type="button" disabled={moreLoading} onClick={() => more('strategies')}>Load more strategies</button>}<label>Reporting period<select value={periodId} onChange={(event) => setPeriodId(event.target.value)} disabled={periodLoading || !periods.length || moreLoading}>{!periods.length && <option value="">{periodLoading ? 'Loading periods…' : 'No reporting periods'}</option>}{periods.map((p) => <option value={p.id} key={p.id}>{p.label} ({p.status})</option>)}</select></label>{periodPage?.hasMore && <button className="secondary-button" type="button" disabled={moreLoading} onClick={() => more('periods')}>Load older periods</button>}</div>}
    <ReportHistoryPanel strategyId={strategyId} periodId={periodLoading ? '' : periodId}/>
  </main>;
}
