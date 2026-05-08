/**
 * Base HTTP Client - Axios wrapper with auth, error handling, and token refresh
 *
 * Features:
 * - Automatic auth token injection
 * - 401 error handling with token refresh
 * - Sanitized error responses (no server detail leakage)
 * - Request timeout (10s default)
 * - Generic HTTP method wrappers
 */

import axios, {
  type AxiosInstance,
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Sanitized API error shape - safe to expose to clients
 */
export interface ApiError {
  message: string;
  status: number;
  code?: string;
}

/**
 * Extended request config with skipAuth flag for public endpoints
 */
interface HttpRequestConfig extends AxiosRequestConfig {
  skipAuth?: boolean;
}

/**
 * Creates an authenticated axios instance with interceptors
 *
 * @param accessToken - Current access token from session
 * @param onTokenExpired - Callback for 401 errors (triggers refresh)
 * @returns Configured axios instance
 */
export function createHttpClient(
  accessToken?: string,
  onTokenExpired?: () => void
): AxiosInstance {
  const client = axios.create({
    baseURL: API_URL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor - inject auth token
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const httpConfig = config as HttpRequestConfig;
      if (accessToken && !httpConfig.skipAuth) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    },
    (error: AxiosError) => Promise.reject(toApiError(error))
  );

  // Response interceptor - handle errors and token refresh
  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: AxiosError) => {
      // Trigger token refresh on 401
      if (error.response?.status === 401 && onTokenExpired) {
        onTokenExpired();
      }

      return Promise.reject(toApiError(error));
    }
  );

  return client;
}

/**
 * Converts Axios error to sanitized ApiError
 * Prevents server detail leakage to client
 */
function toApiError(error: AxiosError): ApiError {
  // Network errors or timeout
  if (!error.response) {
    return {
      message: error.message === 'Network Error'
        ? 'Network error. Please check your connection.'
        : error.message || 'Request failed',
      status: 0,
      code: error.code,
    };
  }

  // HTTP errors with status
  const status = error.response.status;
  let message = error.message || 'Request failed';

  // User-friendly messages for common errors
  switch (status) {
    case 400:
      message = 'Invalid request. Please check your input.';
      break;
    case 401:
      message = 'Authentication required. Please log in.';
      break;
    case 403:
      message = 'Access denied.';
      break;
    case 404:
      message = 'Resource not found.';
      break;
    case 429:
      message = 'Too many requests. Please try again later.';
      break;
    case 500:
      message = 'Server error. Please try again later.';
      break;
    case 503:
      message = 'Service temporarily unavailable.';
      break;
  }

  return {
    message,
    status,
    code: error.code,
  };
}

/**
 * Generic GET request
 *
 * @param client - Axios instance
 * @param url - Endpoint path
 * @param config - Optional request config
 * @returns Response data
 */
export async function get<T>(
  client: AxiosInstance,
  url: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await client.get<T>(url, config);
  return response.data;
}

/**
 * Generic POST request
 *
 * @param client - Axios instance
 * @param url - Endpoint path
 * @param data - Request payload
 * @param config - Optional request config
 * @returns Response data
 */
export async function post<T>(
  client: AxiosInstance,
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await client.post<T>(url, data, config);
  return response.data;
}

/**
 * Generic PUT request
 *
 * @param client - Axios instance
 * @param url - Endpoint path
 * @param data - Request payload
 * @param config - Optional request config
 * @returns Response data
 */
export async function put<T>(
  client: AxiosInstance,
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await client.put<T>(url, data, config);
  return response.data;
}

/**
 * Generic DELETE request
 *
 * @param client - Axios instance
 * @param url - Endpoint path
 * @param config - Optional request config
 * @returns Response data
 */
export async function del<T>(
  client: AxiosInstance,
  url: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await client.delete<T>(url, config);
  return response.data;
}
