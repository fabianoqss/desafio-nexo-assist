import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { appRoutes } from '../../src/app/router.tsx';

function renderAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('appRoutes', () => {
  it('renders the login page at /login', () => {
    renderAt('/login');

    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('redirects the root path to /login', () => {
    const router = renderAt('/');

    expect(router.state.location.pathname).toBe('/login');
  });
});
