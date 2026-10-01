import { apiRequest } from './apiClient.js';
import { clearAuthAccessToken } from './authTransport.js';

export async function logout() {
  await apiRequest('/auth/logout', { method: 'POST' });
  clearAuthAccessToken();
}
