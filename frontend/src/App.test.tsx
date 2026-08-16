import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('App development shell', () => {
  it('identifica o projeto como DesignHub', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    render(<App />);
    expect(screen.getByRole('heading', { name: 'DesignHub' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
