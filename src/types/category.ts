import type { TransactionType } from './transaction'

export type CategoryType = TransactionType | 'BOTH'

export interface Category {
	id: string
	type: CategoryType
	name: string
	active: boolean
}
