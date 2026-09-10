import { apiGet, apiPost } from './api'
import type { Transaction, TransactionType } from '../types/transaction'

interface CreateTransactionInput {
  type: TransactionType
  date: string
  categoryId: string
  description: string
  amount: number
}

interface CreateTransactionResponse {
  transaction: Omit<Transaction, 'categoryName'>
  allocationSnapshots: unknown[]
}

export function getTransactions(type?: TransactionType) {
  return apiGet<Transaction[]>('getTransactions', type ? { type } : {})
}

export function createTransaction(input: CreateTransactionInput) {
  return apiPost<CreateTransactionResponse>({ action: 'createTransaction', ...input })
}

export function updateTransaction(input: CreateTransactionInput & { id: string }) {
  return apiPost({ action: 'updateTransaction', ...input })
}

export function deleteTransaction(id: string) {
  return apiPost({ action: 'deleteTransaction', id })
}
