import type { Transaction } from '../types/transaction'

export function totalByType(transactions: Transaction[], type: Transaction['type']) {
	return transactions.filter((transaction) => transaction.type === type).reduce((total, transaction) => total + transaction.amount, 0)
}

export function netBalance(transactions: Transaction[]) {
	return totalByType(transactions, 'INCOME') - totalByType(transactions, 'EXPENSE')
}

export function formatCurrency(amount: number) {
	return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(amount)
}
