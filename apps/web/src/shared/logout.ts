import { apiRequest } from './apiClient.js';

export async function logout() {
  await apiRequest('/auth/logout', { method: 'POST' });
}
