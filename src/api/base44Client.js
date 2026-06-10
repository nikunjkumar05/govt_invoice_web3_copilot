import { api } from '@/services/api.js';
import { appService } from '@/services/appService.js';

function entityApi(entityName) {
  const basePath = entityName === 'AgentAuditLog' ? '/audit-logs' : `/${entityName.toLowerCase()}s`;
  return {
    list: (sort, limit) => api.get(`${basePath}?sort=${sort || '-created_date'}&limit=${limit || 100}`),
    filter: async (criteria) => {
      if (criteria?.id) {
        try {
          const item = await api.get(`${basePath}/${criteria.id}`);
          return [item];
        } catch { return []; }
      }
      const all = await api.get(`${basePath}?limit=500`);
      return all.filter(item =>
        Object.entries(criteria || {}).every(([k, v]) => item[k] === v)
      );
    },
    get: (id) => api.get(`${basePath}/${id}`),
    create: (data) => api.post(basePath, data),
    update: (id, data) => api.put(`${basePath}/${id}`, data),
    delete: (id) => api.delete(`${basePath}/${id}`),
  };
}

function updateAuthState() {
  const token = api.getToken();
  return { token };
}

const auth = {
  isAuthenticated: async () => !!api.getToken(),
  me: async () => {
    try {
      return await api.get('/auth/me');
    } catch { return null; }
  },
  loginViaEmailPassword: async (email, password) => {
    const result = await api.post('/auth/login', { email, password });
    api.storeToken(result.access_token);
    return result.user;
  },
  loginWithProvider: (_provider, redirect) => { window.location.href = redirect || '/'; },
  register: async (data) => api.post('/auth/register', data),
  verifyOtp: async ({ email, otpCode }) => {
    const result = await api.post('/auth/verify-otp', { email, otpCode, skip: true });
    api.storeToken(result.access_token);
    return result;
  },
  setToken: (token) => api.storeToken(token),
  resendOtp: async (email) => api.post('/auth/resend-otp', { email }),
  resetPasswordRequest: async (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: async (data) => {
    await api.post('/auth/reset-password', data);
    window.location.href = '/login';
  },
  logout: async (url) => {
    try { await api.post('/auth/logout'); } catch {}
    api.clearToken();
    if (url) window.location.href = url;
  },
  redirectToLogin: () => { window.location.href = '/login'; },
};

const entitiesProxy = new Proxy({}, {
  get: (_, name) => entityApi(name)
});

function createAxiosClient({ baseURL, headers, token }) {
  const resolvedBase = import.meta.env.VITE_API_URL || '';
  const effectiveToken = token || api.getToken();
  return {
    get: async (path) => {
      const url = `${resolvedBase}${baseURL}${path}`;
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...(effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {}),
        },
      });
      return res.json();
    },
    post: async (path, body) => {
      const url = `${resolvedBase}${baseURL}${path}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...(effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {}),
        },
        body: JSON.stringify(body),
      });
      return res.json();
    },
  };
}

const db = {
  auth,
  entities: entitiesProxy,
  integrations: {
    Core: {
      UploadFile: async () => ({ file_url: '' }),
      InvokeLLM: async ({ prompt, response_json_schema }) => {
        return api.post('/llm/invoke', { prompt, response_json_schema });
      },
    }
  },
};

globalThis.__B44_DB__ = db;
globalThis.createAxiosClient = createAxiosClient;

const base44 = db;
export { db, base44, createAxiosClient };
export default db;
