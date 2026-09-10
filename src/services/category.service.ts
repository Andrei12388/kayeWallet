import { apiGet, apiPost } from './api'
import type { Category } from '../types/category'

export function getCategories() {
	return apiGet<Category[]>('getCategories')
}

export function createCategory(input: Pick<Category, 'type' | 'name'>) {
	return apiPost<Category>({ action: 'createCategory', ...input })
}

export function updateCategory(input: Pick<Category, 'id' | 'type' | 'name'> & Partial<Pick<Category, 'active'>>) {
	return apiPost<Category>({ action: 'updateCategory', ...input })
}

export function deleteCategory(id: string) {
	return apiPost({ action: 'deleteCategory', id })
}
