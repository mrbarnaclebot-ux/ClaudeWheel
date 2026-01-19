import axios from 'axios';

// Configure axios instance with base URL
export const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add request interceptor for logging in development
api.interceptors.request.use(
    (config) => {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (process.env.NODE_ENV === 'development') {
            console.error('[API Error]', error.response?.data || error.message);
        }
        return Promise.reject(error);
    }
);
