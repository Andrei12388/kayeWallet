import { useEffect, useState, type FormEvent } from 'react'
import './App.css'
import { formatCurrency, netBalance, totalByType } from './lib/calculations'
import { createCategory, deleteCategory, getCategories, updateCategory } from './services/category.service'
import { getAllocations, saveAllocations } from './services/allocation.service'
import { createTransaction, deleteTransaction, getTransactions, updateTransaction } from './services/transaction.service'
import type { Allocation } from './types/allocation'
import type { Category, CategoryType } from './types/category'
import type { Transaction, TransactionType } from './types/transaction'

type View = 'Overview' | 'Ledger' | 'Income' | 'Expenses' | 'Reports' | 'Allocation' | 'Categories'
type Notice = { type: 'success' | 'error'; message: string }

const fallbackCategories: Category[] = [
  { id: 'INC-001', name: 'Sunday Offering', type: 'INCOME', active: true }, { id: 'INC-002', name: 'Donation', type: 'INCOME', active: true },
  { id: 'EXP-001', name: 'Utilities', type: 'EXPENSE', active: true }, { id: 'EXP-002', name: 'Supplies', type: 'EXPENSE', active: true }, { id: 'EXP-003', name: 'Transportation', type: 'EXPENSE', active: true },
]
const fallbackAllocations: Allocation[] = [
  { id: 'ALLOC-001', incomeCategoryId: 'INC-001', fundName: 'Operations', percentage: 50, active: true }, { id: 'ALLOC-002', incomeCategoryId: 'INC-001', fundName: 'Savings', percentage: 20, active: true }, { id: 'ALLOC-003', incomeCategoryId: 'INC-001', fundName: 'Ministry', percentage: 20, active: true }, { id: 'ALLOC-004', incomeCategoryId: 'INC-001', fundName: 'Emergency', percentage: 10, active: true },
]
const fallbackTransactions: Transaction[] = [{ id: 'TXN-001', date: '2026-09-04', type: 'INCOME', categoryId: 'INC-001', categoryName: 'Sunday Offering', description: 'Sunday Offering', amount: 0 }, { id: 'TXN-002', date: '2026-09-03', type: 'EXPENSE', categoryId: 'EXP-001', categoryName: 'Utilities', description: 'Electricity Bill', amount: 0 }]
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T00:00:00`))
const monthLabel = (month: number) => new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(2024, month, 1))
const currentYear = new Date().getFullYear()
type WeekOption = { start: string; end: string; label: string }
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const monthKey = (date: Date) => dateKey(date).slice(0, 7)
const monthName = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(`${value}-01T00:00:00`))
const weekStart = (date: Date) => { const result = new Date(date); const day = result.getDay(); result.setDate(result.getDate() - (day === 0 ? 6 : day - 1)); return result }
const weekOptions = (value: string): WeekOption[] => {
  const firstDay = new Date(`${value}-01T00:00:00`)
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0)
  const options: WeekOption[] = []
  for (let start = weekStart(firstDay); start <= lastDay; start.setDate(start.getDate() + 7)) {
    const weekEnd = new Date(start); weekEnd.setDate(weekEnd.getDate() + 6)
    options.push({ start: dateKey(start), end: dateKey(weekEnd), label: `${dateLabel(dateKey(start))} - ${dateLabel(dateKey(weekEnd))}` })
  }
  return options
}

function App() {
  const [activeView, setActiveView] = useState<View>('Overview')
  const [transactions, setTransactions] = useState<Transaction[]>(fallbackTransactions)
  const [categories, setCategories] = useState<Category[]>(fallbackCategories)
  const [allocations, setAllocations] = useState<Allocation[]>(fallbackAllocations)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL')
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loading, setLoading] = useState(true)
  const [reportYear, setReportYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()))
  const [selectedWeekStart, setSelectedWeekStart] = useState(dateKey(weekStart(new Date())))

  const notify = (type: Notice['type'], message: string) => { setNotice({ type, message }); window.setTimeout(() => setNotice(null), 3500) }
  const reloadTransactions = async () => setTransactions(withCategoryNames(await getTransactions(), categories))
  const reloadCategories = async () => setCategories((await getCategories()).filter((category) => category.active))

  useEffect(() => {
    Promise.all([getTransactions(), getCategories(), getAllocations('INC-001')]).then(([remoteTransactions, remoteCategories, remoteAllocations]) => {
      setTransactions(withCategoryNames(remoteTransactions, remoteCategories))
      setCategories(remoteCategories.filter((category) => category.active))
      setAllocations(remoteAllocations)
    }).catch((error: unknown) => notify('error', error instanceof Error ? error.message : 'Could not connect to Google Sheets.')).finally(() => setLoading(false))
  }, [])

  const income = totalByType(transactions, 'INCOME')
  const overviewWeeks = weekOptions(selectedMonth)
  const selectedWeek = overviewWeeks.find((week) => week.start === selectedWeekStart) || overviewWeeks[0]
  const overviewTransactions = transactions.filter((transaction) => transaction.date >= selectedWeek.start && transaction.date <= selectedWeek.end)
  const overviewIncome = totalByType(overviewTransactions, 'INCOME')
  const overviewExpenses = totalByType(overviewTransactions, 'EXPENSE')
  const overviewBalance = netBalance(overviewTransactions)
  const monthOptions = Array.from(new Set([monthKey(new Date()), ...transactions.map((transaction) => transaction.date.slice(0, 7))])).sort().reverse()
  const visibleTransactions = transactions.filter((transaction) => {
    const textMatch = `${transaction.description} ${transaction.categoryName}`.toLowerCase().includes(search.toLowerCase())
    const typeMatch = typeFilter === 'ALL' || transaction.type === typeFilter
    const viewMatch = activeView === 'Income' ? transaction.type === 'INCOME' : activeView === 'Expenses' ? transaction.type === 'EXPENSE' : true
    const periodMatch = activeView !== 'Overview' || (transaction.date >= selectedWeek.start && transaction.date <= selectedWeek.end)
    return textMatch && typeMatch && viewMatch && periodMatch
  })

  const saveTransaction = async (input: TransactionInput) => {
    try {
      if (editingTransaction) await updateTransaction({ id: editingTransaction.id, ...input })
      else await createTransaction(input)
      await reloadTransactions()
      setEditingTransaction(null); setShowTransactionForm(false)
      notify('success', editingTransaction ? 'Transaction updated.' : 'Transaction saved.')
    } catch (error: unknown) { notify('error', error instanceof Error ? error.message : 'Could not save transaction.') }
  }
  const removeTransaction = async (transaction: Transaction) => {
    if (!window.confirm(`Delete “${transaction.description}”?`)) return
    setDeletingTransactionId(transaction.id)
    try { await deleteTransaction(transaction.id); await reloadTransactions(); notify('success', 'Transaction deleted.') } catch (error: unknown) { notify('error', error instanceof Error ? error.message : 'Could not delete transaction.') } finally { setDeletingTransactionId(null) }
  }
  const openNew = () => { setEditingTransaction(null); setShowTransactionForm(true) }

  const reportYears = Array.from(new Set([currentYear, ...transactions.map((transaction) => Number(transaction.date.slice(0, 4)))] )).sort((first, second) => second - first)
  const navItems: { view: View; icon: string }[] = [{ view: 'Overview', icon: '⌂' }, { view: 'Ledger', icon: '≡' }, { view: 'Income', icon: '↗' }, { view: 'Expenses', icon: '↘' }, { view: 'Reports', icon: '▥' }, { view: 'Allocation', icon: '◈' }, { view: 'Categories', icon: '⚙' }]
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand">
    <img height={55} width={55} src="/kayeIcon.png" alt="KayeWallet Logo" /><span>Kaye<span className="brand-accent">Wallet</span></span></div><div className="workspace-label">WORKSPACE</div><nav>{navItems.slice(0, 5).map((item) => <NavButton key={item.view} item={item} activeView={activeView} setActiveView={setActiveView} />)}</nav><div className="workspace-label settings-label">MANAGE</div><nav>{navItems.slice(5).map((item) => <NavButton key={item.view} item={item} activeView={activeView} setActiveView={setActiveView} />)}</nav><div className="sidebar-footer"><div className="sync-dot" /><div><strong>{loading ? 'Syncing...' : 'Google Sheets'}</strong>
    
    <small>{loading ? 'Loading records' : 'connected Workspace'}</small>
   
    </div></div>
    <div style={{ marginTop: '1rem' }}>
    <small>© Robert Andrei Bardoquillo</small>
    </div>
    </aside>
    <main className="main-content"><header className="topbar"><div><span className="eyebrow">{activeView === 'Overview' ? monthName(selectedMonth).toUpperCase() : 'SEPTEMBER 2026'}</span><h1>{activeView === 'Overview' ? 'Good Day, KathLeng.' : activeView}</h1></div><div className="header-actions"><button className="icon-button" aria-label="Notifications">♧</button><button className="avatar">KW</button></div></header>
      {activeView === 'Categories' ? <CategoriesView categories={categories} onChanged={async (message) => { await reloadCategories(); notify('success', message) }} onError={(message) => notify('error', message)} /> : activeView === 'Allocation' ? <AllocationView allocations={allocations} income={income} onSaved={(next) => { setAllocations(next); notify('success', 'Allocations saved.') }} onError={(message) => notify('error', message)} /> : activeView === 'Reports' ? <MonthlySummary transactions={transactions} years={reportYears} year={reportYear} setYear={setReportYear} /> : <>
        <div className="page-toolbar"><div><p className="page-kicker">FINANCIAL SNAPSHOT</p><p className="muted">{loading ? 'Loading your Google Sheets ledger...' : activeView === 'Overview' ? `Showing ${selectedWeek.label}.` : 'Keep your giving and spending in clear view.'}</p></div><div className="toolbar-actions">{activeView === 'Overview' && <div className="overview-period"><label>Month<select value={selectedMonth} onChange={(event) => { const nextMonth = event.target.value; setSelectedMonth(nextMonth); setSelectedWeekStart(weekOptions(nextMonth)[0]?.start || `${nextMonth}-01`) }}>{monthOptions.map((option) => <option key={option} value={option}>{monthName(option)}</option>)}</select></label><label>Week<select value={selectedWeek.start} onChange={(event) => setSelectedWeekStart(event.target.value)}>{overviewWeeks.map((week) => <option key={week.start} value={week.start}>{week.label}</option>)}</select></label></div>}<button className="primary-button" onClick={openNew}><span>+</span> New transaction</button></div></div>
        {activeView === 'Overview' && <>
        <section className="summary-grid">
          <SummaryCard label="Available balance" amount={overviewBalance} tone="balance" detail="Selected week" />
          <SummaryCard label="Total income" amount={overviewIncome} tone="income" detail="Selected week" />
          <SummaryCard label="Total expenses" amount={overviewExpenses} tone="expense" detail="Selected week" /></section><section className="content-grid"><div className="panel chart-panel"><div className="panel-heading">
         <div>
            <h2>Cash flow</h2><p className="muted">Income versus expenses</p>
            </div>
            </div>
             
              <div className="chart"><div className="chart-total">{formatCurrency(overviewBalance)}
            <span>net selected week</span>

          </div>
          {/*
          <div className="bars">{[44, 64, 52, 78, 60, 86, 72].map((height, index) => <div className="bar-group" key={height}>
          <div className="bar income-bar" style={{ height: `${height}%` }} />
          <div className="bar expense-bar" style={{ height: `${height * .45}%` }} /><small>{['Aug 29', 'Sep 1', 'Sep 3', 'Sep 5', 'Sep 7', 'Sep 9', 'Today'][index]}</small>
          </div>)}</div>*/}
          </div>
          </div><div className="panel allocation-panel">
          <div className="panel-heading"><div>
          <h2>Income allocation</h2><p className="muted">Offering distribution</p></div><button className="text-button" onClick={() => setActiveView('Allocation')}>Edit</button></div><div className="allocation-list allocation-summary">{allocations.map((item, index) => 
          <div className="allocation-row" key={item.id}><span><i className={`dot ${['teal', 'blue', 'coral', 'gold'][index % 4]}`} />{item.fundName}</span>
          <strong>{item.percentage}% <small>{formatCurrency(overviewIncome * Number(item.percentage) / 100)}</small></strong>
          </div>
          )} 
            </div>
            </div>
            
            </section></>} 
         <LedgerTable transactions={visibleTransactions} search={search} setSearch={setSearch} typeFilter={typeFilter} setTypeFilter={setTypeFilter} activeView={activeView} onEdit={(transaction) => { setEditingTransaction(transaction); setShowTransactionForm(true) }} onDelete={removeTransaction} deletingTransactionId={deletingTransactionId} /> 
     
        </>} 
      </main>
    {showTransactionForm && <TransactionModal transaction={editingTransaction} categories={categories} onClose={() => { setShowTransactionForm(false); setEditingTransaction(null) }} onSave={saveTransaction} />}
    {notice && <div className={`toast ${notice.type}`} role="status"><span>{notice.type === 'success' ? '✓' : '!'}</span>{notice.message}<button onClick={() => setNotice(null)} aria-label="Dismiss notification">×</button></div>}
  </div>
}

type TransactionInput = { type: TransactionType; date: string; categoryId: string; description: string; amount: number }
function withCategoryNames(items: Transaction[], available: Category[]) { return items.map((item) => ({ ...item, categoryName: item.categoryName || available.find((category) => category.id === item.categoryId)?.name || item.categoryId })) }
function NavButton({ item, activeView, setActiveView }: { item: { view: View; icon: string }; activeView: View; setActiveView: (view: View) => void }) { return <button className={activeView === item.view ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView(item.view)}><span className="nav-icon">{item.icon}</span>{item.view}</button> }
function SummaryCard({ label, amount, tone, detail }: { label: string; amount: number; tone: string; detail: string }) { return <div className={`summary-card ${tone}`}><div className="card-top"><span>{label}</span><span className="card-icon">{tone === 'balance' ? '◈' : tone === 'income' ? '↗' : '↘'}</span></div><strong>{formatCurrency(amount)}</strong><small>{detail}</small></div> }
function LedgerTable({ transactions, search, setSearch, typeFilter, setTypeFilter, activeView, onEdit, onDelete, deletingTransactionId }: { transactions: Transaction[]; search: string; setSearch: (value: string) => void; typeFilter: 'ALL' | TransactionType; setTypeFilter: (value: 'ALL' | TransactionType) => void; activeView: View; onEdit: (transaction: Transaction) => void; onDelete: (transaction: Transaction) => void; deletingTransactionId: string | null }) { return <section className="panel ledger-panel"><div className="panel-heading ledger-heading"><div><h2>{activeView === 'Overview' ? 'Recent transactions' : `${activeView} transactions`}</h2><p className="muted">{transactions.length} records in your ledger</p></div></div><div className="filters"><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transactions" /></label><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'ALL' | TransactionType)} aria-label="Filter by type"><option value="ALL">All types</option><option value="INCOME">Income</option><option value="EXPENSE">Expenses</option></select></div><div className="table-wrap"><table><thead><tr><th>Transaction</th><th>Category</th><th>Date</th><th className="amount-column">Amount</th><th>Actions</th></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id}><td><div className="transaction-name"><span className={`transaction-icon ${transaction.type.toLowerCase()}`}>{transaction.type === 'INCOME' ? '↗' : '↘'}</span><div><strong>{transaction.description}</strong><small>{transaction.id}</small></div></div></td><td><span className="category-pill">{transaction.categoryName}</span></td><td className="date-cell">{dateLabel(transaction.date)}</td><td className={`amount ${transaction.type.toLowerCase()}`}>{transaction.type === 'INCOME' ? '+' : '-'}{formatCurrency(transaction.amount)}</td><td><div className="row-actions"><button onClick={() => onEdit(transaction)} disabled={deletingTransactionId !== null}>Edit</button><button onClick={() => onDelete(transaction)} disabled={deletingTransactionId !== null}>{deletingTransactionId === transaction.id ? 'Deleting...' : 'Delete'}</button></div></td></tr>)}</tbody></table>{transactions.length === 0 && <div className="empty-state">No transactions match these filters.</div>}</div></section> }

function TransactionModal({ transaction, categories, onClose, onSave }: { transaction: Transaction | null; categories: Category[]; onClose: () => void; onSave: (input: TransactionInput) => Promise<void> }) { const [type, setType] = useState<TransactionType>(transaction?.type || 'INCOME'); const matchingCategories = categories.filter((category) => (category.type === type || category.type === 'BOTH') && category.active); const [date, setDate] = useState(transaction?.date || new Date().toISOString().slice(0, 10)); const [categoryId, setCategoryId] = useState(transaction?.categoryId || matchingCategories[0]?.id || ''); const [description, setDescription] = useState(transaction?.description || ''); const [amount, setAmount] = useState(transaction ? String(transaction.amount) : ''); const [saving, setSaving] = useState(false); const submit = async (event: FormEvent) => { event.preventDefault(); if (!categoryId || !description.trim() || Number(amount) <= 0) return; setSaving(true); await onSave({ type, date, categoryId, description: description.trim(), amount: Number(amount) }); setSaving(false) }; return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">{transaction ? 'EDIT ENTRY' : 'NEW ENTRY'}</span><h2>{transaction ? 'Edit transaction' : 'Add transaction'}</h2></div><button type="button" className="close-button" onClick={onClose}>×</button></div><div className="segmented"><button type="button" className={type === 'INCOME' ? 'selected income-selected' : ''} onClick={() => { setType('INCOME'); setCategoryId(categories.find((category) => (category.type === 'INCOME' || category.type === 'BOTH') && category.active)?.id || '') }}>Income</button><button type="button" className={type === 'EXPENSE' ? 'selected expense-selected' : ''} onClick={() => { setType('EXPENSE'); setCategoryId(categories.find((category) => (category.type === 'EXPENSE' || category.type === 'BOTH') && category.active)?.id || '') }}>Expense</button></div><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{matchingCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was this for?" required /></label><label>Amount<input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></label><button className="primary-button modal-submit" type="submit" disabled={saving}>{saving ? 'Saving...' : transaction ? 'Save changes' : 'Save transaction'}</button></form></div> }

function CategoriesView({ categories, onChanged, onError }: { categories: Category[]; onChanged: (message: string) => Promise<void>; onError: (message: string) => void }) { const [name, setName] = useState(''); const [type, setType] = useState<CategoryType>('BOTH'); const [editingId, setEditingId] = useState(''); const [saving, setSaving] = useState(false); const [deletingId, setDeletingId] = useState<string | null>(null); const save = async (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return; setSaving(true); try { if (editingId) await updateCategory({ id: editingId, type, name: name.trim() }); else await createCategory({ type, name: name.trim() }); setName(''); setEditingId(''); await onChanged(editingId ? 'Category updated.' : 'Category saved.') } catch (error: unknown) { onError(error instanceof Error ? error.message : 'Could not save category.') } finally { setSaving(false) } }; const remove = async (id: string) => { if (!window.confirm('Deactivate this category?')) return; setDeletingId(id); try { await deleteCategory(id); await onChanged('Category deleted.') } catch (error: unknown) { onError(error instanceof Error ? error.message : 'Could not delete category.') } finally { setDeletingId(null) } }; return <div className="management-page"><div className="page-toolbar"><div><p className="page-kicker">MANAGE CATEGORIES</p><p className="muted">Keep the choices in your transaction form current.</p></div></div><form className="panel inline-form" onSubmit={save}><select value={type} onChange={(event) => setType(event.target.value as CategoryType)} disabled={saving}><option value="BOTH">Income & expense</option><option value="INCOME">Income only</option><option value="EXPENSE">Expense only</option></select><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Category name" required disabled={saving} /><button className="primary-button" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save changes' : 'Add category'}</button>{editingId && <button type="button" className="text-button" onClick={() => { setEditingId(''); setName('') }} disabled={saving}>Cancel</button>}</form><div className="panel management-list">{categories.map((category) => <div className="management-row" key={category.id}><div><strong>{category.name}</strong><small>{category.type === 'BOTH' ? 'INCOME & EXPENSE' : category.type} · {category.id}</small></div><div className="row-actions"><button onClick={() => { setEditingId(category.id); setName(category.name); setType(category.type) }} disabled={saving || deletingId !== null}>Edit</button><button onClick={() => remove(category.id)} disabled={saving || deletingId !== null}>{deletingId === category.id ? 'Deleting...' : 'Delete'}</button></div></div>)}</div></div> }

function MonthlySummary({ transactions, years, year, setYear }: { transactions: Transaction[]; years: number[]; year: number; setYear: (year: number) => void }) {
  const monthly = Array.from({ length: 12 }, (_, month) => transactions.reduce((summary, transaction) => {
    const date = new Date(`${transaction.date}T00:00:00`)
    if (date.getFullYear() !== year || date.getMonth() !== month) return summary
    if (transaction.type === 'INCOME') summary.income += transaction.amount
    else summary.expenses += transaction.amount
    return summary
  }, { income: 0, expenses: 0 }))
  const yearIncome = monthly.reduce((sum, item) => sum + item.income, 0)
  const yearExpenses = monthly.reduce((sum, item) => sum + item.expenses, 0)
  const categoryTotals = Array.from(transactions.reduce((totals, transaction) => {
    const date = new Date(`${transaction.date}T00:00:00`)
    if (date.getFullYear() !== year) return totals
    const key = transaction.categoryName || transaction.categoryId
    const current = totals.get(key) || { name: key, income: 0, expenses: 0 }
    if (transaction.type === 'INCOME') current.income += transaction.amount
    else current.expenses += transaction.amount
    totals.set(key, current)
    return totals
  }, new Map<string, { name: string; income: number; expenses: number }>()).values()).sort((first, second) => second.income + second.expenses - first.income - first.expenses)
  return <div className="report-page"><div className="page-toolbar"><div><p className="page-kicker">MONTHLY SUMMARY</p><p className="muted">Compare income, expenses, and balance by month.</p></div><label className="year-picker">Year<select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></div><section className="summary-grid"><SummaryCard label="Year income" amount={yearIncome} tone="income" detail={`${year} total`} /><SummaryCard label="Year expenses" amount={yearExpenses} tone="expense" detail={`${year} total`} /><SummaryCard label="Year balance" amount={yearIncome - yearExpenses} tone="balance" detail={`${year} net`} /></section><section className="panel monthly-summary"><div className="panel-heading"><div><h2>{year} monthly activity</h2><p className="muted">All recorded transactions for the selected year.</p></div></div><div className="monthly-table-wrap"><table><thead><tr><th>Month</th><th className="amount-column">Income</th><th className="amount-column">Expenses</th><th className="amount-column">Balance</th></tr></thead><tbody>{monthly.map((item, month) => <tr key={month}><td><strong>{monthLabel(month)}</strong></td><td className="amount income">+{formatCurrency(item.income)}</td><td className="amount expense">-{formatCurrency(item.expenses)}</td><td className={`amount ${item.income - item.expenses >= 0 ? 'income' : 'expense'}`}>{formatCurrency(item.income - item.expenses)}</td></tr>)}</tbody></table></div></section><section className="panel monthly-summary"><div className="panel-heading"><div><h2>Category totals</h2><p className="muted">Income and expenses combined by category for {year}.</p></div></div><div className="monthly-table-wrap"><table><thead><tr><th>Category</th><th className="amount-column">Income</th><th className="amount-column">Expenses</th><th className="amount-column">Net</th></tr></thead><tbody>{categoryTotals.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td className="amount income">+{formatCurrency(item.income)}</td><td className="amount expense">-{formatCurrency(item.expenses)}</td><td className={`amount ${item.income - item.expenses >= 0 ? 'income' : 'expense'}`}>{formatCurrency(item.income - item.expenses)}</td></tr>)}{categoryTotals.length === 0 && <tr><td colSpan={4} className="empty-state">No category activity for this year.</td></tr>}</tbody></table></div></section></div>
}

function AllocationView({ allocations, income, onSaved, onError }: { allocations: Allocation[]; income: number; onSaved: (allocations: Allocation[]) => void; onError: (message: string) => void }) { const [values, setValues] = useState(allocations); const [saving, setSaving] = useState(false); useEffect(() => setValues(allocations), [allocations]); const total = values.reduce((sum, item) => sum + Number(item.percentage || 0), 0); const save = async () => { if (Math.abs(total - 100) > .001) { onError('Allocations must total 100%.'); return } setSaving(true); try { const next = await saveAllocations('INC-001', values.map((item) => ({ fundName: item.fundName.trim(), percentage: Number(item.percentage) }))); onSaved(next) } catch (error: unknown) { onError(error instanceof Error ? error.message : 'Could not save allocations.') } finally { setSaving(false) } }; const add = () => setValues([...values, { id: `ALLOC-NEW-${Date.now()}`, incomeCategoryId: 'INC-001', fundName: 'New fund', percentage: 0, active: true }]); const remove = (id: string) => setValues(values.filter((item) => item.id !== id)); return <div className="allocation-page"><div className="page-toolbar"><div><p className="page-kicker">RULES & DISTRIBUTION</p><p className="muted">New income is automatically split across your funds.</p></div><div className="allocation-actions"><button className="text-button" onClick={add} disabled={saving}>+ Add fund</button><button className="primary-button" onClick={save} disabled={saving || Math.abs(total - 100) > .001}>{saving ? 'Saving...' : 'Save changes'}</button></div></div><div className="panel allocation-settings"><div><span className="eyebrow">INCOME CATEGORY</span><h2>Overall Allocations</h2><p className="muted">Every new allocations follows this allocation.</p></div><div className={`settings-total ${Math.abs(total - 100) > .001 ? 'invalid' : ''}`}><strong>{total}%</strong><span>{total === 100 ? 'Ready to save' : 'Must equal 100%'}</span></div></div><div className="allocation-editor panel">{values.map((item, index) => <div className="editor-row" key={item.id}><div className="editor-name"><i className={`dot ${['teal', 'blue', 'coral', 'gold'][index % 4]}`} /><div><input className="fund-name-input" value={item.fundName} disabled={saving} onChange={(event) => setValues(values.map((current, currentIndex) => currentIndex === index ? { ...current, fundName: event.target.value } : current))} /><small>{formatCurrency(income * Number(item.percentage) / 100)} projected</small></div></div><div className="percentage-input"><input type="number" value={item.percentage} min="0" max="100" disabled={saving} onChange={(event) => setValues(values.map((current, currentIndex) => currentIndex === index ? { ...current, percentage: Number(event.target.value) } : current))} /><span>%</span><button className="remove-allocation" type="button" onClick={() => remove(item.id)} disabled={saving} aria-label={`Delete ${item.fundName}`}>×</button></div></div>)}</div></div> }

export default App
