import axios, {
  type AxiosInstance,
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { getSession, signOut } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface BackendErrorResponse {
  statusCode: number;
  code?: string;
  error: string;
  message: string;
  path: string;
  timestamp: string;
}

export interface ApiError {
  message: string;
  status: number;
  code?: string;
}

interface HttpRequestConfig extends AxiosRequestConfig {
  skipAuth?: boolean;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const httpConfig = config as HttpRequestConfig;
    if (!httpConfig.skipAuth) {
      const session = await getSession();
      if (session?.accessToken) {
        config.headers.Authorization = `Bearer ${session.accessToken}`;
      }
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(toApiError(error))
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await signOut({ callbackUrl: '/login' });
    }
    return Promise.reject(toApiError(error));
  }
);

function toApiError(error: AxiosError): ApiError {
  if (!error.response) {
    return {
      message: error.message === 'Network Error'
        ? 'Network error. Please check your connection.'
        : error.message || 'Request failed',
      status: 0,
      code: error.code,
    };
  }

  const { status, data } = error.response;
  const backend = isBackendErrorResponse(data) ? data : null;

  return {
    message: backend?.message ?? getDefaultMessage(status),
    status,
    code: backend?.code,
  };
}

function isBackendErrorResponse(data: unknown): data is BackendErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'statusCode' in data &&
    'message' in data
  );
}

function getDefaultMessage(status: number): string {
  const messages: Record<number, string> = {
    400: 'Invalid request. Please check your input.',
    401: 'Authentication required. Please log in.',
    403: 'Access denied.',
    404: 'Resource not found.',
    409: 'Conflict. Please refresh and try again.',
    429: 'Too many requests. Please try again later.',
    500: 'Server error. Please try again later.',
    503: 'Service temporarily unavailable.',
  };
  return messages[status] ?? 'Request failed. Please try again.';
}

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.get<T>(url, config);
  return response.data;
}

export async function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.post<T>(url, data, config);
  return response.data;
}

export async function put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.put<T>(url, data, config);
  return response.data;
}

export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.delete<T>(url, config);
  return response.data;
}
