/**
 * Shared HTTP Client - Singleton axios instance with auto-auth
 *
 * Token is fetched automatically from NextAuth session via interceptor.
 * No need to pass tokens manually — just import and use.
 */

import axios, {
  type AxiosInstance,
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { getSession } from 'next-auth/react';

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

/**
 * Shared axios instance — created once, reused everywhere.
 * Token injected automatically via interceptor from NextAuth session.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — auto-inject auth token from session
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

// Response interceptor — sanitized errors
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => Promise.reject(toApiError(error))
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

  const status = error.response.status;
  const data = error.response.data as BackendErrorResponse | unknown;

  const backendError = isBackendErrorResponse(data)
    ? { message: data.message, code: data.code }
    : {};

  if (status >= 400 && status < 500) {
    return {
      message: backendError.message || getDefaultMessage(status),
      status,
      code: backendError.code,
    };
  }

  return {
    message: getDefaultMessage(status),
    status,
  };
}

function isBackendErrorResponse(data: unknown): data is BackendErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'statusCode' in data &&
    'error' in data &&
    'message' in data
  );
}

function getDefaultMessage(status: number): string {
  switch (status) {
    case 400: return 'Invalid request. Please check your input.';
    case 401: return 'Authentication required. Please log in.';
    case 403: return 'Access denied.';
    case 404: return 'Resource not found.';
    case 409: return 'Conflict. Please refresh and try again.';
    case 429: return 'Too many requests. Please try again later.';
    case 500: return 'Server error. Please try again later.';
    case 503: return 'Service temporarily unavailable.';
    default: return 'Request failed. Please try again.';
  }
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
