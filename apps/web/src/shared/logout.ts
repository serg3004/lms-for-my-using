import { apiRequest } from './apiClient.js';
import { clearAuthToken } from './authToken.js';

export async function logout() {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } finally {
    clearAuthToken();
  }
}
