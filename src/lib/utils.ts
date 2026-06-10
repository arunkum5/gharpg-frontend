import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

export function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function getRoleLabel(role: string) {
  return { superadmin: 'Super Admin', pgadmin: 'PG Admin', guest: 'Guest' }[role] || role
}

export function getRoomStatusColor(status: string) {
  return {
    free:    'text-green-600 bg-green-50 border-green-200',
    partial: 'text-amber-600 bg-amber-50 border-amber-200',
    full:    'text-red-600   bg-red-50   border-red-200',
  }[status] || ''
}
