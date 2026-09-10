export type TransactionType = 'INCOME' | 'EXPENSE'

export interface Transaction {
	id: string
	date: string
	type: TransactionType
	categoryId: string
	categoryName: string
	description: string
	amount: number
}
