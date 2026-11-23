import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { LoginPage } from '../features/auth/pages/login-page.tsx';

export const appRoutes: RouteObject[] = [
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/login', element: <LoginPage /> },
];

export function createAppRouter() {
  return createBrowserRouter(appRoutes);
}
