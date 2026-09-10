import { apiGet, apiPost } from './api'
import type { Allocation } from '../types/allocation'

export function getAllocations(incomeCategoryId?: string) {
	return apiGet<Allocation[]>('getAllocations', incomeCategoryId ? { incomeCategoryId } : {})
}

export function saveAllocations(incomeCategoryId: string, allocations: Pick<Allocation, 'fundName' | 'percentage'>[]) {
	return apiPost<Allocation[]>({ action: 'saveAllocations', incomeCategoryId, allocations })
}
